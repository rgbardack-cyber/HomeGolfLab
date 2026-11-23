/**
 * Aviso de seguridad del HomeLAB (R13). Se muestra antes de la primera sesión y queda accesible después.
 * Si el texto cambia, se sube `HOMELAB_NOTICE_VERSION`: el usuario lo vuelve a aceptar.
 */
export const HOMELAB_NOTICE_VERSION = 1;

export const HOMELAB_NOTICE_DRAFT = 'BORRADOR: requiere revisión de un abogado en Costa Rica antes de publicarse.';

export const HOMELAB_NOTICE_TITLE = 'Antes de practicar en casa';

export const HOMELAB_NOTICE_ITEMS = [
  'Tú eres responsable de medir tu espacio. Las medidas de la app son una guía, no una garantía.',
  'Despeja el área: quita objetos frágiles, muebles, lámparas, ventiladores y a las personas y mascotas que estén cerca.',
  'Haz un swing de prueba muy lento, sin bola, para comprobar que el palo no toca el techo ni nada alrededor.',
  'Para chipear usa bolas de foam o una red. Nunca golpees una bola real sin red.',
  'Si algo no se siente seguro, no hagas el ejercicio.',
] as const;

/** Lo que se guarda de la aceptación: cuándo y qué versión del texto. */
export interface HomelabNoticeAcceptance { acceptedAt: string; version: number }

/** ¿Ya aceptó la versión vigente del aviso? */
export const noticeAccepted = (a: HomelabNoticeAcceptance | null | undefined): boolean => !!a && a.version >= HOMELAB_NOTICE_VERSION;

/**
 * Recordatorio corto: sale cada vez que el usuario va a analizar un espacio nuevo (después de haber aceptado el aviso completo).
 * Debe leerse en 3 segundos y quitarse con un toque, con Esc o tocando fuera.
 */
export const HOMELAB_QUICK_TITLE = 'Antes de medir tu espacio';
export const HOMELAB_QUICK_ITEMS = ['Mide tú mismo el espacio.', 'Despeja objetos y personas.', 'Para chipear: foam o red.'] as const;

/** ¿Se muestra el recordatorio corto? Solo al empezar a analizar un espacio, con el aviso completo ya aceptado, sin haberlo cerrado en esta vuelta y sin el aviso completo abierto. */
export const quickNoticeVisible = (o: { analyzingSpace: boolean; accepted: boolean; quickDismissed: boolean; fullOpen: boolean }): boolean =>
  o.analyzingSpace && o.accepted && !o.quickDismissed && !o.fullOpen;
