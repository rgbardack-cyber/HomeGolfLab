import { makeClock, type Clock } from './media/clock';
import { estimateFps, type FrameSample } from './reviewPlayer';

/** Una pasada de medición: reproducción muda a 0,5× durante `ms` y vuelta a pausa. */
async function sampleOnce(v: HTMLVideoElement, ms: number): Promise<number | null> {
  const samples: FrameSample[] = [];
  let id = 0, on = true;
  const cb = (_n: number, m: VideoFrameCallbackMetadata) => {
    if (!on) return;
    samples.push({ mediaTime: m.mediaTime, presentedFrames: m.presentedFrames });
    id = v.requestVideoFrameCallback(cb);
  };
  id = v.requestVideoFrameCallback(cb);
  const was = v.playbackRate;
  v.playbackRate = 0.5;
  try { await v.play(); await new Promise((res) => setTimeout(res, ms)); } catch { /* sin reproducción automática */ }
  on = false; v.cancelVideoFrameCallback(id); v.pause(); v.playbackRate = was;
  return estimateFps(samples);
}

/**
 * Mide los cuadros por segundo reales de un `<video>` ya cargado con una reproducción muda a 0,5× (≈0,9 s) y vuelve a pausa.
 * Si la primera pasada no da evidencia suficiente (el arranque del decodificador salta cuadros) se repite una vez más larga.
 * Devuelve el reloj corregido, o el mismo si no hay evidencia o si ya viene del archivo/usuario. (Misma técnica que `VideoReview`, F3.3.)
 */
export async function probeClock(v: HTMLVideoElement, clock: Clock): Promise<Clock> {
  if (clock.fpsSource !== 'estimated' || typeof v.requestVideoFrameCallback !== 'function') return clock;
  const f = (await sampleOnce(v, 900)) ?? (await sampleOnce(v, 1600));
  return f ? makeClock({ ...clock, fpsNominal: f, fpsSource: 'estimated' }) : clock;
}
