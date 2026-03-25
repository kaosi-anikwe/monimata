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
 * In-app toast notification system.
 *
 * Usage
 * ─────
 *   // In any component inside ToastProvider:
 *   const { success, error, info } = useToast();
 *   success('Saved!');
 *   error('Something went wrong', 'Please try again.');
 *
 * Wrap your root layout with <ToastProvider> (inside SafeAreaProvider).
 */
import { Ionicons } from '@expo/vector-icons';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme, type ThemeColors } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { ff } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastConfig {
  title: string;
  message?: string;
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Defaults to 3500. */
  duration?: number;
}

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmText?: string;
  confirmStyle?: 'default' | 'destructive';
  cancelText?: string;
  onConfirm: () => void;
}

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  style?: 'default' | 'destructive';
}

export interface ActionSheetConfig {
  title?: string;
  options: ActionSheetOption[];
}

export interface ToastContextValue {
  toast: (config: ToastConfig) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  confirm: (config: ConfirmConfig) => void;
  actionSheet: (config: ActionSheetConfig) => void;
}

// ─── Variant config ───────────────────────────────────────────────────────────

type VariantConfig = {
  bg: string;
  border: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  titleColor: string;
  msgColor: string;
};

// Border rgba values are the corresponding status token colours at 25 % opacity.
function getVariants(colors: ThemeColors): Record<ToastVariant, VariantConfig> {
  return {
    success: {
      bg: colors.successSubtle,
      border: colors.successBorder,
      icon: 'checkmark-circle',
      iconColor: colors.successText,
      titleColor: colors.successText,
      msgColor: colors.brand,
    },
    error: {
      bg: colors.errorSubtle,
      border: colors.errorBorder,
      icon: 'close-circle',
      iconColor: colors.error,
      titleColor: colors.error,
      msgColor: colors.error,
    },
    info: {
      bg: colors.infoSubtle,
      border: colors.infoBorder,
      icon: 'information-circle',
      iconColor: colors.info,
      titleColor: colors.info,
      msgColor: colors.info,
    },
  };
}


// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const colors = useTheme();

  const variants = useMemo(() => getVariants(colors), [colors]);
  const ts = useMemo(() => makeToastStyles(colors), [colors]);
  const cs = useMemo(() => makeConfirmStyles(colors), [colors]);
  const sh = useMemo(() => makeSheetStyles(colors), [colors]);

  const [current, setCurrent] = useState<(ToastConfig & { id: number }) | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);

  const [confirmCfg, setConfirmCfg] = useState<ConfirmConfig | null>(null);
  const [sheetCfg, setSheetCfg] = useState<ActionSheetConfig | null>(null);

  const confirm = useCallback((config: ConfirmConfig) => setConfirmCfg(config), []);
  const actionSheet = useCallback((config: ActionSheetConfig) => setSheetCfg(config), []);

  const clearCurrent = useCallback(() => setCurrent(null), []);

  const dismiss = useCallback(() => {
    opacity.value = withTiming(0, { duration: 220 });
    translateY.value = withTiming(-120, { duration: 280 }, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(clearCurrent);
    });
  }, [clearCurrent, opacity, translateY]);

  const show = useCallback(
    (config: ToastConfig) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      // Reset before animating in (handles rapid successive calls)
      translateY.value = -120;
      opacity.value = 0;

      setCurrent({ ...config, id: ++idRef.current });

      translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
      opacity.value = withTiming(1, { duration: 180 });

      timerRef.current = setTimeout(dismiss, config.duration ?? 3500);
    },
    [dismiss, opacity, translateY],
  );

  const toast = useCallback((config: ToastConfig) => show(config), [show]);
  const success = useCallback(
    (title: string, message?: string) => show({ title, message, variant: 'success' }),
    [show],
  );
  const error = useCallback(
    (title: string, message?: string) => show({ title, message, variant: 'error' }),
    [show],
  );
  const info = useCallback(
    (title: string, message?: string) => show({ title, message, variant: 'info' }),
    [show],
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const v = variants[current?.variant ?? 'info'];

  return (
    <ToastContext.Provider value={{ toast, success, error, info, confirm, actionSheet }}>
      {children}

      {/* ── Confirm dialog ── */}
      {confirmCfg && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setConfirmCfg(null)}>
          <View style={cs.overlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setConfirmCfg(null)}
            />
            <View style={cs.card}>
              <Text style={cs.title}>{confirmCfg.title}</Text>
              <Text style={cs.message}>{confirmCfg.message}</Text>
              <View style={cs.row}>
                <TouchableOpacity
                  style={cs.cancelBtn}
                  onPress={() => setConfirmCfg(null)}
                  activeOpacity={0.8}
                >
                  <Text style={cs.cancelText}>{confirmCfg.cancelText ?? 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    cs.confirmBtn,
                    confirmCfg.confirmStyle === 'destructive' && cs.confirmBtnDestructive,
                  ]}
                  onPress={() => {
                    const fn = confirmCfg.onConfirm;
                    setConfirmCfg(null);
                    fn();
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      cs.confirmText,
                      confirmCfg.confirmStyle === 'destructive' && cs.confirmTextDestructive,
                    ]}
                  >
                    {confirmCfg.confirmText ?? 'Confirm'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Action sheet ── */}
      {sheetCfg && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSheetCfg(null)}>
          <TouchableOpacity
            style={sh.overlay}
            activeOpacity={1}
            onPress={() => setSheetCfg(null)}
          />
          <View style={sh.sheet}>
            {sheetCfg.title ? <Text style={sh.sheetTitle}>{sheetCfg.title}</Text> : null}
            {sheetCfg.options.map((opt, i) => (
              <TouchableOpacity
                key={i}
                style={[sh.option, i > 0 && sh.optionBorder]}
                onPress={() => {
                  const fn = opt.onPress;
                  setSheetCfg(null);
                  fn();
                }}
                activeOpacity={0.7}
              >
                <Text style={[sh.optionText, opt.style === 'destructive' && sh.optionDestructive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[sh.option, sh.optionBorder, sh.cancelOption]}
              onPress={() => setSheetCfg(null)}
              activeOpacity={0.7}
            >
              <Text style={sh.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* ── Toast notification ── */}
      {current && (
        <Animated.View
          style={[
            ts.container,
            { top: insets.top + 10 },
            { backgroundColor: v.bg, borderColor: v.border },
            animStyle,
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={ts.inner}
            onPress={dismiss}
            activeOpacity={0.85}
            accessible
            accessibilityRole="alert"
            accessibilityLabel={`${current.title}${current.message ? '. ' + current.message : ''}`}
          >
            <Ionicons name={v.icon} size={22} color={v.iconColor} style={ts.icon} />
            <View style={ts.textWrap}>
              <Text style={[ts.title, { color: v.titleColor }]} numberOfLines={2}>
                {current.title}
              </Text>
              {current.message ? (
                <Text style={[ts.message, { color: v.msgColor }]} numberOfLines={3}>
                  {current.message}
                </Text>
              ) : null}
            </View>
            <Ionicons name="close" size={16} color={v.iconColor} style={ts.dismiss} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// ─── Style factories ──────────────────────────────────────────────────────────

// Toast notification — shadow colour uses the brand dark-green
function makeToastStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      borderRadius: radius.sm,
      borderWidth: 1,
      // Elevated shadow (more prominent than shadow.md — toast must float above all content)
      ...Platform.select({
        ios: {
          shadowColor: colors.darkGreen,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.14,
          shadowRadius: 18,
        },
        android: { elevation: 10 },
        default: {},
      }),
      zIndex: 9999,
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.mdn,
      gap: 10,
    },
    icon: { flexShrink: 0 },
    textWrap: { flex: 1 },
    title: { fontSize: 14, lineHeight: 20, ...ff(700) },
    message: { fontSize: 13, lineHeight: 18, marginTop: 2, ...ff(400) },
    dismiss: { flexShrink: 0, opacity: 0.55 },
  });
}

// Confirm dialog modal
function makeConfirmStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlayDark,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xxl,
    },
    card: {
      backgroundColor: colors.white,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xxl,
      width: '100%',
      maxWidth: 340,
      ...Platform.select({
        ios: {
          shadowColor: colors.darkGreen,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.14,
          shadowRadius: 24,
        },
        android: { elevation: 12 },
        default: {},
      }),
    },
    title: {
      fontSize: 17,
      lineHeight: 24,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      letterSpacing: -0.3,
      ...ff(800),
    },
    message: {
      fontSize: 14,
      color: colors.textMeta,
      lineHeight: 21,
      marginBottom: spacing.xl,
      ...ff(400),
    },
    row: { flexDirection: 'row', gap: spacing.sm },
    cancelBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    cancelText: { fontSize: 15, color: colors.textSecondary, ...ff(600) },
    confirmBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radius.sm,
      backgroundColor: colors.brand,
      alignItems: 'center',
    },
    confirmBtnDestructive: { backgroundColor: colors.error },
    confirmText: { fontSize: 15, color: colors.white, ...ff(700) },
    // confirmTextDestructive has the same colour — kept for API compat
    confirmTextDestructive: { color: colors.white },
  });
}

// Action sheet modal
function makeSheetStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlayDarkMid,
    },
    sheet: {
      backgroundColor: colors.white,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingBottom: 34,
      overflow: 'hidden',
    },
    sheetTitle: {
      fontSize: 13,
      color: colors.textMeta,
      textAlign: 'center',
      paddingVertical: spacing.mdn,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      ...ff(600),
    },
    option: {
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
    },
    optionBorder: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    optionText: {
      fontSize: 16,
      color: colors.textPrimary,
      textAlign: 'center',
      ...ff(500),
    },
    optionDestructive: { color: colors.error },
    cancelOption: { marginTop: spacing.sm },
    cancelText: {
      fontSize: 16,
      color: colors.textMeta,
      textAlign: 'center',
      ...ff(600),
    },
  });
}

