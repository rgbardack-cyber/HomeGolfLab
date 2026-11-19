import { describe, expect, it } from 'vitest';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { createLiveDetector, detectResilient, PoseFailure } from './pose';

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

describe('detector en vivo (#20)', () => {
  const bad = () => fake(() => { throw new Error('abortó'); });
  const good = () => fake(() => ({ landmarks: [lm], worldLandmarks: [] }));

  it('si el GPU aborta en vivo, se rehace en CPU y el cuadro se recupera (antes el modo en vivo se congelaba)', async () => {
    let reloads = 0;
    const cpu = good();
    const det = createLiveDetector(bad(), async () => { reloads++; return cpu; });
    const f = await det(video, 10);
    expect(reloads).toBe(1);
    expect(f?.t).toBe(10);
  });

  it('corta con PoseFailure tras 3 fallos seguidos, no antes', async () => {
    const det = createLiveDetector(bad(), async () => bad());
    expect(await det(video, 1)).toBeNull();
    expect(await det(video, 2)).toBeNull();
    await expect(det(video, 3)).rejects.toBeInstanceOf(PoseFailure);
  });

  it('un cuadro bueno reinicia la cuenta de fallos', async () => {
    let n = 0;
    const flaky = fake(() => { n++; if (n === 1 || n === 2 || n === 4 || n === 5) throw new Error('x'); return { landmarks: [lm], worldLandmarks: [] }; });
    // reload devuelve el mismo modelo "flaky", así que el reintento tras el fallo cuenta como otra llamada
    const det = createLiveDetector(flaky, async () => flaky);
    expect(await det(video, 1)).toBeNull();      // llamadas 1 y 2 fallan -> fallo 1
    expect((await det(video, 2))?.t).toBe(2);    // llamada 3 bien -> reinicia
    expect(await det(video, 3)).toBeNull();      // llamadas 4 y 5 fallan -> fallo 1 otra vez (no 2)
    expect(await det(video, 4)).not.toBeNull();  // llamada 6 bien
  });
});
