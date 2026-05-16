import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';

export function useStatusBarStyle(style: 'light' | 'dark', reset: 'light' | 'dark' = 'light') {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style);
      return () => setStatusBarStyle(reset);
    }, [style, reset])
  );
}
