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
 * CountUp — animates a number from 0 to target value.
 * Pure JS animation using requestAnimationFrame with ease-out cubic.
 */

import React, { useEffect, useRef, useState } from 'react';
import { type StyleProp, Text, type TextStyle } from 'react-native';

export interface CountUpProps {
  /** Target numeric value (e.g. kobo amount). */
  value: number;
  /** Formats the interpolated number for display. Called on JS thread. */
  formatter: (v: number) => string;
  style?: StyleProp<TextStyle>;
  /** Animation duration in ms. Default 600. */
  duration?: number;
  /** Number of lines. */
  numberOfLines?: number;
}

export function CountUp({
  value,
  formatter,
  style,
  duration = 600,
  numberOfLines,
}: CountUpProps) {
  const [display, setDisplay] = useState(() => formatter(0));
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();

    let raf: number;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (value - from) * eased;
      setDisplay(formatter(Math.round(current)));

      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, formatter]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {display}
    </Text>
  );
}
