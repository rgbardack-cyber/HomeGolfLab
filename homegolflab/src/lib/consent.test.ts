import { describe, expect, it } from 'vitest';
import { appendEvent, CONSENT_CHECKBOX_TEXT, CONSENT_VERSION, currentConsent, deletionPending, newEvent, sanitizeLog, VIDEO_STORAGE_ENABLED, type ConsentEvent } from './consent';
import { resolveFlags } from './flags';

let n = 0;
const ev = (action: ConsentEvent['action'], version = CONSENT_VERSION, at = new Date(2026, 10, 23, 12, n++)) => newEvent('u1', action, `e${n}`, at, version);

describe('consentimiento (R9)', () => {
  it('sin registro no hay consentimiento (la casilla nace sin marcar)', () => {
    expect(currentConsent([])).toBe(false);
    expect(deletionPending([])).toBe(false);
  });

  it('cada decisión guarda usuario, fecha y versión del texto', () => {
    const e = newEvent('u1', 'granted', 'x', new Date('2026-11-23T18:00:00Z'));
    expect(e).toEqual({ id: 'x', userId: 'u1', action: 'granted', at: '2026-11-23T18:00:00.000Z', version: CONSENT_VERSION });
  });

  it('aceptar y luego retirar deja el registro completo y sin consentimiento', () => {
    let log = appendEvent([], ev('granted'));
    expect(currentConsent(log)).toBe(true);
    log = appendEvent(log, ev('withdrawn'));
    expect(currentConsent(log)).toBe(false);
    expect(log.map((e) => e.action)).toEqual(['granted', 'withdrawn']);
  });

  it('no agrega eventos repetidos ni retirar sin haber aceptado', () => {
    expect(appendEvent([], ev('withdrawn'))).toEqual([]);
    const g = appendEvent([], ev('granted'));
    expect(appendEvent(g, ev('granted'))).toHaveLength(1);
  });

  it('el registro anterior no se modifica', () => {
    const g = appendEvent([], ev('granted'));
    const copy = JSON.parse(JSON.stringify(g));
    appendEvent(g, ev('withdrawn'));
    expect(g).toEqual(copy);
  });

  it('si el texto cambia (versión nueva), el consentimiento viejo ya no vale', () => {
    const log = appendEvent([], ev('granted', 1));
    expect(currentConsent(log, 1)).toBe(true);
    expect(currentConsent(log, 2)).toBe(false);
  });

  it('pedir el borrado queda anotado una sola vez y se apaga al aceptar de nuevo', () => {
    let log = appendEvent([], ev('granted'));
    log = appendEvent(log, ev('withdrawn'));
    log = appendEvent(log, ev('deletion_requested'));
    expect(deletionPending(log)).toBe(true);
    expect(appendEvent(log, ev('deletion_requested'))).toHaveLength(3);
    log = appendEvent(log, ev('granted'));
    expect(deletionPending(log)).toBe(false);
  });

  it('sanitizeLog descarta entradas dañadas', () => {
    expect(sanitizeLog(null)).toEqual([]);
    expect(sanitizeLog([{ id: 1 }, null, 'x', { id: 'a', userId: 'u', action: 'raro', at: 'z', version: 1 }])).toEqual([]);
    expect(sanitizeLog([{ id: 'a', userId: 'u', action: 'granted', at: 'z', version: 1, extra: 1 }])).toEqual([{ id: 'a', userId: 'u', action: 'granted', at: 'z', version: 1 }]);
  });

  it('guardar videos sigue desactivado y la bandera nace apagada', () => {
    expect(VIDEO_STORAGE_ENABLED).toBe(false);
    expect(resolveFlags({}, {}, false).consentFlow).toBe(false);
  });

  it('el texto de la casilla dice que la app funciona igual y que se puede retirar, y no menciona la IA (R8)', () => {
    expect(CONSENT_CHECKBOX_TEXT).toMatch(/funciona igual/);
    expect(CONSENT_CHECKBOX_TEXT).toMatch(/retirar/);
    expect(CONSENT_CHECKBOX_TEXT).not.toMatch(/\bIA\b|inteligencia artificial/i);
  });
});
