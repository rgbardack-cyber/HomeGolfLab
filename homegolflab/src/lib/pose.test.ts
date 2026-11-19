import { describe, expect, it } from 'vitest';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { detectResilient } from './pose';

const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
const fake = (detect: () => unknown) => ({ detectForVideo: detect } as unknown as PoseLandmarker);
const video = {} as HTMLVideoElement;

describe('detección con respaldo a CPU', () => {
  it('si el GPU aborta al detectar, rehace el modelo en CPU y reintenta ese cuadro', async () => {
    let gpuCalls = 0, reloads = 0;
    const gpu = fake(() => { gpuCalls++; throw new Error('GPU aborted'); });
    const cpu = fake(() => ({ landmarks: [lm], worldLandmarks: [] }));
    const r = await detectResilient(gpu, video, 1234, async () => { reloads++; return cpu; });
    expect(gpuCalls).toBe(1);
    expect(reloads).toBe(1);
    expect(r.pose).toBe(cpu); // el modelo nuevo es el que se sigue usando
    expect(r.frame?.t).toBe(1234);
    expect(r.frame?.lm).toHaveLength(33);
  });
  it('si el modelo funciona no se rehace nada', async () => {
    let reloads = 0;
    const ok = fake(() => ({ landmarks: [lm], worldLandmarks: [] }));
    const r = await detectResilient(ok, video, 5, async () => { reloads++; return ok; });
    expect(reloads).toBe(0);
    expect(r.pose).toBe(ok);
    expect(r.frame).not.toBeNull();
  });
  it('si ni la CPU puede, el error sale en vez de ocultarse', async () => {
    const bad = () => fake(() => { throw new Error('sin modelo'); });
    await expect(detectResilient(bad(), video, 1, async () => bad())).rejects.toThrow('sin modelo');
  });
});
