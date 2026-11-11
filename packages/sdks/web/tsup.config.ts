import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build (npm package) — cjs + esm + dts
  {
    entry: ['index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: true,
    sourcemap: false,
    clean: true,
    minify: true,
  },
  // IIFE build (script tag: op1.js)
  {
    entry: { 'src/tracker': 'src/tracker.ts' },
    format: ['iife'],
    splitting: false,
    sourcemap: false,
    minify: true,
  },
]);
