import { describe, expect, it } from 'vitest';
import { assertId, DEFAULT_CHUNK_BYTES, MemoryBackend, NativeFsBackend, type FsLike } from './backends';
import { makeClock } from './clock';
import { decodePoseTrack, encodePoseTrack, POSE_LANDMARKS, POSE_STRIDE, type PoseTrack } from './poseTrack';
import { MediaStore, MediaStoreError, type NewMedia } from './store';
import type { MediaBackend } from './types';

const meta = (over: Partial<NewMedia> = {}): NewMedia => ({
  kind: 'source', mime: 'video/mp4', durationMs: 2700, w: 1080, h: 1920, rotation: 0, clock: makeClock({ fpsNominal: 60 }), ...over,
});
const blobOf = (n: number, seed = 7) => new Blob([Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255)]);
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe('MediaStore con el respaldo de memoria (F2.2)', () => {
  it('guarda y recupera un video con su referencia', async () => {
    const st = new MediaStore(new MemoryBackend(), () => Date.UTC(2026, 10, 19, 12));
    const blob = blobOf(1000);
    const ref = await st.saveMedia(blob, meta({ sessionId: 's1' }));
    expect(ref).toMatchObject({ bytes: 1000, kind: 'source', createdAt: '2026-11-19T12:00:00.000Z', sessionId: 's1' });
    expect(ref.id).toMatch(/^m_[a-f0-9]{32}$/);
    const got = await st.getMedia(ref.id);
    expect(got.ref).toEqual(ref);
    expect(await bytesOf(got.blob)).toEqual(await bytesOf(blob));
  });

  it('listRefs, usage y deleteMedia', async () => {
    const st = new MediaStore(new MemoryBackend());
    const a = await st.saveMedia(blobOf(500), meta()), b = await st.saveMedia(blobOf(300), meta({ kind: 'export' }));
    expect((await st.listRefs()).map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect((await st.usage()).bytes).toBeGreaterThan(800); // blobs + referencias JSON
    await st.deleteMedia(a.id);
    expect((await st.listRefs()).map((r) => r.id)).toEqual([b.id]);
    await st.deleteMedia(a.id); // no falla si ya no estaba
    await expect(st.getMedia(a.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('si la referencia no se puede escribir, no queda el video a medias', async () => {
    const inner = new MemoryBackend();
    const failing: MediaBackend = new Proxy(inner, {
      get(t, p, r) { if (p === 'putJson') return async () => { throw new MediaStoreError('no_space', 'sin espacio'); }; const v = Reflect.get(t, p, r); return typeof v === 'function' ? v.bind(t) : v; },
    });
    const st = new MediaStore(failing);
    await expect(st.saveMedia(blobOf(100), meta({ id: 'm_x' }))).rejects.toMatchObject({ code: 'no_space' });
    expect(await inner.list()).toEqual([]);
  });

  it('rechaza ids con rutas o caracteres raros (los ids son nombres de archivo)', () => {
    for (const bad of ['../x', 'a/b', 'a\\b', '', 'x'.repeat(81), 'a b', 'ñ']) expect(() => assertId(bad)).toThrow(RangeError);
    for (const ok of ['m_abc123', 'p-1', 'F_2']) expect(() => assertId(ok)).not.toThrow();
  });

  it('guarda y recupera un registro JSON (seguimiento de bola) y la pista de postura', async () => {
    const st = new MediaStore(new MemoryBackend());
    const fid = await st.saveJsonRecord({ v: 2, observed: [{ t: 1, x: 0.5 }] });
    expect(fid).toMatch(/^f_/);
    expect(await st.loadJsonRecord(fid)).toEqual({ v: 2, observed: [{ t: 1, x: 0.5 }] });
    expect(await st.loadJsonRecord('f_inexistente')).toBeNull();
    const tr = poseTrack(5);
    const pid = await st.savePoseTrack(tr);
    expect(await st.loadPoseTrack(pid)).toEqual(tr);
    expect(await st.loadPoseTrack('p_nada')).toBeNull();
  });
});

function poseTrack(n: number): PoseTrack {
  const t = Float64Array.from({ length: n }, (_, i) => 7000 + (i * 1000) / 30);
  const lm = Float32Array.from({ length: n * POSE_LANDMARKS * POSE_STRIDE }, (_, i) => ((i * 2654435761) % 1000) / 1000);
  return { v: 1, sourceId: 'm_abc', fromMs: t[0], toMs: t[n - 1], hz: 30, t, lm };
}

describe('pista de postura binaria', () => {
  it('ida y vuelta exacta (bit a bit)', () => {
    const tr = poseTrack(60);
    return encodePoseTrack(tr).arrayBuffer().then((buf) => {
      const back = decodePoseTrack(buf);
      expect(back).toEqual(tr);
      expect(Array.from(back.lm.slice(0, 8))).toEqual(Array.from(tr.lm.slice(0, 8)));
    });
  });

  it('pesa mucho menos de 200 KB para una ventana fina típica (≈ 2,5 s a 30 Hz)', () => {
    expect(encodePoseTrack(poseTrack(75)).size).toBeLessThan(200 * 1024);
    expect(encodePoseTrack(poseTrack(75)).size).toBe(4 + JSON.stringify({ v: 1, sourceId: 'm_abc', fromMs: 7000, toMs: 7000 + (74 * 1000) / 30, hz: 30, n: 75 }).length + 75 * 8 + 75 * 33 * 4 * 4);
  });

  it('acepta vistas (subarray) sin arrastrar el buffer entero', async () => {
    const big = poseTrack(10);
    const sub: PoseTrack = { ...big, t: big.t.subarray(2, 6), lm: big.lm.subarray(2 * 132, 6 * 132), fromMs: big.t[2], toMs: big.t[5] };
    const back = decodePoseTrack(await encodePoseTrack(sub).arrayBuffer());
    expect(Array.from(back.t)).toEqual(Array.from(big.t.subarray(2, 6)));
    expect(back.lm).toHaveLength(4 * 132);
  });

  it('rechaza tamaños incoherentes, archivos truncados y versiones desconocidas', async () => {
    expect(() => encodePoseTrack({ ...poseTrack(3), lm: new Float32Array(10) })).toThrow(RangeError);
    const buf = await encodePoseTrack(poseTrack(4)).arrayBuffer();
    expect(() => decodePoseTrack(buf.slice(0, buf.byteLength - 1))).toThrow(RangeError);
    expect(() => decodePoseTrack(new ArrayBuffer(2))).toThrow(RangeError);
    const st = new MediaStore(new MemoryBackend());
    const back = st.backend;
    await back.putBlob('p_roto', new Blob([new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9])]));
    await expect(st.loadPoseTrack('p_roto')).rejects.toMatchObject({ code: 'corrupt' });
  });
});

/* ───────────────────────── Filesystem nativo con un sistema de archivos falso ───────────────────────── */

function fakeFs(opts: { failAppendAt?: number; failWith?: string } = {}) {
  const files = new Map<string, Uint8Array>();
  const calls: { op: string; path: string; len: number }[] = [];
  let appends = 0;
  const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const cat = (a: Uint8Array, b: Uint8Array) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  const fs: FsLike = {
    async mkdir() { /* ya existe o se crea */ },
    async writeFile({ path, data, encoding }) { calls.push({ op: 'write', path, len: data.length }); files.set(path, encoding ? new TextEncoder().encode(data) : fromB64(data)); },
    async appendFile({ path, data }) {
      calls.push({ op: 'append', path, len: data.length });
      if (opts.failAppendAt !== undefined && ++appends === opts.failAppendAt) throw new Error(opts.failWith ?? 'ENOSPC: no space left on device');
      files.set(path, cat(files.get(path) ?? new Uint8Array(), fromB64(data)));
    },
    async readFile({ path }) { const f = files.get(path); if (!f) throw new Error('File does not exist'); return { data: new TextDecoder().decode(f) }; },
    async deleteFile({ path }) { if (!files.delete(path)) throw new Error('File does not exist'); },
    async readdir() { return { files: [...files].map(([p, b]) => ({ name: p.split('/').pop()!, type: 'file', size: b.length })) }; },
    async getUri({ path }) { return { uri: 'file://' + path }; },
  };
  const readBlob = async (uri: string) => { const f = files.get(uri.replace('file://', '')); return f ? new Blob([f.slice()]) : null; };
  return { fs, files, calls, readBlob };
}
const native = (f: ReturnType<typeof fakeFs>, chunkBytes?: number) => new NativeFsBackend({ fs: f.fs, directory: 'DATA', utf8: 'utf8', readBlob: f.readBlob, chunkBytes });

describe('backend nativo: escritura por bloques (F2.2)', () => {
  it('un blob grande se escribe en varios bloques y se reconstruye idéntico', async () => {
    const f = fakeFs();
    const be = native(f, 1000);
    const blob = blobOf(3500);
    await be.putBlob('m_a', blob);
    const w = f.calls.filter((c) => c.path.endsWith('m_a.bin'));
    expect(w.map((c) => c.op)).toEqual(['write', 'append', 'append', 'append']); // 1000+1000+1000+500
    expect(await bytesOf((await be.getBlob('m_a'))!)).toEqual(await bytesOf(blob));
  });

  it('ningún bloque supera el tamaño pedido (nada de un solo base64 de cientos de MB): 7 MiB con el bloque por defecto', async () => {
    const f = fakeFs();
    const be = native(f);
    await be.putBlob('m_big', blobOf(7 * 1024 * 1024));
    const lens = f.calls.map((c) => c.len);
    expect(lens.length).toBe(3);
    expect(Math.max(...lens)).toBeLessThanOrEqual(Math.ceil((DEFAULT_CHUNK_BYTES / 3) * 4));
    expect(f.files.get('hgl-media/m_big.bin')!.length).toBe(7 * 1024 * 1024);
  });

  it('el tamaño de bloque se redondea a múltiplo de 3', async () => {
    const f = fakeFs();
    await native(f, 1000).putBlob('m_b', blobOf(100));
    await native(f, 10).putBlob('m_c', blobOf(100));
    expect(f.calls.filter((c) => c.path.endsWith('m_b.bin')).length).toBe(1);
    expect(f.calls.filter((c) => c.path.endsWith('m_c.bin')).length).toBe(Math.ceil(100 / 9)); // 10 → 9
  });

  it('si falla a mitad, borra el archivo parcial y explica "sin espacio"', async () => {
    const f = fakeFs({ failAppendAt: 2 });
    await expect(native(f, 300).putBlob('m_x', blobOf(2000))).rejects.toMatchObject({ code: 'no_space' });
    expect(f.files.has('hgl-media/m_x.bin')).toBe(false);
  });

  it('un error que no es de espacio sale como "unavailable"', async () => {
    const f = fakeFs({ failAppendAt: 1, failWith: 'permiso denegado' });
    await expect(native(f, 300).putBlob('m_y', blobOf(2000))).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('dos putBlob concurrentes del mismo id no se mezclan (el último gana, archivo íntegro)', async () => {
    const f = fakeFs();
    const be = native(f, 9);
    await Promise.all([be.putBlob('m_c', blobOf(30, 1)), be.putBlob('m_c', blobOf(30, 2))]);
    const got = await bytesOf((await be.getBlob('m_c'))!);
    expect(got.length).toBe(30);
    expect(got).toEqual(await bytesOf(blobOf(30, 2)));
  });

  it('sobrescribir un id no deja restos del contenido anterior', async () => {
    const f = fakeFs();
    const be = native(f, 100);
    await be.putBlob('m_z', blobOf(500));
    await be.putBlob('m_z', blobOf(50, 99));
    expect((await be.getBlob('m_z'))!.size).toBe(50);
  });

  it('blob vacío, JSON, id inexistente, listado y borrado', async () => {
    const f = fakeFs();
    const be = native(f, 100);
    await be.putBlob('m_empty', new Blob([]));
    expect((await be.getBlob('m_empty'))!.size).toBe(0);
    await be.putJson('m_empty-ref', { a: 1, ñ: 'acentos ✓' });
    expect(await be.getJson('m_empty-ref')).toEqual({ a: 1, ñ: 'acentos ✓' });
    expect(await be.getJson('nada')).toBeNull();
    expect(await be.getBlob('nada')).toBeNull();
    const list = await be.list();
    expect(list.map((e) => `${e.id}:${e.kind}`).sort()).toEqual(['m_empty-ref:json', 'm_empty:blob']);
    await be.delete('m_empty'); await be.delete('m_empty-ref'); await be.delete('m_empty');
    expect(await be.list()).toEqual([]);
  });

  it('JSON dañado en disco sale como "corrupt"', async () => {
    const f = fakeFs();
    const be = native(f);
    await be.putJson('r', { a: 1 });
    f.files.set('hgl-media/r.json', new TextEncoder().encode('{roto'));
    await expect(be.getJson('r')).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('el store completo funciona sobre el backend nativo falso', async () => {
    const st = new MediaStore(native(fakeFs(), 500));
    const ref = await st.saveMedia(blobOf(1800), meta());
    expect(await bytesOf((await st.getMedia(ref.id)).blob)).toEqual(await bytesOf(blobOf(1800)));
    const pid = await st.savePoseTrack(poseTrack(8));
    expect(await st.loadPoseTrack(pid)).toEqual(poseTrack(8));
    expect(st.persistent).toBe(true);
    await st.deleteMedia(ref.id);
    expect(await st.listRefs()).toEqual([]);
  });
});
