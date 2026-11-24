import { describe, expect, it } from 'vitest';
import { DEFAULT_COACH_MODEL, DailyBudget, RateLimiter, clientIp, readConfig, secretMatches } from './guards.ts';

const cfg = (env: Record<string, string>) => readConfig(env);

describe('arranque seguro (hallazgos 1 y 2)', () => {
  it('con las variables vacías arranca (desarrollo) con los modelos por defecto y sin tope', () => {
    const { config, problems } = cfg({});
    expect(problems).toEqual([]);
    expect(config).toMatchObject({ production: false, trustProxy: false, dailyBudget: null, coachModel: DEFAULT_COACH_MODEL, scanModel: DEFAULT_COACH_MODEL });
  });

  it('no arranca en producción con dev-claim encendido', () => {
    const { problems } = cfg({ NODE_ENV: 'production', ENTITLEMENTS_DEV_CLAIM: '1', ENTITLEMENTS_DEV_SECRET: 'x'.repeat(20), DAILY_TOKEN_BUDGET: '100000' });
    expect(problems.join(' ')).toMatch(/DEV_CLAIM=1 no se permite/);
  });

  it('fuera de producción, dev-claim exige un secreto de al menos 16 caracteres', () => {
    expect(cfg({ ENTITLEMENTS_DEV_CLAIM: '1' }).problems.join(' ')).toMatch(/ENTITLEMENTS_DEV_SECRET/);
    expect(cfg({ ENTITLEMENTS_DEV_CLAIM: '1', ENTITLEMENTS_DEV_SECRET: 'corto' }).problems.length).toBe(1);
    expect(cfg({ ENTITLEMENTS_DEV_CLAIM: '1', ENTITLEMENTS_DEV_SECRET: 'a'.repeat(16) }).problems).toEqual([]);
  });

  it('no arranca en producción con la cuota encendida mientras no exista el verificador de recibos', () => {
    const { problems } = cfg({ NODE_ENV: 'production', ENTITLEMENTS_ENABLED: '1', DAILY_TOKEN_BUDGET: '100000' });
    expect(problems.join(' ')).toMatch(/verificador de recibos/);
    // fuera de producción sí se puede probar
    expect(cfg({ ENTITLEMENTS_ENABLED: '1' }).problems).toEqual([]);
  });

  it('en producción exige DAILY_TOKEN_BUDGET; con la variable arranca', () => {
    expect(cfg({ NODE_ENV: 'production' }).problems.join(' ')).toMatch(/DAILY_TOKEN_BUDGET/);
    const ok = cfg({ NODE_ENV: 'production', DAILY_TOKEN_BUDGET: '120000' });
    expect(ok.problems).toEqual([]);
    expect(ok.config.dailyBudget).toBe(120_000);
  });

  it('rechaza valores raros en vez de ignorarlos', () => {
    expect(cfg({ DAILY_TOKEN_BUDGET: '0' }).problems.length).toBe(1);
    expect(cfg({ DAILY_TOKEN_BUDGET: '-5' }).problems.length).toBe(1);
    expect(cfg({ DAILY_TOKEN_BUDGET: 'mucho' }).problems.length).toBe(1);
    expect(cfg({ TRUST_PROXY: 'true' }).problems.length).toBe(1);
    expect(cfg({ COACH_MODEL: 'gpt-4' }).problems.length).toBe(1);
    expect(cfg({ SCAN_MODEL: 'claude-sonnet-5-5' }).problems).toEqual([]);
  });

  it('el modelo sale de COACH_MODEL y SCAN_MODEL por separado (hallazgo 8)', () => {
    const { config } = cfg({ COACH_MODEL: 'claude-haiku-5-5', SCAN_MODEL: 'claude-sonnet-5-5' });
    expect(config.coachModel).toBe('claude-haiku-5-5');
    expect(config.scanModel).toBe('claude-sonnet-5-5');
  });

  it('el secreto se compara completo y un valor ausente nunca coincide', () => {
    expect(secretMatches('abcdefghijklmnop', 'abcdefghijklmnop')).toBe(true);
    expect(secretMatches('abcdefghijklmnoq', 'abcdefghijklmnop')).toBe(false);
    expect(secretMatches('abc', 'abcdefghijklmnop')).toBe(false);
    expect(secretMatches(undefined, 'abcdefghijklmnop')).toBe(false);
    expect(secretMatches('', '')).toBe(false);
    expect(secretMatches(['abcdefghijklmnop'], 'abcdefghijklmnop')).toBe(false);
  });
});

describe('IP detrás del túnel (hallazgo nuevo 6)', () => {
  it('sin TRUST_PROXY ignora los encabezados: no se puede falsificar la IP', () => {
    expect(clientIp({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' }, '10.0.0.9', false)).toBe('10.0.0.9');
    expect(clientIp({}, undefined, false)).toBe('desconocido');
  });
  it('con TRUST_PROXY usa cf-connecting-ip', () => {
    expect(clientIp({ 'cf-connecting-ip': '203.0.113.7' }, '127.0.0.1', true)).toBe('203.0.113.7');
  });
  it('si no está, usa el último valor de x-forwarded-for (el del proxy de confianza)', () => {
    expect(clientIp({ 'x-forwarded-for': '9.9.9.9, 203.0.113.8' }, '127.0.0.1', true)).toBe('203.0.113.8');
    expect(clientIp({ 'x-forwarded-for': '203.0.113.8' }, '127.0.0.1', true)).toBe('203.0.113.8');
  });
  it('un valor que no es una IP se ignora y cae en la del socket', () => {
    expect(clientIp({ 'cf-connecting-ip': 'no-soy-ip', 'x-forwarded-for': 'tampoco' }, '127.0.0.1', true)).toBe('127.0.0.1');
    expect(clientIp({ 'cf-connecting-ip': '::1' }, '127.0.0.1', true)).toBe('::1');
    expect(clientIp({}, '127.0.0.1', true)).toBe('127.0.0.1');
  });
});

describe('límite por IP que se limpia solo (hallazgo 6)', () => {
  it('rechaza al pasar el máximo y vuelve a aceptar al salir de la ventana', () => {
    const r = new RateLimiter(3, 1000);
    expect([r.hit('a', 0), r.hit('a', 1), r.hit('a', 2), r.hit('a', 3)]).toEqual([false, false, false, true]);
    expect(r.hit('b', 3)).toBe(false); // otra clave no se ve afectada
    expect(r.hit('a', 1500)).toBe(false);
  });
  it('las claves vencidas se borran: el mapa no crece sin tope', () => {
    const r = new RateLimiter(10, 1000);
    for (let i = 0; i < 500; i++) r.hit(`ip-${i}`, i);
    expect(r.size()).toBe(500);
    r.hit('nueva', 5000); // todas las anteriores vencieron
    expect(r.size()).toBe(1);
  });
  it('con muchas claves activas se descartan las más viejas y no pasa de maxKeys', () => {
    const r = new RateLimiter(10, 1_000_000, 100);
    for (let i = 0; i < 1000; i++) r.hit(`ip-${i}`, i);
    expect(r.size()).toBeLessThanOrEqual(101);
  });
});

describe('tope diario de tokens (hallazgo nuevo 7)', () => {
  const at = (iso: string) => () => new Date(iso);
  it('sin tope siempre deja pasar', () => {
    const b = new DailyBudget(null);
    expect(b.reserve(1_000_000)).toBe(true);
  });
  it('niega cuando la reserva no cabe y no gasta nada', () => {
    const b = new DailyBudget(20_000, at('2026-12-01T10:00:00Z'));
    expect(b.reserve(7_500)).toBe(true);
    expect(b.reserve(7_500)).toBe(true);
    expect(b.reserve(7_500)).toBe(false); // 22.500 > 20.000
    expect(b.used()).toBe(15_000);
  });
  it('al terminar cambia la reserva por el uso real; una llamada que falló la libera', () => {
    const b = new DailyBudget(20_000, at('2026-12-01T10:00:00Z'));
    b.reserve(7_500);
    b.settle(7_500, 4_000);
    expect(b.used()).toBe(4_000);
    b.reserve(7_500);
    b.settle(7_500, 0);
    expect(b.used()).toBe(4_000);
    b.reserve(7_500);
    b.settle(7_500, 12_000); // costó más que la estimación
    expect(b.used()).toBe(16_000);
  });
  it('se reinicia al cambiar el día UTC', () => {
    let now = new Date('2026-12-01T23:59:00Z');
    const b = new DailyBudget(10_000, () => now);
    b.reserve(9_000);
    expect(b.reserve(5_000)).toBe(false);
    now = new Date('2026-12-02T00:01:00Z');
    expect(b.reserve(5_000)).toBe(true);
    expect(b.used()).toBe(5_000);
  });
});
