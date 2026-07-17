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
      STRIPE_SECRET_KEY: 'sk_test_cultrux_placeholder_key_12345',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_cultrux_webhook_secret',
    },
  },
});
