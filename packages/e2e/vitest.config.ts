import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@social-browser/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
