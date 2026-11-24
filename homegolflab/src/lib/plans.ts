/**
 * Planes y cuota mensual (bloque F). Funciones puras, sin imports: las usan la app y `server/entitlements.ts`.
 *
 * - `free`, `premium` y `lifetime_early_adopter`.
 * - El pase Early Adopter tiene un tope de 1.000 que cuenta el SERVIDOR (nunca el cliente).
 * - La cuota mensual cuenta tokens con lo que reporta la API (`usage`), por usuario y por mes UTC.
 * - Todo detrás de la variable del servidor `ENTITLEMENTS_ENABLED=1` (apagada). Ninguna pantalla de la app lo menciona.
 */

export const PLANS = ['free', 'premium', 'lifetime_early_adopter'] as const;
export type PlanId = (typeof PLANS)[number];
export const isPlan = (v: unknown): v is PlanId => typeof v === 'string' && (PLANS as readonly string[]).includes(v);

/** Tope de pases Early Adopter (R8). */
export const EARLY_ADOPTER_CAP = 1000;

/**
 * Cuota mensual de tokens por defecto. `lifetime_early_adopter`: 20.000 (R8). `premium`: 20.000 como punto de partida
 * [PROPUESTA: R12, el costo máximo por usuario, está sin definir]. `free`: 0 (el coach no es del plan gratuito).
 * Configurables desde el servidor (`COACH_TOKENS_*`).
 */
export const DEFAULT_MONTHLY_TOKENS: Record<PlanId, number> = { free: 0, premium: 20_000, lifetime_early_adopter: 20_000 };

export interface QuotaConfig { monthlyTokens: Record<PlanId, number> }
export const defaultQuotaConfig = (): QuotaConfig => ({ monthlyTokens: { ...DEFAULT_MONTHLY_TOKENS } });

/** Lee `COACH_TOKENS_FREE`, `COACH_TOKENS_PREMIUM` y `COACH_TOKENS_EARLY_ADOPTER`. Un valor que no sea un entero ≥ 0 se ignora. */
export function quotaConfigFromEnv(env: Record<string, string | undefined>): QuotaConfig {
  const cfg = defaultQuotaConfig();
  const keys: [PlanId, string][] = [['free', 'COACH_TOKENS_FREE'], ['premium', 'COACH_TOKENS_PREMIUM'], ['lifetime_early_adopter', 'COACH_TOKENS_EARLY_ADOPTER']];
  for (const [plan, key] of keys) {
    const raw = env[key];
    if (raw === undefined || raw.trim() === '') continue;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) cfg.monthlyTokens[plan] = n;
  }
  return cfg;
}

/**
 * Cuántos tokens gasta un análisis del coach con el prompt actual: **estimado, no medido** (no hay clave de la API en este
 * entorno). Ver docs/spec-cuota-coach.md. Sirve para decir «N análisis» en vez de «tokens».
 */
export const TOKENS_PER_ANALYSIS_ESTIMATE = 7500;

/** Mes UTC en formato AAAA-MM. La cuota se reinicia al cambiar el mes UTC. */
export const periodKey = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Primer instante del mes UTC siguiente (cuándo se reinicia la cuota). */
export const nextReset = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

/** Lo que reporta la API en `usage` (campos de caché opcionales). */
export interface ApiUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Tokens de una respuesta: entrada, salida y caché, tal como los reporta la API. Valores raros cuentan como 0. */
export function tokensOfUsage(u: ApiUsage | null | undefined): number {
  if (!u) return 0;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return n(u.input_tokens) + n(u.output_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens);
}

/** Consumo de un usuario en un mes. */
export interface UsageRecord { period: string; tokens: number }

/** Consumo vigente: si el mes cambió, empieza de cero. */
export const usageFor = (u: UsageRecord | undefined, now: Date): UsageRecord => {
  const period = periodKey(now);
  return u && u.period === period ? u : { period, tokens: 0 };
};

export interface QuotaStatus { plan: PlanId; limit: number; used: number; remaining: number; allowed: boolean; resetsAt: string }

/**
 * ¿Puede pedir otro análisis? Se permite mientras quede cuota. No se puede saber cuánto costará una petición antes de
 * hacerla, así que la última puede pasarse del límite; el consumo se registra completo y el siguiente se niega.
 */
export function quotaStatus(plan: PlanId, usage: UsageRecord | undefined, now: Date, cfg: QuotaConfig = defaultQuotaConfig()): QuotaStatus {
  const limit = cfg.monthlyTokens[plan];
  const used = usageFor(usage, now).tokens;
  const remaining = Math.max(0, limit - used);
  return { plan, limit, used, remaining, allowed: remaining > 0, resetsAt: nextReset(now).toISOString() };
}

/** Suma el consumo (solo hacia arriba). */
export function addUsage(usage: UsageRecord | undefined, tokens: number, now: Date): UsageRecord {
  const cur = usageFor(usage, now);
  return { period: cur.period, tokens: cur.tokens + Math.max(0, Math.floor(tokens)) };
}

/** Mensaje claro para el usuario cuando se acaba la cuota. No es un error y no menciona tokens. */
export const QUOTA_EXHAUSTED_MESSAGE = 'Ya usaste todos los análisis de este mes. Se reinician el primer día del mes que viene.';
