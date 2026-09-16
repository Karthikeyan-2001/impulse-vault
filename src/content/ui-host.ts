/**
 * Every piece of UI we put on a retailer's page lives in a closed shadow root: the page's CSS
 * can't bend it, and the page's scripts can't reach in.
 */
import { injectStyles } from '../ui/dom';
import { THEME_CSS } from '../ui/theme';

export interface Host {
  host: HTMLElement;
  root: ShadowRoot;
  /** The .iv-root container to render into. */
  el: HTMLDivElement;
}

const HOST_CSS = /* css */ `
:host { all: initial; display: block; }
:host([hidden]) { display: none !important; }
`;

export function createHost(name: string, css: string[], hostStyle = ''): Host {
  const host = document.createElement('impulse-vault');
  host.setAttribute('data-part', name);
  if (hostStyle) host.setAttribute('style', hostStyle);
  const root = host.attachShadow({ mode: 'closed' });
  injectStyles(root, 'host', HOST_CSS);
  injectStyles(root, 'theme', THEME_CSS);
  css.forEach((c, i) => injectStyles(root, `c${i}`, c));
  const el = document.createElement('div');
  el.className = 'iv-root';
  root.appendChild(el);
  return { host, root, el };
}

/** Styles that must apply to the *page* (hiding its buttons), kept to a single tag. */
export function pageStyle(): void {
  if (document.getElementById('impulse-vault-page-style')) return;
  const s = document.createElement('style');
  s.id = 'impulse-vault-page-style';
  s.textContent = '[data-impulse-vault-hidden]{display:none!important}';
  (document.head ?? document.documentElement).appendChild(s);
}

export function domReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((r) => document.addEventListener('DOMContentLoaded', () => r(), { once: true }));
}
