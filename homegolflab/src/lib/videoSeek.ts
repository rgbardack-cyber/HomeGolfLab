/** Lo mínimo de un <video> que usa `seekVideo` (así se prueba sin navegador). */
export interface SeekableVideo {
  currentTime: number;
  seeking: boolean;
  readyState: number;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

export const SEEK_WAIT_MS = 8000;

function seekOnce(v: SeekableVideo, sec: number, ms: number, assign: boolean): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const clean = () => { clearTimeout(timer); v.removeEventListener('seeked', ok); v.removeEventListener('error', bad); };
    const ok = () => { clean(); resolve(); };
    const bad = () => { clean(); reject(new Error('error')); };
    const timer = setTimeout(() => { clean(); reject(new Error('timeout')); }, ms);
    v.addEventListener('seeked', ok);
    v.addEventListener('error', bad);
    if (!assign) return;
    if (Math.abs(v.currentTime - sec) < 1e-3 && !v.seeking && v.readyState >= 2) { clean(); resolve(); return; }
    v.currentTime = sec;
  });
}

/**
 * Salta a `sec` y espera a 'seeked'. Con el equipo cargado un salto puede tardar más de 8 s sin que el video esté mal
 * (daba falsos "No se pudo leer el video"): si al vencer la espera el navegador sigue saltando, se espera el triple una vez
 * más; si no estaba saltando (video colgado o con error) falla de inmediato.
 */
export function seekVideo(v: SeekableVideo, sec: number, ms = SEEK_WAIT_MS): Promise<void> {
  return seekOnce(v, sec, ms, true).catch((e) => {
    if (!v.seeking) throw e;
    return seekOnce(v, sec, ms * 3, false);
  });
}
