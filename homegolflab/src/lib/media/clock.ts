/**
 * Tiempo y cuadros de un video (plan 4.1).
 *
 * `MediaMs` es el tiempo del video FUENTE tal como lo reporta el decodificador (v.currentTime·1000 tras 'seeked',
 * o VideoFrame.timestamp/1000). Las marcas guardadas son siempre `MediaMs` del archivo fuente más su número de cuadro.
 *
 * Regla: toda medida en SEGUNDOS REALES (bajada del swing, ventana de 0,3 s del tracker, `maxFollowMs`, tempo)
 * usa `realMs`/`realDeltaMs`, no la diferencia de `MediaMs`. Un clip a media velocidad se carga con
 * `fpsNominal 30` y `timeScale 0.5`: cada paso de 1/30 s de medio toca un cuadro original de 60 fps y los
 * umbrales siguen en tiempo real.
 */
export type MediaMs = number;

export interface Clock {
  /** Cuadros por segundo de medio: 30, 60 u otro, del contenedor o del usuario. */
  fpsNominal: number;
  fpsSource: 'container' | 'user' | 'estimated';
  /** 1 = tiempo real; 0,5 = media velocidad (1 s de medio = 0,5 s reales). */
  timeScale: number;
  /** Marca del primer cuadro (listas de edición del contenedor). */
  firstFrameMs: MediaMs;
}

export function makeClock(p: { fpsNominal: number; fpsSource?: Clock['fpsSource']; timeScale?: number; firstFrameMs?: MediaMs }): Clock {
  const c: Clock = { fpsNominal: p.fpsNominal, fpsSource: p.fpsSource ?? 'container', timeScale: p.timeScale ?? 1, firstFrameMs: p.firstFrameMs ?? 0 };
  if (!(Number.isFinite(c.fpsNominal) && c.fpsNominal > 0)) throw new RangeError('fpsNominal debe ser un número positivo');
  if (!(Number.isFinite(c.timeScale) && c.timeScale > 0)) throw new RangeError('timeScale debe ser un número positivo');
  if (!Number.isFinite(c.firstFrameMs)) throw new RangeError('firstFrameMs debe ser finito');
  return c;
}

/** Número de cuadro (0 = primero) del instante `t` de medio. */
export const frameOf = (c: Clock, t: MediaMs): number => Math.round(((t - c.firstFrameMs) * c.fpsNominal) / 1000);

/** Instante de medio del cuadro `n` (inversa de `frameOf` en los instantes exactos de cuadro). */
export const msOfFrame = (c: Clock, n: number): MediaMs => c.firstFrameMs + (n * 1000) / c.fpsNominal;

/** Milisegundos REALES desde el primer cuadro hasta `t`. */
export const realMs = (c: Clock, t: MediaMs): number => (t - c.firstFrameMs) * c.timeScale;

/** Milisegundos REALES entre dos instantes de medio. */
export const realDeltaMs = (c: Clock, a: MediaMs, b: MediaMs): number => (b - a) * c.timeScale;

/** Duración de un cuadro: en medio y en tiempo real. */
export const frameDurationMs = (c: Clock): number => 1000 / c.fpsNominal;
export const realFrameDurationMs = (c: Clock): number => (1000 / c.fpsNominal) * c.timeScale;

/** Instante de medio que queda `ms` milisegundos REALES después de `t`. */
export const addRealMs = (c: Clock, t: MediaMs, ms: number): MediaMs => t + ms / c.timeScale;
