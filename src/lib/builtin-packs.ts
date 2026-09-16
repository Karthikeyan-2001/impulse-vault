/** Site packs shipped with the extension, bundled from /sites/*.json at build time. */
import type { SitePack } from '../types';

const modules = import.meta.glob<{ default: SitePack & { $schema?: string } }>(['../../sites/*.json', '!../../sites/schema.json'], {
  eager: true,
});

export const BUILTIN_PACKS: SitePack[] = Object.values(modules).map(({ default: raw }) => {
  const { $schema: _schema, ...pack } = raw;
  return pack;
});
