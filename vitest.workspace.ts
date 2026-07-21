export default [
  {
    test: {
      name: 'main',
      root: './packages/main',
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.test.js', 'src/**/*.test.js.map', 'src/**/*.test.d.ts', 'src/**/*.test.d.ts.map'],
    },
  },
  {
    test: {
      name: 'dashboard',
      root: './packages/dashboard',
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      exclude: ['src/**/*.test.js', 'src/**/*.test.js.map', 'src/**/*.test.d.ts', 'src/**/*.test.d.ts.map'],
      setupFiles: [],
    },
  },
  {
    test: {
      name: 'worker',
      root: './packages/worker',
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.test.js', 'src/**/*.test.js.map', 'src/**/*.test.d.ts', 'src/**/*.test.d.ts.map'],
    },
  },
];
