import type { Session } from '@/store';
import { planCleanup, planOrphans, type CleanupPlan } from './policy';
import type { MediaStore } from './store';

/** Ids de medios que alguna sesión del usuario referencia: la limpieza automática no los toca. */
export function referencedMediaIds(sessions: readonly Pick<Session, 'mediaId' | 'poseTrackId' | 'flightTrackId'>[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sessions) for (const id of [s.mediaId, s.poseTrackId, s.flightTrackId]) if (id) ids.add(id);
  return ids;
}

async function storageQuota(): Promise<number | undefined> {
  try { return (await navigator.storage?.estimate?.())?.quota; } catch { return undefined; }
}

/**
 * Limpieza al arrancar la app (y al terminar una exportación o grabación): borra lo temporal de más de 24 h, lo vencido,
 * y lo necesario para bajar del tope sin tocar los videos de las sesiones. Devuelve el plan aplicado.
 */
export async function runCleanup(store: MediaStore, sessions: readonly Session[], now = Date.now(), quotaBytes?: number): Promise<CleanupPlan & { orphans: string[] }> {
  const referenced = referencedMediaIds(sessions);
  const refs = await store.listRefs();
  const plan = planCleanup(refs, now, { referencedIds: referenced, quotaBytes: quotaBytes ?? (await storageQuota()) });
  for (const r of plan.remove) await store.deleteMedia(r.id);
  // Huérfanos: se mira el almacén DESPUÉS de lo anterior, con lo que realmente quedó.
  const orphans = planOrphans(await store.backend.list(), now, referenced);
  for (const id of orphans) await store.backend.delete(id);
  return { ...plan, orphans };
}

/** Borra los medios de UNA sesión (al borrar la sesión): video, pista de postura y seguimiento de bola. */
export async function deleteSessionMedia(store: MediaStore, s: Pick<Session, 'mediaId' | 'poseTrackId' | 'flightTrackId'>): Promise<void> {
  if (s.mediaId) await store.deleteMedia(s.mediaId);
  for (const id of [s.poseTrackId, s.flightTrackId]) if (id) await store.deleteRecord(id);
}

/** Borra TODO lo guardado (botón de Perfil y "Borrar todos mis datos"). */
export async function clearAllMedia(store: MediaStore): Promise<void> {
  for (const e of await store.backend.list()) await store.backend.delete(e.id);
}
