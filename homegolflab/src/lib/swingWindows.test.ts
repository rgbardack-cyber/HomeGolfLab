import { describe, expect, it } from 'vitest';
import { findSwingWindow, LM, type Frame } from './swing';
import { swingWindows } from './swingWindows';

function frame(t: number, hy: number): Frame {
  const v = 0.95;
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, v }));
  lm[LM.L_SHOULDER] = { x: 0.44, y: 0.3, z: 0, v }; lm[LM.R_SHOULDER] = { x: 0.56, y: 0.3, z: 0, v };
  lm[LM.L_HIP] = { x: 0.46, y: 0.6, z: 0, v }; lm[LM.R_HIP] = { x: 0.54, y: 0.6, z: 0, v };
  lm[LM.L_WRIST] = { x: 0.48, y: hy, z: 0, v }; lm[LM.R_WRIST] = { x: 0.52, y: hy, z: 0, v };
  return { t, lm };
}
/** Un swing: manos quietas abajo, suben 0,7 s hasta el tope, bajan en 0,3 s. */
const swingY = (t: number, start: number) => {
  const u = t - start;
  if (u < 0) return 0.6;
  if (u < 700) return 0.6 - (u / 700) * 0.4;
  if (u < 1000) return 0.2 + ((u - 700) / 300) * 0.4;
  return 0.6;
};
const clip = (starts: number[], end: number) => Array.from({ length: end / 100 + 1 }, (_, i) => {
  const t = i * 100;
  return frame(t, Math.min(...starts.map((s) => swingY(t, s))));
});

describe('ventanas de swing (F3.5)', () => {
  it('con un solo swing devuelve una ventana y es la que ya usaba la app', () => {
    const fr = clip([4000], 8000);
    const w = swingWindows(fr);
    const base = findSwingWindow(fr)!;
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ from: base.from, to: base.to, index: 0, isDefault: true });
  });

  it('con dos swings devuelve ambas en orden cronológico; la última es la predeterminada y coincide con findSwingWindow', () => {
    const fr = clip([2000, 6500], 9500);
    const w = swingWindows(fr);
    const base = findSwingWindow(fr)!;
    expect(w).toHaveLength(2);
    expect(w.map((x) => x.isDefault)).toEqual([false, true]);
    expect(w[1]).toMatchObject({ from: base.from, to: base.to });
    expect(w[0].from).toBeLessThan(w[1].from);
    // el primero cae alrededor de su inicio (2000 s ± la ventana), no en el segundo
    expect(w[0].from).toBeLessThan(2600);
    expect(w[0].to).toBeGreaterThan(2000);
    expect(w[0].to).toBeLessThan(w[1].from + 700);
  });

  it('un video sin swing no da ventanas', () => {
    expect(swingWindows(Array.from({ length: 60 }, (_, i) => frame(i * 100, 0.6)))).toEqual([]);
  });

  it('respeta el máximo y no entra en un bucle infinito', () => {
    const fr = clip([1500, 4000, 6500, 9000], 12000);
    expect(swingWindows(fr, {}, 2).length).toBeLessThanOrEqual(2);
    expect(swingWindows(fr).length).toBeGreaterThanOrEqual(2);
  });
});
