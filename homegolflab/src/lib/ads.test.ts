import { describe, expect, it } from 'vitest';
import { AD_TTL_MS, RewardedAds, type AdEvent, type RewardedPlugin } from './ads';

/** Plugin falso: guarda los oyentes y deja que el test dispare los eventos como lo haría el SDK. */
function fake(opts: { prepareFails?: boolean; showThrows?: boolean } = {}) {
  const listeners = new Map<AdEvent, Set<(i?: unknown) => void>>();
  const calls = { initialize: 0, prepare: 0, show: 0, removed: 0 };
  const emit = (e: AdEvent) => listeners.get(e)?.forEach((cb) => cb());
  let onShow: (() => void) | null = null;
  const plugin: RewardedPlugin = {
    initialize: async () => { calls.initialize++; },
    prepare: async () => { calls.prepare++; if (opts.prepareFails) throw new Error('sin relleno'); },
    show: async () => { calls.show++; if (opts.showThrows) throw new Error('fallo'); onShow?.(); return {}; },
    on: async (event, cb) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return { remove: async () => { calls.removed++; listeners.get(event)!.delete(cb); } };
    },
  };
  return { plugin, calls, emit, listeners, whenShown: (f: () => void) => { onShow = f; } };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('controlador de anuncios con recompensa (F9.2)', () => {
  it('recompensa: Rewarded + Dismissed da un id; se quitan todos los oyentes', async () => {
    const f = fake();
    f.whenShown(() => { setTimeout(() => { f.emit('Showed'); f.emit('Rewarded'); f.emit('Dismissed'); }, 0); });
    const ads = new RewardedAds(f.plugin);
    const r = await ads.show();
    expect(r.kind).toBe('rewarded');
    expect(r.kind === 'rewarded' && r.rewardEventId).toMatch(/^reward-/);
    expect(f.calls.removed).toBe(3);
    expect([...f.listeners.values()].every((s) => s.size === 0)).toBe(true);
    expect(ads.busy).toBe(false);
  });

  it('cerrar sin recompensa es "dismissed"; un FailedToShow es "show_failed"', async () => {
    const f = fake();
    f.whenShown(() => { setTimeout(() => { f.emit('Showed'); f.emit('Dismissed'); }, 0); });
    expect((await new RewardedAds(f.plugin).show()).kind).toBe('dismissed');
    const g = fake();
    g.whenShown(() => { setTimeout(() => g.emit('FailedToShow'), 0); });
    expect((await new RewardedAds(g.plugin).show()).kind).toBe('show_failed');
    const h = fake({ showThrows: true });
    expect((await new RewardedAds(h.plugin).show()).kind).toBe('show_failed');
  });

  it('si no se puede cargar (sin relleno) devuelve load_failed y no muestra nada', async () => {
    const f = fake({ prepareFails: true });
    const ads = new RewardedAds(f.plugin);
    expect((await ads.show()).kind).toBe('load_failed');
    expect(f.calls.show).toBe(0);
    expect(await ads.preload()).toBe(false);
  });

  it('la precarga es idempotente y un anuncio cargado caduca a la hora', async () => {
    let t = 1_000;
    const f = fake();
    const ads = new RewardedAds(f.plugin, () => t);
    await Promise.all([ads.preload(), ads.preload()]);
    expect(f.calls.prepare).toBe(1);
    expect(ads.fresh).toBe(true);
    await ads.preload();
    expect(f.calls.prepare).toBe(1);                              // ya hay uno fresco
    t += AD_TTL_MS - 1;
    expect(ads.fresh).toBe(true);
    t += 1;
    expect(ads.fresh).toBe(false);
    await ads.preload();
    expect(f.calls.prepare).toBe(2);                              // el caducado se descarta y se pide otro
    expect(f.calls.initialize).toBe(1);                           // el plugin se inicializa una sola vez
  });

  it('bloquea la reentrada: un segundo show mientras hay uno en curso devuelve busy', async () => {
    const f = fake();
    let finish!: () => void;
    f.whenShown(() => { finish = () => { f.emit('Rewarded'); f.emit('Dismissed'); }; });
    const ads = new RewardedAds(f.plugin);
    const first = ads.show();
    await tick(); await tick();
    expect(ads.busy).toBe(true);
    expect(await ads.show()).toEqual({ kind: 'busy' });
    expect(f.calls.show).toBe(1);
    finish();
    expect((await first).kind).toBe('rewarded');
    expect(ads.busy).toBe(false);
  });

  it('un anuncio se muestra una sola vez: tras mostrarlo ya no cuenta como cargado y cada show lleva su id', async () => {
    const f = fake();
    f.whenShown(() => { setTimeout(() => { f.emit('Rewarded'); f.emit('Dismissed'); }, 0); });
    const ads = new RewardedAds(f.plugin);
    const a = await ads.show();
    expect(ads.fresh).toBe(false);
    const b = await ads.show();
    expect(f.calls.prepare).toBe(2);
    expect(a.kind === 'rewarded' && b.kind === 'rewarded' && a.rewardEventId !== b.rewardEventId).toBe(true);
  });

  it('un Rewarded repetido dentro del mismo show entrega una sola recompensa', async () => {
    const f = fake();
    f.whenShown(() => { setTimeout(() => { f.emit('Rewarded'); f.emit('Rewarded'); f.emit('Dismissed'); }, 0); });
    const r = await new RewardedAds(f.plugin).show();
    expect(r.kind).toBe('rewarded');
  });
});
