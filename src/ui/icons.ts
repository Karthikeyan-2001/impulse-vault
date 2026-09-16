/** Inline SVG icons (trusted, static). 24×24 grid, currentColor. */
export const ICONS = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 6C6.5 7.2 4.5 9.8 4.5 13.3V18h5.2v-5.2H7.3c.1-2 1.2-3.5 3.1-4.4L9.5 6zm9.5 0c-3 1.2-5 3.8-5 7.3V18h5.2v-5.2h-2.4c.1-2 1.2-3.5 3.1-4.4L19 6z"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
};

/** The vault door: ring, bolts, and a wheel (animated separately via .iv-wheel). */
export const VAULT_DOOR = `
<svg viewBox="0 0 120 120" class="iv-door-svg">
  <circle cx="60" cy="60" r="56" class="iv-door-rim"/>
  <circle cx="60" cy="60" r="46" class="iv-door-face"/>
  ${Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return `<circle cx="${(60 + Math.cos(a) * 51).toFixed(1)}" cy="${(60 + Math.sin(a) * 51).toFixed(1)}" r="2.6" class="iv-door-bolt"/>`;
  }).join('')}
  <g class="iv-wheel">
    <circle cx="60" cy="60" r="22" class="iv-wheel-ring"/>
    <path d="M60 60 L60 34 M60 60 L82.5 73 M60 60 L37.5 73" class="iv-wheel-spoke"/>
    <circle cx="60" cy="60" r="6" class="iv-wheel-hub"/>
  </g>
</svg>`;
