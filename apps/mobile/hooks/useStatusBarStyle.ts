import { getTheme, useTheme } from '@/lib/theme';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';

export function useStatusBarStyle(style: 'light' | 'dark', reset: 'light' | 'dark' = 'light') {
  const theme = useTheme();
  const isDark = theme === getTheme('dark');

  // In dark mode, screens with dark status bar icons (meant for light backgrounds)
  // need to flip to light icons so they remain visible on the dark background.
  // Screens already using light icons (on dark headers) stay as-is.
  const resolved = isDark && style === 'dark' ? 'light' : style;
  const resolvedReset = isDark && reset === 'dark' ? 'light' : reset;

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(resolved);
      return () => setStatusBarStyle(resolvedReset);
    }, [resolved, resolvedReset])
  );
}
