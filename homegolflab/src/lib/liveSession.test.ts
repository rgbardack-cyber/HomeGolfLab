import { describe, expect, it } from 'vitest';
import { drainLiveSwings, liveSessionPayload } from './liveSession';
import type { SwingResult } from './swing';

const sw = (score: number, tempoRatio = 3): SwingResult => ({ score, metrics: { tempoRatio } } as unknown as SwingResult);

describe('sesión en vivo (#18: no guardar dos veces ni arrastrar swings)', () => {
  it('sin swings no hay nada que guardar', () => {
    expect(liveSessionPayload([])).toBeNull();
    expect(drainLiveSwings({ current: [] })).toBeNull();
  });

  it('guarda el mejor swing y la cuenta', () => {
    const p = liveSessionPayload([sw(60), sw(82, 2.8), sw(70)]);
    expect(p).toMatchObject({ type: 'swing', live: true, score: 82, tempoRatio: 2.8, shots: 3 });
  });

  it('es idempotente: dos cierres seguidos (doble toque) guardan una sola vez', () => {
    const ref = { current: [sw(75), sw(80)] };
    expect(drainLiveSwings(ref)?.shots).toBe(2);
    expect(drainLiveSwings(ref)).toBeNull();
    expect(ref.current).toEqual([]);
  });

  it('una sesión nueva empieza vacía: no arrastra la anterior', () => {
    const ref = { current: [sw(90)] };
    drainLiveSwings(ref);
    ref.current = [sw(50), ...ref.current];
    expect(drainLiveSwings(ref)).toMatchObject({ score: 50, shots: 1 });
  });
});
