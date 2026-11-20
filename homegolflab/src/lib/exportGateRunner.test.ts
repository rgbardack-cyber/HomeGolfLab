import { describe, expect, it } from 'vitest';
import type { ExportPass } from '@/store';
import type { AdOutcome } from './ads';
import { PASS_TTL_MS, type GateContext } from './exportGate';
import { obtainExportPass, type NoticeChoice, type RunnerDeps } from './exportGateRunner';

const NOW = 1_800_000_000_000;

function harness(o: { noAds?: boolean; premium?: boolean; consent?: GateContext['consent']; freeExportDate?: string | null; notice?: NoticeChoice; ads?: AdOutcome[]; passes?: ExportPass[] } = {}) {
  let ctx: GateContext = { now: NOW, premium: o.premium ?? false, consent: o.consent ?? 'unknown', passes: o.passes ?? [], freeExportDate: o.freeExportDate ?? null, today: '2026-11-20' };
  const seen = { notices: 0, ads: 0, waits: [] as number[], consent: [] as string[] };
  const ads = [...(o.ads ?? [])];
  const deps: RunnerDeps = {
    getCtx: () => ctx,
    apply: (e) => {
      if (e.grant) ctx = { ...ctx, passes: [...ctx.passes, e.grant] };
      if (e.useFreeDaily) ctx = { ...ctx, freeExportDate: ctx.today };
    },
    setConsent: (c) => { seen.consent.push(c); ctx = { ...ctx, consent: c }; },
    askNotice: async () => { seen.notices++; return o.notice ?? 'watch'; },
    playAd: async () => { seen.ads++; return ads.shift() ?? { kind: 'load_failed' }; },
    wait: async (ms) => { seen.waits.push(ms); },
    adsAvailable: () => !o.noAds,
  };
  return { deps, seen, get ctx() { return ctx; } };
}

describe('recorrido de la compuerta de descarga (F9.4)', () => {
  it('gratis: aviso previo → anuncio → recompensa → pase de 24 h → puede exportar', async () => {
    const h = harness({ ads: [{ kind: 'rewarded', rewardEventId: 'r1' }] });
    const r = await obtainExportPass('a1', h.deps);
    expect(r.ok).toBe(true);
    expect(h.seen.notices).toBe(1);
    expect(h.seen.consent).toEqual(['granted']);
    expect(h.ctx.passes).toHaveLength(1);
    expect(h.ctx.passes[0]).toMatchObject({ via: 'reward', analysisId: 'a1', expiresAt: NOW + PASS_TTL_MS });
  });

  it('con un pase vigente del análisis no hay aviso ni anuncio (otras opciones, reintentos, reenvíos)', async () => {
    const pass: ExportPass = { id: 'p', analysisId: 'a1', specHash: 'otra', grantedAt: NOW - 1000, expiresAt: NOW + 1000, via: 'reward', uses: 0, consumed: false };
    const h = harness({ passes: [pass] });
    expect((await obtainExportPass('a1', h.deps, 'config-nueva')).ok).toBe(true);
    expect(h.seen).toMatchObject({ notices: 0, ads: 0 });
  });

  it('Premium exporta sin aviso ni anuncio', async () => {
    const h = harness({ premium: true });
    expect((await obtainExportPass('a1', h.deps)).ok).toBe(true);
    expect(h.seen).toMatchObject({ notices: 0, ads: 0 });
    expect(h.ctx.passes[0].via).toBe('premium');
  });

  it('cerrar el anuncio antes de terminar NO desbloquea', async () => {
    const h = harness({ ads: [{ kind: 'dismissed' }] });
    const r = await obtainExportPass('a1', h.deps);
    expect(r.ok).toBe(false);
    expect(r.state.message).toMatch(/Cerraste el anuncio antes de terminar/);
    expect(h.ctx.passes).toHaveLength(0);
  });

  it('el anuncio no carga: reintenta una vez con espera y luego usa la exportación gratis del día (D5)', async () => {
    const h = harness({ ads: [{ kind: 'load_failed' }, { kind: 'load_failed' }] });
    const r = await obtainExportPass('a1', h.deps);
    expect(r.ok).toBe(true);
    expect(h.seen.ads).toBe(2);
    expect(h.seen.waits).toEqual([1500]);
    expect(h.ctx.passes[0].via).toBe('free_daily');
    expect(h.ctx.freeExportDate).toBe('2026-11-20');
    // el mismo día, otro análisis: ya no hay gratis
    const r2 = await obtainExportPass('a2', h.deps);
    expect(r2.ok).toBe(false);
    expect(r2.state.status).toBe('ad_unavailable');
  });

  it('la web de producción (sin anuncios): sin aviso ni anuncio, cae directo a la gratis diaria y luego avisa', async () => {
    const h = harness({ noAds: true });
    expect((await obtainExportPass('a1', h.deps)).ok).toBe(true);
    expect(h.seen).toMatchObject({ notices: 0, ads: 0 });
    expect(h.ctx.passes[0].via).toBe('free_daily');
    const r = await obtainExportPass('a2', h.deps);
    expect(r.ok).toBe(false);
    expect(r.state.message).toMatch(/Ya usaste tu exportación gratis de hoy/);
  });

  it('el usuario que no quiere anuncios usa la gratis diaria y queda registrado como "declined"', async () => {
    const h = harness({ notice: 'decline' });
    const r = await obtainExportPass('a1', h.deps);
    expect(r.ok).toBe(true);
    expect(h.seen.consent).toEqual(['declined']);
    expect(h.seen.ads).toBe(0);
    expect(h.ctx.passes[0].via).toBe('free_daily');
    // ya declinó antes y se agotó la gratis: no se le vuelve a pedir ver anuncios
    const r2 = await obtainExportPass('a2', h.deps);
    expect(r2.ok).toBe(false);
    expect(h.seen.notices).toBe(1);
  });

  it('cancelar el aviso o elegir Premium no emite pase y lo dice', async () => {
    const c = harness({ notice: 'cancel' });
    expect((await obtainExportPass('a1', c.deps)).ok).toBe(false);
    expect(c.ctx.passes).toHaveLength(0);
    const p = harness({ notice: 'premium' });
    const r = await obtainExportPass('a1', p.deps);
    expect(r).toMatchObject({ ok: false, wantsPremium: true });
    expect(p.seen.ads).toBe(0);
  });

  it('un anuncio que no se puede mostrar cae a la gratis diaria; una reentrada (busy) no hace nada', async () => {
    const h = harness({ ads: [{ kind: 'show_failed' }] });
    expect((await obtainExportPass('a1', h.deps)).ok).toBe(true);
    const b = harness({ ads: [{ kind: 'busy' }] });
    expect((await obtainExportPass('a1', b.deps)).ok).toBe(false);
    expect(b.ctx.passes).toHaveLength(0);
  });
});
