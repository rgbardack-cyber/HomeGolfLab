import { describe, expect, it } from 'vitest';
import { findFinish, FINISH, phaseConfidence } from './phases';
import { LM, type Frame } from './swing';

/** Cuadro sintético: torso de 0,3 (hombros y=0,3, caderas y=0,6), manos en (x, y) con visibilidad v. */
function frame(t: number, hy: number, hx = 0.5, v = 0.95): Frame {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, v }));
  lm[LM.L_SHOULDER] = { x: 0.44, y: 0.3, z: 0, v }; lm[LM.R_SHOULDER] = { x: 0.56, y: 0.3, z: 0, v };
  lm[LM.L_HIP] = { x: 0.46, y: 0.6, z: 0, v }; lm[LM.R_HIP] = { x: 0.54, y: 0.6, z: 0, v };
  lm[LM.L_WRIST] = { x: hx - 0.02, y: hy, z: 0, v }; lm[LM.R_WRIST] = { x: hx + 0.02, y: hy, z: 0, v };
  return { t, lm };
}
const series = (from: number, to: number, hz: number, y: (t: number) => number, x: (t: number) => number = () => 0.5, v = 0.95) =>
  Array.from({ length: Math.floor(((to - from) * hz) / 1000) + 1 }, (_, i) => { const t = from + (i * 1000) / hz; return frame(t, y(t), x(t), v); });

// impacto a t=1000; las manos están en y=0,6 (abajo) y suben hasta y=0,2 hacia t=1600, y se quedan ahí
const rise = (t: number) => (t <= 1000 ? 0.6 : t >= 1600 ? 0.2 : 0.6 - ((t - 1000) / 600) * 0.4);

describe('final del swing (findFinish)', () => {
  it('encuentra el primer cuadro de la pose sostenida (manos arriba y quietas ≥ 0,3 s)', () => {
    const f = findFinish(series(1000, 2500, 30, rise), 1000)!;
    expect(f).not.toBeNull();
    expect(f.t).toBeGreaterThanOrEqual(1500);
    expect(f.t).toBeLessThanOrEqual(1700);
    expect(f.conf).toBeGreaterThan(0.9);
  });

  it('si los cuadros no cubren 0,3 s de quietud, no lo afirma (null): el muestreo terminó antes', () => {
    expect(findFinish(series(1000, 1650, 30, rise), 1000)).toBeNull();
  });

  it('si las manos no suben lo bastante (chip, sin pose final), null', () => {
    expect(findFinish(series(1000, 2500, 30, (t) => 0.6 - Math.min(0.05, (t - 1000) / 10000)), 1000)).toBeNull();
  });

  it('manos que siguen moviéndose (no quedan quietas) no cuentan como final', () => {
    const moving = series(1000, 2500, 30, (t) => (t >= 1600 ? 0.2 : rise(t)), (t) => 0.5 + 0.3 * Math.sin(t / 60));
    expect(findFinish(moving, 1000)).toBeNull();
  });

  it('la confianza baja con las manos poco visibles', () => {
    const lowVis = series(1000, 2500, 30, rise, () => 0.5, 0.45);
    expect(findFinish(lowVis, 1000)!.conf).toBeLessThan(0.5);
  });

  it('con pocos cuadros tras el impacto, null; los cuadros anteriores al impacto no cuentan', () => {
    expect(findFinish(series(1000, 1080, 30, rise), 1000)).toBeNull();
    expect(findFinish(series(0, 900, 30, () => 0.1), 1000)).toBeNull();
    expect(FINISH.holdMs).toBe(300);
  });
});

describe('confianza por fase (phaseConfidence)', () => {
  // quieto 0..1000, sube hasta el tope en 1700 (y=0,2), baja rápido y llega al impacto en 2000
  const y = (t: number) => (t < 1000 ? 0.6 : t < 1700 ? 0.6 - ((t - 1000) / 700) * 0.4 : t < 2000 ? 0.2 + ((t - 1700) / 300) * 0.4 : 0.6);
  const times = { address: 1000, top: 1700, impact: 2000 };

  it('swing limpio y bien visible: las tres fases con confianza alta', () => {
    const c = phaseConfidence(series(0, 2300, 30, y), times);
    expect(c.address).toBeGreaterThan(0.85);
    expect(c.top).toBeGreaterThan(0.85);
    expect(c.impact).toBeGreaterThan(0.85);
  });

  it('manos poco visibles en el impacto bajan la confianza del impacto (y solo la suya)', () => {
    const fr = series(0, 2300, 30, y).map((f) => (Math.abs(f.t - 2000) <= 100 ? frame(f.t, y(f.t), 0.5, 0.2) : f));
    const c = phaseConfidence(fr, times);
    expect(c.impact).toBeLessThan(0.5);
    expect(c.top).toBeGreaterThan(0.85);
  });

  it('un tope en meseta (manos casi igual de altas a ±0,2 s) tiene menos confianza que un pico marcado', () => {
    const flat = (t: number) => (t < 1000 ? 0.6 : t < 1400 ? 0.6 - ((t - 1000) / 400) * 0.4 : t < 1900 ? 0.2 : 0.2 + ((t - 1900) / 100) * 0.4);
    const sharp = phaseConfidence(series(0, 2300, 30, y), times).top;
    const plateau = phaseConfidence(series(0, 2300, 30, flat), { address: 1000, top: 1650, impact: 2000 }).top;
    expect(plateau).toBeLessThan(sharp);
  });

  it('una bajada fuera de lo físico (0,05 s) baja la confianza del impacto; el inicio con manos en movimiento también baja', () => {
    expect(phaseConfidence(series(0, 2300, 30, y), { address: 1000, top: 1700, impact: 1750 }).impact).toBeLessThan(0.3);
    const moving = series(0, 2300, 30, y, (t) => 0.5 + (t < 1000 ? 0.05 * Math.sin(t / 40) : 0));
    expect(phaseConfidence(moving, times).address).toBeLessThan(phaseConfidence(series(0, 2300, 30, y), times).address);
  });
});
