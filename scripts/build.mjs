// Two-pass build.
//  1. vite.config.ts → extension pages + module service worker (shared chunks are fine there).
//  2. Each content script → its own self-contained IIFE. Content scripts can't be ES modules,
//     and a single file can be injected on demand with chrome.scripting.executeScript on any
//     origin without web_accessible_resources loader chunks.
//
// Usage: node scripts/build.mjs [--watch]
import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '..');
const outDir = resolve(rootDir, 'dist');
const watch = process.argv.includes('--watch');
const mode = watch ? 'development' : 'production';

const CONTENT_ENTRIES = {
  content: 'src/content/index.ts',
  'main-world': 'src/content/main-world.ts',
};

rmSync(outDir, { recursive: true, force: true });

await build({
  configFile: resolve(rootDir, 'vite.config.ts'),
  mode,
  build: { watch: watch ? {} : null },
});

for (const [name, entry] of Object.entries(CONTENT_ENTRIES)) {
  await build({
    configFile: false,
    root: rootDir,
    mode,
    publicDir: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
    build: {
      outDir,
      emptyOutDir: false,
      target: 'chrome116',
      minify: !watch,
      sourcemap: false,
      watch: watch ? {} : null,
      lib: {
        entry: resolve(rootDir, entry),
        formats: ['iife'],
        name: `ImpulseVault_${name.replace(/\W/g, '_')}`,
        fileName: () => `${name}.js`,
      },
    },
  });
}

if (!watch) console.log('\n✓ Built to dist/ — load it at chrome://extensions (Developer mode → Load unpacked).');
