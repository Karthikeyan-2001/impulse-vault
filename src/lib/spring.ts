/**
 * Damped-spring easing as a CSS `linear()` function, so WAAPI/CSS animations get real spring
 * physics (including overshoot) without a JS animation loop.
 */
export interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export interface SpringEasing {
  easing: string;
  /** ms until the motion is visually settled (within 0.5%). */
  duration: number;
}

/** Position of a unit spring released from 0 towards 1 at time t (seconds). */
export function springAt(t: number, { stiffness = 170, damping = 26, mass = 1 }: SpringConfig = {}): number {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

export function springEasing(config: SpringConfig = {}, points = 48): SpringEasing {
  const { stiffness = 170, damping = 26, mass = 1 } = config;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = Math.min(damping / (2 * Math.sqrt(stiffness * mass)), 1);
  const settle = Math.log(200) / (zeta * w0); // envelope below 0.5%
  const values: string[] = [];
  for (let i = 0; i <= points; i++) {
    const v = i === points ? 1 : springAt((settle * i) / points, config);
    values.push(String(Math.round(v * 10000) / 10000));
  }
  return { easing: `linear(${values.join(', ')})`, duration: Math.round(settle * 1000) };
}

/** Tuned presets. DROP settles in ~380ms with a small overshoot — the vault drop. */
export const SPRINGS = {
  drop: springEasing({ stiffness: 380, damping: 28 }),
  pop: springEasing({ stiffness: 520, damping: 26 }),
  wheel: springEasing({ stiffness: 220, damping: 14 }),
  coin: springEasing({ stiffness: 600, damping: 18 }),
  soft: springEasing({ stiffness: 170, damping: 26 }),
};

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
