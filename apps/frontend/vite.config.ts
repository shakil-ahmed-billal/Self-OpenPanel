import tailwindcss from '@tailwindcss/vite';
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';

const plugins = [
  nitroV2Plugin({
    preset: 'node-server',
    compatibilityDate: '2025-10-21',
  }),
  viteTsConfigPaths({
    projects: ['./tsconfig.json'],
  }),
  tailwindcss(),
  tanstackStart(),
  viteReact(),
];

// Behind the hub's Caddy the page is `https://<name>.openpanel.cc`: Vite has to accept that Host,
// and its HMR client has to dial 443 over wss instead of the dev port.
const behindProxy = (process.env.DASHBOARD_URL ?? '').startsWith('https://');

export default defineConfig({
  plugins,
  server: {
    allowedHosts: ['.openpanel.cc'],
    ...(behindProxy ? { hmr: { protocol: 'wss', clientPort: 443 } } : {}),
  },
  ssr: {
    noExternal: [
      'react-syntax-highlighter',
      'lowlight',
      'highlight.js',
      // @visx/* packages ship extensionless ESM internal imports (e.g. @visx/scale/esm/scales/band)
      // that fail Node's native ESM resolver during Vite dev SSR unless transformed by Vite.
      // react-svg-worldmap's default export arrives as `{ default }`; lodash/debounce is extensionless.
      /^@visx\//,
      'lodash',
      'react-svg-worldmap',
      // react-svg-worldmap requires d3-geo v2 (CommonJS) while the choropleth
      // uses v3 (ESM, no default export). Left external, both import the one
      // d3-geo the server output ships, and v2's default import fails on v3.
      'd3-geo',
      // Nested deps under @number-flow/react (esm-env, number-flow) inside Bun's isolated
      // store are missed by Nitro's node-server tracer, causing ERR_MODULE_NOT_FOUND at runtime.
      '@number-flow/react',
      'number-flow',
      'esm-env',
    ],
    // Vite dev SSR runs `noExternal` packages in an ESM ModuleRunner without `require`/`exports`.
    // Pre-bundling CommonJS entries here converts them to ESM in dev without breaking Nitro builds.
    optimizeDeps: {
      include: [
        '@visx/responsive > lodash/debounce',
        'lodash.debounce',
        'lodash.isequal',
        'lodash.throttle',
        'react-svg-worldmap',
        'react-svg-worldmap/dist/countries.geo',
        'react-syntax-highlighter',
        'react-syntax-highlighter > lowlight',
        'react-syntax-highlighter > lowlight/lib/core',
        'react-syntax-highlighter > highlight.js/lib/core',
        'react-syntax-highlighter > highlight.js/lib/languages/typescript',
        'react-syntax-highlighter > highlight.js/lib/languages/bash',
        'react-syntax-highlighter > highlight.js/lib/languages/json',
        'react-syntax-highlighter > highlight.js/lib/languages/markdown',
      ],
    },
  },
});
