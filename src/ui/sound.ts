/** A synthesised lock "clunk": a low thump plus a short latch click. Off by default; no audio files. */
let ctx: AudioContext | null = null;

export function playLockSound(): void {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.35;
    out.connect(ctx.destination);

    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(110, now);
    thump.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    thumpGain.gain.setValueAtTime(0.9, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    thump.connect(thumpGain).connect(out);
    thump.start(now);
    thump.stop(now + 0.2);

    const len = Math.floor(ctx.sampleRate * 0.02);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const click = ctx.createBufferSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    click.buffer = buf;
    click.connect(hp).connect(out);
    click.start(now + 0.035);
  } catch {
    /* audio blocked: silence is fine */
  }
}

/** A small bright "clink" for coins landing on the stack. */
export function playCoinSound(pitch = 1): void {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    g.connect(ctx.destination);
    for (const f of [2200, 3300]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * pitch;
      o.connect(g);
      o.start(now);
      o.stop(now + 0.25);
    }
  } catch {
    /* ignore */
  }
}
