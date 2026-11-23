import { describe, expect, it } from 'vitest';
import { buildFlightTrack, detectDescent, estimateContinuation, findGaps, flightLayer, lastDistinguishable, type FlightPointV2 } from './flightTrack';
import { frameOf, makeClock } from './media/clock';
import { buildDrawList } from './overlay/draw';
import { makeViewport } from './overlay/viewport';

const clock = makeClock({ fpsNominal: 60 });
const noise = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.0008;   // determinista, ±0,08 % del alto

/** Tiro parabólico en la imagen: sube hasta t = 0,4 s (y = 0,36) y baja; 60 cuadros/s. `n` puntos desde t = 0. */
function parabola(n: number, opts: { dropFrames?: number[]; xOf?: (t: number, i: number) => number; ampNoise?: number } = {}): FlightPointV2[] {
  const out: FlightPointV2[] = [];
  for (let i = 0; i < n; i++) {
    if (opts.dropFrames?.includes(i)) continue;
    const t = (i * 1000) / 60, s = t / 1000;
    out.push({ t, frame: i, x: opts.xOf ? opts.xOf(s, i) : 0.3 + 0.2 * s + noise(i + 7) * (opts.ampNoise ?? 1), y: 0.6 - 1.2 * s + 1.5 * s * s + noise(i) * (opts.ampNoise ?? 1), conf: 0.8, source: 'detected' });
  }
  return out;
}
const dopt = { clock, analysisH: 1000 };

describe('huecos y última posición (F5.5)', () => {
  it('un hueco aparece entre dos puntos vistos separados por cuadros sin detección', () => {
    const p = parabola(20, { dropFrames: [8, 9, 10] });
    expect(findGaps(p)).toEqual([{ fromFrame: 7, toFrame: 11 }]);
    expect(findGaps(parabola(20))).toEqual([]);
  });
  it('la última posición distinguible es el último punto visto, o null', () => {
    const p = parabola(12);
    expect(lastDistinguishable(p)).toEqual({ frame: 11, t: p[11].t });
    expect(lastDistinguishable([])).toBeNull();
  });
});

describe('descenso en la imagen (F5.5)', () => {
  it('un descenso claro se confirma, con el ápice cerca de t = 0,4 s', () => {
    const d = detectDescent(parabola(46), dopt);
    expect(d.state).toBe('confirmed');
    expect(d.frame).toBe('image');
    expect(Math.abs((d.fromIndex ?? 0) - 24)).toBeLessThanOrEqual(2);
    expect(d.evidence.failed).toEqual([]);
    expect(d.evidence.curvature).toBeGreaterThan(0);
  });

  it('ruido sin trayectoria no se confirma', () => {
    const rnd = Array.from({ length: 30 }, (_, i): FlightPointV2 => ({ t: (i * 1000) / 60, frame: i, x: 0.5 + noise(i + 3) * 8, y: 0.5 + noise(i) * 8, conf: 0.8, source: 'detected' }));
    expect(detectDescent(rnd, dopt).state).toBe('not_confirmed');
  });

  it('solo subida (sin ápice) no es descenso', () => {
    expect(detectDescent(parabola(20), dopt).state).toBe('not_confirmed');   // t < 0,4 s: todavía sube
  });

  it('con menos de 8 puntos es "insufficient"', () => {
    const d = detectDescent(parabola(7), dopt);
    expect(d.state).toBe('insufficient');
    expect(d.evidence.failed).toContain('menos de 8 puntos');
  });

  it('un hueco de más de 2 cuadros tras el ápice impide confirmar', () => {
    const d = detectDescent(parabola(46, { dropFrames: [30, 31, 32] }), dopt);
    expect(d.state).toBe('not_confirmed');
    expect(d.evidence.failed).toContain('hueco de más de 2 cuadros');
  });

  it('puntos con confianza baja tras el ápice impiden confirmar', () => {
    const p = parabola(46).map((q, i) => (i > 30 ? { ...q, conf: 0.5 } : q));
    expect(detectDescent(p, dopt).state).toBe('not_confirmed');
  });

  it('x que retrocede más que σ (saltó a otro objeto) no se confirma', () => {
    const p = parabola(46, { xOf: (s, i) => (i === 35 ? 0.1 : 0.3 + 0.2 * s) });
    const d = detectDescent(p, dopt);
    expect(d.state).toBe('not_confirmed');
    expect(d.evidence.failed).toContain('x retrocede');
  });

  it('la comprobación de vecinos, si falla en un punto del tramo, impide confirmar', () => {
    const d = detectDescent(parabola(46), { ...dopt, neighborOk: (i) => i !== 40 });
    expect(d.state).toBe('not_confirmed');
    expect(d.evidence.failed).toContain('comprobación de vecinos');
  });

  it('a 30 cuadros reales por segundo bastan 3 puntos tras el ápice; a 60 hacen falta 4', () => {
    const c30 = makeClock({ fpsNominal: 30 });
    const pts = (c: typeof clock, step: number) => Array.from({ length: 18 }, (_, i): FlightPointV2 => {
      const s = (i * step) / 1000;
      return { t: i * step, frame: i, x: 0.3 + 0.2 * s, y: 0.6 - 1.2 * s + 1.5 * s * s, conf: 0.8, source: 'detected' };
    }).slice(0, 18);
    // apex en s = 0,4 s → índice 12 a 33,3 ms (30 fps): quedan 5 tras el ápice; recortamos a 3 y a 2
    const p30 = pts(c30, 1000 / 30);
    const apex = 12;
    expect(detectDescent(p30.slice(0, apex + 1 + 3), { clock: c30, analysisH: 1000 }).evidence.failed).not.toContain('menos de 3 puntos tras el ápice');
    expect(detectDescent(p30.slice(0, apex + 1 + 2), { clock: c30, analysisH: 1000 }).state).not.toBe('confirmed');
  });

  const mk = (ys: number[]): FlightPointV2[] => ys.map((y, i) => ({ t: (i * 1000) / 60, frame: i, x: 0.3 + 0.002 * i, y, conf: 0.8, source: 'detected' as const }));
  const rise = Array.from({ length: 13 }, (_, i) => 0.5 - 0.0045 * i);              // sube limpio hasta y = 0,446

  it('a 60 cuadros reales hacen falta 4 puntos tras el ápice (con 3 no se confirma)', () => {
    const d = detectDescent(parabola(28), dopt);
    expect(d.evidence.pointsAfter).toBe(3);
    expect(d.state).toBe('not_confirmed');
    expect(d.evidence.failed).toContain('menos de 4 puntos tras el ápice');
  });

  it('una caída menor que el máximo entre 3σ y 0,6 % del alto no cuenta como descenso', () => {
    const d = detectDescent(mk([...rise, 0.4465, 0.447, 0.4475, 0.448]), dopt);        // cae 0,2 % del alto: menos de 0,6 %
    expect(d.evidence.drop).toBeLessThan(0.006 + 1e-9);
    expect(d.state).toBe('not_confirmed');
    expect(d.evidence.failed).toContain('caída insuficiente');
  });

  it('una subida y bajada sin pendiente significativa (zigzag) no se confirma', () => {
    const d = detectDescent(mk([...rise, 0.455, 0.446, 0.456, 0.447, 0.455]), dopt);
    expect(d.state).toBe('not_confirmed');
    expect(d.evidence.failed).toContain('pendiente posterior sin significancia');
  });

  it('una bajada monótona sin subida previa (ápice en el índice 0) no se confirma', () => {
    const fall = Array.from({ length: 24 }, (_, i): FlightPointV2 => ({ t: (i * 1000) / 60, frame: i, x: 0.3 + 0.004 * i, y: 0.3 + 0.01 * i + 0.0005 * i * i, conf: 0.8, source: 'detected' }));
    const d = detectDescent(fall, dopt);
    expect(d.state).toBe('not_confirmed');
    expect(d.evidence.failed).toContain('sin subida previa al ápice');
  });

  it('el retroceso de x se mide en unidades de alto: el mismo salto cuenta más en un cuadro apaisado', () => {
    const jump = (aspect: number) => detectDescent(parabola(46, { xOf: (s, i) => 0.3 + 0.2 * s - (i === 35 ? 0.006 : 0) }), { ...dopt, aspect });
    expect(jump(16 / 9).evidence.maxXReversal).toBeGreaterThan(jump(1).evidence.maxXReversal);
  });

  it('un clip a media velocidad (30 nominal, timeScale 0,5) cuenta como 60 reales', () => {
    const half = makeClock({ fpsNominal: 30, timeScale: 0.5 });
    const p = parabola(46).map((q) => ({ ...q, t: q.t * 2, frame: Math.round(q.frame) }));      // medio tiempo ×2: mismo tiro real
    const d = detectDescent(p, { clock: half, analysisH: 1000 });
    expect(d.state).toBe('confirmed');
  });
});

describe('continuación estimada (F5.5)', () => {
  const copt = { clock, aspect: 9 / 16, clipEndMs: 5000, allowed: true };

  it('con una trayectoria limpia se muestra y no pasa de 1,0 s reales ni de la duración observada', () => {
    const p = parabola(30);                                                              // 0,5 s observados
    const c = estimateContinuation(p, copt);
    expect(c.state).toBe('shown');
    expect(c.model).toBe('quad2d');
    expect(c.horizonMs!).toBeLessThanOrEqual(500 + 17);
    expect(c.points.every((q) => q.source === 'estimated')).toBe(true);
    expect(c.points[0].t).toBeGreaterThan(p[p.length - 1].t);
    const big = estimateContinuation(parabola(54), { ...copt, clipEndMs: 9000 });
    expect(big.horizonMs!).toBeLessThanOrEqual(1000);
  });

  it('el horizonte no pasa del fin del clip', () => {
    const p = parabola(30);
    const c = estimateContinuation(p, { ...copt, clipEndMs: p[p.length - 1].t + 100 });
    if (c.state === 'shown') expect(c.horizonMs!).toBeLessThanOrEqual(100 + 17);
  });

  it('con menos de 8 puntos, o sin permiso, se abstiene y no hay puntos', () => {
    expect(estimateContinuation(parabola(7), copt)).toMatchObject({ state: 'abstained', points: [] });
    const nope = estimateContinuation(parabola(30), { ...copt, allowed: false });
    expect(nope.state).toBe('abstained');
    expect(nope.points).toEqual([]);
  });

  it('con un hueco de más de 3 cuadros al final se abstiene', () => {
    expect(estimateContinuation(parabola(30, { dropFrames: [24, 25, 26, 27] }), copt).state).toBe('abstained');
  });

  it('con puntos que el modelo no ajusta (ruido grande) se abstiene', () => {
    expect(estimateContinuation(parabola(30, { ampNoise: 60 }), copt).state).toBe('abstained');
  });

  it('con una proporción de cuadro inválida (0 o NaN) se abstiene en vez de inventar puntos', () => {
    for (const aspect of [0, NaN]) expect(estimateContinuation(parabola(30), { ...copt, aspect })).toMatchObject({ state: 'abstained', points: [] });
  });

  it('se detiene al salir del cuadro', () => {
    const fast = parabola(30, { xOf: (s) => 0.5 + 0.9 * s });                           // x llega a 1 hacia 0,55 s
    const c = estimateContinuation(fast, { ...copt, aspect: 1 });
    if (c.state === 'shown') expect(c.points.every((q) => q.x <= 1 && q.x >= 0)).toBe(true);
  });
});

describe('construcción y capa del compositor', () => {
  const res = (points: ReturnType<typeof parabola>, endReason: 'lost' | 'window' | null = 'lost') => ({ points: points.map((p) => ({ t: p.t, x: p.x, y: p.y, source: 'detected' as const })), lostAtMs: endReason === 'lost' ? points[points.length - 1].t : null, endReason, released: true });
  const bopt = { sourceId: 'm1', clock, tap: { x: 0.3, y: 0.6, t: 0 }, aspect: 9 / 16, analysisH: 1000, clipEndMs: 5000, allowEstimate: false };

  it('un tiro no liberado no tiene puntos observados y no inventa nada', () => {
    const t = buildFlightTrack({ ...res(parabola(30)), released: false }, bopt);
    expect(t.observed).toEqual([]);
    expect(t.released).toBe(false);
    expect(t.descent.state).toBe('insufficient');
    expect(t.continuation.state).toBe('abstained');
  });

  it('los puntos llevan su cuadro según el reloj y el motor queda registrado', () => {
    const t = buildFlightTrack(res(parabola(46)), bopt);
    expect(t.v).toBe(2);
    expect(t.engine).toBe('ballflight@2');
    expect(t.observed.every((p) => p.frame === frameOf(clock, p.t))).toBe(true);
    expect(t.descent.state).toBe('confirmed');
  });

  it('la capa usa verde antes del ápice, dorado desde él, gris en los huecos y un anillo al perderse', () => {
    const t = buildFlightTrack(res(parabola(46, { dropFrames: [5, 6] })), bopt);
    const layer = flightLayer(t);
    const kinds = layer.segments.map((s) => s.kind);
    expect(kinds[0]).toBe('observed');
    expect(kinds).toContain('gap');
    expect(kinds[kinds.length - 1]).toBe('descent');
    expect(layer.lost).toBeDefined();
    expect(layer.tap).toEqual({ x: 0.3, y: 0.6 });
  });

  it('sin descenso confirmado todo el trazo queda verde y la continuación solo sale con permiso', () => {
    const t = buildFlightTrack(res(parabola(20)), { ...bopt, allowEstimate: true });
    expect(flightLayer(t).segments.every((s) => s.kind !== 'descent')).toBe(true);
    const vp = makeViewport(1080, 1920, { x: 0, y: 0, w: 270, h: 480 });
    const ops = buildDrawList({ flight: flightLayer(t) }, t.observed[t.observed.length - 1].t + 2000, vp);
    expect(ops.length).toBeGreaterThan(0);
  });
});
