/**
 * Lógica pura del reproductor de revisión (F3.3): marcas de fase, paso de cuadro y estimación de fps. Sin DOM.
 * Las marcas guardadas son siempre `MediaMs` del archivo fuente más su número de cuadro (plan 4.1).
 */
import { frameDurationMs, frameOf, msOfFrame, type Clock, type MediaMs } from './media/clock';

export type PhaseKey = 'address' | 'top' | 'impact' | 'finish';
export const PHASE_KEYS: readonly PhaseKey[] = ['address', 'top', 'impact', 'finish'];
export const PHASE_LABEL: Record<PhaseKey, string> = { address: 'Inicio', top: 'Tope', impact: 'Impacto', finish: 'Final' };
export const SPEEDS = [1, 0.5, 0.25] as const;
export type Speed = (typeof SPEEDS)[number];
export const SPEED_LABEL: Record<Speed, string> = { 1: '1×', 0.5: '0,5×', 0.25: '0,25×' };

/** Por debajo de esta confianza una fase lleva el aviso "Revisa esta fase" (plan 4.3). */
export const PHASE_CONF_REVIEW = 0.5;

export interface PhaseMark { key: PhaseKey; t: MediaMs; frame: number; source: 'auto' | 'manual'; conf?: number }

/**
 * Marcas de las tres fases a partir de los tiempos del análisis y de los ajustes manuales del usuario (que mandan).
 * `times` son MediaMs del archivo fuente; el cuadro se calcula con el reloj.
 */
export function phaseMarks(
  clock: Clock, times: { address: MediaMs; top: MediaMs; impact: MediaMs; finish?: MediaMs }, manual: Partial<Record<PhaseKey, MediaMs>> = {}, conf: Partial<Record<PhaseKey, number>> = {},
): PhaseMark[] {
  // El final es opcional: solo hay marca si el análisis lo encontró (o el usuario lo puso a mano).
  return PHASE_KEYS.filter((key) => times[key] !== undefined || manual[key] !== undefined).map((key) => {
    const isManual = manual[key] !== undefined;
    const t = (manual[key] ?? times[key]) as MediaMs;
    return { key, t, frame: frameOf(clock, t), source: isManual ? 'manual' : 'auto', ...(conf[key] !== undefined ? { conf: conf[key] } : {}) };
  });
}

/**
 * Instante al que hay que hacer `seek` para MOSTRAR el cuadro `n`: dentro del intervalo de ese cuadro (a ~40 % de su
 * duración), no en su borde exacto, donde un redondeo del navegador puede enseñar el cuadro anterior.
 */
export const seekTimeForFrame = (c: Clock, n: number): MediaMs => msOfFrame(c, n) + frameDurationMs(c) * 0.4;

/** Instante de seek del cuadro de la fase. */
export const seekTimeForMark = (c: Clock, m: PhaseMark): MediaMs => seekTimeForFrame(c, m.frame);

/** Cuadro `dir` posiciones después (o antes) del que se muestra en `t`, sin salirse de [0, lastFrame]. */
export function stepFrame(c: Clock, t: MediaMs, dir: number, lastFrame = Infinity): number {
  return Math.min(lastFrame, Math.max(0, frameOf(c, t) + dir));
}

/** Mueve una marca `dir` cuadros (±1): queda marcada como ajustada por el usuario. */
export function nudgeMark(c: Clock, m: PhaseMark, dir: number, lastFrame = Infinity): PhaseMark {
  const frame = Math.min(lastFrame, Math.max(0, m.frame + dir));
  return { ...m, frame, t: msOfFrame(c, frame), source: 'manual' };
}

/** La marca debe mantener el orden inicio < tope < impacto: devuelve las marcas o null si el ajuste lo rompe. */
export function validOrder(marks: readonly PhaseMark[]): boolean {
  const f = Object.fromEntries(marks.map((m) => [m.key, m.frame])) as Partial<Record<PhaseKey, number>>;
  return f.address! < f.top! && f.top! < f.impact! && (f.finish === undefined || f.impact! < f.finish);
}

export const needsReview = (m: PhaseMark): boolean => m.conf !== undefined && m.conf < PHASE_CONF_REVIEW;

/* ───────────────────────── fps desde requestVideoFrameCallback ───────────────────────── */

export interface FrameSample { mediaTime: number; presentedFrames: number }
const COMMON_FPS = [24, 25, 30, 48, 50, 60, 120] as const;

/**
 * Estima los cuadros por segundo del archivo con las muestras de `requestVideoFrameCallback` (mediaTime en segundos y
 * `presentedFrames`): solo cuentan pares con un cuadro presentado de diferencia (si el navegador se saltó cuadros, ese par
 * no sirve). Devuelve el fps común más cercano (±6 %) o null si no hay evidencia suficiente. Es una ESTIMACIÓN: el usuario
 * puede confirmarla o corregirla.
 */
export function estimateFps(samples: readonly FrameSample[]): number | null {
  const d: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].mediaTime - samples[i - 1].mediaTime;
    if (samples[i].presentedFrames - samples[i - 1].presentedFrames === 1 && dt > 0.003 && dt < 0.2) d.push(dt);
  }
  if (d.length < 4) return null;
  d.sort((a, b) => a - b);
  const fps = 1 / d[d.length >> 1];
  const best = COMMON_FPS.reduce((a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a));
  return Math.abs(best - fps) / best <= 0.06 ? best : null;
}
