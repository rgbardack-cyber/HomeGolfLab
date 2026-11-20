import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('etiqueta del tiro y pases en el store (F6.1, F9)', () => {
  let mem: Record<string, string>;
  beforeEach(() => {
    mem = {};
    vi.resetModules();
    const fake = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
    vi.stubGlobal('localStorage', fake);
    vi.stubGlobal('window', { localStorage: fake });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('la etiqueta se guarda con la sesión del tiro, se puede cambiar y quitar, y sobrevive al reinicio', async () => {
    const { useStore } = await import('../store');
    const s = useStore.getState().addSession({ type: 'tracking', flightOnly: true, flightTrackId: 'f1', shapeManual: 'draw' });
    expect(useStore.getState().sessions[0].shapeManual).toBe('draw');
    useStore.getState().setShapeManual(s.id, 'fade');
    expect(useStore.getState().sessions[0].shapeManual).toBe('fade');
    expect(JSON.parse(mem['homegolflab-v1']).state.sessions[0].shapeManual).toBe('fade');
    useStore.getState().setShapeManual(s.id, null);
    expect(useStore.getState().sessions[0].shapeManual).toBeUndefined();
    // otra sesión no se toca
    const t = useStore.getState().addSession({ type: 'tracking', flightOnly: true, shapeManual: 'slice' });
    useStore.getState().setShapeManual(s.id, 'hook');
    expect(useStore.getState().sessions.find((x) => x.id === t.id)!.shapeManual).toBe('slice');
  });

  it('los pases se guardan, vencen al guardar otro y cuentan usos; la gratis del día y el consentimiento persisten', async () => {
    const { useStore } = await import('../store');
    const now = 1_800_000_000_000;
    const mk = (id: string, expiresAt: number) => ({ id, analysisId: 'a', specHash: '', grantedAt: now, expiresAt, via: 'reward' as const, uses: 0, consumed: false });
    useStore.getState().grantExportPass(mk('old', now - 1), now - 100);
    useStore.getState().grantExportPass(mk('p1', now + 1000), now);
    expect(useStore.getState().exportPasses.map((p) => p.id)).toEqual(['p1']);            // el vencido se quita al guardar uno nuevo
    useStore.getState().touchExportPass('p1');
    expect(useStore.getState().exportPasses[0].uses).toBe(1);
    useStore.getState().markFreeExport('2026-11-20');
    useStore.getState().setAdsConsent('declined');
    const saved = JSON.parse(mem['homegolflab-v1']).state;
    expect(saved).toMatchObject({ freeExportDate: '2026-11-20', adsConsent: 'declined' });
    expect(saved.exportPasses).toHaveLength(1);
  });
});
