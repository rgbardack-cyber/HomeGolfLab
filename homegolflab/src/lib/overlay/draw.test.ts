import { describe, expect, it } from 'vitest';
import { buildDrawList, paint, pickSample, type DrawOp } from './draw';
import { CONF, ESTIMATED_ALPHA, FLIGHT_LEGEND, FLIGHT_OUTLINE, FLIGHT_STYLES, LOST_LABEL, type FlightKind, type FlightSegment, type OverlayModel, type SkeletonSample } from './model';
import { makeViewport, screenUnit } from './viewport';

const vp = makeViewport(1080, 1920, { x: 0, y: 0, w: 540, h: 960 });
const U = screenUnit(vp);
const lines = (ops: DrawOp[]) => ops.filter((o): o is Extract<DrawOp, { op: 'line' }> => o.op === 'line');
const circles = (ops: DrawOp[]) => ops.filter((o): o is Extract<DrawOp, { op: 'circle' }> => o.op === 'circle');

const seg = (kind: FlightKind, i: number, conf?: number): FlightSegment => ({ kind, a: { x: 0.1 + i * 0.1, y: 0.8 - i * 0.05 }, b: { x: 0.2 + i * 0.1, y: 0.75 - i * 0.05 }, tA: i * 100, tB: i * 100 + 100, conf });
const sk = (t: number, confs: number[]): SkeletonSample => ({ t, pts: Array.from({ length: 33 }, (_, i) => ({ x: 0.3 + (i % 5) * 0.05, y: 0.2 + Math.floor(i / 5) * 0.08, conf: confs[i] ?? 0.9 })) });

describe('buildDrawList: determinismo y recorte (1.2)', () => {
  const model: OverlayModel = {
    skeleton: [sk(0, []), sk(100, [])],
    guides: [{ id: 'h', guide: 'head', shape: 'circle', role: 'reference', center: { x: 0.5, y: 0.3 }, r: 6, conf: 0.9, fromMs: 0, toMs: 1000 }],
    flight: { segments: [seg('observed', 0), seg('descent', 1), seg('gap', 2), seg('estimated', 3)], tap: { x: 0.1, y: 0.8 } },
    labels: [{ text: 'Inicio', at: { x: 0.5, y: 0.9 }, fromMs: 0, toMs: 500 }],
  };

  it('misma entrada ⇒ misma lista (profundamente igual y serializada igual)', () => {
    const a = buildDrawList(model, 250, vp), b = buildDrawList(structuredClone(model), 250, vp);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('la lista va entre un clip al rectángulo de destino y su cierre', () => {
    const ops = buildDrawList(model, 250, vp);
    expect(ops[0]).toEqual({ op: 'clip', ...vp.dstRect });
    expect(ops[ops.length - 1]).toEqual({ op: 'endClip' });
  });

  it('los interruptores por capa apagan esa capa y solo esa', () => {
    const all = buildDrawList(model, 250, vp).length;
    const noFlight = buildDrawList({ ...model, show: { flight: false } }, 250, vp);
    expect(noFlight.length).toBeLessThan(all);
    expect(buildDrawList({ ...model, show: { skeleton: false, guides: false, flight: false, labels: false } }, 250, vp)).toHaveLength(2); // solo clip y endClip
  });
});

describe('estilos del trazo de la bola (tabla 4.6)', () => {
  const colored = (kind: FlightKind) => {
    const ops = buildDrawList({ flight: { segments: [seg(kind, 0)] } }, 1000, vp);
    const l = lines(ops);
    expect(l).toHaveLength(2);
    expect(l[0].color).toBe(FLIGHT_OUTLINE.color); // el contorno oscuro va primero
    return l[1];
  };

  it('observado = verde continuo; descenso = dorado continuo del mismo grosor', () => {
    const o = colored('observed'), d = colored('descent');
    expect(o.color).toBe('#6DCF8E'); expect(o.dash).toEqual([]);
    expect(d.color).toBe('#E8C04A'); expect(d.dash).toEqual([]);
    expect(d.width).toBe(o.width);
    expect(o.width).toBeCloseTo(FLIGHT_STYLES.observed.width * U, 9);
  });

  it('hueco = gris claro punteado fino (más fino que lo observado)', () => {
    const g = colored('gap'), o = colored('observed');
    expect(g.color).toBe('rgba(255,255,255,0.7)');
    expect(g.dash.length).toBeGreaterThan(0);
    expect(g.width).toBeLessThan(o.width);
  });

  it('estimada = morada punteada, más fina que la observada', () => {
    const e = colored('estimated'), o = colored('observed');
    expect(e.color).toBe('#9B7BEA');
    expect(e.dash.length).toBeGreaterThan(0);
    expect(e.width).toBeLessThan(o.width);
  });

  it('la continuación estimada se desvanece de 0,9 a 0,4 a lo largo de su recorrido', () => {
    const segs = [0, 1, 2, 3, 4].map((i) => seg('estimated', i));
    const al = lines(buildDrawList({ flight: { segments: segs } }, 10_000, vp)).filter((l) => l.color === '#9B7BEA').map((l) => l.alpha);
    expect(al).toHaveLength(5);
    expect(al[0]).toBeCloseTo(ESTIMATED_ALPHA.from, 9);
    expect(al[4]).toBeCloseTo(ESTIMATED_ALPHA.to, 9);
    for (let i = 1; i < al.length; i++) expect(al[i]).toBeLessThan(al[i - 1]);
  });

  it('el morado se distingue del negro y del blanco (≥ 3:1); contra fondos reales: no medido', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const p = lum(FLIGHT_STYLES.estimated.color);
    expect(ratio(p, 0)).toBeGreaterThanOrEqual(3);
    expect(ratio(p, 1)).toBeGreaterThanOrEqual(3);
  });

  it('la leyenda trae los cinco elementos con las etiquetas del plan', () => {
    expect(FLIGHT_LEGEND.map((l) => l.label)).toEqual(['Tramo visto', 'Bajada vista en el video', 'Sin ver la bola', 'Trayectoria estimada · no medida', 'Última vez vista']);
  });

  it('el trazo crece con el tiempo: nada antes de tA, parcial entre tA y tB, completo desde tB', () => {
    const s: FlightSegment = { kind: 'observed', a: { x: 0.2, y: 0.8 }, b: { x: 0.4, y: 0.6 }, tA: 100, tB: 200 };
    expect(lines(buildDrawList({ flight: { segments: [s] } }, 99, vp))).toHaveLength(0);
    const half = lines(buildDrawList({ flight: { segments: [s] } }, 150, vp))[1];
    const full = lines(buildDrawList({ flight: { segments: [s] } }, 200, vp))[1];
    expect(half.x2).toBeCloseTo((full.x1 + full.x2) / 2, 9);
    expect(half.y2).toBeCloseTo((full.y1 + full.y2) / 2, 9);
    expect(lines(buildDrawList({ flight: { segments: [s] } }, 900, vp))[1].x2).toBeCloseTo(full.x2, 9);
  });

  it('bola perdida: el anillo y su etiqueta aparecen desde su instante', () => {
    const m: OverlayModel = { flight: { segments: [], lost: { x: 0.5, y: 0.4, t: 300 } } };
    expect(buildDrawList(m, 299, vp).some((o) => o.op === 'text')).toBe(false);
    const after = buildDrawList(m, 300, vp);
    expect(after.some((o) => o.op === 'text' && o.text === LOST_LABEL)).toBe(true);
    expect(circles(after)).toHaveLength(2);
  });

  it('el anillo del toque se ve siempre', () => {
    expect(circles(buildDrawList({ flight: { segments: [], tap: { x: 0.3, y: 0.3 } } }, 0, vp))).toHaveLength(2);
  });
});

describe('nada se dibuja con confianza < 0,4 (4.3)', () => {
  it('esqueleto: el hueso con un extremo bajo 0,4 no sale; el punto bajo 0,4 tampoco', () => {
    const confs = Array(33).fill(0.9); confs[13] = 0.39; // codo izquierdo
    const ops = buildDrawList({ skeleton: [sk(0, confs)] }, 0, vp);
    const full = buildDrawList({ skeleton: [sk(0, [])] }, 0, vp);
    // huesos [11,13] y [13,15] desaparecen y la articulación 13 también
    expect(lines(ops)).toHaveLength(lines(full).length - 2);
    expect(circles(ops)).toHaveLength(circles(full).length - 1);
  });

  it('esqueleto: entre 0,4 y 0,6 se dibuja atenuado', () => {
    const confs = Array(33).fill(0.9); confs[13] = 0.5;
    const l = lines(buildDrawList({ skeleton: [sk(0, confs)] }, 0, vp));
    expect(l.filter((x) => x.alpha < 1)).toHaveLength(2);
  });

  it('guías: < 0,4 no se dibuja; 0,4–0,6 atenuada y punteada; ≥ 0,6 normal', () => {
    const g = (conf: number, role: 'current' | 'reference' = 'current') => ({ id: 'x', guide: 'torso' as const, shape: 'line' as const, role, a: { x: 0.4, y: 0.3 }, b: { x: 0.4, y: 0.6 }, conf, fromMs: 0, toMs: 100 });
    expect(lines(buildDrawList({ guides: [g(CONF.hide - 0.01)] }, 50, vp))).toHaveLength(0);
    const faded = lines(buildDrawList({ guides: [g(0.5)] }, 50, vp))[1];
    expect(faded.alpha).toBe(0.5); expect(faded.dash.length).toBeGreaterThan(0);
    const solid = lines(buildDrawList({ guides: [g(0.6)] }, 50, vp))[1];
    expect(solid.alpha).toBe(1); expect(solid.dash).toEqual([]);
    const ref = lines(buildDrawList({ guides: [g(0.9, 'reference')] }, 50, vp))[1];
    expect(ref.dash.length).toBeGreaterThan(0); // la referencia del inicio siempre va punteada
  });

  it('guías: fuera de su intervalo de tiempo no aparecen', () => {
    const m: OverlayModel = { guides: [{ id: 'x', guide: 'head', shape: 'circle', role: 'current', center: { x: 0.5, y: 0.2 }, r: 5, conf: 0.9, fromMs: 100, toMs: 200 }] };
    expect(circles(buildDrawList(m, 99, vp))).toHaveLength(0);
    expect(circles(buildDrawList(m, 150, vp))).toHaveLength(2);
    expect(circles(buildDrawList(m, 201, vp))).toHaveLength(0);
  });

  it('trazo y puntos de la bola con conf < 0,4 se omiten', () => {
    const m: OverlayModel = { flight: { segments: [seg('observed', 0, 0.3), seg('observed', 1, 0.8)], dots: [{ x: 0.2, y: 0.7, t: 0, kind: 'detected', conf: 0.2 }, { x: 0.3, y: 0.7, t: 0, kind: 'detected', conf: 0.9 }] } };
    const ops = buildDrawList(m, 10_000, vp);
    expect(lines(ops)).toHaveLength(2); // solo el segmento de conf 0.8 (contorno + color)
    expect(circles(ops)).toHaveLength(1);
  });
});

describe('pickSample', () => {
  const s = [sk(0, []), sk(100, []), sk(200, [])];
  it('elige la muestra más cercana y respeta la tolerancia', () => {
    expect(pickSample(s, 90)?.t).toBe(100);
    expect(pickSample(s, 149)?.t).toBe(100);
    expect(pickSample(s, 151)?.t).toBe(200);
    expect(pickSample(s, 400)).toBeNull();
    expect(pickSample([], 0)).toBeNull();
  });
});

describe('paint', () => {
  function mockCtx() {
    const calls: string[] = [];
    const rec = (n: string) => () => { calls.push(n); };
    const ctx: Record<string, unknown> = {
      save: rec('save'), restore: rec('restore'), beginPath: rec('beginPath'), rect: rec('rect'), clip: rec('clip'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
      stroke: rec('stroke'), arc: rec('arc'), fill: rec('fill'), fillRect: rec('fillRect'), fillText: rec('fillText'), setLineDash: rec('setLineDash'),
      measureText: () => ({ width: 50 }), globalAlpha: 1,
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx };
  }

  it('ejecuta la lista con save/restore balanceados y deja el estado limpio', () => {
    const { ctx, calls, raw } = mockCtx();
    const ops = buildDrawList({ skeleton: [sk(0, [])], flight: { segments: [seg('observed', 0)], tap: { x: 0.2, y: 0.8 }, lost: { x: 0.5, y: 0.5, t: 0 } }, labels: [{ text: 'x', at: { x: 0.5, y: 0.9 }, fromMs: 0, toMs: 10 }] }, 1000, vp);
    paint(ctx, ops);
    expect(calls.filter((c) => c === 'save')).toHaveLength(calls.filter((c) => c === 'restore').length);
    expect(calls).toContain('stroke'); expect(calls).toContain('fillText'); expect(calls).toContain('clip');
    expect(raw.globalAlpha).toBe(1);
  });

  it('si algo falla a mitad, igual restaura el estado', () => {
    const { ctx, calls, raw } = mockCtx();
    raw.stroke = () => { throw new Error('canvas roto'); };
    expect(() => paint(ctx, buildDrawList({ flight: { segments: [seg('observed', 0)] } }, 1000, vp))).toThrow('canvas roto');
    expect(calls.filter((c) => c === 'save')).toHaveLength(calls.filter((c) => c === 'restore').length);
  });
});
