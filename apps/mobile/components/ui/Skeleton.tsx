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
 * components/ui/Skeleton.tsx
 *
 * A single pulsing rectangle for composing skeleton loading screens.
 * Use it wherever content is loading and a placeholder shape is needed.
 *
 * @example
 *   <Skeleton width="60%" height={14} />
 *   <Skeleton width={48} height={48} borderRadius={radius.sm} />
 */

import React, { useEffect } from 'react';
import { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';
import { radius } from '@/lib/tokens';

export interface SkeletonProps {
    width?: DimensionValue;
    height?: number;
    borderRadius?: number;
    style?: StyleProp<ViewStyle>;
}

export function Skeleton({
    width = '100%',
    height = 16,
    borderRadius = radius.xs,
    style,
}: SkeletonProps) {
    const colors = useTheme();
    const opacity = useSharedValue(0.4);

    useEffect(() => {
        opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return (
        <Animated.View
            style={[
                { width, height, borderRadius, backgroundColor: colors.surfaceElevated },
                animStyle,
                style,
            ]}
        />
    );
}
