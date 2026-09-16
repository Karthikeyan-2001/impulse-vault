// Zip dist/ into impulse-vault-<version>.zip for the Chrome Web Store.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(rootDir, 'dist');
const { version } = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));

const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files[relative(dist, full).split('\\').join('/')] = readFileSync(full);
  }
})(dist);

const out = join(rootDir, `impulse-vault-${version}.zip`);
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`✓ ${relative(rootDir, out)} (${Object.keys(files).length} files)`);
