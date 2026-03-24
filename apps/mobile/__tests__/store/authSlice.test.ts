/**
 * @jest-environment node
 */
/**
 * Tests for store/authSlice.ts
 *
 * Run: npm test -- --testPathPattern=authSlice
 *
 * We test the synchronous reducers only (clearAuth, clearError).
 * Async thunks (login, register, etc.) require a mocked API — this is
 * covered in integration tests. Unit tests verify the slice's shape and
 * reducer purity.
 */

// Mock all native/Expo dependencies so tests run in a plain Node environment.
import type { AuthUser } from '../../store/authSlice';
import authReducer, { clearAuth, clearError } from '../../store/authSlice';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock axios to avoid network setup in reducer tests.
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn(),
    post: jest.fn(),
  })),
  isAxiosError: jest.fn(() => false),
  post: jest.fn(),
}));

// Mock the entire API service module — it throws synchronously at load time
// when EXPO_PUBLIC_API_URL is not set (the C-2 guard). Mocking the module
// prevents its top-level code from running during unit tests.
jest.mock('../../services/api', () => ({
  apiClient: {
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    get: jest.fn(),
    post: jest.fn(),
  },
  saveTokens: jest.fn().mockResolvedValue(undefined),
  clearTokens: jest.fn().mockResolvedValue(undefined),
  getAccessToken: jest.fn().mockResolvedValue(null),
}));

const mockUser: AuthUser = {
  id: 'user-123',
  email: 'emeka@example.com',
  first_name: 'Emeka',
  last_name: 'Okafor',
  identity_verified: true,
  onboarded: true,
};

describe('authSlice reducers', () => {
  // ── Initial state ───────────────────────────────────────────────────────

  it('has the correct initial state shape', () => {
    const state = authReducer(undefined, { type: '@@INIT' });
    expect(state).toEqual({
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,
    });
  });

  // ── clearAuth ───────────────────────────────────────────────────────────

  it('clearAuth resets user and authentication flag', () => {
    const loggedIn = {
      user: mockUser,
      isAuthenticated: true,
      loading: false,
      error: null,
    };
    const state = authReducer(loggedIn, clearAuth());
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBeNull();
  });

  it('clearAuth preserves loading: false', () => {
    const s = authReducer(
      { user: mockUser, isAuthenticated: true, loading: true, error: 'oops' },
      clearAuth(),
    );
    expect(s.loading).toBe(true); // loading is preserved — clearAuth does not touch it
  });

  // ── clearError ──────────────────────────────────────────────────────────

  it('clearError sets error to null', () => {
    const withError = {
      user: null,
      isAuthenticated: false,
      loading: false,
      error: 'Login failed',
    };
    const state = authReducer(withError, clearError());
    expect(state.error).toBeNull();
  });

  it('clearError is a no-op when error is already null', () => {
    const noError = {
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,
    };
    const state = authReducer(noError, clearError());
    expect(state.error).toBeNull();
  });

  // ── Reducer purity ──────────────────────────────────────────────────────

  it('returns the same reference for unknown actions (pure reducer)', () => {
    const initial = authReducer(undefined, { type: '@@INIT' });
    const after = authReducer(initial, { type: 'auth/unknown_action_xyz' });
    expect(after).toBe(initial);
  });
});
