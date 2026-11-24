import { describe, expect, it } from 'vitest';
import { envKey, FLAG_NAMES, isInternalBuild, parseOverrides, resolveFlags } from './flags';

describe('interruptor de Premium de prueba (solo builds internas)', () => {
  it('la web pública (sin DEV ni VITE_INTERNAL) no lo muestra', () => {
    expect(isInternalBuild({})).toBe(false);
    expect(isInternalBuild({ DEV: false })).toBe(false);
    expect(isInternalBuild({ DEV: false, VITE_INTERNAL: '0' })).toBe(false);
    expect(isInternalBuild({ DEV: false, VITE_INTERNAL: 'true' })).toBe(false);
    expect(isInternalBuild({ VITE_INTERNAL: 1 })).toBe(false);
  });
  it('desarrollo o VITE_INTERNAL=1 sí', () => {
    expect(isInternalBuild({ DEV: true })).toBe(true);
    expect(isInternalBuild({ DEV: false, VITE_INTERNAL: '1' })).toBe(true);
  });
});

describe('banderas (1.4)', () => {
  it('todo nace apagado', () => {
    const f = resolveFlags({}, {}, false);
    expect(FLAG_NAMES.every((n) => f[n] === false)).toBe(true);
    expect(FLAG_NAMES).toHaveLength(10);
  });

  it('el nombre de la variable sale en MAYÚSCULAS con guiones bajos', () => {
    expect(envKey('videoReview')).toBe('VITE_FLAG_VIDEO_REVIEW');
    expect(envKey('shotShapeAuto')).toBe('VITE_FLAG_SHOT_SHAPE_AUTO');
    expect(envKey('export')).toBe('VITE_FLAG_EXPORT');
  });

  it('VITE_FLAG_*=1 o true enciende; cualquier otra cosa no', () => {
    const f = resolveFlags({ VITE_FLAG_VIDEO_REVIEW: '1', VITE_FLAG_COMPARE: 'true', VITE_FLAG_EXPORT: '0', VITE_FLAG_FLIGHT_V2: 'false', VITE_FLAG_EXPORT_GATE: '', VITE_FLAG_LIVE_RECORDING: 'si' }, {}, false);
    expect(f).toMatchObject({ videoReview: true, compare: true, export: false, flightV2: false, exportGate: false, liveRecording: false });
  });

  it('fuera del modo interno, los cambios guardados en el navegador NO encienden nada', () => {
    expect(resolveFlags({}, { flightEstimate: true, export: true }, false).flightEstimate).toBe(false);
    expect(resolveFlags({}, { flightEstimate: true, export: true }, false).export).toBe(false);
  });

  it('en modo interno el panel manda sobre el entorno, en ambos sentidos', () => {
    const f = resolveFlags({ VITE_FLAG_COMPARE: '1' }, { flightEstimate: true, compare: false }, true);
    expect(f.flightEstimate).toBe(true);
    expect(f.compare).toBe(false);
    expect(f.export).toBe(false);
  });

  it('parseOverrides ignora basura: JSON roto, arreglos, claves desconocidas y valores que no son booleanos', () => {
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides('{no es json')).toEqual({});
    expect(parseOverrides('[1,2]')).toEqual({});
    expect(parseOverrides('"x"')).toEqual({});
    expect(parseOverrides('{"export":true,"compare":"true","inventada":true,"flightV2":false}')).toEqual({ export: true, flightV2: false });
  });
});
