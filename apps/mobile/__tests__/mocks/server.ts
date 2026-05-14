import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * MSW server for Jest tests.
 *
 * Usage in a test file (or globalSetup):
 *   import { server } from '../mocks/server';
 *   beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 *
 * Or rely on __tests__/setup/mswSetup.ts being in setupFilesAfterFramework
 * so every test suite gets it automatically.
 */
export const server = setupServer(...handlers);
