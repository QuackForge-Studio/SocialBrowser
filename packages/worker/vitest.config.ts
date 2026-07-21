export default {
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/worker/src/**/*.test.ts'],
    exclude: ['packages/worker/src/**/*.test.js', 'packages/worker/src/**/*.test.d.ts', 'packages/worker/src/**/*.test.js.map', 'packages/worker/src/**/*.test.d.ts.map'],
  },
};