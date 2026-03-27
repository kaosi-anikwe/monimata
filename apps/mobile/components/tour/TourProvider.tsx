// MoniMata - zero-based budgeting for Nigerians
// Copyright (C) 2026  MoniMata Contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * TourProvider — manages global tour state and renders the SVG spotlight overlay.
 *
 * Architecture:
 *  - TourContext exposes controls (startTour, next, skip) and the active target ID
 *    so TourTarget components know when to measure themselves.
 *  - The overlay is a transparent Modal so it sits above ALL navigation layers,
 *    including tab bars, headers, and other modals.
 *  - The spotlight hole is cut from the dim layer using SVG with an evenodd
 *    fill-rule path (outer full-screen rect minus inner rounded-rect).
 *  - Spotlight position and size are Reanimated shared values, animated with
 *    withSpring when stepping to a new target so the hole glides smoothly.
 *  - The tooltip (title + body + buttons) is a regular View positioned
 *    above or below the spotlight using regular Animated for the fade.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated as RNAnimated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ff } from '@/lib/typography';
import { radius, spacing } from '@/lib/tokens';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TourStep {
  /** Matches the `id` prop of a <TourTarget> on the current screen. */
  targetId: string;
  title: string;
  body: string;
  /** Where to place the tooltip relative to the spotlight. Default: 'auto'. */
  tooltipSide?: 'above' | 'below';
  /**
   * When true and the target element isn't on screen (e.g. the TBB card is
   * hidden because all money is assigned), the step is shown as a full-screen
   * informational card instead of being skipped. The dim overlay is hidden and
   * the tooltip is centred with a "not visible right now" notice.
   */
  fallbackFullscreen?: boolean;
  /**
   * Delay in ms before calling measureInWindow for this step. Useful when the
   * screen needs to scroll into view first — set this to give the native scroll
   * commit time to complete before the spotlight position is measured.
   */
  delayMeasureMs?: number;
}

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TourContextValue {
  /** The targetId of the current active tour step, or null when no tour is running. */
  activeTargetId: string | null;
  /** Called by TourTarget when it has measured its position. */
  reportRect: (rect: TargetRect) => void;
  /**
   * Start a tour. No-op if a tour is already active.
   * @param onDone Fired when the tour finishes (complete or skip). Receives any
   *   steps that were shown in fallback mode so callers can persist them for
   *   retry on the next screen visit.
   */
  startTour: (steps: TourStep[], onDone?: (deferredSteps: TourStep[]) => void) => void;
  next: () => void;
  skip: () => void;
  /** Registers steps for deferred replay — called by useTour when it finds
   *  persisted deferred steps from a previous visit. Each step will be shown
   *  the next time its TourTarget mounts on screen. */
  queueDeferred: (steps: TourStep[]) => void;
  /** Delay (ms) for measureInWindow on the current active step. 0 when not set. */
  activeStepDelayMs: number;
  /** Called by TourTarget on layout when no tour is active — triggers a
   *  deferred mini-tour if this id was queued. */
  notifyTargetMounted: (id: string) => void;
  /** Called by TourTarget on mount/unmount so the provider knows which targets
   *  are currently on screen. Used to immediately start a deferred step when
   *  queueDeferred is called after the target has already laid out. */
  registerTarget: (id: string) => void;
  unregisterTarget: (id: string) => void;
}

export const TourContext = createContext<TourContextValue>({
  activeTargetId: null,
  reportRect: () => { },
  startTour: () => { },
  next: () => { },
  skip: () => { },
  queueDeferred: () => { },
  activeStepDelayMs: 0,
  notifyTargetMounted: () => { },
  registerTarget: () => { },
  unregisterTarget: () => { },
});

// ── Overlay ───────────────────────────────────────────────────────────────────

const DIM = 'rgba(13, 31, 13, 0.78)' as const;

const PADDING = 8;   // extra space around the target inside the spotlight
const ANIM_DURATION = 300;
const ANIM_EASING = Easing.out(Easing.cubic);
const SCREEN = Dimensions.get('window');

interface OverlayProps {
  steps: TourStep[];
  stepIndex: number;
  rect: TargetRect | null;
  spotX: RNAnimated.Value;
  spotY: RNAnimated.Value;
  spotW: RNAnimated.Value;
  spotH: RNAnimated.Value;
  spotRight: RNAnimated.AnimatedAddition<number>;
  spotBottom: RNAnimated.AnimatedAddition<number>;
  onNext: () => void;
  onSkip: () => void;
  colors: ThemeColors;
}

function TourOverlay({ steps, stepIndex, rect, spotX, spotY, spotW, spotH, spotRight, spotBottom, onNext, onSkip, colors }: OverlayProps) {
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const sh = SCREEN.height;

  // A step is in "fallback" mode when it has fallbackFullscreen AND no rect
  // has arrived (target not currently rendered on screen).
  const isFallback = step.fallbackFullscreen === true && rect === null;

  // ── Tooltip position ──────────────────────────────────────────────────────
  const insets = useSafeAreaInsets();
  const TOOLTIP_MARGIN = 12;

  let tooltipTop: number | undefined;
  let tooltipBottom: number | undefined;

  if (isFallback) {
    // Centre vertically in the usable area.
    tooltipTop = insets.top + (sh - insets.top - insets.bottom) / 4;
  } else if (rect) {
    const side = step.tooltipSide ?? (rect.y > sh / 2 ? 'above' : 'below');
    if (side === 'below') {
      tooltipTop = Math.max(rect.y + rect.height + PADDING + TOOLTIP_MARGIN, insets.top + TOOLTIP_MARGIN);
    } else {
      tooltipBottom = Math.max(sh - (rect.y - PADDING) + TOOLTIP_MARGIN, insets.bottom + TOOLTIP_MARGIN);
    }
  } else {
    tooltipTop = sh / 2;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dim overlay — hidden in fallback mode so nothing is spotlighted */}
      {!isFallback && (
        <>
          <RNAnimated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: DIM }, { height: spotY }]} pointerEvents="none" />
          <RNAnimated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: DIM }, { top: spotBottom }]} pointerEvents="none" />
          <RNAnimated.View style={[{ position: 'absolute', left: 0, backgroundColor: DIM }, { top: spotY, width: spotX, height: spotH }]} pointerEvents="none" />
          <RNAnimated.View style={[{ position: 'absolute', right: 0, backgroundColor: DIM }, { top: spotY, left: spotRight, height: spotH }]} pointerEvents="none" />
          <RNAnimated.View style={[{ position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' }, { top: spotY, left: spotX, width: spotW, height: spotH }]} pointerEvents="none" />
        </>
      )}
      {isFallback && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} pointerEvents="none" />
      )}

      {/* Tooltip bubble */}
      <View
        style={[
          ts.tooltip,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            top: tooltipTop,
            bottom: tooltipBottom,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Step counter */}
        <Text style={[ts.counter, { color: colors.textMeta }]}>
          {stepIndex + 1} of {steps.length}
        </Text>

        {isFallback && (
          <View style={[ts.fallbackBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[ts.fallbackTxt, { color: colors.textMeta }]}>
              Not visible on your screen right now
            </Text>
          </View>
        )}

        <Text style={[ts.title, { color: colors.textPrimary }]}>{step.title}</Text>
        <Text style={[ts.body, { color: colors.textSecondary }]}>{step.body}</Text>

        <View style={ts.btnRow}>
          <TouchableOpacity onPress={onSkip} hitSlop={8}>
            <Text style={[ts.skipTxt, { color: colors.textMeta }]}>Skip tour</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ts.nextBtn, { backgroundColor: colors.lime }]}
            onPress={onNext}
            activeOpacity={0.85}
          >
            <Text style={[ts.nextTxt, { color: colors.darkGreen }]}>
              {isLast ? 'Done' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function TourProvider({ children }: { children: React.ReactNode }) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  const [activeTour, setActiveTour] = useState<TourStep[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  // Refs so callbacks never capture stale closures.
  const stepRef = useRef(0);
  const activeTourRef = useRef<TourStep[] | null>(null);
  activeTourRef.current = activeTour;
  // Tracks whether the current step's target has reported a rect yet.
  const rectReceivedRef = useRef(false);

  // Steps shown in fallback mode during the current tour — collected as the
  // tour advances and passed to onDone so they can be persisted for retry.
  const deferredStepsRef = useRef<TourStep[]>([]);

  // Steps queued for a deferred retry (populated by queueDeferred from
  // useTour on focus). Maps targetId → step. Cleared as targets mount.
  const pendingDeferredRef = useRef<Map<string, TourStep>>(new Map());

  // Registry of target IDs that are currently mounted on screen. Lets
  // queueDeferred immediately start a step when the target already exists.
  const mountedTargetsRef = useRef<Set<string>>(new Set());

  // RN Animated values for the spotlight panels — stable refs driven on the
  // JS thread via setNativeProps (no Reanimated Worklets, no UI-thread crash).
  const sh = SCREEN.height;
  const sw = SCREEN.width;
  const spotX = useRef(new RNAnimated.Value(sw / 2 - 60)).current;
  const spotY = useRef(new RNAnimated.Value(sh / 2 - 30)).current;
  const spotW = useRef(new RNAnimated.Value(120)).current;
  const spotH = useRef(new RNAnimated.Value(60)).current;
  // Precomputed derived values — created once so TourOverlay never creates new
  // Animated nodes on re-render.
  const spotRight = useRef(RNAnimated.add(spotX, spotW)).current;
  const spotBottom = useRef(RNAnimated.add(spotY, spotH)).current;

  // Track whether the first rect for this tour has been applied yet, so we
  // can jump instead of animate on step 1 (avoids a "fly-in from center" flash).
  const isFirstRectRef = useRef(true);

  // Drive spotlight animation from an effect — clamp against safe-area insets.
  useEffect(() => {
    if (!rect) return;
    const rawTop = rect.y - PADDING;
    const rawLeft = rect.x - PADDING;
    const clampedTop = Math.max(rawTop, insets.top);
    const clampedLeft = Math.max(rawLeft, 0);
    const bottomEdge = rect.y + rect.height + PADDING;
    const clampedH = Math.max(0, bottomEdge - clampedTop);
    const clampedW = Math.min(rect.width + PADDING * 2, SCREEN.width - clampedLeft);

    if (isFirstRectRef.current) {
      // Jump to position immediately on the first step — no fly-in animation.
      isFirstRectRef.current = false;
      spotX.setValue(clampedLeft);
      spotY.setValue(clampedTop);
      spotW.setValue(clampedW);
      spotH.setValue(clampedH);
      return;
    }

    const cfg = { duration: ANIM_DURATION, easing: ANIM_EASING, useNativeDriver: false } as const;
    RNAnimated.parallel([
      RNAnimated.timing(spotX, { toValue: clampedLeft, ...cfg }),
      RNAnimated.timing(spotY, { toValue: clampedTop, ...cfg }),
      RNAnimated.timing(spotW, { toValue: clampedW, ...cfg }),
      RNAnimated.timing(spotH, { toValue: clampedH, ...cfg }),
    ]).start();
  }, [rect, insets, spotX, spotY, spotW, spotH]);

  const activeTargetId = activeTour ? activeTour[stepIndex]?.targetId ?? null : null;
  const activeStepDelayMs = activeTour ? (activeTour[stepIndex]?.delayMeasureMs ?? 0) : 0;

  // Shared advance logic — used by the Next / Finish button.
  const advanceStep = useCallback(() => {
    const tour = activeTourRef.current;
    if (!tour) return;

    // If the current step was shown in fallback mode, queue it for retry.
    const currentStep = tour[stepRef.current];
    if (currentStep?.fallbackFullscreen && !rectReceivedRef.current) {
      deferredStepsRef.current.push({ ...currentStep, fallbackFullscreen: false });
    }

    const nextIdx = stepRef.current + 1;
    if (nextIdx >= tour.length) {
      // Last step — delegate to endTour so onDone fires correctly.
      endTourRef.current?.();
    } else {
      setRect(null);
      stepRef.current = nextIdx;
      setStepIndex(nextIdx);
    }
  }, []);

  // Reset the "rect received" flag whenever we move to a new step.
  useEffect(() => {
    rectReceivedRef.current = false;
  }, [activeTargetId]);

  // Fallback fullscreen: if the step has fallbackFullscreen and the target
  // doesn't exist, show the tooltip immediately without waiting for a rect.
  useEffect(() => {
    if (!activeTour || !activeTargetId) return;
    const step = activeTour[stepRef.current];
    if (!step?.fallbackFullscreen) return;
    // Give TourTarget a brief window to report a rect first (it may exist).
    // If nothing arrives, keeping rect=null triggers fallback rendering.
    // No action needed here — TourOverlay's isFallback check handles it.
    // We just need to ensure the Modal is visible, which happens via activeTour.
  }, [activeTour, activeTargetId]);

  const reportRect = useCallback((r: TargetRect) => {
    rectReceivedRef.current = true;
    // measureInWindow on Android returns y relative to the app window, which
    // starts BELOW the status bar (y=0 = first pixel after status bar).
    // Our Modal has statusBarTranslucent so its y=0 is the physical screen top.
    // Adding insets.top converts from app-window coords to physical screen coords.
    // On iOS both systems share the same origin so no adjustment is needed.
    const yOffset = Platform.OS === 'android' ? insets.top : 0;
    const xOffset = Platform.OS === 'android' ? insets.left : 0;
    setRect({ ...r, x: r.x + xOffset, y: r.y + yOffset });
  }, [insets.top, insets.left]);

  const onDoneRef = useRef<((deferredSteps: TourStep[]) => void) | undefined>(undefined);
  // Stable ref so advanceStep can call endTour without a circular dependency.
  const endTourRef = useRef<(() => void) | undefined>(undefined);

  const startTour = useCallback((steps: TourStep[], onDone?: (deferredSteps: TourStep[]) => void) => {
    if (activeTourRef.current) return; // already running
    onDoneRef.current = onDone;
    deferredStepsRef.current = [];
    isFirstRectRef.current = true; // next rect should jump, not animate
    setRect(null);
    setStepIndex(0);
    stepRef.current = 0;
    setActiveTour(steps);
  }, []);

  const endTour = useCallback(() => {
    setActiveTour(null);
    setStepIndex(0);
    setRect(null);
    stepRef.current = 0;
    const cb = onDoneRef.current;
    onDoneRef.current = undefined;
    const deferred = deferredStepsRef.current.splice(0);
    cb?.(deferred);
  }, []);
  endTourRef.current = endTour;

  // skip checks whether the current step was a fallback before ending the tour
  // so it too gets deferred for retry.
  const skip = useCallback(() => {
    const currentStep = activeTourRef.current?.[stepRef.current];
    if (currentStep?.fallbackFullscreen && !rectReceivedRef.current) {
      deferredStepsRef.current.push({ ...currentStep, fallbackFullscreen: false });
    }
    endTour();
  }, [endTour]);

  const next = advanceStep;

  const queueDeferred = useCallback((steps: TourStep[]) => {
    for (const step of steps) {
      pendingDeferredRef.current.set(step.targetId, step);
    }
    // If a queued target is already on screen (its onLayout already fired
    // before this async call arrived), start the mini-tour immediately.
    if (!activeTourRef.current) {
      for (const step of steps) {
        if (mountedTargetsRef.current.has(step.targetId)) {
          pendingDeferredRef.current.delete(step.targetId);
          startTour([step]);
          break; // one tour at a time
        }
      }
    }
  }, [startTour]);

  const registerTarget = useCallback((id: string) => {
    mountedTargetsRef.current.add(id);
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    mountedTargetsRef.current.delete(id);
  }, []);

  const notifyTargetMounted = useCallback((id: string) => {
    const step = pendingDeferredRef.current.get(id);
    if (!step || activeTourRef.current) return;
    pendingDeferredRef.current.delete(id);
    // Start a 1-step mini-tour for this deferred step. Because fallbackFullscreen
    // is already false, if the target somehow disappears before measuring, the
    // tooltip just won't show (rect stays null → tooltip at sh/2 is skipped by
    // the user immediately). In practice the target just mounted, so it's fine.
    startTour([step]);
  }, [startTour]);

  return (
    <TourContext.Provider value={{ activeTargetId, activeStepDelayMs, reportRect, startTour, next, skip, queueDeferred, notifyTargetMounted, registerTarget, unregisterTarget }}>
      {children}

      {/* Overlay — rendered as a transparent Modal to sit above all navigation */}
      <Modal
        visible={activeTour !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={skip}
      >
        {activeTour && (
          <TourOverlay
            steps={activeTour}
            stepIndex={stepIndex}
            rect={rect}
            spotX={spotX}
            spotY={spotY}
            spotW={spotW}
            spotH={spotH}
            spotRight={spotRight}
            spotBottom={spotBottom}
            onNext={next}
            onSkip={skip}
            colors={colors}
          />
        )}
      </Modal>
    </TourContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTourContext() {
  return useContext(TourContext);
}

// ── Tooltip styles ────────────────────────────────────────────────────────────

const ts = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.sm,
    // Subtle shadow so it lifts off the overlay
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  counter: {
    ...ff(500),
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    ...ff(700),
    fontSize: 18,
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  body: {
    ...ff(400),
    fontSize: 14,
    lineHeight: 22,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  skipTxt: {
    ...ff(500),
    fontSize: 13,
  },
  nextBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.smd,
    borderRadius: radius.sm,
  },
  nextTxt: {
    ...ff(700),
    fontSize: 14,
    letterSpacing: -0.1,
  },
  fallbackBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    marginBottom: spacing.xs,
  },
  fallbackTxt: {
    ...ff(500),
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
