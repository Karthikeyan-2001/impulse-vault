import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { injectStyles } from '../dom';
import { THEME_CSS } from '../theme';
import { UNLOCK_CSS } from '../unlock';
import { VAULT_CARD_CSS } from '../vault-card';

/** Shared entry for React pages: tokens + widget styles + a .iv-root wrapper. */
export function boot(node: ReactNode): void {
  injectStyles(document, 'theme', THEME_CSS);
  injectStyles(document, 'card', VAULT_CARD_CSS);
  injectStyles(document, 'unlock', UNLOCK_CSS);
  document.documentElement.classList.add('iv-root');
  createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>);
}
