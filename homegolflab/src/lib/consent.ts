/**
 * Consentimiento para guardar videos y análisis y mejorar la app (R9). Detrás de `flags.consentFlow` (apagada).
 *
 * Reglas:
 * - La casilla va aparte de los términos generales y NUNCA viene marcada.
 * - La app funciona igual si el usuario dice que no.
 * - Cada decisión se registra con usuario, fecha y versión del texto. El registro solo se agrega: nunca se edita.
 * - Retirar el consentimiento se puede hacer en cualquier momento, y se puede pedir además el borrado.
 * - **Subir o guardar videos sigue desactivado** (`VIDEO_STORAGE_ENABLED`). Hoy el registro es lo único que se guarda
 *   y vive solo en este dispositivo; «usuario» es un id anónimo local porque todavía no hay cuentas.
 */

/** Mientras sea false, ninguna parte de la app sube ni guarda videos para «mejorar la app». Cambiarlo exige texto aprobado por un abogado. */
export const VIDEO_STORAGE_ENABLED = false as boolean;

export const CONSENT_VERSION = 1;

export const CONSENT_DRAFT = 'BORRADOR: requiere revisión de un abogado en Costa Rica antes de publicarse.';

export const CONSENT_TITLE = 'Ayúdanos a mejorar la app (opcional)';

/** Texto exacto de la casilla. Si cambia, se sube `CONSENT_VERSION` y se pide de nuevo. */
export const CONSENT_CHECKBOX_TEXT =
  'Acepto que HomeGolf LAB guarde mis videos de swing y de tiros, y los análisis que hace de ellos, para mejorar la app. ' +
  'Puedo retirar este permiso cuando quiera desde Perfil y pedir que borren lo guardado. Si no lo acepto, la app funciona igual.';

export const CONSENT_NOTE = 'Todavía no se guarda ningún video: tu decisión queda registrada en este dispositivo para cuando exista el almacenamiento.';

export type ConsentAction = 'granted' | 'withdrawn' | 'deletion_requested';

export interface ConsentEvent {
  id: string;
  /** Id anónimo local (todavía no hay cuentas). */
  userId: string;
  action: ConsentAction;
  /** ISO completo. */
  at: string;
  /** Versión del texto de la casilla vigente cuando pasó. */
  version: number;
}

export function newEvent(userId: string, action: ConsentAction, id: string, at: Date = new Date(), version: number = CONSENT_VERSION): ConsentEvent {
  return { id, userId, action, at: at.toISOString(), version };
}

/** Anexa un evento sin tocar el registro anterior. Una acción repetida no agrega nada (no hay falsos registros). */
export function appendEvent(log: readonly ConsentEvent[], ev: ConsentEvent): ConsentEvent[] {
  const last = log[log.length - 1];
  if (ev.action === 'granted' && currentConsent(log)) return [...log];
  if (ev.action === 'withdrawn' && !currentConsent(log)) return [...log];
  if (ev.action === 'deletion_requested' && last?.action === 'deletion_requested') return [...log];
  return [...log, ev];
}

/**
 * ¿Hay consentimiento vigente? Es el último evento de aceptar/retirar, y solo cuenta si fue de la versión actual del
 * texto: si el texto cambió, hay que volver a pedirlo.
 */
export function currentConsent(log: readonly ConsentEvent[], version: number = CONSENT_VERSION): boolean {
  for (let i = log.length - 1; i >= 0; i--) {
    const a = log[i].action;
    if (a === 'granted') return log[i].version >= version;
    if (a === 'withdrawn') return false;
  }
  return false;
}

/** ¿Hay un pedido de borrado que todavía no se atendió? Mientras no haya almacenamiento, no hay nada que borrar y se anota. */
export function deletionPending(log: readonly ConsentEvent[]): boolean {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].action === 'deletion_requested') return true;
    if (log[i].action === 'granted') return false;
  }
  return false;
}

/** Descarta basura al leer lo guardado en el navegador. */
export function sanitizeLog(raw: unknown): ConsentEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ConsentEvent[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.userId !== 'string' || typeof o.at !== 'string' || typeof o.version !== 'number') continue;
    if (o.action !== 'granted' && o.action !== 'withdrawn' && o.action !== 'deletion_requested') continue;
    out.push({ id: o.id, userId: o.userId, action: o.action, at: o.at, version: o.version });
  }
  return out;
}
