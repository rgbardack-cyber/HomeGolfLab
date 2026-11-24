/**
 * Guardas de seguridad y de gasto del servidor (bloque 4 del plan v2, 24 nov 2026). Funciones y clases puras, sin red ni estado global:
 * `server/index.ts` las usa y `server/guards.test.ts` las prueba.
 *
 * - `readConfig`: lee las variables de entorno y devuelve los problemas que impiden arrancar de forma segura.
 * - `clientIp`: la IP real del cliente detrás de un túnel, solo con `TRUST_PROXY=1`.
 * - `RateLimiter`: límite por clave que se limpia solo.
 * - `DailyBudget`: tope diario de tokens para todo el servidor.
 *
 * Node ejecuta estos archivos quitando solo los tipos: sin propiedades de parámetro ni enums.
 */
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * ¿Existe un verificador de recibos de App Store / Google Play? **No.** Mientras sea `false`, el servidor no arranca en producción con
 * `ENTITLEMENTS_ENABLED=1`: sin recibos verificados nadie puede recibir `premium` ni el pase de forma legítima (ver revision-2026-11-24.md,
 * hallazgo 2). Se cambia a `true` solo cuando el verificador esté escrito y probado.
 */
export const RECEIPT_VERIFIER_AVAILABLE = false;

/** Modelos por defecto hasta que Ryan elija con la comparación a ciegas del bloque 3 (decisión 14A). */
export const DEFAULT_COACH_MODEL = 'claude-opus-5-5';
export const DEFAULT_SCAN_MODEL = 'claude-opus-5-5';

/** Tokens que se reservan por un escaneo del Home Lab antes de llamar a la API. **Estimado, no medido** (el bloque 3 lo mide). */
export const SCAN_TOKENS_ESTIMATE = 8000;

/** Mensaje cuando el tope diario se agota. No menciona tokens ni IA. */
export const UNAVAILABLE_TODAY_MESSAGE = 'Este servicio no está disponible por hoy. Inténtalo mañana.';

const MODEL_RE = /^claude-[a-z0-9][a-z0-9.-]{1,60}$/;

export interface ServerConfig {
  production: boolean;
  trustProxy: boolean;
  devClaim: boolean;
  devSecret: string;
  /** Tokens por día (UTC) para todo el servidor; `null` = sin tope. */
  dailyBudget: number | null;
  coachModel: string;
  scanModel: string;
}

export function readConfig(env: Record<string, string | undefined>): { config: ServerConfig; problems: string[] } {
  const problems: string[] = [];
  const v = (k: string) => (env[k] ?? '').trim();
  const production = v('NODE_ENV') === 'production';
  const devClaim = v('ENTITLEMENTS_DEV_CLAIM') === '1';
  const devSecret = v('ENTITLEMENTS_DEV_SECRET');

  const proxy = v('TRUST_PROXY');
  if (proxy !== '' && proxy !== '0' && proxy !== '1') problems.push('TRUST_PROXY debe ser 1 o 0 (o estar vacía).');

  let dailyBudget: number | null = null;
  if (v('DAILY_TOKEN_BUDGET') !== '') {
    const n = Number(v('DAILY_TOKEN_BUDGET'));
    if (Number.isInteger(n) && n > 0) dailyBudget = n;
    else problems.push('DAILY_TOKEN_BUDGET debe ser un entero mayor que 0.');
  }

  const coachModel = v('COACH_MODEL') || DEFAULT_COACH_MODEL;
  const scanModel = v('SCAN_MODEL') || DEFAULT_SCAN_MODEL;
  if (!MODEL_RE.test(coachModel)) problems.push('COACH_MODEL no parece un nombre de modelo de Claude.');
  if (!MODEL_RE.test(scanModel)) problems.push('SCAN_MODEL no parece un nombre de modelo de Claude.');

  if (production && devClaim) problems.push('ENTITLEMENTS_DEV_CLAIM=1 no se permite con NODE_ENV=production: entrega pases sin recibo.');
  if (devClaim && devSecret.length < 16) problems.push('ENTITLEMENTS_DEV_CLAIM=1 exige ENTITLEMENTS_DEV_SECRET de al menos 16 caracteres (encabezado x-hgl-dev-secret).');
  if (production && v('ENTITLEMENTS_ENABLED') === '1' && !RECEIPT_VERIFIER_AVAILABLE) {
    problems.push('ENTITLEMENTS_ENABLED=1 no se permite en producción sin verificador de recibos de las tiendas (todavía no existe).');
  }
  if (production && dailyBudget === null) problems.push('En producción hace falta DAILY_TOKEN_BUDGET (tope diario de tokens para todo el servidor).');

  return { config: { production, trustProxy: proxy === '1', devClaim, devSecret, dailyBudget, coachModel, scanModel }, problems };
}

/** Comparación de secretos en tiempo constante. Un valor ausente nunca coincide. */
export function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string' || expected === '') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Headers = Record<string, string | string[] | undefined>;
const first = (h: string | string[] | undefined): string => (Array.isArray(h) ? h[0] : h)?.trim() ?? '';

/**
 * IP del cliente. Sin `trustProxy` es siempre la del socket: confiar en un encabezado sin un túnel delante permitiría falsificar la IP
 * y saltarse el límite. Con `trustProxy`: `cf-connecting-ip` (Cloudflare) y, si no está, el ÚLTIMO valor de `x-forwarded-for` (el que
 * agregó el proxy de confianza; los anteriores los puede escribir el cliente). Un valor que no sea una IP se ignora.
 */
export function clientIp(headers: Headers, remoteAddress: string | undefined, trustProxy: boolean): string {
  const socketIp = remoteAddress ?? 'desconocido';
  if (!trustProxy) return socketIp;
  const cf = first(headers['cf-connecting-ip']);
  if (isIP(cf)) return cf;
  const xff = first(headers['x-forwarded-for']).split(',').map((s) => s.trim()).filter(Boolean);
  const last = xff[xff.length - 1] ?? '';
  return isIP(last) ? last : socketIp;
}

/** Límite de peticiones por clave en una ventana de tiempo. Se limpia solo: no crece sin tope con IPs distintas. */
export class RateLimiter {
  private max: number;
  private windowMs: number;
  private maxKeys: number;
  private hits = new Map<string, number[]>();
  private lastSweep = 0;
  constructor(max: number, windowMs: number, maxKeys: number = 10_000) {
    this.max = max;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  /** Registra una petición. Devuelve `true` si hay que rechazarla. */
  hit(key: string, now: number = Date.now()): boolean {
    this.sweep(now);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) { this.hits.set(key, recent); return true; }
    recent.push(now);
    this.hits.set(key, recent);
    return false;
  }

  size(): number { return this.hits.size; }

  private sweep(now: number) {
    if (now - this.lastSweep < this.windowMs / 10 && this.hits.size <= this.maxKeys) return;
    this.lastSweep = now;
    for (const [k, ts] of this.hits) {
      if (!ts.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    }
    // Si aun así hay demasiadas claves activas, se descartan las más antiguas (Map conserva el orden de inserción).
    for (const k of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

/** Tope diario de tokens para todo el servidor, por día UTC. En memoria: un reinicio lo vuelve a cero. */
export class DailyBudget {
  private limit: number | null;
  private now: () => Date;
  private day = '';
  private spent = 0;
  constructor(limit: number | null, now: () => Date = () => new Date()) {
    this.limit = limit;
    this.now = now;
  }

  private roll() {
    const d = this.now().toISOString().slice(0, 10);
    if (d !== this.day) { this.day = d; this.spent = 0; }
  }

  /** Reserva `tokens` antes de llamar a la API. `false` si no caben en lo que queda del día. */
  reserve(tokens: number): boolean {
    this.roll();
    if (this.limit === null) { this.spent += tokens; return true; }
    if (this.spent + tokens > this.limit) return false;
    this.spent += tokens;
    return true;
  }

  /** Cambia la reserva por lo que reportó la API (0 si la API no llegó a responder). */
  settle(reserved: number, actual: number) {
    this.roll();
    this.spent = Math.max(0, this.spent - reserved + Math.max(0, actual));
  }

  used(): number { this.roll(); return this.spent; }
}
