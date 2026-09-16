import type { ReactNode } from 'react';

export function Card({ title, subtitle, children, tone }: { title?: string; subtitle?: ReactNode; children: ReactNode; tone?: 'danger' | 'warn' }) {
  const border = tone === 'danger' ? 'border-danger/40' : tone === 'warn' ? 'border-warn/40' : 'border-line';
  return (
    <section className={`mb-4 rounded-2xl border ${border} bg-surface p-5`}>
      {title ? <h2 className="m-0 text-[15px] font-bold tracking-tight">{title}</h2> : null}
      {subtitle ? <p className="m-0 mt-1 text-[13px] leading-relaxed text-muted">{subtitle}</p> : null}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

export function Row({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-3 last:border-b-0 last:pb-0 first:pt-0">
      <div className="min-w-[220px] flex-1">
        <label htmlFor={htmlFor} className="block text-[13.5px] font-semibold">
          {label}
        </label>
        {hint ? <p className="m-0 mt-0.5 text-[12.5px] leading-relaxed text-muted">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

const inputCls =
  'h-9 rounded-[10px] border border-line bg-surface px-3 text-[13.5px] text-text outline-none focus:border-brass';

export function NumberField({ id, value, onChange, min, max, step = 1, suffix, width = 'w-24' }: { id?: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string; width?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <input
        id={id}
        type="number"
        className={`${inputCls} ${width} tabular`}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.currentTarget.value);
          if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
        }}
      />
      {suffix ? <span className="text-[12.5px] text-muted">{suffix}</span> : null}
    </span>
  );
}

export function TextField({ id, value, onChange, placeholder, width = 'w-56', maxLength }: { id?: string; value: string; onChange: (s: string) => void; placeholder?: string; width?: string; maxLength?: number }) {
  return (
    <input id={id} type="text" className={`${inputCls} ${width}`} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.currentTarget.value)} />
  );
}

export function Select({ id, value, onChange, options }: { id?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select id={id} className={`${inputCls} pr-8`} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ id, checked, onChange, label }: { id?: string; checked: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors ${checked ? 'border-mint bg-mint' : 'border-line bg-surface-2'}`}
    >
      <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-surface shadow transition-all ${checked ? 'left-[22px]' : 'left-[2px]'}`} style={checked ? { background: '#fff' } : undefined} />
    </button>
  );
}

export function Button({ children, onClick, tone = 'ghost', disabled, type }: { children: ReactNode; onClick?: () => void; tone?: 'ghost' | 'primary' | 'danger' | 'link'; disabled?: boolean; type?: 'button' | 'submit' }) {
  const tones = {
    ghost: 'border border-line bg-surface hover:bg-surface-2 text-text',
    primary: 'border-0 bg-ink text-on-ink hover:opacity-90',
    danger: 'border-0 bg-danger text-white hover:opacity-90',
    link: 'border-0 bg-transparent text-muted underline underline-offset-2 hover:text-text px-0 h-auto',
  };
  return (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled} className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] px-3.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]}`}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' | 'mint' | 'brass' }) {
  const tones = {
    muted: 'bg-surface-2 text-muted',
    warn: 'bg-warn-soft text-warn',
    mint: 'bg-mint-soft text-mint',
    brass: 'bg-brass-soft text-brass-strong',
  };
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' | 'danger' | 'mint' }) {
  const tones = { muted: 'text-muted', warn: 'text-warn', danger: 'text-danger', mint: 'text-mint' };
  return <p className={`m-0 mt-2 text-[12.5px] leading-relaxed ${tones[tone]}`}>{children}</p>;
}
