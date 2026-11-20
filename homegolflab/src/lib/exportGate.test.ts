import { describe, expect, it } from 'vitest';
import type { ExportPass } from '@/store';
import {
  analysisKey, findValidPass, gateStep, INITIAL_GATE, MAX_LOAD_ATTEMPTS, needsAdNotice, PASS_TTL_MS, pruneExpired,
  type GateContext, type GateEvent, type GateState,
} from './exportGate';

const NOW = 1_800_000_000_000;
const ctx = (over: Partial<GateContext> = {}): GateContext => ({ now: NOW, premium: false, consent: 'granted', passes: [], freeExportDate: null, today: '2026-11-20', ...over });

/** Simula la capa que aplica los efectos al almacenamiento, para probar secuencias completas. */
function sim(over: Partial<GateContext> = {}) {
  let state: GateState = INITIAL_GATE;
  let c = ctx(over);
  const log: GateState['status'][] = [];
  const send = (e: GateEvent) => {
    const r = gateStep(state, e, c);
    state = r.state;
    if (r.effects.grant) c = { ...c, passes: [...c.passes, r.effects.grant] };
    if (r.effects.useFreeDaily) c = { ...c, freeExportDate: c.today };
    if (r.effects.usePassId) c = { ...c, passes: c.passes.map((p) => (p.id === r.effects.usePassId ? { ...p, uses: p.uses + 1 } : p)) };
    log.push(state.status);
    return r;
  };
  return { send, get state() { return state; }, get ctx() { return c; }, set(o: Partial<GateContext>) { c = { ...c, ...o }; }, log };
}

describe('compuerta de exportación (F9.1)', () => {
  it('camino feliz gratis: solo el evento de recompensa emite el pase, y se exporta', () => {
    const g = sim();
    g.send({ type: 'request', analysisId: 'a1' });
    expect(g.state.status).toBe('requesting_ad');
    expect(g.ctx.passes).toHaveLength(0);                          // pedir el anuncio no desbloquea nada
    g.send({ type: 'ad_loaded' });
    g.send({ type: 'ad_showed' });
    expect(g.state.status).toBe('showing');
    expect(g.ctx.passes).toHaveLength(0);                          // mostrarlo tampoco
    g.send({ type: 'ad_rewarded', rewardEventId: 'r1' });
    expect(g.state.status).toBe('rewarded');
    expect(g.ctx.passes).toHaveLength(1);
    expect(g.ctx.passes[0]).toMatchObject({ analysisId: 'a1', via: 'reward', rewardEventId: 'r1', grantedAt: NOW, expiresAt: NOW + PASS_TTL_MS });
    g.send({ type: 'ad_dismissed' });                              // cerrar el anuncio tras la recompensa es normal
    expect(g.state.status).toBe('rewarded');
    g.send({ type: 'export_started' });
    g.send({ type: 'export_done' });
    expect(g.state.status).toBe('done');
  });

  it('cerrar el anuncio sin recompensa no desbloquea y avisa', () => {
    const g = sim();
    g.send({ type: 'request', analysisId: 'a1' });
    g.send({ type: 'ad_loaded' });
    g.send({ type: 'ad_dismissed' });
    expect(g.state.status).toBe('cancelled');
    expect(g.state.message).toMatch(/Cerraste el anuncio antes de terminar/);
    expect(g.ctx.passes).toHaveLength(0);
  });

  it('una recompensa duplicada (mismo rewardEventId) no emite un segundo pase', () => {
    const g = sim();
    g.send({ type: 'request', analysisId: 'a1' });
    g.send({ type: 'ad_showed' });
    g.send({ type: 'ad_rewarded', rewardEventId: 'r1' });
    g.send({ type: 'ad_rewarded', rewardEventId: 'r1' });
    expect(g.ctx.passes).toHaveLength(1);
    // y un evento de recompensa tardío cuando ya no se espera uno tampoco emite nada
    g.send({ type: 'reset' });
    g.send({ type: 'ad_rewarded', rewardEventId: 'r2' });
    expect(g.ctx.passes).toHaveLength(1);
    expect(g.state.status).toBe('idle');
  });

  it('un evento de recompensa viejo (mismo id) que llega en un trámite NUEVO no regala otro pase', () => {
    const g = sim();
    g.send({ type: 'request', analysisId: 'a1' });
    g.send({ type: 'ad_showed' });
    g.send({ type: 'ad_rewarded', rewardEventId: 'r1' });
    g.send({ type: 'reset' });
    g.send({ type: 'request', analysisId: 'a2' });
    g.send({ type: 'ad_showed' });
    g.send({ type: 'ad_rewarded', rewardEventId: 'r1' });          // el plugin repite el evento anterior
    expect(g.ctx.passes.filter((p) => p.analysisId === 'a2')).toHaveLength(0);
    expect(g.state.status).toBe('showing');
  });

  it('Premium: pase premium sin anuncio, y Premium a mitad del trámite lo emite sin esperar', () => {
    const p = sim({ premium: true });
    p.send({ type: 'request', analysisId: 'a1' });
    expect(p.state.status).toBe('exporting');
    expect(p.ctx.passes[0].via).toBe('premium');
    const g = sim();
    g.send({ type: 'request', analysisId: 'a1' });
    g.send({ type: 'ad_loaded' });
    g.set({ premium: true });
    g.send({ type: 'premium_enabled' });
    expect(g.state.status).toBe('exporting');
    expect(g.ctx.passes[0].via).toBe('premium');
  });

  it('D3: un pase vigente del análisis cubre otras opciones, reintentos y reenvíos sin otro anuncio', () => {
    const g = sim();
    g.send({ type: 'request', analysisId: 'a1', specHash: 'A' });
    g.send({ type: 'ad_showed' });
    g.send({ type: 'ad_rewarded', rewardEventId: 'r1' });
    g.send({ type: 'export_started' });
    g.send({ type: 'export_done' });
    // otra configuración (por ejemplo sin marca, otras guías) del mismo análisis, 5 h después
    g.set({ now: NOW + 5 * 3600_000 });
    g.send({ type: 'reset' });
    const r = g.send({ type: 'request', analysisId: 'a1', specHash: 'B' });
    expect(g.state.status).toBe('exporting');
    expect(r.effects.usePassId).toBeDefined();
    expect(g.ctx.passes).toHaveLength(1);                          // sin pase nuevo
    // otro análisis sí pide anuncio
    g.send({ type: 'reset' });
    g.send({ type: 'request', analysisId: 'a2' });
    expect(g.state.status).toBe('requesting_ad');
  });

  it('el pase vence a las 24 h exactas y no antes', () => {
    const pass: ExportPass = { id: 'p', analysisId: 'a1', specHash: '', grantedAt: NOW, expiresAt: NOW + PASS_TTL_MS, via: 'reward', uses: 0, consumed: false };
    expect(findValidPass([pass], 'a1', NOW + PASS_TTL_MS - 1)).toBe(pass);
    expect(findValidPass([pass], 'a1', NOW + PASS_TTL_MS)).toBeNull();
    expect(findValidPass([pass], 'a1', NOW - 1)).toBeNull();        // pase del futuro (reloj movido): no vale
    expect(pruneExpired([pass], NOW + PASS_TTL_MS)).toEqual([]);
    const g = sim({ passes: [pass], now: NOW + PASS_TTL_MS + 1 });
    g.send({ type: 'request', analysisId: 'a1' });
    expect(g.state.status).toBe('requesting_ad');
  });

  it('un fallo al exportar tras desbloquear deja el pase vivo y se reintenta sin otro anuncio', () => {
    const g = sim();
    g.send({ type: 'request', analysisId: 'a1' });
    g.send({ type: 'ad_showed' });
    g.send({ type: 'ad_rewarded', rewardEventId: 'r1' });
    g.send({ type: 'export_started' });
    g.send({ type: 'export_failed' });
    expect(g.state.status).toBe('export_failed');
    expect(g.state.message).toMatch(/sin ver otro anuncio/);
    expect(g.ctx.passes).toHaveLength(1);
    g.send({ type: 'reset' });
    g.send({ type: 'request', analysisId: 'a1' });
    expect(g.state.status).toBe('exporting');
    expect(g.ctx.passes).toHaveLength(1);
  });

  it('sin anuncio disponible tras 2 intentos cae a la exportación gratis diaria (D5), una por día', () => {
    const g = sim();
    g.send({ type: 'request', analysisId: 'a1' });
    expect(g.state.loadAttempts).toBe(1);
    g.send({ type: 'ad_load_failed' });
    expect(g.state.status).toBe('requesting_ad');                  // se reintenta
    expect(g.state.loadAttempts).toBe(MAX_LOAD_ATTEMPTS);
    g.send({ type: 'ad_load_failed' });
    expect(g.state.status).toBe('exporting');
    expect(g.ctx.passes[0].via).toBe('free_daily');
    expect(g.ctx.freeExportDate).toBe('2026-11-20');
    // el mismo día, otro análisis, otra vez sin anuncio: ya no hay gratis
    g.send({ type: 'reset' });
    g.send({ type: 'request', analysisId: 'a2' });
    g.send({ type: 'ad_load_failed' });
    g.send({ type: 'ad_load_failed' });
    expect(g.state.status).toBe('ad_unavailable');
    expect(g.state.message).toMatch(/Ya usaste tu exportación gratis de hoy/);
    // al día siguiente vuelve a haber una
    g.set({ today: '2026-11-21' });
    g.send({ type: 'reset' });
    g.send({ type: 'request', analysisId: 'a3' });
    g.send({ type: 'ad_load_failed' });
    g.send({ type: 'ad_load_failed' });
    expect(g.state.status).toBe('exporting');
  });

  it('si el anuncio no puede mostrarse, cae a la gratis diaria o termina en ad_failed_to_show', () => {
    const g = sim();
    g.send({ type: 'request', analysisId: 'a1' });
    g.send({ type: 'ad_loaded' });
    g.send({ type: 'ad_show_failed' });
    expect(g.state.status).toBe('exporting');
    expect(g.ctx.passes[0].via).toBe('free_daily');
    const h = sim({ freeExportDate: '2026-11-20' });
    h.send({ type: 'request', analysisId: 'a1' });
    h.send({ type: 'ad_loaded' });
    h.send({ type: 'ad_show_failed' });
    expect(h.state.status).toBe('ad_failed_to_show');
    expect(h.ctx.passes).toHaveLength(0);
  });

  it('D5: quien rechaza ver anuncios usa la gratis diaria; sin ella, se le avisa (nunca se le pide el anuncio)', () => {
    const g = sim({ consent: 'declined' });
    g.send({ type: 'request', analysisId: 'a1' });
    expect(g.state.status).toBe('exporting');
    expect(g.ctx.passes[0].via).toBe('free_daily');
    const h = sim({ consent: 'declined', freeExportDate: '2026-11-20' });
    h.send({ type: 'request', analysisId: 'a1' });
    expect(h.state.status).toBe('ad_unavailable');
    expect(h.log).not.toContain('requesting_ad');
  });

  it('bloquea la reentrada mientras hay un trámite en curso y cancelar lo termina', () => {
    const g = sim();
    g.send({ type: 'request', analysisId: 'a1' });
    const before = g.state;
    g.send({ type: 'request', analysisId: 'a9' });
    expect(g.state).toEqual(before);
    g.send({ type: 'cancel' });
    expect(g.state.status).toBe('cancelled');
    g.send({ type: 'request', analysisId: 'a9' });                 // tras cancelar se puede empezar de nuevo
    expect(g.state.analysisId).toBe('a9');
  });

  it('eventos que no corresponden al estado se ignoran', () => {
    const g = sim();
    for (const e of [{ type: 'ad_loaded' }, { type: 'ad_showed' }, { type: 'ad_dismissed' }, { type: 'export_done' }, { type: 'export_failed' }, { type: 'premium_enabled' }] as GateEvent[]) {
      g.send(e);
      expect(g.state).toEqual(INITIAL_GATE);
    }
    expect(g.ctx.passes).toEqual([]);
  });

  it('el aviso previo al anuncio solo sale a quien lo va a ver', () => {
    expect(needsAdNotice('a1', ctx())).toBe(true);
    expect(needsAdNotice('a1', ctx({ premium: true }))).toBe(false);
    expect(needsAdNotice('a1', ctx({ consent: 'declined' }))).toBe(false);
    const pass: ExportPass = { id: 'p', analysisId: 'a1', specHash: '', grantedAt: NOW, expiresAt: NOW + PASS_TTL_MS, via: 'reward', uses: 0, consumed: false };
    expect(needsAdNotice('a1', ctx({ passes: [pass] }))).toBe(false);
  });

  it('la clave del análisis de una comparación no depende del orden', () => {
    expect(analysisKey('b', 'a')).toBe(analysisKey('a', 'b'));
    expect(analysisKey('a')).toBe('a');
  });
});
