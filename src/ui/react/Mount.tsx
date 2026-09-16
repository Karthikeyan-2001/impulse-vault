import { useEffect, useRef } from 'react';

/** Mount a framework-free widget (the vault card, the interstitial) inside React. */
export function Mount({ create, className }: { create: () => HTMLElement; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = create();
    ref.current?.appendChild(el);
    return () => el.remove();
    // Mount once: the widget owns its own state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} className={className} />;
}
