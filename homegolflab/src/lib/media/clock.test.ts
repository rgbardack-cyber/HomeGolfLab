import { describe, expect, it } from 'vitest';
import { addRealMs, frameDurationMs, frameOf, makeClock, msOfFrame, realDeltaMs, realFrameDurationMs, realMs } from './clock';

describe('reloj de medio (4.1)', () => {
  it('60 fps: el cuadro 60 está a 1 s y el redondeo cae al cuadro más cercano', () => {
    const c = makeClock({ fpsNominal: 60 });
    expect(frameOf(c, 1000)).toBe(60);
    expect(frameOf(c, 1000 + 8)).toBe(60); // 8 ms < media cuadro (8,33)
    expect(frameOf(c, 1000 + 9)).toBe(61);
    expect(msOfFrame(c, 60)).toBeCloseTo(1000, 9);
  });

  it('30 fps: un cuadro dura 33,33 ms y frameOf/msOfFrame son inversas en instantes exactos', () => {
    const c = makeClock({ fpsNominal: 30 });
    expect(frameDurationMs(c)).toBeCloseTo(33.3333, 3);
    for (const n of [0, 1, 17, 435, 899]) expect(frameOf(c, msOfFrame(c, n))).toBe(n);
  });

  it('firstFrameMs distinto de 0 desplaza el cuadro 0 (listas de edición)', () => {
    const c = makeClock({ fpsNominal: 60, firstFrameMs: 133.333 });
    expect(frameOf(c, 133.333)).toBe(0);
    expect(frameOf(c, 133.333 + 1000)).toBe(60);
    expect(realMs(c, 133.333)).toBe(0);
    expect(msOfFrame(c, 0)).toBeCloseTo(133.333, 9);
  });

  it('media velocidad: 1 s de medio son 0,5 s reales; los umbrales en segundos reales no se estiran', () => {
    const slow = makeClock({ fpsNominal: 30, timeScale: 0.5, fpsSource: 'user' });
    expect(realMs(slow, 1000)).toBe(500);
    expect(realDeltaMs(slow, 2000, 3000)).toBe(500);
    // un paso de 1 cuadro (33,33 ms de medio) equivale a 16,67 ms reales = un cuadro de 60 fps real
    expect(realFrameDurationMs(slow)).toBeCloseTo(1000 / 60, 6);
    // 0,3 s REALES (ventana del tracker) son 600 ms de medio
    expect(addRealMs(slow, 7000, 300)).toBeCloseTo(7600, 9);
  });

  it('el mismo golpe a 60 fps y a media velocidad 30 fps da los mismos tiempos reales', () => {
    const fast = makeClock({ fpsNominal: 60 });
    const slow = makeClock({ fpsNominal: 30, timeScale: 0.5 });
    // impacto en el cuadro 90 de un original a 60 fps = 1,5 s reales; el clip lento (cada cuadro original dura
    // 2 × 16,67 ms de medio = 33,33 ms) lo tiene en el cuadro 90 de 30 fps = 3 s de medio = 1,5 s reales
    expect(realMs(fast, msOfFrame(fast, 90))).toBeCloseTo(1500, 6);
    expect(realMs(slow, msOfFrame(slow, 90))).toBeCloseTo(1500, 6);
  });

  it('rechaza relojes inválidos', () => {
    expect(() => makeClock({ fpsNominal: 0 })).toThrow(RangeError);
    expect(() => makeClock({ fpsNominal: NaN })).toThrow(RangeError);
    expect(() => makeClock({ fpsNominal: 60, timeScale: 0 })).toThrow(RangeError);
    expect(() => makeClock({ fpsNominal: 60, firstFrameMs: Infinity })).toThrow(RangeError);
  });
});
