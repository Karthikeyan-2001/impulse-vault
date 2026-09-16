import type { ReactNode } from 'react';
import type { VaultItem } from '../types';

export function Thumb({ item, size = 48 }: { item: Pick<VaultItem, 'imageUrl' | 'title'>; size?: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-[10px] border border-line bg-surface-2"
      style={{ width: size, height: size }}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
      ) : null}
    </div>
  );
}

export function Empty({ art, title, children }: { art: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 pb-8 pt-6 text-center">
      <div className="mb-3 text-brass">{art}</div>
      <p className="m-0 text-[15px] font-semibold">{title}</p>
      <div className="mt-1.5 text-[13px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] font-semibold text-text">
      {children}
    </span>
  );
}

export function LockGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function DoorArt({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
      <circle cx="60" cy="60" r="56" fill="var(--iv-brass)" />
      <circle cx="60" cy="60" r="46" fill="var(--iv-door)" stroke="var(--iv-door-edge)" strokeWidth={2} />
      <circle cx="60" cy="60" r="22" fill="none" stroke="var(--iv-brass)" strokeWidth={5} />
      <path d="M60 60 L60 34 M60 60 L82.5 73 M60 60 L37.5 73" stroke="var(--iv-brass)" strokeWidth={5} strokeLinecap="round" />
      <circle cx="60" cy="60" r="6" fill="var(--iv-brass)" />
    </svg>
  );
}
