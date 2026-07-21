export default {
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/main/src/**/*.test.ts'],
    exclude: ['packages/main/src/**/*.test.js', 'packages/main/src/**/*.test.d.ts', 'packages/main/src/**/*.test.js.map', 'packages/main/src/**/*.test.d.ts.map'],
  },
};