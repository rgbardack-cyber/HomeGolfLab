import { MediaStoreError, type BackendEntry, type MediaBackend } from './types';

/** Los ids se usan como nombre de archivo: solo letras, números, guion y guion bajo (nada de rutas). */
export function assertId(id: string): void {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new RangeError(`id de medio no válido: ${JSON.stringify(id).slice(0, 40)}`);
}

const NOT_FOUND = /not exist|no such|not found|ENOENT|doesn.?t exist/i;
const NO_SPACE = /quota|no space|ENOSPC|disk full|storage full/i;

/** Traduce un error de almacenamiento a uno que la pantalla sabe explicar. */
export function toMediaError(e: unknown): MediaStoreError {
  if (e instanceof MediaStoreError) return e;
  const name = e instanceof Error ? e.name : '';
  const msg = e instanceof Error ? e.message : String(e);
  if (name === 'QuotaExceededError' || NO_SPACE.test(msg)) return new MediaStoreError('no_space', 'Sin espacio para guardar', e);
  return new MediaStoreError('unavailable', 'No se pudo guardar: ' + msg.slice(0, 120), e);
}

/* ───────────────────────── Memoria ───────────────────────── */

/** Pruebas y respaldo cuando el navegador no deja guardar (modo privado): vale solo mientras la pestaña viva. */
export class MemoryBackend implements MediaBackend {
  readonly persistent = false;
  private blobs = new Map<string, Blob>();
  private jsons = new Map<string, string>();
  async putBlob(id: string, data: Blob) { assertId(id); this.blobs.set(id, data); }
  async getBlob(id: string) { assertId(id); return this.blobs.get(id) ?? null; }
  async putJson(id: string, value: unknown) { assertId(id); this.jsons.set(id, JSON.stringify(value)); }
  async getJson<T>(id: string) {
    assertId(id);
    const s = this.jsons.get(id);
    if (s === undefined) return null;
    try { return JSON.parse(s) as T; } catch (e) { throw new MediaStoreError('corrupt', 'JSON dañado', e); }
  }
  async delete(id: string) { assertId(id); this.blobs.delete(id); this.jsons.delete(id); }
  async list(): Promise<BackendEntry[]> {
    return [
      ...[...this.blobs].map(([id, b]) => ({ id, kind: 'blob' as const, bytes: b.size })),
      ...[...this.jsons].map(([id, s]) => ({ id, kind: 'json' as const, bytes: s.length })),
    ];
  }
}

/* ───────────────────────── IndexedDB (web) ───────────────────────── */

const idbReq = <T>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbDone = (tx: IDBTransaction): Promise<void> => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error ?? new DOMException('transacción cancelada', 'AbortError'));
});

/** Envoltorio mínimo de IndexedDB, sin dependencias. Dos almacenes: `blobs` y `json`. */
export class IndexedDbBackend implements MediaBackend {
  readonly persistent = true;
  private dbp: Promise<IDBDatabase> | null = null;
  constructor(private readonly factory: IDBFactory, private readonly name = 'hgl-media') {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise<IDBDatabase>((res, rej) => {
        const r = this.factory.open(this.name, 1);
        r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('blobs'); d.createObjectStore('json'); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('la base de medios está bloqueada por otra pestaña'));
      }).catch((e) => { this.dbp = null; throw toMediaError(e); });
    }
    return this.dbp;
  }

  private async write(store: 'blobs' | 'json', id: string, value: unknown) {
    const db = await this.db();
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, id);
      await idbDone(tx);
    } catch (e) { throw toMediaError(e); }
  }

  async putBlob(id: string, data: Blob) { assertId(id); await this.write('blobs', id, { blob: data, bytes: data.size }); }
  async putJson(id: string, value: unknown) { assertId(id); const s = JSON.stringify(value); await this.write('json', id, { data: s, bytes: s.length }); }

  async getBlob(id: string) {
    assertId(id);
    const db = await this.db();
    const rec = await idbReq<{ blob: Blob } | undefined>(db.transaction('blobs').objectStore('blobs').get(id));
    return rec?.blob ?? null;
  }
  async getJson<T>(id: string) {
    assertId(id);
    const db = await this.db();
    const rec = await idbReq<{ data: string } | undefined>(db.transaction('json').objectStore('json').get(id));
    if (!rec) return null;
    try { return JSON.parse(rec.data) as T; } catch (e) { throw new MediaStoreError('corrupt', 'JSON dañado', e); }
  }
  async delete(id: string) {
    assertId(id);
    const db = await this.db();
    const tx = db.transaction(['blobs', 'json'], 'readwrite');
    tx.objectStore('blobs').delete(id);
    tx.objectStore('json').delete(id);
    await idbDone(tx);
  }
  async list(): Promise<BackendEntry[]> {
    const db = await this.db();
    const out: BackendEntry[] = [];
    for (const [store, kind] of [['blobs', 'blob'], ['json', 'json']] as const) {
      await new Promise<void>((res, rej) => {
        const cur = db.transaction(store).objectStore(store).openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return res();
          out.push({ id: String(c.key), kind, bytes: (c.value as { bytes: number }).bytes });
          c.continue();
        };
        cur.onerror = () => rej(cur.error);
      });
    }
    return out;
  }
}

/* ───────────────────────── Filesystem de Capacitor (nativo) ───────────────────────── */

/** Subconjunto de `@capacitor/filesystem` que se usa; permite inyectar uno falso en las pruebas. */
export interface FsLike {
  writeFile(o: { path: string; data: string; directory: string; encoding?: string; recursive?: boolean }): Promise<unknown>;
  appendFile(o: { path: string; data: string; directory: string; encoding?: string }): Promise<void>;
  readFile(o: { path: string; directory: string; encoding?: string }): Promise<{ data: string | Blob }>;
  deleteFile(o: { path: string; directory: string }): Promise<void>;
  readdir(o: { path: string; directory: string }): Promise<{ files: { name: string; type?: string; size: number }[] }>;
  mkdir(o: { path: string; directory: string; recursive?: boolean }): Promise<void>;
  getUri(o: { path: string; directory: string }): Promise<{ uri: string }>;
}

export interface NativeFsOptions {
  fs: FsLike;
  /** `Directory.Data` del plugin. */
  directory: string;
  /** `Encoding.UTF8` del plugin. */
  utf8: string;
  /** Lee un archivo nativo como Blob por su URI (por defecto: fetch de `Capacitor.convertFileSrc(uri)`), sin pasar todo por base64. */
  readBlob: (uri: string) => Promise<Blob | null>;
  root?: string;
  /** Tamaño de bloque al escribir; múltiplo de 3 (base64 limpio). Un solo `writeFile` base64 de cientos de MB agota la memoria. */
  chunkBytes?: number;
}

export const DEFAULT_CHUNK_BYTES = 3 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export class NativeFsBackend implements MediaBackend {
  readonly persistent = true;
  private readonly root: string;
  private readonly chunk: number;
  private ready: Promise<void> | null = null;
  constructor(private readonly o: NativeFsOptions) {
    this.root = o.root ?? 'hgl-media';
    this.chunk = Math.max(3, Math.floor((o.chunkBytes ?? DEFAULT_CHUNK_BYTES) / 3) * 3);
  }

  private dir() {
    this.ready ??= this.o.fs.mkdir({ path: this.root, directory: this.o.directory, recursive: true }).catch((e) => {
      if (!/exist/i.test(String(e?.message ?? e))) { this.ready = null; throw e; }
    });
    return this.ready;
  }
  private path(id: string, ext: 'bin' | 'json') { return `${this.root}/${id}.${ext}`; }
  private async rm(path: string) {
    try { await this.o.fs.deleteFile({ path, directory: this.o.directory }); } catch (e) { if (!NOT_FOUND.test(String((e as Error)?.message ?? e))) throw e; }
  }

  async putBlob(id: string, data: Blob) {
    assertId(id);
    const path = this.path(id, 'bin');
    try {
      await this.dir();
      await this.rm(path);
      if (data.size === 0) { await this.o.fs.writeFile({ path, data: '', directory: this.o.directory }); return; }
      for (let off = 0, first = true; off < data.size; off += this.chunk, first = false) {
        const b64 = toBase64(new Uint8Array(await data.slice(off, off + this.chunk).arrayBuffer()));
        if (first) await this.o.fs.writeFile({ path, data: b64, directory: this.o.directory });
        else await this.o.fs.appendFile({ path, data: b64, directory: this.o.directory });
      }
    } catch (e) {
      try { await this.rm(path); } catch { /* sin archivo a medio escribir */ }
      throw toMediaError(e);
    }
  }

  async getBlob(id: string) {
    assertId(id);
    try {
      const { uri } = await this.o.fs.getUri({ path: this.path(id, 'bin'), directory: this.o.directory });
      return await this.o.readBlob(uri);
    } catch (e) {
      if (NOT_FOUND.test(String((e as Error)?.message ?? e))) return null;
      throw toMediaError(e);
    }
  }

  async putJson(id: string, value: unknown) {
    assertId(id);
    try {
      await this.dir();
      await this.o.fs.writeFile({ path: this.path(id, 'json'), data: JSON.stringify(value), directory: this.o.directory, encoding: this.o.utf8 });
    } catch (e) { throw toMediaError(e); }
  }

  async getJson<T>(id: string) {
    assertId(id);
    let text: string;
    try {
      const r = await this.o.fs.readFile({ path: this.path(id, 'json'), directory: this.o.directory, encoding: this.o.utf8 });
      text = typeof r.data === 'string' ? r.data : await r.data.text();
    } catch (e) {
      if (NOT_FOUND.test(String((e as Error)?.message ?? e))) return null;
      throw toMediaError(e);
    }
    try { return JSON.parse(text) as T; } catch (e) { throw new MediaStoreError('corrupt', 'JSON dañado', e); }
  }

  async delete(id: string) {
    assertId(id);
    await this.rm(this.path(id, 'bin'));
    await this.rm(this.path(id, 'json'));
  }

  async list(): Promise<BackendEntry[]> {
    let files: { name: string; size: number }[];
    try { files = (await this.o.fs.readdir({ path: this.root, directory: this.o.directory })).files; }
    catch (e) { if (NOT_FOUND.test(String((e as Error)?.message ?? e))) return []; throw toMediaError(e); }
    const out: BackendEntry[] = [];
    for (const f of files) {
      const m = /^([A-Za-z0-9_-]{1,80})\.(bin|json)$/.exec(f.name);
      if (m) out.push({ id: m[1], kind: m[2] === 'bin' ? 'blob' : 'json', bytes: f.size });
    }
    return out;
  }
}
