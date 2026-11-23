import { describe, expect, it } from 'vitest';
import { exportTimes, swingExportSource } from './sources';
import type { SwingResult } from '../swing';

const r = (times: unknown) => ({ times, view: 'atras', lefty: true } as unknown as SwingResult);

describe('fuentes de exportación', () => {
  it('los ajustes manuales mandan sobre los automáticos', () => {
    expect(exportTimes(r({ address: 1000, top: 1600, impact: 2000 }), { top: 1700 })).toEqual({ address: 1000, top: 1700, impact: 2000 });
  });
  it('incluye el final solo si existe y está después del impacto', () => {
    expect(exportTimes(r({ address: 1000, top: 1600, impact: 2000, finish: 3200 }))).toMatchObject({ finish: 3200 });
    expect(exportTimes(r({ address: 1000, top: 1600, impact: 2000, finish: 1900 }))).toBeNull();
  });
  it('sin tiempos o desordenados no hay fuente', () => {
    expect(exportTimes(r(undefined))).toBeNull();
    expect(exportTimes(r({ address: 2000, top: 1600, impact: 2100 }))).toBeNull();
    expect(swingExportSource('m', { w: 1080, h: 1920 }, null, r({ address: 2000, top: 1600, impact: 2100 }))).toBeNull();
  });
  it('toma vista y mano del análisis, y la mano puede cambiarse', () => {
    const s = swingExportSource('m', { w: 1080, h: 1920 }, null, r({ address: 1000, top: 1600, impact: 2000 }))!;
    expect(s).toMatchObject({ id: 'm', w: 1080, h: 1920, view: 'atras', lefty: true });
    expect(swingExportSource('m', { w: 1, h: 1 }, null, r({ address: 1000, top: 1600, impact: 2000 }), {}, false)!.lefty).toBe(false);
  });
});
