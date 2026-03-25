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
 * components/ui/Input.tsx
 *
 * Styled text input matching the .inp / .inp-lbl / .inp-hint classes in the
 * mockup. Supports:
 *   - Optional label above the field
 *   - Animated focus border (brand colour + 3px soft ring)
 *   - Error state (red border + red hint)
 *   - Left / right slot for icons or buttons
 *   - Secure text entry toggle (password fields)
 *
 * CSS reference (MoniMata_V5.html):
 *   .inp         height:48, borderRadius:--rm, border:1.5px --bd, font:15px
 *   .inp:focus   border: --gp, box-shadow: 0 0 0 3px rgba(45,106,45,0.1)
 *   .inp-lbl     12px / 600 / --ts
 *   .inp-hint    12px / --tm
 */

import React, { forwardRef, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Node rendered at the left edge inside the field (icon, currency symbol). */
  leftSlot?: React.ReactNode;
  /** Node rendered at the right edge inside the field (clear, show/hide toggle). */
  rightSlot?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

// ─── AnimatedView ─────────────────────────────────────────────────────────────

const AnimatedView = Animated.createAnimatedComponent(View);

// ─── Input ────────────────────────────────────────────────────────────────────

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    hint,
    error,
    leftSlot,
    rightSlot,
    containerStyle,
    onFocus,
    onBlur,
    style,
    ...rest
  },
  ref,
) {
  const colors = useTheme();
  const focused = useSharedValue(0); // 0 = blurred, 1 = focused
  const [secureVisible, setSecureVisible] = useState(false);

  const isSecure = rest.secureTextEntry && !secureVisible;

  // Animated border colour: border → brand
  const borderAnim = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      focused.value,
      [0, 1],
      [
        error ? colors.error : colors.border,
        error ? colors.error : colors.brand,
      ],
    );
    return {
      borderColor,
      // Soft focus ring via shadow-like opacity ring (iOS only; Android uses borderColor)
      shadowColor: focused.value > 0 ? colors.brand : 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: focused.value * 0.12,
      shadowRadius: 4,
    };
  });

  function handleFocus(e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) {
    focused.value = withTiming(1, { duration: 150 });
    onFocus?.(e);
  }
  function handleBlur(e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) {
    focused.value = withTiming(0, { duration: 150 });
    onBlur?.(e);
  }

  return (
    <View style={[s.root, containerStyle]}>
      {label && (
        <Text style={[s.label, { color: colors.textSecondary }]}>{label}</Text>
      )}

      <AnimatedView
        style={[
          s.fieldWrap,
          {
            backgroundColor: colors.white,
            borderColor: error ? colors.error : colors.border,
          },
          borderAnim,
        ]}
      >
        {leftSlot && <View style={s.leftSlot}>{leftSlot}</View>}

        <TextInput
          ref={ref}
          placeholderTextColor={colors.textTertiary}
          style={[
            s.field,
            { color: colors.textPrimary },
            leftSlot ? s.fieldWithLeft : undefined,
            rightSlot || rest.secureTextEntry ? s.fieldWithRight : undefined,
            style,
          ]}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={isSecure}
          {...rest}
        />

        {rest.secureTextEntry ? (
          <TouchableOpacity
            style={s.rightSlot}
            onPress={() => setSecureVisible((v) => !v)}
            accessibilityLabel={secureVisible ? 'Hide password' : 'Show password'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {/* Uses a simple text toggle; replace with Ionicons in screens if preferred */}
            <Text style={{ color: colors.textMeta, fontSize: 13 }}>
              {secureVisible ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        ) : rightSlot ? (
          <View style={s.rightSlot}>{rightSlot}</View>
        ) : null}
      </AnimatedView>

      {(error || hint) && (
        <Text
          style={[
            s.hint,
            { color: error ? colors.error : colors.textMeta },
          ]}
        >
          {error ?? hint}
        </Text>
      )}
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    width: '100%',
  },
  label: {
    ...type_.small,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    marginBottom: spacing.xs,
  },
  fieldWrap: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  field: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_400Regular',
    paddingHorizontal: 14,
  },
  fieldWithLeft: {
    paddingLeft: 6,
  },
  fieldWithRight: {
    paddingRight: 6,
  },
  leftSlot: {
    paddingLeft: 12,
    paddingRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightSlot: {
    paddingRight: 12,
    paddingLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    ...type_.small,
    marginTop: spacing.xs,
  },
});
