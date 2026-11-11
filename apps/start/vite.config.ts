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
      // CommonJS that Node's ESM loader gets wrong in the built server:
      // @visx/responsive imports `lodash/debounce` without an extension, and
      // react-svg-worldmap's default export arrives as `{ default }`. Bundled,
      // both resolve.
      '@visx/responsive',
      'lodash',
      'react-svg-worldmap',
      // react-svg-worldmap requires d3-geo v2 (CommonJS) while the choropleth
      // uses v3 (ESM, no default export). Left external, both import the one
      // d3-geo the server output ships, and v2's default import fails on v3.
      'd3-geo',
    ],
  },
});
