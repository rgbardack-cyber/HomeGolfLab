import { describe, expect, it } from 'vitest';
import { detectImpact } from './impact';

/** PRNG determinista (mulberry32). */
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

interface Hit { atMs: number; amp: number; decayMs?: number }
/** Ruido de fondo + golpes (ráfagas de ruido blanco con caída exponencial). */
function track(sr: number, seconds: number, hits: Hit[], floor = 0.002, seed = 1): Float32Array {
  const r = rng(seed), x = new Float32Array(Math.round(sr * seconds));
  for (let i = 0; i < x.length; i++) x[i] = (r() * 2 - 1) * floor;
  for (const h of hits) {
    const s = Math.round((h.atMs / 1000) * sr), tau = ((h.decayMs ?? 30) / 1000) * sr;
    for (let i = 0; i < tau * 8 && s + i < x.length; i++) x[s + i] += (r() * 2 - 1) * h.amp * Math.exp(-i / tau);
  }
  return x;
}

describe('detección del impacto en el audio (F8.3)', () => {
  it('encuentra el inicio del golpe con error ≤ 5 ms a 48 kHz y a 44,1 kHz, con varios instantes y fondos', () => {
    for (const sr of [48000, 44100]) {
      for (const [t0, seed] of [[1500, 1], [1500.7, 2], [3210, 3], [900, 4]] as const) {
        const x = track(sr, 4, [{ atMs: t0, amp: 0.5 }], 0.004, seed);
        const r = detectImpact(x, sr, t0 + 80);                      // el impacto visual cae 80 ms después
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(Math.abs(r.onsetMs - t0)).toBeLessThanOrEqual(5);
          expect(r.prominenceDb).toBeGreaterThan(15);
        }
      }
    }
  });

  it('no se deja engañar por un transitorio solo en graves (golpe de pie, 200 Hz)', () => {
    const sr = 48000, x = track(sr, 4, []);
    for (let i = 0; i < 4800; i++) x[Math.round(1.5 * sr) + i] += 0.6 * Math.sin((2 * Math.PI * 200 * i) / sr) * Math.min(1, i / 480) * Math.exp(-i / 1500);   // ataque suave de 10 ms: sin chasquido de banda ancha
    const r = detectImpact(x, sr, 1500);
    expect(r.ok).toBe(false);
  });

  it('rechaza si hay otro golpe de nivel parecido en ±1 s ("dos golpes")', () => {
    const sr = 48000, x = track(sr, 5, [{ atMs: 2000, amp: 0.5 }, { atMs: 2600, amp: 0.4 }]);
    const r = detectImpact(x, sr, 2050);
    expect(r).toMatchObject({ ok: false, reason: 'second_hit' });
  });

  it('acepta si el otro golpe está más de 10 dB por debajo, o a más de 1 s', () => {
    const sr = 48000;
    expect(detectImpact(track(sr, 5, [{ atMs: 2000, amp: 0.5 }, { atMs: 2600, amp: 0.05 }]), sr, 2050).ok).toBe(true);   // −20 dB
    expect(detectImpact(track(sr, 6, [{ atMs: 2000, amp: 0.5 }, { atMs: 3400, amp: 0.5 }]), sr, 2050).ok).toBe(true);    // a 1,4 s
  });

  it('rechaza un golpe que apenas sobresale del ruido (< 15 dB)', () => {
    const sr = 48000, x = track(sr, 4, [{ atMs: 1500, amp: 0.012 }], 0.01);
    const r = detectImpact(x, sr, 1550);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['weak', 'no_transient']).toContain(r.reason);
  });

  it('rechaza el audio saturado (recorte digital)', () => {
    const sr = 48000, x = track(sr, 4, [{ atMs: 1500, amp: 3 }]);
    for (let i = 0; i < x.length; i++) x[i] = Math.max(-1, Math.min(1, x[i]));
    expect(detectImpact(x, sr, 1550)).toMatchObject({ ok: false, reason: 'clipped' });
  });

  it('silencio, audio demasiado corto o impacto fuera de la ventana de ±300 ms no dan resultado', () => {
    const sr = 48000;
    expect(detectImpact(new Float32Array(100), sr, 50)).toMatchObject({ ok: false, reason: 'no_audio' });
    expect(detectImpact(track(sr, 3, []), sr, 1500).ok).toBe(false);
    expect(detectImpact(track(sr, 4, [{ atMs: 3000, amp: 0.5 }]), sr, 1500).ok).toBe(false);       // el golpe está a 1,5 s de donde se buscó
  });

  it('el golpe en el borde del audio (primeros ms) no lanza', () => {
    const sr = 48000;
    expect(() => detectImpact(track(sr, 2, [{ atMs: 5, amp: 0.5 }]), sr, 100)).not.toThrow();
  });
});

describe('revisión F8: inicio acotado y recorte por canal', () => {
  it('con ruido sostenido a 15–20 dB bajo el pico el inicio no se arrastra hacia atrás (error ≤ 5 ms)', () => {
    const sr = 48000;
    // Casos medidos que antes daban −16 a −29 ms: ruido continuo de 0,04–0,08 con golpe de 0,3–0,5 (prominencia 15–17 dB).
    for (const [floor, amp, seed] of [[0.04, 0.3, 1], [0.04, 0.3, 2], [0.05, 0.3, 1], [0.05, 0.3, 2], [0.06, 0.5, 1], [0.08, 0.5, 2]] as const) {
      const r = detectImpact(track(sr, 4, [{ atMs: 2000, amp }], floor, seed), sr, 2050);
      expect(r.ok).toBe(true);
      if (r.ok) expect(Math.abs(r.onsetMs - 2000)).toBeLessThanOrEqual(5);
    }
  });

  it('un solo canal saturado se detecta aunque el promedio no llegue a 0,999', () => {
    const sr = 48000, n = sr * 4;
    const left = track(sr, 4, [{ atMs: 1500, amp: 0.45 }]), right = new Float32Array(n);
    for (let i = 0; i < n; i++) right[i] = Math.max(-1, Math.min(1, left[i] * 3));     // canal derecho saturado
    for (let i = 0; i < n; i++) left[i] = left[i] * 0.2;
    const mono = new Float32Array(n);
    for (let i = 0; i < n; i++) mono[i] = (left[i] + right[i]) / 2;
    expect(detectImpact(mono, sr, 1550).ok).toBe(true);                               // promediado: no se ve el recorte
    expect(detectImpact(mono, sr, 1550, { rawChannels: [left, right] })).toMatchObject({ ok: false, reason: 'clipped' });
  });
});
