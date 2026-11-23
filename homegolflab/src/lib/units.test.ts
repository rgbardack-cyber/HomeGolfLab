import { describe, expect, it } from 'vitest';
import { asUnit, DEFAULT_UNIT, fmtDist, fmtLateral, fromMeters, inputValue, mToYd, parseToMeters, toMeters, ydToM, YD_M } from './units';

describe('unidades (F7.1, D2)', () => {
  it('la yarda es exactamente 0,9144 m y la conversión es exacta en los dos sentidos', () => {
    expect(YD_M).toBe(0.9144);
    expect(ydToM(100)).toBeCloseTo(91.44, 10);
    expect(mToYd(91.44)).toBeCloseTo(100, 10);
    for (const m of [0.3, 1, 2.5, 12.34, 250]) expect(ydToM(mToYd(m))).toBeCloseTo(m, 10);
    expect(fromMeters(0.9144, 'yd')).toBe(1);
    expect(toMeters(10, 'm')).toBe(10);
  });

  it('yardas es la unidad por defecto', () => {
    expect(DEFAULT_UNIT).toBe('yd');
    expect(asUnit(undefined)).toBe('yd');
    expect(asUnit('km')).toBe('yd');
    expect(asUnit('m')).toBe('m');
  });

  it('los datos viejos en metros se muestran convertidos y redondeados con coma', () => {
    expect(fmtDist(2, 'yd')).toBe('2,2 yd');                          // 2 m = 2,187 yd
    expect(fmtDist(2, 'm')).toBe('2,0 m');
    expect(fmtDist(91.44, 'yd')).toBe('100 yd');                      // desde 100 sin decimales
    expect(fmtDist(Number.NaN, 'yd')).toBe('—');
    expect(fmtDist(5, 'yd', 2)).toBe('5,47 yd');
  });

  it('el desvío lateral conserva el lado y no inventa precisión', () => {
    expect(fmtLateral(0, 'yd')).toBe('centro');
    expect(fmtLateral(0.002, 'm')).toBe('centro');
    expect(fmtLateral(0.5, 'm')).toBe('0,50 m der.');
    expect(fmtLateral(-0.5, 'yd')).toBe('0,55 yd izq.');
    expect(fmtLateral(3, 'm')).toBe('3,0 m der.');
  });

  it('lo que escribe el usuario se interpreta en su unidad y se guarda en metros', () => {
    expect(parseToMeters('10', 'yd')).toBeCloseTo(9.144, 10);
    expect(parseToMeters('12,5', 'm')).toBe(12.5);
    expect(parseToMeters('abc', 'm')).toBeNull();
    expect(parseToMeters('-3', 'yd')).toBeNull();
    expect(parseToMeters('0', 'yd')).toBeNull();
    expect(inputValue(9.144, 'yd')).toBe('10');
    expect(inputValue(9.144, 'm')).toBe('9.1');
  });

  it('guardar y volver a mostrar no acumula error (ida y vuelta de lo escrito)', () => {
    const m = parseToMeters('37,5', 'yd')!;
    expect(fmtDist(m, 'yd')).toBe('37,5 yd');
    expect(fmtDist(m, 'm')).toBe('34,3 m');
  });
});

import { buildPlan, zones, type Space } from './homelab';

describe('avisos del espacio en la unidad elegida (F7.1)', () => {
  const sp: Space = { lengthM: 1.5, widthM: 2, ceilingM: 2.4, floor: 'alfombra', gear: ['putter', 'hierros'] };
  it('por defecto (metros) los avisos no cambian; en yardas se convierten sin cambiar las reglas', () => {
    const m = zones(sp), yd = zones(sp, 'yd');
    expect(m[0].note).toBe('Hace falta al menos 2,0 m libres de largo.');
    expect(yd[0].note).toBe('Hace falta al menos 2,2 yd libres de largo.');
    expect(m.map((z) => z.ok)).toEqual(yd.map((z) => z.ok));                       // la regla (en metros) es la misma
    expect(yd[2].note).toBe('Techo de 2,6 yd: muy bajo para un swing completo (mínimo 3,1 yd).');
  });
  it('la nota del plan usa la unidad', () => {
    const full: Space = { lengthM: 6, widthM: 4, ceilingM: 3, floor: 'alfombra', gear: ['putter', 'hierros', 'wedge', 'foam'] };
    expect(buildPlan(full, '2026-11-10', [], 'yd').note).toMatch(/^Espacio de 6,6 yd × 4,4 yd/);
    expect(buildPlan(full, '2026-11-10').note).toMatch(/^Espacio de 6,0 m × 4,0 m/);
  });
});
