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
    define: {
      'process.env.WEB_VERSION': JSON.stringify(process.env.WEB_VERSION || '1.4.4'),
      'process.env.SDK_VERSION': JSON.stringify(process.env.SDK_VERSION || '1.3.4'),
    },
  },
]);
