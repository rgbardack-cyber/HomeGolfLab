/**
 * Planes, pase Early Adopter y cuota mensual de tokens (bloque F). Apagado por defecto: solo corre con ENTITLEMENTS_ENABLED=1.
 *
 * - El contador de pases Early Adopter (tope 1.000) vive aquí, en el servidor.
 * - La cuota cuenta los tokens que reporta la API (`usage`), por usuario y por mes UTC.
 * - El almacenamiento es una interfaz: `MemoryStore` (pruebas) y `FileStore` (JSON en disco, un solo proceso).
 *
 * ADVERTENCIA antes de encender esto en producción: todavía no hay cuentas ni recibos de compra. El «usuario» llega en
 * un encabezado que el cliente controla, así que cualquiera puede inventar usuarios nuevos y saltarse la cuota, y el
 * pase no se puede reclamar sin un recibo verificado de App Store / Google Play. Falta: identidad firmada y
 * verificación del recibo. Ver docs/spec-cuota-coach.md.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  EARLY_ADOPTER_CAP, addUsage, defaultQuotaConfig, isPlan, quotaStatus,
  type ApiUsage, type PlanId, type QuotaConfig, type QuotaStatus, type UsageRecord, tokensOfUsage,
} from '../src/lib/plans.ts';

export interface UserRecord { plan: PlanId; usage?: UsageRecord; passGrantedAt?: string }

export interface Store {
  get(userId: string): UserRecord | undefined;
  set(userId: string, rec: UserRecord): void;
  /** Cuántos usuarios tienen el pase Early Adopter. */
  countPlan(plan: PlanId): number;
}

export class MemoryStore implements Store {
  protected users = new Map<string, UserRecord>();
  get(id: string) { return this.users.get(id); }
  set(id: string, rec: UserRecord) { this.users.set(id, rec); }
  countPlan(plan: PlanId) { let n = 0; for (const r of this.users.values()) if (r.plan === plan) n++; return n; }
}

/** JSON en disco, escritura atómica (archivo temporal + rename). Pensado para un solo proceso. */
export class FileStore extends MemoryStore {
  private path: string;
  constructor(path: string) {
    super();
    this.path = path;
    if (existsSync(path)) {
      try {
        const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
        if (raw && typeof raw === 'object') {
          for (const [id, rec] of Object.entries(raw as Record<string, unknown>)) {
            const r = rec as Partial<UserRecord> | null;
            if (r && isPlan(r.plan)) this.users.set(id, { plan: r.plan, usage: r.usage, passGrantedAt: r.passGrantedAt });
          }
        }
      } catch { /* archivo dañado: se empieza vacío; el original no se toca hasta la primera escritura */ }
    }
  }
  override set(id: string, rec: UserRecord) {
    super.set(id, rec);
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.users)));
    renameSync(tmp, this.path);
  }
}

/** Ids de usuario aceptados: de 8 a 64 caracteres seguros (por ejemplo, un UUID). */
export const validUserId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v);

export type ClaimResult = { ok: true; already: boolean; count: number } | { ok: false; reason: 'sold_out'; count: number };

export class Entitlements {
  private store: Store;
  private cfg: QuotaConfig;
  private cap: number;
  // Sin propiedades de parámetro: Node ejecuta este archivo quitando solo los tipos.
  constructor(store: Store, cfg: QuotaConfig = defaultQuotaConfig(), cap: number = EARLY_ADOPTER_CAP) {
    this.store = store;
    this.cfg = cfg;
    this.cap = cap;
  }

  planOf(userId: string): PlanId { return this.store.get(userId)?.plan ?? 'free'; }

  /** Cuántos pases Early Adopter se han entregado. */
  passesGranted(): number { return this.store.countPlan('lifetime_early_adopter'); }

  /** Cuántos quedan (nunca negativo). */
  passesLeft(): number { return Math.max(0, this.cap - this.passesGranted()); }

  /**
   * Entrega el pase Early Adopter. Es idempotente (quien ya lo tiene no gasta otro) y se detiene en el tope. Llamar solo
   * después de verificar el recibo de compra (todavía no existe: ver la advertencia de arriba).
   */
  claimEarlyAdopter(userId: string, now: Date = new Date()): ClaimResult {
    const cur = this.store.get(userId);
    if (cur?.plan === 'lifetime_early_adopter') return { ok: true, already: true, count: this.passesGranted() };
    if (this.passesGranted() >= this.cap) return { ok: false, reason: 'sold_out', count: this.passesGranted() };
    this.store.set(userId, { ...cur, plan: 'lifetime_early_adopter', passGrantedAt: now.toISOString() });
    return { ok: true, already: false, count: this.passesGranted() };
  }

  /** Pone el plan Premium (compra o prueba). No toca el pase de por vida. */
  setPremium(userId: string, premium: boolean): void {
    const cur = this.store.get(userId);
    if (cur?.plan === 'lifetime_early_adopter') return;
    this.store.set(userId, { ...cur, plan: premium ? 'premium' : 'free' });
  }

  status(userId: string, now: Date = new Date()): QuotaStatus {
    const rec = this.store.get(userId);
    return quotaStatus(rec?.plan ?? 'free', rec?.usage, now, this.cfg);
  }

  /** Registra lo que gastó una petición, según el `usage` de la API. Devuelve los tokens contados. */
  recordUsage(userId: string, usage: ApiUsage | null | undefined, now: Date = new Date()): number {
    const tokens = tokensOfUsage(usage);
    const cur = this.store.get(userId) ?? { plan: 'free' as PlanId };
    this.store.set(userId, { ...cur, usage: addUsage(cur.usage, tokens, now) });
    return tokens;
  }
}
