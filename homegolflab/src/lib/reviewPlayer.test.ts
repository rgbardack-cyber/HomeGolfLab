import { describe, expect, it } from 'vitest';
import { frameOf, makeClock, msOfFrame } from './media/clock';
import { estimateFps, needsReview, nudgeMark, phaseMarks, seekTimeForFrame, stepFrame, validOrder, type FrameSample } from './reviewPlayer';

const c60 = makeClock({ fpsNominal: 60 });
const times = { address: 7066.665, top: 7699.998, impact: 7999.998 };   // i5_sr_t01 medido en el navegador (F3.1)

describe('marcas de fase', () => {
  it('traen su cuadro del reloj y son automáticas por defecto', () => {
    const m = phaseMarks(c60, times);
    expect(m.map((x) => x.frame)).toEqual([424, 462, 480]);
    expect(m.every((x) => x.source === 'auto')).toBe(true);
  });
  it('un ajuste manual manda sobre el automático y queda marcado', () => {
    const m = phaseMarks(c60, times, { top: msOfFrame(c60, 465) }, { top: 0.3 });
    expect(m[1]).toMatchObject({ key: 'top', frame: 465, source: 'manual', conf: 0.3 });
    expect(m[0].source).toBe('auto');
  });
  it('"Revisa esta fase" solo con conf < 0,5', () => {
    const [a, t, i] = phaseMarks(c60, times, {}, { address: 0.49, top: 0.5 });
    expect([needsReview(a), needsReview(t), needsReview(i)]).toEqual([true, false, false]);
  });
});

describe('paso de cuadro y seek exacto', () => {
  it('el instante de seek cae DENTRO del cuadro pedido (no en el borde) y frameOf lo devuelve', () => {
    for (const fps of [30, 60]) {
      const c = makeClock({ fpsNominal: fps });
      for (const n of [0, 1, 424, 480, 899]) expect(frameOf(c, seekTimeForFrame(c, n))).toBe(n);
    }
  });
  it('con firstFrameMs distinto de 0 también', () => {
    const c = makeClock({ fpsNominal: 60, firstFrameMs: 133.333 });
    expect(frameOf(c, seekTimeForFrame(c, 100))).toBe(100);
  });
  it('stepFrame avanza/retrocede 1 sin salirse de [0, último]', () => {
    expect(stepFrame(c60, msOfFrame(c60, 10), 1)).toBe(11);
    expect(stepFrame(c60, msOfFrame(c60, 10), -1)).toBe(9);
    expect(stepFrame(c60, 0, -1)).toBe(0);
    expect(stepFrame(c60, msOfFrame(c60, 50), 1, 50)).toBe(50);
  });
  it('nudgeMark mueve ±1 cuadro, marca como manual y respeta los límites', () => {
    const [a] = phaseMarks(c60, times);
    expect(nudgeMark(c60, a, 1)).toMatchObject({ frame: 425, source: 'manual' });
    expect(nudgeMark(c60, a, -1).frame).toBe(423);
    expect(nudgeMark(c60, { ...a, frame: 0 }, -1).frame).toBe(0);
    expect(nudgeMark(c60, a, 1).t).toBeCloseTo(msOfFrame(c60, 425), 9);
  });
  it('validOrder: inicio < tope < impacto', () => {
    const m = phaseMarks(c60, times);
    expect(validOrder(m)).toBe(true);
    expect(validOrder([m[0], nudgeMark(c60, m[1], 100), m[2]])).toBe(false);
    expect(validOrder([m[0], m[1], nudgeMark(c60, m[2], -30)])).toBe(false);
  });
});

describe('estimateFps (requestVideoFrameCallback)', () => {
  const run = (fps: number, n = 20, jitter = 0.0004): FrameSample[] => Array.from({ length: n }, (_, i) => ({ mediaTime: i / fps + ((i * 7919) % 11) * jitter / 11, presentedFrames: 100 + i }));
  it('reconoce 30 y 60 fps', () => {
    expect(estimateFps(run(60))).toBe(60);
    expect(estimateFps(run(30))).toBe(30);
    expect(estimateFps(run(24))).toBe(24);
  });
  it('ignora pares donde el navegador se saltó cuadros (presentedFrames salta 2)', () => {
    const s = run(60, 30).filter((_, i) => i % 2 === 0).map((x, i) => ({ ...x, presentedFrames: 100 + i * 2 })); // todos los pares saltan
    expect(estimateFps(s)).toBeNull();
  });
  it('sin evidencia suficiente o con un valor raro devuelve null (no inventa)', () => {
    expect(estimateFps(run(60, 3))).toBeNull();
    expect(estimateFps(run(41))).toBeNull();
    expect(estimateFps([])).toBeNull();
  });
});
