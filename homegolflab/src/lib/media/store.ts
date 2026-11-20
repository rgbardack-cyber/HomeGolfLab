import { Capacitor } from '@capacitor/core';
import { assertId, IndexedDbBackend, MemoryBackend, NativeFsBackend, toMediaError, type FsLike } from './backends';
import { decodePoseTrack, encodePoseTrack, type PoseTrack } from './poseTrack';
import { MediaStoreError, type MediaBackend, type MediaRef } from './types';

export type { MediaRef } from './types';
export { MediaStoreError, MEDIA_ERROR_TEXT } from './types';

/** Prefijos de id por tipo de dato (un mismo análisis comparte el sufijo para que se vea qué va con qué). */
export const ID_PREFIX = { media: 'm_', pose: 'p_', flight: 'f_' } as const;
const REF_SUFFIX = '-ref';

export type NewMedia = Omit<MediaRef, 'id' | 'bytes' | 'createdAt'> & { id?: string };

/**
 * Almacén de datos pesados (plan 4.9): videos, pistas de postura y seguimientos de bola. En localStorage solo van los
 * ids (`mediaId`, `poseTrackId`, `flightTrackId`). El backend decide dónde: IndexedDB (web), Filesystem (nativo) o
 * memoria (respaldo, no sobrevive al cierre).
 */
export class MediaStore {
  constructor(readonly backend: MediaBackend, private readonly now: () => number = () => Date.now()) {}

  get persistent() { return this.backend.persistent; }
  private newId(prefix: string) { return prefix + crypto.randomUUID().replace(/-/g, ''); }

  /** Guarda el video y su referencia. Si la referencia no se puede escribir, deshace el video (nada a medias). */
  async saveMedia(blob: Blob, meta: NewMedia): Promise<MediaRef> {
    const id = meta.id ?? this.newId(ID_PREFIX.media);
    assertId(id);
    const ref: MediaRef = { ...meta, id, bytes: blob.size, createdAt: new Date(this.now()).toISOString() };
    await this.backend.putBlob(id, blob);
    try { await this.backend.putJson(id + REF_SUFFIX, ref); }
    catch (e) {
      // Si tampoco se puede deshacer, el blob queda huérfano: la limpieza (`planOrphans`) lo borra pasadas 24 h.
      await this.backend.delete(id).catch((e2) => console.warn('No se pudo deshacer el guardado del video', e2));
      throw e;
    }
    return ref;
  }

  getRef(id: string): Promise<MediaRef | null> { return this.backend.getJson<MediaRef>(id + REF_SUFFIX); }

  async getMedia(id: string): Promise<{ ref: MediaRef; blob: Blob }> {
    const [ref, blob] = await Promise.all([this.getRef(id), this.backend.getBlob(id)]);
    if (!ref || !blob) throw new MediaStoreError('not_found', 'No se encontró el video guardado');
    return { ref, blob };
  }

  async listRefs(): Promise<MediaRef[]> {
    const out: MediaRef[] = [];
    for (const e of await this.backend.list()) {
      if (e.kind !== 'json' || !e.id.endsWith(REF_SUFFIX)) continue;
      const ref = await this.backend.getJson<MediaRef>(e.id).catch(() => null);
      if (ref) out.push(ref);
    }
    return out;
  }

  /** Borra el video y su referencia (no falla si ya no estaba). */
  async deleteMedia(id: string): Promise<void> {
    await this.backend.delete(id);
    await this.backend.delete(id + REF_SUFFIX);
  }

  async savePoseTrack(track: PoseTrack, id: string = this.newId(ID_PREFIX.pose)): Promise<string> {
    assertId(id);
    await this.backend.putBlob(id, encodePoseTrack(track));
    return id;
  }
  async loadPoseTrack(id: string): Promise<PoseTrack | null> {
    const b = await this.backend.getBlob(id);
    if (!b) return null;
    try { return decodePoseTrack(await b.arrayBuffer()); } catch (e) { throw new MediaStoreError('corrupt', 'Pista de postura dañada', e); }
  }

  /** Seguimiento de bola (FlightTrack, F5): JSON. */
  async saveJsonRecord(value: unknown, id: string = this.newId(ID_PREFIX.flight)): Promise<string> {
    assertId(id);
    await this.backend.putJson(id, value);
    return id;
  }
  loadJsonRecord<T>(id: string): Promise<T | null> { return this.backend.getJson<T>(id); }
  deleteRecord(id: string): Promise<void> { return this.backend.delete(id); }

  /** Bytes usados por todo lo guardado y cuántos archivos hay. */
  async usage(): Promise<{ bytes: number; entries: number }> {
    const all = await this.backend.list();
    return { bytes: all.reduce((s, e) => s + e.bytes, 0), entries: all.length };
  }
}

/* ───────────────────────── Fábrica según la plataforma ───────────────────────── */

async function nativeFetchBlob(uri: string): Promise<Blob | null> {
  const r = await fetch(Capacitor.convertFileSrc(uri));
  return r.ok ? await r.blob() : null;
}

/** Elige el backend: Filesystem nativo, IndexedDB en el navegador, y memoria si ninguno está disponible. */
export async function createDefaultBackend(): Promise<MediaBackend> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      return new NativeFsBackend({ fs: Filesystem as unknown as FsLike, directory: Directory.Data, utf8: Encoding.UTF8, readBlob: nativeFetchBlob });
    }
    if (typeof indexedDB !== 'undefined') {
      const b = new IndexedDbBackend(indexedDB);
      await b.list(); // abre la base: si el navegador no deja (modo privado), cae al respaldo
      return b;
    }
  } catch (e) { void toMediaError(e); }
  return new MemoryBackend();
}

let shared: Promise<MediaStore> | null = null;
/** El almacén compartido de la app (se crea la primera vez que se pide). */
export function getMediaStore(): Promise<MediaStore> {
  shared ??= createDefaultBackend().then((b) => new MediaStore(b));
  return shared;
}
