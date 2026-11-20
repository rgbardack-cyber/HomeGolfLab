import { describe, expect, it } from 'vitest';
import { buildDrawList } from './overlay/draw';
import { makeViewport } from './overlay/viewport';
import { POSE_LANDMARKS, POSE_STRIDE, type PoseTrack } from './media/poseTrack';
import { DEFAULT_GUIDES, guidesAllowed, guidesAt, headUsesNose, hiddenGuides, LMI, leadArmIndices, poseAt, reviewModelAt, type GuideSet, type ReviewContext } from './swingReview';

const ALL: GuideSet = { head: true, torso: true, leadArm: true, hips: true };
const HZ = 30;

/** Pista sintética: persona de frente, parada, a 30 Hz desde t0. `edit(i, set)` modifica landmarks de la muestra i. */
function track(n: number, edit?: (i: number, set: (lm: number, p: Partial<{ x: number; y: number; vis: number }>) => void) => void, t0 = 1000): PoseTrack {
  const lm = new Float32Array(n * POSE_LANDMARKS * POSE_STRIDE);
  const t = Float64Array.from({ length: n }, (_, i) => t0 + (i * 1000) / HZ);
  const base: Record<number, [number, number]> = {
    [LMI.NOSE]: [0.5, 0.2], [LMI.L_EAR]: [0.48, 0.2], [LMI.R_EAR]: [0.52, 0.2],
    [LMI.L_SHOULDER]: [0.44, 0.3], [LMI.R_SHOULDER]: [0.56, 0.3], [LMI.L_ELBOW]: [0.4, 0.4], [LMI.R_ELBOW]: [0.6, 0.4],
    [LMI.L_WRIST]: [0.45, 0.5], [LMI.R_WRIST]: [0.55, 0.5], [LMI.L_HIP]: [0.46, 0.55], [LMI.R_HIP]: [0.54, 0.55],
  };
  for (let i = 0; i < n; i++) {
    const set = (k: number, p: Partial<{ x: number; y: number; vis: number }>) => {
      const o = (i * POSE_LANDMARKS + k) * POSE_STRIDE;
      if (p.x !== undefined) lm[o] = p.x;
      if (p.y !== undefined) lm[o + 1] = p.y;
      if (p.vis !== undefined) { lm[o + 2] = p.vis; lm[o + 3] = p.vis; }
    };
    for (let k = 0; k < POSE_LANDMARKS; k++) { const [x, y] = base[k] ?? [0.5, 0.6]; set(k, { x, y, vis: 0.95 }); }
    edit?.(i, set);
  }
  return { v: 1, sourceId: 'm_t', fromMs: t[0], toMs: t[n - 1], hz: HZ, t, lm };
}
const ctx = (tr: PoseTrack, over: Partial<ReviewContext> = {}): ReviewContext => ({ track: tr, lefty: false, view: 'frente', times: { address: tr.t[0], top: tr.t[Math.floor(tr.t.length / 2)], impact: tr.t[tr.t.length - 3] }, ...over });
const byId = (items: ReturnType<typeof guidesAt>, id: string) => items.find((g) => g.id === id)!;

describe('interpolación de la pista (30 → 60 Hz)', () => {
  const tr = track(4, (i, set) => set(LMI.NOSE, { x: 0.5 + i * 0.1 }));  // la nariz avanza 0,1 por muestra
  it('un instante exacto devuelve la muestra; a medio periodo, el punto medio', () => {
    expect(poseAt(tr, tr.t[1])!.pts[LMI.NOSE].x).toBeCloseTo(0.6, 6);
    expect(poseAt(tr, (tr.t[1] + tr.t[2]) / 2)!.pts[LMI.NOSE].x).toBeCloseTo(0.65, 6);
  });
  it('a 60 Hz cada cuadro mostrado cae entre dos muestras y avanza de forma lineal', () => {
    const xs = Array.from({ length: 5 }, (_, k) => poseAt(tr, tr.t[0] + k * (1000 / 60))!.pts[LMI.NOSE].x);
    for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeCloseTo(0.05, 5);
  });
  it('fuera del rango: la muestra más cercana si está a ≤ 1 periodo; si no, null', () => {
    expect(poseAt(tr, tr.t[0] - 20)).not.toBeNull();
    expect(poseAt(tr, tr.t[0] - 40)).toBeNull();
    expect(poseAt(tr, tr.t[3] + 20)).not.toBeNull();
    expect(poseAt(tr, tr.t[3] + 40)).toBeNull();
  });
  it('un hueco grande entre muestras no se interpola: se usa la más cercana solo si está cerca', () => {
    const gap = track(2); gap.t[1] = gap.t[0] + 400; // hueco de 0,4 s
    expect(poseAt(gap, gap.t[0] + 200)).toBeNull();
    expect(poseAt(gap, gap.t[0] + 20)).not.toBeNull();
  });
  it('la confianza interpolada es la mínima de las dos muestras', () => {
    const lowMid = track(3, (i, set) => { if (i === 1) set(LMI.L_WRIST, { vis: 0.3 }); });
    expect(poseAt(lowMid, (lowMid.t[0] + lowMid.t[1]) / 2)!.pts[LMI.L_WRIST].conf).toBeCloseTo(0.3, 6);
  });
});

describe('brazo guía: zurdo y diestro (4.4)', () => {
  it('zurdo = brazo derecho; diestro = brazo izquierdo', () => {
    expect(leadArmIndices(true)).toEqual([LMI.R_SHOULDER, LMI.R_ELBOW, LMI.R_WRIST]);
    expect(leadArmIndices(false)).toEqual([LMI.L_SHOULDER, LMI.L_ELBOW, LMI.L_WRIST]);
  });
  it('las líneas del brazo salen de los landmarks del lado guía y cambian al invertir la mano', () => {
    const tr = track(10);
    const t = tr.t[3];
    const diestro = guidesAt(ctx(tr, { lefty: false }), t, ALL), zurdo = guidesAt(ctx(tr, { lefty: true }), t, ALL);
    expect(byId(diestro, 'arm-fore').b).toEqual({ x: expect.closeTo(0.45, 5), y: expect.closeTo(0.5, 5) }); // muñeca izquierda
    expect(byId(zurdo, 'arm-fore').b).toEqual({ x: expect.closeTo(0.55, 5), y: expect.closeTo(0.5, 5) });   // muñeca derecha
  });
});

describe('confianza, oclusión y estabilidad', () => {
  it('oclusión del brazo: conf < 0,4 → la guía no se dibuja y se reporta como oculta', () => {
    const tr = track(10, (_, set) => { set(LMI.L_WRIST, { vis: 0.2 }); });
    const items = guidesAt(ctx(tr), tr.t[3], ALL);
    expect(byId(items, 'arm-fore').conf).toBeCloseTo(0.2, 5);
    expect(hiddenGuides(items)).toEqual(['leadArm']);
    const ops = buildDrawList({ guides: items.filter((g) => g.guide === 'leadArm') }, tr.t[3], makeViewport(1080, 1920, { x: 0, y: 0, w: 540, h: 960 }));
    const arm = ops.filter((o) => o.op === 'line');
    expect(arm).toHaveLength(2); // solo el antebrazo oculto falta: queda el brazo superior (contorno + color)
  });

  it('entre 0,4 y 0,6 la guía se dibuja atenuada y punteada', () => {
    const tr = track(10, (_, set) => { set(LMI.L_WRIST, { vis: 0.5 }); });
    const items = guidesAt(ctx(tr), tr.t[3], ALL);
    const ops = buildDrawList({ guides: [byId(items, 'arm-fore')] }, tr.t[3], makeViewport(1080, 1920, { x: 0, y: 0, w: 540, h: 960 }));
    const colored = ops.filter((o) => o.op === 'line').pop()!;
    expect(colored).toMatchObject({ alpha: 0.5 });
    expect((colored as { dash: number[] }).dash.length).toBeGreaterThan(0);
    expect(hiddenGuides(items)).toEqual([]);
  });

  it('un salto de un punto > 8 % del torso respecto a la muestra anterior deja la guía en ≤ 0,5', () => {
    const calm = track(10);
    const jump = track(10, (i, set) => { if (i >= 4) set(LMI.L_WRIST, { x: 0.45 + 0.2 }); }); // salto de 0,2 > 0,08 × torso(≈0,25)
    const t = jump.t[4];
    expect(byId(guidesAt(ctx(calm), t, ALL), 'arm-fore').conf).toBeGreaterThan(0.9);
    expect(byId(guidesAt(ctx(jump), t, ALL), 'arm-fore').conf).toBeLessThanOrEqual(0.5);
  });
});

describe('cabeza, intervalos y vista', () => {
  it('cabeza con orejas; si faltan en > 30 % de las muestras, con la nariz', () => {
    expect(headUsesNose(track(10))).toBe(false);
    const sinOrejas = track(10, (i, set) => { if (i < 4) { set(LMI.L_EAR, { vis: 0.1 }); } }); // 4 de 10 = 40 %
    expect(headUsesNose(sinOrejas)).toBe(true);
    const pocas = track(10, (i, set) => { if (i < 2) set(LMI.L_EAR, { vis: 0.1 }); });          // 20 %
    expect(headUsesNose(pocas)).toBe(false);
    const tr = track(10);
    expect(byId(guidesAt(ctx(tr), tr.t[3], ALL, { useNose: true }), 'head-cur').center).toEqual({ x: expect.closeTo(0.5, 5), y: expect.closeTo(0.2, 5) });
  });

  it('la referencia de cabeza es FIJA en la posición del inicio mientras la actual se mueve', () => {
    const tr = track(12, (i, set) => { set(LMI.L_EAR, { x: 0.48 + i * 0.01 }); set(LMI.R_EAR, { x: 0.52 + i * 0.01 }); });
    const a = guidesAt(ctx(tr), tr.t[2], ALL), b = guidesAt(ctx(tr), tr.t[8], ALL);
    expect(byId(a, 'head-ref').center).toEqual(byId(b, 'head-ref').center);
    expect(byId(a, 'head-cur').center!.x).toBeLessThan(byId(b, 'head-cur').center!.x);
    expect(byId(b, 'head-cur').center!.x - byId(b, 'head-ref').center!.x).toBeCloseTo(0.08, 5);
  });

  it('solo hay guías entre el inicio y 0,3 s después del impacto; el brazo guía termina en el impacto', () => {
    const tr = track(20);
    const c = ctx(tr);
    expect(guidesAt(c, c.times.address - 40, ALL)).toEqual([]);
    expect(guidesAt(c, c.times.impact + 400, ALL)).toEqual([]);
    const post = guidesAt(c, c.times.impact + 100, ALL);
    expect(post.some((g) => g.guide === 'torso')).toBe(true);
    expect(post.some((g) => g.guide === 'leadArm')).toBe(false);
  });

  it('solo se devuelven las guías encendidas y las de cada vista traen su conjunto por defecto', () => {
    const tr = track(10);
    expect(new Set(guidesAt(ctx(tr), tr.t[3], { head: false, torso: true, leadArm: false, hips: false }).map((g) => g.guide))).toEqual(new Set(['torso']));
    expect(DEFAULT_GUIDES.frente.torso).toBe(true);
    expect(DEFAULT_GUIDES.atras.torso).toBe(false);
    expect(DEFAULT_GUIDES.atras.leadArm).toBe(true);
  });

  it('las guías de la otra vista no se muestran mezcladas', () => {
    expect(guidesAllowed('atras', undefined, 'auto')).toBe(true);
    expect(guidesAllowed('atras', 'frente', 'frente')).toBe(false);    // viewMismatch
    expect(guidesAllowed('atras', undefined, 'frente')).toBe(false);   // el usuario pidió otra vista
    expect(guidesAllowed('frente', undefined, 'frente')).toBe(true);
  });

  it('reviewModelAt arma esqueleto interpolado y guías, y el compositor lo dibuja', () => {
    const tr = track(10);
    const m = reviewModelAt(ctx(tr), tr.t[3] + 10, ALL, { skeleton: true });
    expect(m.skeleton).toHaveLength(1);
    expect(m.guides!.length).toBeGreaterThan(0);
    expect(buildDrawList(m, tr.t[3] + 10, makeViewport(1080, 1920, { x: 0, y: 0, w: 540, h: 960 })).length).toBeGreaterThan(10);
  });
});

import { buildWarp, warpSuspicious } from './swingReview';

describe('sincronía de dos clips (F4.1)', () => {
  const A = { address: 1000, top: 2000, impact: 2400, finish: 3500 };
  const B = { address: 5000, top: 6500, impact: 6900, finish: 8000 };

  it('alinea exactamente cada fase común', () => {
    const w = buildWarp(A, B)!;
    for (const k of ['address', 'top', 'impact', 'finish'] as const) {
      expect(w.toB(A[k])).toBeCloseTo(B[k], 9);
      expect(w.toA(B[k])).toBeCloseTo(A[k], 9);
    }
  });

  it('es estrictamente creciente y toA es su inverso', () => {
    const w = buildWarp(A, B)!;
    let prev = -Infinity;
    for (let t = -500; t <= 6000; t += 37) {
      const y = w.toB(t);
      expect(y).toBeGreaterThan(prev);
      prev = y;
      expect(w.toA(y)).toBeCloseTo(t, 6);
    }
  });

  it('entre fases interpola por tramos y fuera de ellas conserva el tiempo real (pendiente 1)', () => {
    const w = buildWarp(A, B)!;
    expect(w.toB(1500)).toBeCloseTo(5750, 9);            // mitad del primer tramo
    expect(w.toB(500)).toBeCloseTo(4500, 9);             // antes del inicio: pendiente 1
    expect(w.toB(4000)).toBeCloseTo(8500, 9);            // después del final
    expect(w.rates).toEqual([1.5, 1, 1]);
  });

  it('usa solo las fases comunes; con una sola es un desfase y sin ninguna no hay sincronía', () => {
    const w = buildWarp({ address: 1000, top: 2000, impact: 2400 }, { top: 6500, impact: 6900, finish: 8000 })!;
    expect(w.keys).toEqual(['top', 'impact']);
    expect(w.toB(2000)).toBeCloseTo(6500, 9);
    expect(w.toB(2200)).toBeCloseTo(6700, 9);
    const one = buildWarp({ impact: 2400 }, { impact: 7000 })!;
    expect(one.toB(2500)).toBeCloseTo(7100, 9);
    expect(buildWarp({ address: 1 }, { top: 2 })).toBeNull();
  });

  it('con fases fuera de orden en cualquiera de los clips devuelve null', () => {
    expect(buildWarp({ ...A, top: 900 }, B)).toBeNull();
    expect(buildWarp(A, { ...B, impact: 6500 })).toBeNull();
  });

  it('avisa si un tramo cambia el ritmo más de 2× (sincronía dudosa)', () => {
    expect(warpSuspicious(buildWarp(A, B)!)).toBe(false);
    expect(warpSuspicious(buildWarp(A, { ...B, impact: 8000, finish: 9000 })!)).toBe(true); // tramo tope→impacto 1500/400
  });

  it('el ajuste manual de una fase de B reemplaza la automática y sigue alineando', () => {
    const w = buildWarp(A, { ...B, ...{ top: 6600 } })!;
    expect(w.toB(A.top)).toBeCloseTo(6600, 9);
    expect(w.toB(A.impact)).toBeCloseTo(B.impact, 9);
  });
});
