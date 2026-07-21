export default {
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['packages/dashboard/src/**/*.test.tsx', 'packages/dashboard/src/**/*.test.ts'],
    exclude: ['packages/dashboard/src/**/*.test.js', 'packages/dashboard/src/**/*.test.js.map', 'packages/dashboard/src/**/*.test.d.ts', 'packages/dashboard/src/**/*.test.d.ts.map'],
    setupFiles: [],
  },
};