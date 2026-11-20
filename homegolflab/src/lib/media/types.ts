import type { Clock } from './clock';

/** Referencia a un video guardado (plan 4.9). Lo pesado vive en el backend de medios; en localStorage solo van los ids. */
export interface MediaRef {
  id: string;
  kind: 'source' | 'live_recording' | 'export';
  mime: string;
  bytes: number;
  durationMs: number;
  w: number; h: number;
  rotation: 0 | 90 | 180 | 270;
  clock: Clock;
  createdAt: string;      // ISO
  /** Si se da, la limpieza lo borra pasada esa fecha (exportaciones temporales, grabaciones sin guardar). */
  expiresAt?: string;
  sessionId?: string;
}

export type BackendEntryKind = 'blob' | 'json';
/** `modifiedAt` (ms desde 1970) permite saber la edad de un archivo, p. ej. para detectar huérfanos; puede faltar. */
export interface BackendEntry { id: string; kind: BackendEntryKind; bytes: number; modifiedAt?: number }

/**
 * Almacenamiento de datos pesados. Dos "cajones" por id: un blob binario y un JSON. Implementaciones: IndexedDB (web),
 * Filesystem de Capacitor (nativo, por bloques) y memoria (pruebas y respaldo si el navegador no deja guardar).
 */
export interface MediaBackend {
  /** ¿Lo guardado sobrevive a cerrar la app? (false en el respaldo de memoria) */
  readonly persistent: boolean;
  putBlob(id: string, data: Blob): Promise<void>;
  getBlob(id: string): Promise<Blob | null>;
  putJson(id: string, value: unknown): Promise<void>;
  getJson<T = unknown>(id: string): Promise<T | null>;
  /** Borra TODO lo de ese id (blob y json). No falla si no existe. */
  delete(id: string): Promise<void>;
  list(): Promise<BackendEntry[]>;
}

/** Errores que la pantalla sabe explicar en español. */
export type MediaErrorCode = 'no_space' | 'unavailable' | 'not_found' | 'corrupt';
export class MediaStoreError extends Error {
  constructor(public readonly code: MediaErrorCode, message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'MediaStoreError';
  }
}

export const MEDIA_ERROR_TEXT: Record<MediaErrorCode, string> = {
  no_space: 'No hay espacio suficiente para guardar el video. Libera espacio o borra videos guardados en Perfil.',
  unavailable: 'Este dispositivo no permite guardar videos ahora. El análisis se muestra, pero el video no se guardará.',
  not_found: 'No se encontró el video guardado. Puede haberse borrado para liberar espacio.',
  corrupt: 'El archivo guardado está dañado y no se puede leer.',
};
