import { describe, expect, it } from 'vitest';
import { seekVideo, type SeekableVideo } from './videoSeek';

/** Video falso: `seekMs` = lo que tarda en llegar 'seeked' (null = nunca); `seeking` = si el navegador sigue saltando. */
function fakeVideo(seekMs: number | null, seeking: boolean): SeekableVideo {
  const fns = new Set<() => void>();
  const v: SeekableVideo = {
    currentTime: 0, seeking, readyState: 4,
    addEventListener: (t, f) => { if (t === 'seeked') fns.add(f); },
    removeEventListener: (t, f) => { if (t === 'seeked') fns.delete(f); },
  };
  let t = 0;
  Object.defineProperty(v, 'currentTime', {
    get: () => t,
    set: (n: number) => { t = n; if (seekMs !== null) setTimeout(() => { v.seeking = false; [...fns].forEach((f) => f()); }, seekMs); },
  });
  return v;
}

describe('salto de cuadro del video', () => {
  it('con el equipo cargado espera más si el navegador sigue saltando, en vez de dar "no se pudo leer"', async () => {
    // Espera de 20 ms y el salto tarda 50 ms: antes fallaba a los 20; ahora se espera hasta 3 × 20 más.
    await expect(seekVideo(fakeVideo(50, true), 5, 20)).resolves.toBeUndefined();
  });
  it('si no estaba saltando (video colgado) falla de inmediato, sin la espera extra', async () => {
    const t0 = Date.now();
    await expect(seekVideo(fakeVideo(null, false), 5, 30)).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(80);
  });
  it('si el salto nunca termina, falla tras la espera extra', async () => {
    await expect(seekVideo(fakeVideo(null, true), 5, 15)).rejects.toThrow();
  });
  it('un salto rápido termina enseguida', async () => {
    await expect(seekVideo(fakeVideo(1, true), 5, 20)).resolves.toBeUndefined();
  });
});
