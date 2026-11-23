import { describe, expect, it } from 'vitest';
import { cameraProblem, FpsMonitor, PERF, queryCameraPermission } from './camera';

const err = (name: string, message = '') => Object.assign(new Error(message), { name });

describe('errores de cámara (F10.1)', () => {
  it('cada error tiene su texto, y solo el de permiso manda a los ajustes', () => {
    expect(cameraProblem(err('NotAllowedError'))).toMatchObject({ title: 'Necesito permiso para usar la cámara', settings: true, retry: true });
    expect(cameraProblem(err('NotFoundError'))).toMatchObject({ title: 'No encuentro una cámara', retry: false, settings: false });
    expect(cameraProblem(err('NotReadableError'))).toMatchObject({ title: 'La cámara está ocupada', retry: true, settings: false });
    expect(cameraProblem(err('OverconstrainedError')).title).toMatch(/no admite/);
    expect(cameraProblem(err('SecurityError')).title).toMatch(/segura/);
  });
  it('un error desconocido o que no es un Error no rompe', () => {
    expect(cameraProblem(err('Otro', 'falló algo')).detail).toBe('falló algo');
    expect(cameraProblem('texto').title).toBe('No se pudo abrir la cámara');
    expect(cameraProblem(null).retry).toBe(true);
  });
  it('el texto de permiso dice que la imagen no sale del teléfono', () => {
    expect(cameraProblem(err('NotAllowedError')).detail).toMatch(/no sale de tu teléfono/);
  });
});

describe('permiso previo (F10.1)', () => {
  it('lee el estado cuando el navegador lo sabe y cae a "unknown" si no', async () => {
    const nav = (state: string) => ({ permissions: { query: async () => ({ state }) } });
    expect(await queryCameraPermission(nav('granted'))).toBe('granted');
    expect(await queryCameraPermission(nav('denied'))).toBe('denied');
    expect(await queryCameraPermission(nav('prompt'))).toBe('prompt');
    expect(await queryCameraPermission(nav('raro'))).toBe('unknown');
    expect(await queryCameraPermission({})).toBe('unknown');
    expect(await queryCameraPermission({ permissions: { query: async () => { throw new Error('x'); } } })).toBe('unknown');
  });
});

describe('monitor de rendimiento (F10.6)', () => {
  it('con menos de 12 cuadros procesados por segundo en 5 s aconseja bajar la resolución, una sola vez', () => {
    const m = new FpsMonitor();
    let advice: string | null = null;
    for (let t = 0; t <= 5200; t += 125) advice = m.record(t) ?? advice;         // 8 fps
    expect(advice).toBe('lower');
    expect(m.lastFps!).toBeLessThan(PERF.minFps);
    let again: string | null = null;
    for (let t = 5300; t <= 10400; t += 125) again = m.record(t) ?? again;
    expect(again).toBeNull();                                                      // ya se avisó
  });
  it('con 15 cuadros por segundo o más no hace nada', () => {
    const m = new FpsMonitor();
    let advice: string | null = null;
    for (let t = 0; t <= 10000; t += 60) advice = m.record(t) ?? advice;          // ~16,7 fps
    expect(advice).toBeNull();
    expect(m.lastFps!).toBeGreaterThan(15);
  });
  it('reset() empieza una ventana nueva', () => {
    const m = new FpsMonitor();
    for (let t = 0; t < 4000; t += 125) m.record(t);
    m.reset();
    expect(m.record(100000)).toBeNull();
    expect(m.lastFps).toBeNull();
  });
});
