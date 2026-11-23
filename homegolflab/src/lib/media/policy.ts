import type { BackendEntry, MediaRef } from './types';

/**
 * Política de limpieza de medios (plan 4.9, F2.3). Pura: recibe las referencias, la hora y los límites, y dice qué
 * borrar y por qué. Quien llama (cleanup.ts) es quien borra.
 *
 * - Una exportación temporal o una grabación en vivo sin guardar que lleva más de 24 h se borra (al arrancar la app).
 * - Lo que trae `expiresAt` se borra pasada esa fecha.
 * - Un video referenciado por una sesión del usuario NO se borra solo, nunca: si el total pasa del tope, se avisa y
 *   el usuario decide (botón "Borrar videos guardados").
 * - Tope total: 2 GB [PROPUESTA], y como máximo el 80 % de la cuota que reporta `navigator.storage.estimate()`.
 */
export const POLICY = {
  tempMaxAgeMs: 24 * 60 * 60 * 1000,
  /** [PROPUESTA] Tope total configurable. */
  capBytes: 2 * 1024 ** 3,
  /** [PROPUESTA] Fracción máxima de la cuota del navegador que se usa. */
  quotaFraction: 0.8,
} as const;

/** Tipos de medio temporales: no son del usuario hasta que los guarda a propósito. */
export const TEMP_KINDS: readonly MediaRef['kind'][] = ['export', 'live_recording'];

export type CleanupReason = 'expired' | 'temporary' | 'over_cap';
export interface CleanupPlan {
  remove: { id: string; reason: CleanupReason; bytes: number }[];
  /** Tope efectivo usado (bytes). */
  capBytes: number;
  /** Bytes que quedan tras aplicar el plan. */
  bytesAfter: number;
  /** Aún pasa del tope y solo quedan videos del usuario: hay que pedirle que borre. */
  needsUserAction: boolean;
}

export interface CleanupOptions {
  capBytes?: number;
  /** Cuota total del navegador (`navigator.storage.estimate().quota`), si se conoce. */
  quotaBytes?: number;
  /** Ids de medios que una sesión del usuario referencia (nunca se borran solos). */
  referencedIds?: ReadonlySet<string>;
}

export function effectiveCap(o: Pick<CleanupOptions, 'capBytes' | 'quotaBytes'> = {}): number {
  const cap = o.capBytes ?? POLICY.capBytes;
  return o.quotaBytes && o.quotaBytes > 0 ? Math.min(cap, Math.floor(o.quotaBytes * POLICY.quotaFraction)) : cap;
}

export function planCleanup(refs: readonly MediaRef[], now: number, o: CleanupOptions = {}): CleanupPlan {
  const cap = effectiveCap(o);
  const referenced = o.referencedIds ?? new Set<string>();
  const remove: CleanupPlan['remove'] = [];
  const gone = new Set<string>();
  const take = (r: MediaRef, reason: CleanupReason) => { if (!gone.has(r.id)) { gone.add(r.id); remove.push({ id: r.id, reason, bytes: r.bytes }); } };

  for (const r of refs) {
    const created = Date.parse(r.createdAt), expires = r.expiresAt ? Date.parse(r.expiresAt) : NaN;
    if (Number.isFinite(expires) && expires <= now && !referenced.has(r.id)) { take(r, 'expired'); continue; }
    if (TEMP_KINDS.includes(r.kind) && !referenced.has(r.id) && Number.isFinite(created) && now - created > POLICY.tempMaxAgeMs) take(r, 'temporary');
  }

  let total = refs.filter((r) => !gone.has(r.id)).reduce((s, r) => s + r.bytes, 0);
  if (total > cap) {
    // Para bajar del tope se borran antes los temporales (más viejos primero) y nunca los referenciados por una sesión.
    const candidates = refs.filter((r) => !gone.has(r.id) && !referenced.has(r.id))
      .sort((a, b) => Number(TEMP_KINDS.includes(b.kind)) - Number(TEMP_KINDS.includes(a.kind)) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
    for (const r of candidates) {
      if (total <= cap) break;
      take(r, 'over_cap');
      total -= r.bytes;
    }
  }
  return { remove, capBytes: cap, bytesAfter: total, needsUserAction: total > cap };
}

/**
 * Huérfanos (revisión F2): datos que quedaron sin dueño, p. ej. porque el proceso murió entre guardar el video y su referencia.
 * Se borran SOLO si llevan más de 24 h (así un guardado en curso nunca se toca) y si no los referencia ninguna sesión:
 * - un blob/pista/seguimiento (id que no termina en "-ref") sin su referencia `<id>-ref` y que ninguna sesión menciona;
 * - una referencia `<id>-ref` cuyo video ya no existe.
 * Sin `modifiedAt` no se puede saber la edad: no se borra.
 */
export function planOrphans(entries: readonly BackendEntry[], now: number, referencedIds: ReadonlySet<string> = new Set()): string[] {
  const blobs = new Set(entries.filter((e) => e.kind === 'blob').map((e) => e.id));
  const refs = new Set(entries.filter((e) => e.kind === 'json' && e.id.endsWith('-ref')).map((e) => e.id.slice(0, -4)));
  const old = (e: BackendEntry) => e.modifiedAt !== undefined && now - e.modifiedAt > POLICY.tempMaxAgeMs;
  const out = new Set<string>();
  for (const e of entries) {
    if (!old(e)) continue;
    if (e.kind === 'json' && e.id.endsWith('-ref')) { if (!blobs.has(e.id.slice(0, -4))) out.add(e.id); continue; }
    if (referencedIds.has(e.id) || refs.has(e.id)) continue;
    out.add(e.id);
  }
  return [...out];
}

/** "24,0 MB", "1,3 GB", "512 KB" (coma decimal). */
export function formatBytes(n: number): string {
  const f = (v: number, u: string) => `${v.toFixed(v >= 100 || u === 'KB' ? 0 : 1).replace('.', ',')} ${u}`;
  if (n >= 1024 ** 3) return f(n / 1024 ** 3, 'GB');
  if (n >= 1024 ** 2) return f(n / 1024 ** 2, 'MB');
  return f(n / 1024, 'KB');
}
