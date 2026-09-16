import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Day-name and quiet-hours tests assume a fixed zone.
    env: { TZ: 'Asia/Kolkata' },
  },
});
