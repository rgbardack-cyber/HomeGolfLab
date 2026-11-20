import { describe, expect, it } from 'vitest';
import { MemoryBackend } from './backends';
import { persistReview } from './persistReview';
import { framesToPoseTrack, POSE_LANDMARKS } from './poseTrack';
import { MediaStore } from './store';
import type { Frame } from '../swing';

const frame = (t: number, x = 0.5): Frame => ({ t, lm: Array.from({ length: POSE_LANDMARKS }, (_, k) => ({ x: x + k * 0.001, y: 0.4, z: 0, v: 0.9 })) });
const frames = Array.from({ length: 75 }, (_, i) => frame(7000 + (i * 1000) / 30));
const input = (over = {}) => ({ file: new Blob([new Uint8Array(1000)], { type: 'video/mp4' }), frames, hz: 30, video: { durationMs: 20000, w: 1080, h: 1920 }, sessionId: 's1', result: { times: { address: 7000, top: 7600, impact: 8000 } }, ...over });

describe('persistReview (F3.1)', () => {
  it('guarda 1 video y 1 pista de postura enlazados, y la pista pesa menos de 200 KB', async () => {
    const be = new MemoryBackend(), st = new MediaStore(be);
    const out = await persistReview(st, input());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(await st.listRefs()).toHaveLength(1);
    const track = await st.loadPoseTrack(out.ids.poseTrackId!);
    expect(track).toMatchObject({ sourceId: out.ids.mediaId, hz: 30 });
    expect(track!.t).toHaveLength(75);
    const poseBytes = (await be.list()).find((e) => e.id === out.ids.poseTrackId)!.bytes;
    expect(poseBytes).toBeLessThan(200 * 1024);
    const ref = await st.getRef(out.ids.mediaId!);
    expect(ref).toMatchObject({ kind: 'source', sessionId: 's1', w: 1080, h: 1920, clock: { fpsSource: 'estimated' } });
  });

  it('si falla guardar la pista, no queda el video a medias y avisa en español', async () => {
    const be = new MemoryBackend(), st = new MediaStore(be);
    const orig = be.putBlob.bind(be);
    let n = 0;
    be.putBlob = async (id, b) => { if (++n === 2) throw new Error('boom'); return orig(id, b); };
    const out = await persistReview(st, input());
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.message).toMatch(/guardar videos|espacio/);
    expect(await be.list()).toEqual([]);
  });

  it('framesToPoseTrack omite cuadros incompletos y conserva los puntos', () => {
    const bad: Frame = { t: 1, lm: [] };
    const tr = framesToPoseTrack([frame(200), bad, frame(100)], 'm_x', 30);
    expect(Array.from(tr.t)).toEqual([100, 200]);                       // ordenada y sin el incompleto
    expect(tr.lm[0]).toBeCloseTo(0.5, 6);
    expect(tr.lm[2]).toBeCloseTo(0.9, 6); expect(tr.lm[3]).toBeCloseTo(0.9, 6); // visibilidad y presencia
  });
});
