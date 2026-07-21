export default {
  test: {
    globals: true,
    include: [
      'packages/worker/src/**/*.test.ts',
      'packages/main/src/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.js',
      '**/*.test.js.map',
      '**/*.test.d.ts',
      '**/*.test.d.ts.map',
    ],
    environment: 'node',
    testTimeout: 15000,
  },
};