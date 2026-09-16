/**
 * Build #1 of 2: extension pages (React popup/options, vanilla gate/interstitial/vault/offscreen)
 * and the module service worker. Content scripts are built separately as single-file IIFEs by
 * scripts/build.mjs. See DECISIONS.md ("Why not @crxjs").
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = resolve(import.meta.dirname, 'src');

/** Copy manifest.json into dist, stamping the version from package.json. */
function manifest(): Plugin {
  return {
    name: 'impulse-vault-manifest',
    buildStart() {
      this.addWatchFile(resolve(import.meta.dirname, 'manifest.json'));
    },
    generateBundle() {
      const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'));
      const m = JSON.parse(readFileSync(resolve(import.meta.dirname, 'manifest.json'), 'utf8'));
      m.version = pkg.version;
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(m, null, 2) });
    },
  };
}

export default defineConfig({
  root,
  base: '',
  publicDir: resolve(import.meta.dirname, 'public'),
  plugins: [react(), tailwindcss(), manifest()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    target: 'chrome116',
    modulePreload: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        background: resolve(root, 'background/index.ts'),
        popup: resolve(root, 'popup/index.html'),
        options: resolve(root, 'options/index.html'),
        gate: resolve(root, 'pages/gate/index.html'),
        interstitial: resolve(root, 'pages/interstitial/index.html'),
        vault: resolve(root, 'pages/vault/index.html'),
        offscreen: resolve(root, 'offscreen/index.html'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
