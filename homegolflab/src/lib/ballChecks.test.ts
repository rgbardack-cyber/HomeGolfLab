import { describe, expect, it } from 'vitest';
import type { Gray } from './ballflight';
import { isBackgroundFeature, neighborCheck } from './ballChecks';

const W = 120, H = 80;
function frame(bg: number, discs: { x: number; y: number; r: number; v: number }[] = []): Gray {
  const data = new Uint8Array(W * H).fill(bg);
  for (const d of discs) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - d.x, y - d.y) <= d.r) data[y * W + x] = d.v;
  return { data, w: W, h: H };
}
const ball = (x: number, y: number) => ({ x, y, r: 2.5, v: 240 });

describe('comprobación de vecinos (F5.4)', () => {
  it('una bola que salta de sitio pasa: presente en t, ausente en t−1 y t+1 en esa posición', () => {
    const prev = frame(60, [ball(40, 40)]), cur = frame(60, [ball(52, 36)]), next = frame(60, [ball(64, 32)]);
    expect(neighborCheck(prev, cur, next, { x: 52, y: 36 })).toBe(true);
  });

  it('una mancha fija (rama, mancha del pasto) presente en los tres cuadros se rechaza', () => {
    const f = () => frame(60, [ball(52, 36)]);
    expect(neighborCheck(f(), f(), f(), { x: 52, y: 36 })).toBe(false);
  });

  it('sin mancha en t no pasa, y si falta un vecino solo se exige el otro lado', () => {
    const cur = frame(60);
    expect(neighborCheck(frame(60), cur, frame(60), { x: 52, y: 36 })).toBe(false);
    expect(neighborCheck(null, frame(60, [ball(52, 36)]), frame(60, [ball(64, 32)]), { x: 52, y: 36 })).toBe(true);
    expect(neighborCheck(frame(60, [ball(52, 36)]), frame(60, [ball(52, 36)]), null, { x: 52, y: 36 })).toBe(false);
  });
});

describe('fondo previo a la salida (F5.4)', () => {
  it('lo que ya estaba en el cuadro de referencia es fondo; lo nuevo no', () => {
    const ref = frame(60, [ball(80, 20)]);
    expect(isBackgroundFeature(ref, frame(60, [ball(80, 20)]), { x: 80, y: 20 })).toBe(true);
    expect(isBackgroundFeature(ref, frame(60, [ball(52, 36)]), { x: 52, y: 36 })).toBe(false);
  });
  it('sin contraste en el cuadro actual no hay mancha que rechazar', () => {
    expect(isBackgroundFeature(frame(60), frame(60), { x: 10, y: 10 })).toBe(false);
  });
});
