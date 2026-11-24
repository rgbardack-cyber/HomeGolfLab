/**
 * Banderas de funciones (plan 4.10). Todo lo nuevo nace apagado y se enciende por etapas.
 *
 * - Valor base: `VITE_FLAG_<NOMBRE_EN_MAYÚSCULAS_CON_GUIONES_BAJOS>` = "1" o "true" (p. ej. `VITE_FLAG_VIDEO_REVIEW=1`).
 * - Panel "Funciones de prueba" en Perfil: solo con `import.meta.env.DEV` o `VITE_INTERNAL=1`. Solo en ese caso se
 *   leen los cambios hechos desde el panel (guardados en localStorage): en una build normal, un valor guardado en el
 *   navegador NO puede encender nada.
 */
import { useSyncExternalStore } from 'react';

export const FLAG_NAMES = [
  'videoReview', 'compare', 'flightV2', 'flightEstimate', 'shotShapeAuto', 'distanceEstimate', 'export', 'exportGate', 'liveRecording', 'consentFlow',
] as const;
export type FlagName = (typeof FLAG_NAMES)[number];
export type FlagValues = Record<FlagName, boolean>;

export const FLAG_INFO: Record<FlagName, { label: string; desc: string }> = {
  videoReview: { label: 'Revisión de swing en video', desc: 'Reproductor con guías de cabeza, torso y brazo guía, y pausas por fase.' },
  compare: { label: 'Comparar dos clips', desc: 'Dos swings lado a lado sincronizados por fase.' },
  flightV2: { label: 'Seguimiento de bola v2', desc: 'Trazo animado sobre el video (verde / dorado / morado).' },
  flightEstimate: { label: 'Trayectoria estimada', desc: 'Continuación morada punteada. Solo pruebas internas hasta validarla.' },
  shotShapeAuto: { label: 'Tipo de tiro automático', desc: 'Clasificación automática. Apagada hasta tener datos etiquetados.' },
  distanceEstimate: { label: 'Estimación de distancia', desc: 'Distancia con referencias del campo. Apagada hasta validarla.' },
  export: { label: 'Exportar video', desc: 'Editor de exportación vertical 1080×1920.' },
  exportGate: { label: 'Anuncio para descargar', desc: 'Pase de exportación con anuncio recompensado (plan Gratis).' },
  liveRecording: { label: 'Grabación en vivo', desc: 'Graba y recorta los golpes del modo en vivo (Premium).' },
  consentFlow: { label: 'Consentimiento de datos', desc: 'Casilla aparte para guardar videos y análisis (R9). Guardar videos sigue desactivado.' },
};

/** `videoReview` → `VITE_FLAG_VIDEO_REVIEW`. */
export const envKey = (n: FlagName): string => 'VITE_FLAG_' + n.replace(/([A-Z])/g, '_$1').toUpperCase();

const truthy = (v: unknown) => v === '1' || v === 'true' || v === true;

/**
 * Resuelve las banderas. Base: todo apagado. `env` puede encender (VITE_FLAG_*). Solo si `internal`, los cambios del
 * panel (`overrides`) mandan sobre el entorno, en ambos sentidos.
 */
export function resolveFlags(env: Record<string, unknown>, overrides: Partial<Record<FlagName, boolean>>, internal: boolean): FlagValues {
  const out = {} as FlagValues;
  for (const n of FLAG_NAMES) {
    const o = internal ? overrides[n] : undefined;
    out[n] = typeof o === 'boolean' ? o : truthy(env[envKey(n)]);
  }
  return out;
}

/** Lee el JSON guardado ignorando todo lo que no sea una bandera conocida con valor booleano. */
export function parseOverrides(raw: string | null): Partial<Record<FlagName, boolean>> {
  if (!raw) return {};
  try {
    const j: unknown = JSON.parse(raw);
    if (!j || typeof j !== 'object' || Array.isArray(j)) return {};
    const out: Partial<Record<FlagName, boolean>> = {};
    for (const n of FLAG_NAMES) { const v = (j as Record<string, unknown>)[n]; if (typeof v === 'boolean') out[n] = v; }
    return out;
  } catch { return {}; }
}

/** ¿Alguna función que guarda videos o pistas está encendida? Si no, la app no abre el almacén de medios. */
export const anyMediaFlag = (f: FlagValues): boolean => f.videoReview || f.compare || f.flightV2 || f.export || f.liveRecording;

/** ¿Se muestra el panel y se leen los cambios guardados? */
export const INTERNAL: boolean = import.meta.env.DEV || import.meta.env.VITE_INTERNAL === '1';

const STORAGE_KEY = 'hgl-flags-v1';
const readStored = (): string | null => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } };

let overrides = INTERNAL ? parseOverrides(readStored()) : {};
let snapshot: FlagValues = resolveFlags(import.meta.env as Record<string, unknown>, overrides, INTERNAL);
const listeners = new Set<() => void>();

const recompute = () => {
  snapshot = resolveFlags(import.meta.env as Record<string, unknown>, overrides, INTERNAL);
  listeners.forEach((l) => l());
};

export const getFlags = (): FlagValues => snapshot;
export const flag = (n: FlagName): boolean => snapshot[n];

/** Cambia (o con `null` quita) la bandera desde el panel. No hace nada fuera del modo interno. */
export function setFlagOverride(n: FlagName, value: boolean | null): void {
  if (!INTERNAL) return;
  const next = { ...overrides };
  if (value === null) delete next[n]; else next[n] = value;
  overrides = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch { /* sin almacenamiento: el cambio vale solo en esta sesión */ }
  recompute();
}

export function clearFlagOverrides(): void {
  if (!INTERNAL) return;
  overrides = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* idem */ }
  recompute();
}

export const subscribeFlags = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Hook: las banderas vigentes, con re-render cuando cambian desde el panel. */
export const useFlags = (): FlagValues => useSyncExternalStore(subscribeFlags, getFlags, getFlags);
