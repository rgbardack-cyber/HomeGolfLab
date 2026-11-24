import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Entitlements, FileStore, MemoryStore, validUserId } from './entitlements.ts';
import { EARLY_ADOPTER_CAP, QUOTA_EXHAUSTED_MESSAGE, nextReset, periodKey, quotaConfigFromEnv, tokensOfUsage } from '../src/lib/plans.ts';

const T = (s: string) => new Date(s);
const mk = (cap?: number, cfg?: ReturnType<typeof quotaConfigFromEnv>) => new Entitlements(new MemoryStore(), cfg, cap);

describe('cuota mensual del coach (bloque F)', () => {
  it('el Early Adopter tiene 20.000 tokens al mes por defecto; el plan gratuito, ninguno', () => {
    const e = mk();
    e.claimEarlyAdopter('usuario-aaaa');
    expect(e.status('usuario-aaaa', T('2026-12-05T00:00:00Z'))).toMatchObject({ plan: 'lifetime_early_adopter', limit: 20_000, used: 0, remaining: 20_000, allowed: true });
    expect(e.status('otro-usuario-1', T('2026-12-05T00:00:00Z'))).toMatchObject({ plan: 'free', limit: 0, allowed: false });
  });

  it('cuenta con lo que reporta la API: entrada, salida y caché', () => {
    expect(tokensOfUsage({ input_tokens: 3800, output_tokens: 1200, cache_creation_input_tokens: 100, cache_read_input_tokens: 50 })).toBe(5150);
    expect(tokensOfUsage(null)).toBe(0);
    expect(tokensOfUsage({ input_tokens: -5, output_tokens: Number.NaN })).toBe(0);
    const e = mk();
    e.claimEarlyAdopter('usuario-aaaa');
    const now = T('2026-12-05T10:00:00Z');
    expect(e.recordUsage('usuario-aaaa', { input_tokens: 3800, output_tokens: 3200 }, now)).toBe(7000);
    expect(e.status('usuario-aaaa', now)).toMatchObject({ used: 7000, remaining: 13_000, allowed: true });
  });

  it('al llegar al límite se niega el siguiente análisis y avisa cuándo se reinicia', () => {
    const e = mk();
    e.claimEarlyAdopter('usuario-aaaa');
    const now = T('2026-12-05T10:00:00Z');
    e.recordUsage('usuario-aaaa', { input_tokens: 10_000, output_tokens: 9_000 }, now);
    expect(e.status('usuario-aaaa', now).allowed).toBe(true); // quedan 1.000
    e.recordUsage('usuario-aaaa', { input_tokens: 4_000, output_tokens: 3_000 }, now); // la última puede pasarse
    const s = e.status('usuario-aaaa', now);
    expect(s).toMatchObject({ used: 26_000, remaining: 0, allowed: false });
    expect(s.resetsAt).toBe('2027-01-01T00:00:00.000Z');
    expect(QUOTA_EXHAUSTED_MESSAGE).not.toMatch(/token|\bIA\b/i);
  });

  it('el mes UTC siguiente reinicia la cuota', () => {
    const e = mk();
    e.claimEarlyAdopter('usuario-aaaa');
    e.recordUsage('usuario-aaaa', { input_tokens: 25_000, output_tokens: 0 }, T('2026-12-31T23:59:59Z'));
    expect(e.status('usuario-aaaa', T('2026-12-31T23:59:59Z')).allowed).toBe(false);
    expect(e.status('usuario-aaaa', T('2027-01-01T00:00:00Z'))).toMatchObject({ used: 0, remaining: 20_000, allowed: true });
    expect(periodKey(T('2027-01-01T00:00:00Z'))).toBe('2027-01');
    expect(nextReset(T('2026-12-15T00:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('la cuota se configura desde el entorno y un valor inválido se ignora', () => {
    const cfg = quotaConfigFromEnv({ COACH_TOKENS_EARLY_ADOPTER: '50000', COACH_TOKENS_PREMIUM: 'mucho', COACH_TOKENS_FREE: '-3' });
    expect(cfg.monthlyTokens).toEqual({ free: 0, premium: 20_000, lifetime_early_adopter: 50_000 });
    const e = mk(undefined, cfg);
    e.claimEarlyAdopter('usuario-aaaa');
    expect(e.status('usuario-aaaa', T('2026-12-05T00:00:00Z')).limit).toBe(50_000);
  });
});

describe('pase Early Adopter: tope de 1.000 en el servidor', () => {
  it('el tope es 1.000', () => { expect(EARLY_ADOPTER_CAP).toBe(1000); });

  it('entrega hasta el tope y el siguiente se rechaza como agotado', () => {
    const e = mk(1000);
    for (let i = 0; i < 1000; i++) expect(e.claimEarlyAdopter(`usuario-${String(i).padStart(5, '0')}`).ok).toBe(true);
    expect(e.passesGranted()).toBe(1000);
    expect(e.passesLeft()).toBe(0);
    expect(e.claimEarlyAdopter('usuario-ultimo')).toEqual({ ok: false, reason: 'sold_out', count: 1000 });
    expect(e.planOf('usuario-ultimo')).toBe('free');
  });

  it('reclamar dos veces no gasta dos pases, ni siquiera con el tope lleno', () => {
    const e = mk(2);
    expect(e.claimEarlyAdopter('usuario-aaaa')).toMatchObject({ ok: true, already: false, count: 1 });
    expect(e.claimEarlyAdopter('usuario-aaaa')).toMatchObject({ ok: true, already: true, count: 1 });
    e.claimEarlyAdopter('usuario-bbbb');
    expect(e.claimEarlyAdopter('usuario-aaaa')).toMatchObject({ ok: true, already: true });
  });

  it('Premium no pisa el pase de por vida y el pase conserva el consumo del mes', () => {
    const e = mk();
    e.setPremium('usuario-aaaa', true);
    e.recordUsage('usuario-aaaa', { input_tokens: 1000, output_tokens: 500 }, T('2026-12-05T00:00:00Z'));
    e.claimEarlyAdopter('usuario-aaaa');
    e.setPremium('usuario-aaaa', false);
    expect(e.planOf('usuario-aaaa')).toBe('lifetime_early_adopter');
    expect(e.status('usuario-aaaa', T('2026-12-06T00:00:00Z')).used).toBe(1500);
  });
});

describe('almacenamiento en archivo', () => {
  it('sobrevive a un reinicio del servidor', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'hgl-ent-')), 'estado.json');
    const a = new Entitlements(new FileStore(path));
    a.claimEarlyAdopter('usuario-aaaa', T('2026-12-01T00:00:00Z'));
    a.recordUsage('usuario-aaaa', { input_tokens: 800, output_tokens: 200 }, T('2026-12-05T00:00:00Z'));
    const b = new Entitlements(new FileStore(path));
    expect(b.passesGranted()).toBe(1);
    expect(b.status('usuario-aaaa', T('2026-12-06T00:00:00Z'))).toMatchObject({ plan: 'lifetime_early_adopter', used: 1000 });
  });

  it('un archivo dañado no tumba el servidor', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'hgl-ent-')), 'estado.json');
    writeFileSync(path, '{no es json');
    const e = new Entitlements(new FileStore(path));
    expect(e.passesGranted()).toBe(0);
    e.claimEarlyAdopter('usuario-aaaa');
    expect(JSON.parse(readFileSync(path, 'utf8'))['usuario-aaaa'].plan).toBe('lifetime_early_adopter');
  });
});

describe('identidad', () => {
  it('solo acepta ids seguros', () => {
    expect(validUserId('3f2b8c1e-aaaa-bbbb-cccc-1234567890ab')).toBe(true);
    for (const bad of [undefined, '', 'corto', 'x'.repeat(65), 'con espacio', '../etc/passwd', 42]) expect(validUserId(bad)).toBe(false);
  });
});

describe('reserva antes de gastar (hallazgo 4) y uso real en errores (hallazgo 5)', () => {
  const now = T('2026-12-05T10:00:00Z');
  const withPass = () => { const e = mk(); e.claimEarlyAdopter('usuario-aaaa'); return e; };

  it('peticiones simultáneas ya no ven la cuota intacta: la tercera de tres se pasa como máximo una reserva', () => {
    const e = withPass();
    const r1 = e.reserve('usuario-aaaa', 7_500, now);
    const r2 = e.reserve('usuario-aaaa', 7_500, now);
    const r3 = e.reserve('usuario-aaaa', 7_500, now); // quedaban 5.000: pasa, y deja el consumo en 22.500
    const r4 = e.reserve('usuario-aaaa', 7_500, now);
    expect([r1.ok, r2.ok, r3.ok, r4.ok]).toEqual([true, true, true, false]);
    expect(e.status('usuario-aaaa', now)).toMatchObject({ used: 22_500, remaining: 0, allowed: false });
  });

  it('settle cambia la reserva por el uso real; con 0 (la API no respondió) la libera', () => {
    const e = withPass();
    e.reserve('usuario-aaaa', 7_500, now);
    e.settle('usuario-aaaa', 7_500, 5_200, now);
    expect(e.status('usuario-aaaa', now).used).toBe(5_200);
    e.reserve('usuario-aaaa', 7_500, now);
    e.settle('usuario-aaaa', 7_500, 0, now);
    expect(e.status('usuario-aaaa', now).used).toBe(5_200);
  });

  it('un rechazo o una respuesta inválida con uso real sí cuenta', () => {
    const e = withPass();
    e.reserve('usuario-aaaa', 7_500, now);
    e.settle('usuario-aaaa', 7_500, tokensOfUsage({ input_tokens: 3_900, output_tokens: 600 }), now);
    expect(e.status('usuario-aaaa', now).used).toBe(4_500);
  });

  it('el usuario gratis (límite 0) no puede reservar y no queda ningún consumo', () => {
    const e = mk();
    const r = e.reserve('inventado-123', 7_500, now);
    expect(r.ok).toBe(false);
    expect(e.status('inventado-123', now).used).toBe(0);
  });

  it('settle nunca deja el consumo bajo cero ni cambia el plan', () => {
    const e = withPass();
    e.settle('usuario-aaaa', 9_999, 0, now);
    expect(e.status('usuario-aaaa', now)).toMatchObject({ used: 0, plan: 'lifetime_early_adopter' });
  });
});
