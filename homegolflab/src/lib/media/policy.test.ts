import { describe, expect, it } from 'vitest';
import { clearAllMedia, deleteSessionMedia, referencedMediaIds, runCleanup } from './cleanup';
import { makeClock } from './clock';
import { MemoryBackend } from './backends';
import { effectiveCap, formatBytes, planCleanup, planOrphans, POLICY } from './policy';
import type { BackendEntry } from './types';
import { MediaStore } from './store';
import type { MediaRef } from './types';
import type { Session } from '@/store';

const H = 3600_000, MB = 1024 ** 2;
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const ref = (id: string, kind: MediaRef['kind'], ageH: number, mb = 10, over: Partial<MediaRef> = {}): MediaRef => ({
  id, kind, mime: 'video/mp4', bytes: mb * MB, durationMs: 1000, w: 1080, h: 1920, rotation: 0, clock: makeClock({ fpsNominal: 60 }),
  createdAt: new Date(NOW - ageH * H).toISOString(), ...over,
});
const ids = (p: ReturnType<typeof planCleanup>) => p.remove.map((r) => `${r.id}:${r.reason}`).sort();

describe('política de limpieza (F2.3, fechas simuladas)', () => {
  it('borra exportaciones y grabaciones temporales de más de 24 h, no las recientes', () => {
    const p = planCleanup([ref('e_old', 'export', 25), ref('e_new', 'export', 23.9), ref('l_old', 'live_recording', 30), ref('l_new', 'live_recording', 1)], NOW);
    expect(ids(p)).toEqual(['e_old:temporary', 'l_old:temporary']);
  });

  it('un video fuente del usuario no se borra por viejo', () => {
    expect(planCleanup([ref('m_1', 'source', 24 * 400)], NOW).remove).toEqual([]);
  });

  it('lo que trae expiresAt se borra pasada esa fecha', () => {
    const p = planCleanup([
      ref('a', 'source', 1, 10, { expiresAt: new Date(NOW - 1).toISOString() }),
      ref('b', 'source', 1, 10, { expiresAt: new Date(NOW + H).toISOString() }),
    ], NOW);
    expect(ids(p)).toEqual(['a:expired']);
  });

  it('un medio referenciado por una sesión no se borra aunque sea temporal viejo o venza', () => {
    const p = planCleanup([ref('e_old', 'export', 99), ref('x', 'source', 1, 10, { expiresAt: new Date(NOW - 5).toISOString() })], NOW, { referencedIds: new Set(['e_old', 'x']) });
    expect(p.remove).toEqual([]);
  });

  it('sobre el tope: borra primero los temporales (más viejos primero) y luego los no referenciados; nunca los de una sesión', () => {
    const refs = [ref('s_user', 'source', 500, 60), ref('s_free', 'source', 400, 60), ref('e_1', 'export', 10, 30), ref('e_2', 'export', 5, 30)];
    // tope 100 MB, total 180 MB: hay que liberar ≥ 80 MB
    const p = planCleanup(refs, NOW, { capBytes: 100 * MB, referencedIds: new Set(['s_user']) });
    expect(p.remove.map((r) => r.id)).toEqual(['e_1', 'e_2', 's_free']);
    expect(p.remove.every((r) => r.reason === 'over_cap')).toBe(true);
    expect(p.bytesAfter).toBe(60 * MB);
    expect(p.needsUserAction).toBe(false);
  });

  it('si solo quedan videos de sesiones y aún pasa del tope, no borra y pide acción del usuario', () => {
    const p = planCleanup([ref('s1', 'source', 5, 80), ref('s2', 'source', 5, 80)], NOW, { capBytes: 100 * MB, referencedIds: new Set(['s1', 's2']) });
    expect(p.remove).toEqual([]);
    expect(p.needsUserAction).toBe(true);
    expect(p.bytesAfter).toBe(160 * MB);
  });

  it('no cuenta dos veces lo que ya se borró por viejo al calcular el tope', () => {
    const p = planCleanup([ref('e_old', 'export', 48, 90), ref('s', 'source', 1, 50)], NOW, { capBytes: 100 * MB });
    expect(ids(p)).toEqual(['e_old:temporary']);
    expect(p.bytesAfter).toBe(50 * MB);
  });

  it('el tope efectivo es el menor entre 2 GB y el 80 % de la cuota del navegador', () => {
    expect(effectiveCap({})).toBe(POLICY.capBytes);
    expect(effectiveCap({ quotaBytes: 1000 * MB })).toBe(800 * MB);
    expect(effectiveCap({ quotaBytes: 10 * 1024 ** 3 })).toBe(POLICY.capBytes);
    expect(effectiveCap({ capBytes: 5 * MB, quotaBytes: 1000 * MB })).toBe(5 * MB);
  });

  it('formatBytes usa coma decimal y la unidad adecuada', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(24 * MB)).toBe('24,0 MB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1,5 GB');
    expect(formatBytes(0)).toBe('0 KB');
  });
});

describe('huérfanos (revisión F2)', () => {
  const e = (id: string, kind: 'blob' | 'json', ageH: number | undefined, bytes = 10): BackendEntry => ({ id, kind, bytes, modifiedAt: ageH === undefined ? undefined : NOW - ageH * H });

  it('un blob sin referencia y de más de 24 h es huérfano; uno reciente (guardado en curso) no', () => {
    expect(planOrphans([e('m_old', 'blob', 30), e('m_new', 'blob', 1)], NOW)).toEqual(['m_old']);
  });

  it('un blob con su referencia, o que una sesión referencia, no es huérfano', () => {
    const entries = [e('m_ok', 'blob', 99), e('m_ok-ref', 'json', 99), e('p_s', 'blob', 99), e('f_s', 'json', 99)];
    expect(planOrphans(entries, NOW, new Set(['p_s', 'f_s']))).toEqual([]);
  });

  it('una referencia cuyo video no existe es huérfana (solo si es vieja)', () => {
    expect(planOrphans([e('m_x-ref', 'json', 30), e('m_y-ref', 'json', 2)], NOW)).toEqual(['m_x-ref']);
  });

  it('sin fecha de modificación no se borra nada (no se puede saber la edad)', () => {
    expect(planOrphans([e('m_sin', 'blob', undefined)], NOW)).toEqual([]);
  });
});

describe('limpieza aplicada sobre el almacén', () => {
  it('runCleanup borra un blob huérfano viejo y deja un guardado reciente sin referencia', async () => {
    const be = new MemoryBackend();
    const st = new MediaStore(be);
    await be.putBlob('m_huerfano', new Blob([new Uint8Array(10)]));
    await be.putBlob('m_reciente', new Blob([new Uint8Array(10)]));
    // hace 48 h para el primero: se simula adelantando el reloj de la limpieza para el viejo y comprobando el reciente aparte
    const farFuture = Date.now() + 30 * H;
    const plan = await runCleanup(st, [], farFuture, 10 * 1024 ** 3);
    expect(plan.orphans.sort()).toEqual(['m_huerfano', 'm_reciente']); // con +30 h ambos son viejos
    await be.putBlob('m_nuevo', new Blob([new Uint8Array(10)]));
    const plan2 = await runCleanup(st, [], Date.now(), 10 * 1024 ** 3);
    expect(plan2.orphans).toEqual([]);                                  // recién guardado: no se toca
    expect((await be.list()).map((x) => x.id)).toEqual(['m_nuevo']);
  });

  const blob = (mb: number) => new Blob([new Uint8Array(mb * 1024)]); // KB reales; el tamaño que cuenta es el de la referencia
  const meta = (kind: MediaRef['kind']) => ({ kind, mime: 'video/mp4', durationMs: 1, w: 1, h: 1, rotation: 0 as const, clock: makeClock({ fpsNominal: 60 }) });
  const sess = (o: Partial<Session>): Session => ({ id: 's', at: '', date: '', mode: 'casa', type: 'swing', ...o } as Session);

  it('runCleanup borra lo vencido y deja lo de las sesiones', async () => {
    const st = new MediaStore(new MemoryBackend(), () => NOW - 48 * H);
    const old = await st.saveMedia(blob(1), meta('export'));
    const kept = await st.saveMedia(blob(1), meta('export'));
    const user = await st.saveMedia(blob(1), meta('source'));
    const plan = await runCleanup(st, [sess({ mediaId: kept.id })], NOW, 10 * 1024 ** 3);
    expect(plan.remove.map((r) => r.id)).toEqual([old.id]);
    expect((await st.listRefs()).map((r) => r.id).sort()).toEqual([kept.id, user.id].sort());
  });

  it('deleteSessionMedia borra video, pista y vuelo de esa sesión y nada más', async () => {
    const st = new MediaStore(new MemoryBackend());
    const a = await st.saveMedia(blob(1), meta('source')), b = await st.saveMedia(blob(1), meta('source'));
    const pid = await st.saveJsonRecord({ x: 1 }, 'p_a'), fid = await st.saveJsonRecord({ y: 2 }, 'f_a'), other = await st.saveJsonRecord({ z: 3 }, 'f_b');
    await deleteSessionMedia(st, { mediaId: a.id, poseTrackId: pid, flightTrackId: fid });
    expect((await st.listRefs()).map((r) => r.id)).toEqual([b.id]);
    expect(await st.loadJsonRecord(pid)).toBeNull();
    expect(await st.loadJsonRecord(fid)).toBeNull();
    expect(await st.loadJsonRecord(other)).toEqual({ z: 3 });
  });

  it('referencedMediaIds junta los tres ids de todas las sesiones y clearAllMedia lo vacía todo', async () => {
    expect([...referencedMediaIds([{ mediaId: 'm1', poseTrackId: 'p1' }, { flightTrackId: 'f1' }, {}])].sort()).toEqual(['f1', 'm1', 'p1']);
    const st = new MediaStore(new MemoryBackend());
    await st.saveMedia(blob(1), meta('source')); await st.saveJsonRecord({ a: 1 });
    await clearAllMedia(st);
    expect(await st.usage()).toEqual({ bytes: 0, entries: 0 });
  });
});

describe('acciones del store: removeSession y clearMediaRefs', () => {
  it('removeSession quita solo esa sesión y devuelve la quitada; clearMediaRefs olvida los ids', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    const { useStore } = await import('../../store');
    useStore.setState({ sessions: [{ id: 'a', mediaId: 'm_a', poseTrackId: 'p_a' } as never, { id: 'b', score: 70 } as never] });
    useStore.getState().clearMediaRefs();
    const [a, b] = useStore.getState().sessions;
    expect(a.mediaId).toBeUndefined(); expect(a.poseTrackId).toBeUndefined();
    expect(b).toMatchObject({ id: 'b', score: 70 });
    expect(useStore.getState().removeSession('a')?.id).toBe('a');
    expect(useStore.getState().sessions.map((s) => s.id)).toEqual(['b']);
    expect(useStore.getState().removeSession('zzz')).toBeUndefined();
  });
});
