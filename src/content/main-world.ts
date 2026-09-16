/**
 * Runs in the page's MAIN world at document_start. Content scripts live in an isolated world,
 * so patching `history.pushState` there wouldn't see the site's own SPA navigations. This tiny
 * script patches the real one and announces route changes with a DOM event both worlds can hear.
 */
(() => {
  const w = window as unknown as { __impulseVaultHistory?: boolean };
  if (w.__impulseVaultHistory) return;
  w.__impulseVaultHistory = true;
  const fire = () => window.dispatchEvent(new Event('impulse-vault:locationchange'));
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      fire();
      return result;
    };
  }
})();
