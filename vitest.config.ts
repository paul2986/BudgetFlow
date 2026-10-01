import { defineConfig } from 'vitest/config';

// Two suites:
//   npm test         tests/unit: merge and storage logic, no server needed.
//   npm run test:db  tests/db: access rules and multi-device sync against a
//                    local Supabase (`supabase start` first; see tests/README.md).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The db suite talks to a real server; give round trips room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // The app logs every storage step; keep warnings and errors, drop the rest.
    onConsoleLog: (_log, type) => (type === 'stdout' ? false : undefined),
  },
});
