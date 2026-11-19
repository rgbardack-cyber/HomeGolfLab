import { describe, expect, it } from 'vitest';
import { containRect, inView, makeViewport, project, screenUnit, unproject } from './viewport';

const grid = [0, 0.13, 0.25, 0.5, 0.77, 0.999, 1].flatMap((x) => [0, 0.2, 0.5, 0.91, 1].map((y) => ({ x, y })));

describe('vista y proyección (1.3)', () => {
  it('letterbox: un 9:16 dentro de una caja cuadrada queda centrado y entero', () => {
    const r = containRect(1080, 1920, { x: 0, y: 0, w: 1080, h: 1080 });
    expect(r.h).toBeCloseTo(1080, 9);
    expect(r.w).toBeCloseTo(607.5, 9);
    expect(r.x).toBeCloseTo(236.25, 9);
    expect(r.y).toBe(0);
  });

  it('project lleva las esquinas del cuadro a las esquinas del rectángulo de destino', () => {
    const vp = makeViewport(1080, 1920, { x: 100, y: 50, w: 540, h: 960 });
    expect(project({ x: 0, y: 0 }, vp)).toEqual({ x: 100, y: 50 });
    const br = project({ x: 1, y: 1 }, vp);
    expect(br.x).toBeCloseTo(640, 9);
    expect(br.y).toBeCloseTo(1010, 9);
  });

  it('ida y vuelta con letterbox: error < 0,5 px', () => {
    for (const box of [{ x: 0, y: 0, w: 1080, h: 1920 }, { x: 540, y: 0, w: 540, h: 1920 }, { x: 0, y: 0, w: 1080, h: 1080 }]) {
      const vp = makeViewport(1080, 1920, box);
      for (const p of grid) {
        const back = unproject(project(p, vp), vp);
        expect(Math.hypot((back.x - p.x) * vp.dstRect.w, (back.y - p.y) * vp.dstRect.h)).toBeLessThan(0.5);
      }
    }
  });

  it('ida y vuelta con recorte seguro: error < 0,5 px y el recorte llena su rectángulo', () => {
    const crop = { x: 0.2, y: 0.1, w: 0.5, h: 0.8 };
    const vp = makeViewport(1080, 1920, { x: 0, y: 0, w: 540, h: 1920 }, crop);
    const tl = project({ x: crop.x, y: crop.y }, vp);
    const br = project({ x: crop.x + crop.w, y: crop.y + crop.h }, vp);
    expect(tl.x).toBeCloseTo(vp.dstRect.x, 9);
    expect(tl.y).toBeCloseTo(vp.dstRect.y, 9);
    expect(br.x).toBeCloseTo(vp.dstRect.x + vp.dstRect.w, 9);
    expect(br.y).toBeCloseTo(vp.dstRect.y + vp.dstRect.h, 9);
    for (const p of grid) {
      const back = unproject(project(p, vp), vp);
      // error medido en píxeles de la fuente
      expect(Math.hypot((back.x - p.x) * 1080, (back.y - p.y) * 1920)).toBeLessThan(0.5);
    }
  });

  it('el mismo punto da el mismo píxel en vista previa y exportación a otra escala (proporcional)', () => {
    const prev = makeViewport(1080, 1920, { x: 0, y: 0, w: 270, h: 480 });
    const exp = makeViewport(1080, 1920, { x: 0, y: 0, w: 1080, h: 1920 });
    const p = { x: 0.37, y: 0.62 };
    expect(project(p, exp).x / 4).toBeCloseTo(project(p, prev).x, 9);
    expect(project(p, exp).y / 4).toBeCloseTo(project(p, prev).y, 9);
  });

  it('inView respeta el recorte y el margen', () => {
    const vp = makeViewport(1080, 1920, { x: 0, y: 0, w: 540, h: 960 }, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(inView({ x: 0.5, y: 0.5 }, vp)).toBe(true);
    expect(inView({ x: 0.1, y: 0.5 }, vp)).toBe(false);
    expect(inView({ x: 0.24, y: 0.5 }, vp, 0.02)).toBe(true);
  });

  it('screenUnit = max(ancho, alto del destino)/320', () => {
    expect(screenUnit(makeViewport(1080, 1920, { x: 0, y: 0, w: 1080, h: 1920 }))).toBeCloseTo(6, 9);
  });

  it('rechaza tamaños o recortes inválidos', () => {
    expect(() => makeViewport(0, 10, { x: 0, y: 0, w: 1, h: 1 })).toThrow(RangeError);
    expect(() => makeViewport(10, 10, { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 0, h: 1 })).toThrow(RangeError);
    expect(() => containRect(10, 10, { x: 0, y: 0, w: 0, h: 5 })).toThrow(RangeError);
  });
});
