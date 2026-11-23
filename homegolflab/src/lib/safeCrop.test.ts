import { describe, expect, it } from 'vitest';
import { POSE_LANDMARKS, POSE_STRIDE, type PoseTrack } from './media/poseTrack';
import { safeCrop } from './safeCrop';
import { LMI } from './swingReview';

/** Pista de 3 muestras (t = 0, 100, 200): persona de pie; `hands` fija la altura de las muñecas en la muestra 1 (el tope). */
function track(handY: number, hide: number[] = []): PoseTrack {
  const n = 3, lm = new Float32Array(n * POSE_LANDMARKS * POSE_STRIDE);
  const base: Record<number, [number, number]> = {
    [LMI.NOSE]: [0.5, 0.3], [LMI.L_EAR]: [0.48, 0.3], [LMI.R_EAR]: [0.52, 0.3], [LMI.L_SHOULDER]: [0.44, 0.4], [LMI.R_SHOULDER]: [0.56, 0.4],
    [LMI.L_ELBOW]: [0.4, 0.5], [LMI.R_ELBOW]: [0.6, 0.5], [LMI.L_WRIST]: [0.45, 0.6], [LMI.R_WRIST]: [0.55, 0.6], [LMI.L_HIP]: [0.46, 0.65], [LMI.R_HIP]: [0.54, 0.65],
  };
  for (let i = 0; i < n; i++) for (let k = 0; k < POSE_LANDMARKS; k++) {
    const b = (i * POSE_LANDMARKS + k) * POSE_STRIDE;
    let [x, y] = base[k] ?? [0.5, 0.9];
    if ((k === LMI.L_WRIST || k === LMI.R_WRIST) && i === 1) y = handY;
    lm[b] = x; lm[b + 1] = y; lm[b + 2] = hide.includes(k) ? 0.1 : 0.95; lm[b + 3] = hide.includes(k) ? 0.1 : 0.95;
  }
  return { sourceId: 't', hz: 10, t: Float64Array.from([0, 100, 200]), lm } as unknown as PoseTrack;
}
const opt = { from: 0, to: 200, top: 100, panelAspect: 9 / 16, srcAspect: 9 / 16 };

describe('recorte seguro (F4.2)', () => {
  it('deja ≥ 1,3 × torso sobre las manos del tope y 5 % lateral', () => {
    const r = safeCrop(track(0.35), { ...opt })!;   // manos a y=.35, torso = 0.25 → la caja sube hasta .35 − .325 = .025
    expect(r.box.y).toBeCloseTo(0.025, 3);
    const span = 0.56 - 0.4;                          // codos 0.4..0.6 → ancho 0.2
    expect(r.box.x).toBeCloseTo(0.4 - 0.2 * 0.05, 3);
    expect(span).toBeGreaterThan(0);
  });

  it('la punta de la varilla, si está más arriba, amplía la caja', () => {
    const a = safeCrop(track(0.5), { ...opt })!, b = safeCrop(track(0.5), { ...opt, shaftTip: { x: 0.5, y: 0.01 } })!;
    expect(b.box.y).toBeLessThan(a.box.y);
    expect(b.box.y).toBeCloseTo(0.01, 6);
  });

  it('el recorte tiene la proporción del panel y contiene toda la caja', () => {
    const r = safeCrop(track(0.5), { ...opt, panelAspect: 1, srcAspect: 16 / 9 })!;
    if (!r.letterbox) expect((r.rect.w * 16) / 9 / r.rect.h).toBeCloseTo(1, 6);
    expect(r.rect.x).toBeLessThanOrEqual(r.box.x + 1e-9);
    expect(r.rect.y).toBeLessThanOrEqual(r.box.y + 1e-9);
    expect(r.rect.x + r.rect.w).toBeGreaterThanOrEqual(r.box.x + r.box.w - 1e-9);
    expect(r.rect.y + r.rect.h).toBeGreaterThanOrEqual(r.box.y + r.box.h - 1e-9);
  });

  it('si la caja no cabe en la proporción del panel, muestra el cuadro entero con letterbox', () => {
    const r = safeCrop(track(0.35), { ...opt, panelAspect: 4, srcAspect: 9 / 16 })!;
    expect(r.letterbox).toBe(true);
    expect(r.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('ignora landmarks con confianza baja y sin cuerpo visible devuelve null', () => {
    const all = Array.from({ length: POSE_LANDMARKS }, (_, i) => i);
    expect(safeCrop(track(0.4, all), { ...opt })).toBeNull();
  });
});
