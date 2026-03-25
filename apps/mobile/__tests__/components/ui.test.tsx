/**
 * __tests__/components/ui.test.tsx
 *
 * Render and behaviour tests for shared UI primitive components.
 *
 * Run: npm test -- --testPathPattern=ui
 *
 * Strategy:
 *   - Mock @/lib/theme so components receive a stable colour object without
 *     needing SecureStore or a real ThemeProvider.
 *   - Mock react-native-reanimated using the official jest test utilities so
 *     Animated components (Button, Chip) render without Hermes native calls.
 *   - All other imports (typography, tokens) run unmodified.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatMoney } from '../../lib/typography';

// ─── Mocks ───────────────────────────────────────────────────────────────────

/**
 * Provide a static light-mode colour object so all useTheme() calls in the
 * components under test return consistent values.
 */
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    background: '#F5F9F0',
    surface: '#EEF9E4',
    surfaceElevated: '#E0F2D0',
    surfaceHigh: '#CAE8B4',
    white: '#FFFFFF',
    brand: '#2D6A2D',
    brandBright: '#4CAF50',
    darkGreen: '#0D1F0D',
    darkGreenMid: '#1A3A1A',
    lime: '#A8E063',
    lime2: '#B8F070',
    lime3: '#DAFBBC',
    border: 'rgba(45,106,45,0.12)',
    borderStrong: 'rgba(45,106,45,0.25)',
    borderBrand: 'rgba(45,106,45,0.35)',
    separator: 'rgba(45,106,45,0.08)',
    textPrimary: '#0D1F0D',
    textSecondary: '#3D5C3D',
    textMeta: '#7A9A7A',
    textTertiary: '#B0C8B0',
    textInverse: '#FFFFFF',
    textInverseFaint: 'rgba(255,255,255,0.7)',
    error: '#D32F2F',
    errorSubtle: '#FFEBEE',
    errorText: '#B71C1C',
    warning: '#F57C00',
    warningSubtle: '#FFF3E0',
    warningBorder: 'rgba(245,124,0,0.4)',
    warningBorderLight: 'rgba(245,124,0,0.2)',
    warningText: '#E65100',
    success: '#2E7D32',
    successSubtle: '#E8F5E9',
    successText: '#1B5E20',
    info: '#0288D1',
    infoSubtle: '#E1F5FE',
    infoBorder: 'rgba(2,136,209,0.3)',
    purple: '#7B1FA2',
    purpleSubtle: '#F3E5F5',
    purpleBorder: 'rgba(123,31,162,0.2)',
    overlay: 'rgba(0,0,0,0.5)',
    overlayNeutral: 'rgba(0,0,0,0.4)',
    overlayGhost: 'rgba(255,255,255,0.1)',
    overlayGhostMid: 'rgba(255,255,255,0.2)',
    overlayGhostStrong: 'rgba(255,255,255,0.3)',
  }),
  ThemeContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
  getTheme: jest.fn(),
  THEME_STORAGE_KEY: 'mm_theme',
}));

/** Replace Reanimated + Worklets with minimal stubs — no native initialisation needed. */
jest.mock('react-native-worklets', () => ({
  useSharedValue: (v: unknown) => ({ value: v }),
  useWorkletCallback: (fn: unknown) => fn,
  runOnJS: (fn: unknown) => fn,
  runOnWorklet: (fn: unknown) => fn,
}));

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native');
  return {
    default: { createAnimatedComponent: RN.Animated.createAnimatedComponent },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withDelay: (v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    withRepeat: (v: unknown) => v,
    interpolate: (v: unknown) => v,
    runOnJS: (fn: unknown) => fn,
    createAnimatedComponent: RN.Animated.createAnimatedComponent,
    Easing: { bezier: () => 0, linear: 0, ease: 0 },
  };
});

// ─── Button ───────────────────────────────────────────────────────────────────

describe('Button', () => {
  it('renders children label text', () => {
    render(<Button>Save</Button>);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('fires onPress callback when tapped', () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Tap me</Button>);
    fireEvent.press(screen.getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} disabled>
        Disabled
      </Button>,
    );
    fireEvent.press(screen.getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows ActivityIndicator when loading', () => {
    const { UNSAFE_getByType } = render(<Button loading>Loading</Button>);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('hides label text when loading', () => {
    render(<Button loading>Submit</Button>);
    expect(screen.queryByText('Submit')).toBeNull();
  });

  it('renders lime variant without crash', () => {
    render(<Button variant="lime">Continue</Button>);
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('renders red (destructive) variant without crash', () => {
    render(<Button variant="red">Delete</Button>);
    expect(screen.getByText('Delete')).toBeTruthy();
  });
});

// ─── Badge ────────────────────────────────────────────────────────────────────

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge variant="success">+12%</Badge>);
    expect(screen.getByText('+12%')).toBeTruthy();
  });

  it('renders neutral variant by default without crash', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('renders each variant without crash', () => {
    const variants = ['success', 'error', 'warning', 'info', 'purple', 'neutral'] as const;
    for (const variant of variants) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeTruthy();
      unmount();
    }
  });

  it('renders sm size without crash', () => {
    render(<Badge size="sm">3</Badge>);
    expect(screen.getByText('3')).toBeTruthy();
  });
});

// ─── Chip ─────────────────────────────────────────────────────────────────────

describe('Chip', () => {
  it('renders label text', () => {
    render(<Chip label="All" />);
    expect(screen.getByText('All')).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    render(<Chip label="Debits" onPress={onPress} />);
    fireEvent.press(screen.getByText('Debits'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Chip label="Credits" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Credits'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('exposes accessibilityLabel on interactive chip', () => {
    render(
      <Chip
        label="Credits"
        accessibilityLabel="Show credits only"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Show credits only')).toBeTruthy();
  });

  it('renders selected state without crash', () => {
    render(<Chip label="Active" selected />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('renders quickfill variant without crash', () => {
    render(<Chip label="Assign TBB" variant="quickfill" />);
    expect(screen.getByText('Assign TBB')).toBeTruthy();
  });
});

// ─── EmptyState ───────────────────────────────────────────────────────────────

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No transactions" />);
    expect(screen.getByText('No transactions')).toBeTruthy();
  });

  it('renders body text when provided', () => {
    render(
      <EmptyState
        title="No transactions"
        body="Sync a bank account to see transactions here."
      />,
    );
    expect(
      screen.getByText('Sync a bank account to see transactions here.'),
    ).toBeTruthy();
  });

  it('renders emoji when provided', () => {
    render(<EmptyState emoji="🧺" title="Empty" />);
    expect(screen.getByText('🧺')).toBeTruthy();
  });

  it('renders CTA button when action is specified', () => {
    const onPress = jest.fn();
    render(
      <EmptyState
        title="No accounts"
        action={{ label: 'Add account', onPress }}
      />,
    );
    const btn = screen.getByText('Add account');
    expect(btn).toBeTruthy();
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not render CTA button when action is omitted', () => {
    render(<EmptyState title="Nothing here" />);
    // No button role should be present (other than the EmptyState itself)
    expect(screen.queryByRole('button')).toBeNull();
  });
});

// ─── AmountDisplay ────────────────────────────────────────────────────────────

describe('AmountDisplay', () => {
  it('renders formatted kobo amount matching formatMoney output', () => {
    const kobo = 150000; // ₦1,500.00
    render(<AmountDisplay kobo={kobo} />);
    // Use the same formatMoney function the component uses — locale-safe.
    expect(screen.getByText(formatMoney(kobo))).toBeTruthy();
  });

  it('renders zero', () => {
    render(<AmountDisplay kobo={0} />);
    expect(screen.getByText(formatMoney(0))).toBeTruthy();
  });

  it('renders negative amount', () => {
    render(<AmountDisplay kobo={-50000} />);
    expect(screen.getByText(formatMoney(-50000))).toBeTruthy();
  });

  it('renders compact notation for large amounts', () => {
    render(<AmountDisplay kobo={10_000_000} compact />);
    expect(screen.getByText(formatMoney(10_000_000, { compact: true }))).toBeTruthy();
  });

  it('renders without currency symbol when symbol=false', () => {
    render(<AmountDisplay kobo={100000} symbol={false} />);
    expect(screen.getByText(formatMoney(100000, { symbol: false }))).toBeTruthy();
  });

  it('renders all size variants without crash', () => {
    const sizes = ['display', 'lg', 'md', 'sm', 'xs'] as const;
    for (const size of sizes) {
      const { unmount } = render(<AmountDisplay kobo={50000} size={size} />);
      expect(screen.getByText(formatMoney(50000))).toBeTruthy();
      unmount();
    }
  });
});
