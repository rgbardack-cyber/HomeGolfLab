/**
 * Migración del estado guardado en localStorage (`homegolflab-v1`, plan 4.9 / F2.1).
 *
 * - v0 (sin `version`): la forma original. Se conserva TODO (sesiones, medallas, perfil, espacio, plan, escaneo,
 *   `trackingUsedSec`, palo, cola de medallas) y se agregan los campos nuevos como opcionales/vacíos.
 * - v1: igual que v0 + `exportPasses` (pases de exportación, F9) y, en cada sesión, `mediaId`/`poseTrackId`/`flightTrackId`
 *   opcionales que apuntan a los datos pesados guardados FUERA de localStorage (lib/media/store.ts).
 *
 * localStorage guarda solo metadatos e ids: nunca video, pose ni imágenes.
 * Es una función pura: no toca el DOM ni localStorage, para poder probarla con JSON reales.
 */
export const STORE_VERSION = 1;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Convierte lo guardado (cualquier versión anterior) a la forma vigente sin perder nada reconocible. */
export function migrateStore(persisted: unknown, fromVersion: number): Record<string, unknown> {
  // Guardado ilegible: se descarta y zustand arranca con el estado inicial (mejor que romper la app al abrir).
  if (!isObj(persisted)) return {};
  const s: Record<string, unknown> = { ...persisted };

  if (fromVersion < 1) {
    // Campos que ya existían: solo se corrige el tipo si vino dañado, nunca se borra un dato válido.
    if (!Array.isArray(s.sessions)) s.sessions = [];
    if (!isObj(s.earned)) s.earned = {};
    if (!Array.isArray(s.unlockQueue)) s.unlockQueue = [];
    if (typeof s.trackingUsedSec !== 'number' || !Number.isFinite(s.trackingUsedSec) || s.trackingUsedSec < 0) s.trackingUsedSec = 0;
    // Perfil: se mezcla con los valores por defecto (un perfil de una versión anterior podría no traer todos los campos).
    s.profile = { name: '', handicap: '', lefty: false, premium: false, ...(isObj(s.profile) ? s.profile : {}) };
    // Campos nuevos de v1.
    if (!Array.isArray(s.exportPasses)) s.exportPasses = [];
  }
  return s;
}
