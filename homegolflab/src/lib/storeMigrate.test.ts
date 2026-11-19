import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateStore, STORE_VERSION } from './storeMigrate';

// JSON REAL de localStorage generado por la app (formato vigente antes de F2, sin `version`): perfil rellenado a mano,
// un análisis de video de i5_sr_t01 y las medallas que ese análisis ganó. Ver docs/registro-implementacion.md.
const raw = readFileSync(new URL('./__fixtures__/store-v0-real.json', import.meta.url), 'utf8');
const real = JSON.parse(raw) as { state: Record<string, unknown>; version: number };

describe('migración del store v0 → v1 con un JSON real (F2.1)', () => {
  it('el fixture es realmente de la versión anterior (version 0, sin exportPasses)', () => {
    expect(real.version).toBe(0);
    expect('exportPasses' in real.state).toBe(false);
    expect((real.state.sessions as unknown[]).length).toBeGreaterThan(0);
    expect(Object.keys(real.state.earned as object).length).toBeGreaterThan(0);
  });

  it('conserva todo lo que ya había y agrega los campos nuevos vacíos', () => {
    const out = migrateStore(structuredClone(real.state), 0);
    for (const k of Object.keys(real.state)) expect(out[k]).toEqual(real.state[k]);
    expect(out.exportPasses).toEqual([]);
    expect(STORE_VERSION).toBe(1);
  });

  it('no pierde sesiones, medallas, perfil ni trackingUsedSec con datos más completos', () => {
    const rich = {
      ...structuredClone(real.state),
      trackingUsedSec: 421,
      currentClub: 'Hierro 7',
      unlockQueue: ['swing_1'],
      profile: { name: 'Ana', handicap: '9.1', lefty: true, premium: true },
      space: { w: 3, d: 4 }, plan: { minutes: 20 }, scan: { x: 1 },
      desconocido: 'se conserva',
    };
    const out = migrateStore(structuredClone(rich), 0);
    expect(out.trackingUsedSec).toBe(421);
    expect(out.currentClub).toBe('Hierro 7');
    expect(out.unlockQueue).toEqual(['swing_1']);
    expect(out.profile).toEqual(rich.profile);
    expect(out.space).toEqual(rich.space);
    expect(out.desconocido).toBe('se conserva');
    expect(out.sessions).toEqual(rich.sessions);
    expect(out.earned).toEqual(rich.earned);
  });

  it('completa un perfil antiguo al que le faltan campos, sin pisar los que trae', () => {
    const out = migrateStore({ profile: { name: 'Luis', premium: true } }, 0);
    expect(out.profile).toEqual({ name: 'Luis', handicap: '', lefty: false, premium: true });
  });

  it('repara tipos dañados sin lanzar errores y descarta un guardado ilegible', () => {
    const out = migrateStore({ sessions: 'x', earned: [], unlockQueue: null, trackingUsedSec: -5, profile: 3 }, 0);
    expect(out).toMatchObject({ sessions: [], earned: {}, unlockQueue: [], trackingUsedSec: 0, exportPasses: [] });
    expect(migrateStore(null, 0)).toEqual({});
    expect(migrateStore('texto', 0)).toEqual({});
    expect(migrateStore([1, 2], 0)).toEqual({});
  });

  it('un guardado ya en v1 (o de una versión futura) pasa sin cambios', () => {
    const v1 = { ...structuredClone(real.state), exportPasses: [{ id: 'p' }] };
    expect(migrateStore(structuredClone(v1), 1)).toEqual(v1);
    expect(migrateStore(structuredClone(v1), 2)).toEqual(v1);
  });
});

describe('el store real hidrata desde un localStorage v0 y escribe v1 (F2.1, integración)', () => {
  let mem: Record<string, string>;
  beforeEach(() => {
    mem = { 'homegolflab-v1': raw };
    vi.resetModules();
    const fake = {
      getItem: (k: string) => (k in mem ? mem[k] : null),
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
    };
    vi.stubGlobal('localStorage', fake);
    vi.stubGlobal('window', { localStorage: fake }); // zustand lee window.localStorage
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('carga las sesiones y medallas guardadas y deja exportPasses vacío', async () => {
    const { useStore } = await import('../store');
    await useStore.persist.rehydrate();
    const st = useStore.getState();
    expect(st.sessions).toHaveLength((real.state.sessions as unknown[]).length);
    expect(st.earned).toEqual(real.state.earned);
    expect(st.profile).toEqual(real.state.profile);
    expect(st.exportPasses).toEqual([]);
  });

  it('al guardar de nuevo, escribe version 1 y conserva todo', async () => {
    const { useStore } = await import('../store');
    await useStore.persist.rehydrate();
    useStore.getState().addTrackingTime(30);
    const written = JSON.parse(mem['homegolflab-v1']);
    expect(written.version).toBe(1);
    expect(written.state.sessions).toEqual(real.state.sessions);
    expect(written.state.trackingUsedSec).toBe(30);
    expect(written.state.exportPasses).toEqual([]);
  });
});
