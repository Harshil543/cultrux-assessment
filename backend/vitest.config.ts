import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/env.ts'],
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DB_NAME: 'cultrux_test',
      JWT_SECRET: 'test-secret',
    },
  },
});
