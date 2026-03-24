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
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

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

// ─── Variant styles ───────────────────────────────────────────────────────────

const VARIANTS: Record<
  ToastVariant,
  {
    bg: string;
    border: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    iconColor: string;
    titleColor: string;
    msgColor: string;
  }
> = {
  success: {
    bg: '#ECFDF5',
    border: '#A7F3D0',
    icon: 'checkmark-circle',
    iconColor: '#0F7B3F',
    titleColor: '#065F46',
    msgColor: '#047857',
  },
  error: {
    bg: '#FEF2F2',
    border: '#FECACA',
    icon: 'close-circle',
    iconColor: '#DC2626',
    titleColor: '#7F1D1D',
    msgColor: '#B91C1C',
  },
  info: {
    bg: '#EFF6FF',
    border: '#BFDBFE',
    icon: 'information-circle',
    iconColor: '#2563EB',
    titleColor: '#1E3A8A',
    msgColor: '#1D4ED8',
  },
};

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<(ToastConfig & { id: number }) | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);

  const [confirmCfg, setConfirmCfg] = useState<ConfirmConfig | null>(null);
  const [sheetCfg, setSheetCfg] = useState<ActionSheetConfig | null>(null);

  const confirm = useCallback((config: ConfirmConfig) => setConfirmCfg(config), []);
  const actionSheet = useCallback((config: ActionSheetConfig) => setSheetCfg(config), []);

  const dismiss = useCallback(() => {
    opacity.value = withTiming(0, { duration: 220 });
    translateY.value = withTiming(-120, { duration: 280 }, (finished) => {
      if (finished) setCurrent(null);
    });
  }, [opacity, translateY]);

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

  const v = VARIANTS[current?.variant ?? 'info'];

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

// ─── Styles ───────────────────────────────────────────────────────────────────

const ts = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 9999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  icon: { flexShrink: 0 },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  message: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  dismiss: { flexShrink: 0, opacity: 0.6 },
});

// ─── Confirm dialog styles ────────────────────────────────────────────────────

const cs = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  message: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0F7B3F',
    alignItems: 'center',
  },
  confirmBtnDestructive: { backgroundColor: '#EF4444' },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  confirmTextDestructive: { color: '#fff' },
});

// ─── Action sheet styles ──────────────────────────────────────────────────────

const sh = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
    overflow: 'hidden',
  },
  sheetTitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  option: { paddingVertical: 16, paddingHorizontal: 20 },
  optionBorder: { borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  optionText: { fontSize: 16, color: '#111827', textAlign: 'center' },
  optionDestructive: { color: '#EF4444' },
  cancelOption: { marginTop: 8 },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#6B7280', textAlign: 'center' },
});
