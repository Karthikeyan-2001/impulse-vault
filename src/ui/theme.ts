/**
 * Shared design tokens + primitives for the framework-free UI (content scripts, gate,
 * interstitial, vault window). Everything is scoped under .iv-root so it can live in a page's
 * shadow root or next to Tailwind in the popup without collisions.
 *
 * Palette: warm paper, ink, and brass for the vault; mint for money that stays yours.
 */
export const THEME_CSS = /* css */ `
.iv-root {
  --iv-bg: #f7f4ee;
  --iv-surface: #ffffff;
  --iv-surface-2: #f3efe7;
  --iv-line: #e4ddd0;
  --iv-text: #1d1b22;
  --iv-muted: #6b655a;
  --iv-brass: #b8892d;
  --iv-brass-strong: #946b1c;
  --iv-brass-soft: #f5ead0;
  --iv-ink: #1d1b22;
  --iv-on-ink: #f7f4ee;
  --iv-mint: #1d7a53;
  --iv-mint-soft: #ddf0e6;
  --iv-on-mint: #ffffff;
  --iv-warn: #8f5310;
  --iv-warn-soft: #fbeed8;
  --iv-danger: #a13d2d;
  --iv-door: #26232c;
  --iv-door-edge: #3a3642;
  --iv-shadow: 0 1px 2px rgba(29,27,34,.08), 0 18px 44px -12px rgba(29,27,34,.32);
  color-scheme: light;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  color: var(--iv-text);
  -webkit-font-smoothing: antialiased;
  text-align: left;
  letter-spacing: normal;
  text-transform: none;
}
@media (prefers-color-scheme: dark) {
  .iv-root {
    --iv-bg: #131216;
    --iv-surface: #1c1a21;
    --iv-surface-2: #24222a;
    --iv-line: #34313b;
    --iv-text: #ece8df;
    --iv-muted: #a39d91;
    --iv-brass: #d9ab4f;
    --iv-brass-strong: #ebc36e;
    --iv-brass-soft: #3a3020;
    --iv-ink: #ece8df;
    --iv-on-ink: #1a181e;
    --iv-mint: #52c392;
    --iv-mint-soft: #173a2b;
    --iv-on-mint: #0c2419;
    --iv-warn: #f0b264;
    --iv-warn-soft: #3a2a14;
    --iv-danger: #f08a78;
    --iv-shadow: 0 1px 2px rgba(0,0,0,.4), 0 18px 44px -12px rgba(0,0,0,.7);
    color-scheme: dark;
  }
}
/* Element resets live in a layer: unlayered rules beat every layered one, so leaving these
   unlayered would override Tailwind's utilities (which sit in @layer utilities) in the popup. */
@layer base {
  .iv-root *, .iv-root *::before, .iv-root *::after { box-sizing: border-box; }
  .iv-root button, .iv-root input, .iv-root textarea, .iv-root select {
    font: inherit; color: inherit; letter-spacing: inherit; margin: 0;
  }
  .iv-root :focus { outline: none; }
  .iv-root :focus-visible { outline: 2px solid var(--iv-brass); outline-offset: 2px; }
}
.iv-icon { display: inline-flex; width: 1.15em; height: 1.15em; flex: none; }
.iv-icon svg { width: 100%; height: 100%; }

.iv-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 16px; border-radius: 10px; border: 1px solid transparent;
  font-weight: 650; font-size: 14px; cursor: pointer; white-space: nowrap; text-decoration: none;
  transition: transform .12s ease, background-color .15s ease, opacity .15s ease, border-color .15s ease;
  -webkit-user-select: none; user-select: none;
}
.iv-btn:active:not(:disabled) { transform: scale(.97); }
.iv-btn:disabled { opacity: .45; cursor: not-allowed; }
.iv-btn-primary { background: var(--iv-ink); color: var(--iv-on-ink); }
.iv-btn-primary:hover:not(:disabled) { opacity: .9; }
.iv-btn-brass { background: var(--iv-brass); color: #1d1b22; }
.iv-btn-brass:hover:not(:disabled) { background: var(--iv-brass-strong); }
.iv-btn-mint { background: var(--iv-mint); color: var(--iv-on-mint); }
.iv-btn-ghost { background: transparent; border-color: var(--iv-line); color: var(--iv-text); }
.iv-btn-ghost:hover:not(:disabled) { background: var(--iv-surface-2); }
.iv-btn-lg { height: 48px; padding: 0 22px; font-size: 15px; border-radius: 12px; }
.iv-btn-sm { height: 32px; padding: 0 12px; font-size: 13px; border-radius: 8px; }
.iv-link {
  background: none; border: 0; padding: 0; cursor: pointer; color: var(--iv-muted);
  text-decoration: underline; text-underline-offset: 3px; font-size: 13px;
}
.iv-link:hover { color: var(--iv-text); }

.iv-input, .iv-textarea {
  width: 100%; border: 1px solid var(--iv-line); background: var(--iv-surface);
  border-radius: 10px; padding: 9px 12px; transition: border-color .15s ease;
}
.iv-input:focus, .iv-textarea:focus { border-color: var(--iv-brass); }
.iv-label { display: block; font-size: 12px; font-weight: 650; color: var(--iv-muted); margin-bottom: 6px; }
.iv-num { font-variant-numeric: tabular-nums; }
.iv-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.iv-door-svg { width: 100%; height: 100%; overflow: visible; }
.iv-door-rim { fill: var(--iv-brass); }
.iv-door-face { fill: var(--iv-door); stroke: var(--iv-door-edge); stroke-width: 2; }
.iv-door-bolt { fill: var(--iv-door); }
.iv-wheel { transform-box: fill-box; transform-origin: center; }
.iv-wheel-ring { fill: none; stroke: var(--iv-brass); stroke-width: 5; }
.iv-wheel-spoke { stroke: var(--iv-brass); stroke-width: 5; stroke-linecap: round; }
.iv-wheel-hub { fill: var(--iv-brass); }
`;
