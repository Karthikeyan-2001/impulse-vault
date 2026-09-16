/**
 * A tiny hyperscript helper. Page-derived text (titles, notes) only ever goes in as text
 * nodes — never innerHTML — so a hostile product title can't inject markup.
 */
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> | null | undefined;

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'type', 'placeholder', 'min', 'max', 'maxLength', 'minLength', 'tabIndex', 'autofocus', 'spellcheck', 'rows', 'htmlFor', 'name', 'readOnly']);

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = String(value);
      else if (key === 'style') el.setAttribute('style', String(value));
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (PROPS.has(key)) (el as any)[key] = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** Static, trusted SVG markup only (icons shipped in this bundle). */
export function svg(markup: string, className = 'iv-icon'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = markup;
  return span;
}

export function injectStyles(root: Document | ShadowRoot, id: string, css: string): void {
  if (root instanceof ShadowRoot) {
    if (root.querySelector(`style[data-iv="${id}"]`)) return;
    const style = document.createElement('style');
    style.dataset.iv = id;
    style.textContent = css;
    root.prepend(style);
    return;
  }
  if (root.getElementById(`iv-style-${id}`)) return;
  const style = root.createElement('style');
  style.id = `iv-style-${id}`;
  style.textContent = css;
  root.head.appendChild(style);
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
