import path from 'path';

export default {
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['src/**/*.test.js', 'src/**/*.test.js.map', 'src/**/*.test.d.ts', 'src/**/*.test.d.ts.map'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@social-browser/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
};