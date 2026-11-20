import { describe, expect, it } from 'vitest';
import { classifyBallSound } from './ballSound';

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function audio(hits: { at: number; amp: number }[], seconds = 4, sr = 48000) {
  const r = rng(3), x = new Float32Array(sr * seconds);
  for (let i = 0; i < x.length; i++) x[i] = (r() * 2 - 1) * 0.003;
  for (const h of hits) { const s = Math.round((h.at / 1000) * sr), tau = 0.03 * sr; for (let i = 0; i < tau * 8 && s + i < x.length; i++) x[s + i] += (r() * 2 - 1) * h.amp * Math.exp(-i / tau); }
  return x;
}

describe('con bola / sin sonido de golpe (F10.3)', () => {
  it('un transitorio a ≤ 100 ms del impacto visual es "con bola"', () => {
    expect(classifyBallSound(audio([{ at: 2000, amp: 0.5 }]), 48000, 2060)).toBe('con_bola');
  });
  it('un golpe a más de 100 ms del impacto visual, o ninguno, es "sin sonido de golpe" (nunca "práctica")', () => {
    expect(classifyBallSound(audio([{ at: 2000, amp: 0.5 }]), 48000, 2400)).toBe('sin_sonido_de_golpe');
    expect(classifyBallSound(audio([]), 48000, 2000)).toBe('sin_sonido_de_golpe');
  });
  it('dos golpes cercanos o audio saturado no se afirman como "con bola"', () => {
    expect(classifyBallSound(audio([{ at: 2000, amp: 0.5 }, { at: 2500, amp: 0.5 }]), 48000, 2050)).toBe('sin_sonido_de_golpe');
    const clipped = audio([{ at: 2000, amp: 3 }]).map((v) => Math.max(-1, Math.min(1, v)));
    expect(classifyBallSound(clipped, 48000, 2050)).toBe('sin_sonido_de_golpe');
  });
  it('sin pista de audio devuelve "sin_audio"', () => {
    expect(classifyBallSound(null, 48000, 1000)).toBe('sin_audio');
    expect(classifyBallSound(new Float32Array(0), 48000, 1000)).toBe('sin_audio');
  });
});
