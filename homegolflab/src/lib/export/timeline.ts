/**
 * Línea de tiempo de la exportación (plan 4.8, F8.2). Pura: sin DOM ni códecs. Dice, para cada instante del video exportado,
 * qué instante de la fuente se muestra (segmentos de reproducción a distinta velocidad y pausas), y dónde cae el impacto
 * para colocar el audio en el instante exacto aunque la imagen vaya lenta.
 *
 * Tiempos: `MediaMs` es el de la fuente; los de la línea exportada se llaman `exportMs`. La plantilla de comparación usa el reloj
 * maestro A: `Segment.sources` lleva los ids y el renderizador mapea B con `buildWarp`.
 */
import type { MediaMs } from '../media/clock';

export type PlaySpeed = 1 | 0.5 | 0.25;
export type Segment =
  | { kind: 'play'; sources: string[]; fromMs: MediaMs; toMs: MediaMs; speed: PlaySpeed; label?: string }
  | { kind: 'hold'; sources: string[]; atMs: MediaMs; durMs: number; label?: string };

/** Duración máxima de una exportación (plan 4.8). */
export const MAX_EXPORT_MS = 60_000;
export const FADE_MS = 30;
/** Del audio original se aísla desde 150 ms antes hasta 800 ms después del inicio del impacto (plan 4.8). */
export const AUDIO_PRE_MS = 150;
export const AUDIO_POST_MS = 800;

export interface TimelineSegment { seg: Segment; startMs: number; endMs: number }
export interface Timeline { segments: TimelineSegment[]; totalMs: number }

export const segmentDurationMs = (s: Segment): number => (s.kind === 'hold' ? s.durMs : (s.toMs - s.fromMs) / s.speed);

/** Valida y coloca los segmentos uno tras otro. Lanza `RangeError` si alguno es inválido (duración ≤ 0 o rango invertido). */
export function buildTimeline(segments: readonly Segment[]): Timeline {
  let t = 0;
  const out: TimelineSegment[] = segments.map((seg) => {
    const d = segmentDurationMs(seg);
    if (!(d > 0) || !Number.isFinite(d)) throw new RangeError('segmento con duración inválida');
    const r = { seg, startMs: t, endMs: t + d };
    t += d;
    return r;
  });
  return { segments: out, totalMs: t };
}

export const fitsLimit = (tl: Timeline): boolean => tl.totalMs <= MAX_EXPORT_MS + 1e-6;

export interface FrameSource { index: number; srcMs: MediaMs; held: boolean; sources: string[] }

/** Qué se muestra en `exportMs` (0 ≤ exportMs < total). En el límite entre dos segmentos manda el siguiente. */
export function sourceAt(tl: Timeline, exportMs: number): FrameSource | null {
  if (!(exportMs >= 0) || exportMs >= tl.totalMs - 1e-9) return null;
  // Búsqueda lineal: hay pocos segmentos.
  let i = tl.segments.findIndex((s) => exportMs < s.endMs - 1e-9);
  if (i < 0) i = tl.segments.length - 1;
  const { seg, startMs } = tl.segments[i];
  if (seg.kind === 'hold') return { index: i, srcMs: seg.atMs, held: true, sources: seg.sources };
  return { index: i, srcMs: seg.fromMs + (exportMs - startMs) * seg.speed, held: false, sources: seg.sources };
}

/** Número de cuadros de salida a `fps` (redondeado al más cercano, mínimo 1). */
export const frameCount = (tl: Timeline, fps: number): number => Math.max(1, Math.round((tl.totalMs * fps) / 1000));

/** Instante exportado del cuadro `n`. */
export const exportMsOfFrame = (n: number, fps: number): number => (n * 1000) / fps;

/**
 * Primer `exportMs` en que se muestra el instante `srcMs` de la fuente (en una reproducción, cuando se alcanza; en una pausa,
 * donde empieza). `null` si la línea no lo muestra. Sirve para ubicar el impacto exportado.
 */
export function exportTimeOfSource(tl: Timeline, srcMs: MediaMs): number | null {
  for (const { seg, startMs } of tl.segments) {
    if (seg.kind === 'hold') { if (Math.abs(seg.atMs - srcMs) < 1e-6) return startMs; continue; }
    if (srcMs >= seg.fromMs - 1e-6 && srcMs <= seg.toMs + 1e-6) return startMs + (srcMs - seg.fromMs) / seg.speed;
  }
  return null;
}

/* ───────────────────────── Audio ───────────────────────── */

export interface AudioCue { sourceId: string; srcFromMs: MediaMs; srcToMs: MediaMs; atExportMs: number; fadeMs: 30 }

/**
 * Corte de audio del impacto: [onset − 150, onset + 800] ms de la fuente a velocidad normal, colocado para que el inicio del
 * impacto suene en el instante en que la imagen llega al impacto (`atExportMs`), aunque la imagen vaya lenta. `null` si la línea
 * no muestra el instante del impacto, o si el corte empezaría antes de 0 en la línea exportada (se recorta el principio).
 */
export function impactAudioCue(tl: Timeline, sourceId: string, impactOnsetSrcMs: MediaMs, imageImpactSrcMs: MediaMs = impactOnsetSrcMs): AudioCue | null {
  const at = exportTimeOfSource(tl, imageImpactSrcMs);
  if (at === null) return null;
  let pre = AUDIO_PRE_MS;
  if (at - pre < 0) pre = at;                                  // no puede empezar antes del cuadro 0 de la salida
  return { sourceId, srcFromMs: impactOnsetSrcMs - pre, srcToMs: impactOnsetSrcMs + AUDIO_POST_MS, atExportMs: at - pre, fadeMs: FADE_MS };
}

/* ───────────────────────── Plantillas ───────────────────────── */

export interface SwingMarks { address: MediaMs; top: MediaMs; impact: MediaMs; finish?: MediaMs }
/** Cola tras el impacto cuando no hay fase "final" (ms de fuente a 1×). */
export const DEFAULT_TAIL_MS = 1500;
export const HOLD_MS = 1000;

/**
 * Plantilla swing / comparación: inicio (pausa 1 s) → subida 0,5× → pausa en el tope 1 s → bajada 0,25× → pausa en el impacto 1 s → final a 1×.
 * Con `sources` de dos clips es la plantilla de comparación (el reloj maestro es el primero).
 */
export function swingSegments(m: SwingMarks, sources: string[]): Segment[] {
  if (!(m.address < m.top && m.top < m.impact && (m.finish === undefined || m.impact < m.finish))) throw new RangeError('las fases deben estar en orden');
  const end = m.finish ?? m.impact + DEFAULT_TAIL_MS;
  return [
    { kind: 'hold', sources, atMs: m.address, durMs: HOLD_MS, label: 'Inicio' },
    { kind: 'play', sources, fromMs: m.address, toMs: m.top, speed: 0.5 },
    { kind: 'hold', sources, atMs: m.top, durMs: HOLD_MS, label: 'Tope' },
    { kind: 'play', sources, fromMs: m.top, toMs: m.impact, speed: 0.25 },
    { kind: 'hold', sources, atMs: m.impact, durMs: HOLD_MS, label: 'Impacto' },
    { kind: 'play', sources, fromMs: m.impact, toMs: end, speed: 1 },
  ];
}

/** Plantilla vuelo: golpe a 1× → 0,5× desde 0,2 s antes del impacto hasta el fin del trazo. */
export function flightSegments(o: { source: string; startMs: MediaMs; impactMs: MediaMs; traceEndMs: MediaMs }): Segment[] {
  const slowFrom = o.impactMs - 200;
  if (!(o.startMs < slowFrom && slowFrom < o.traceEndMs)) throw new RangeError('el impacto debe quedar entre el inicio y el fin del trazo');
  return [
    { kind: 'play', sources: [o.source], fromMs: o.startMs, toMs: slowFrom, speed: 1 },
    { kind: 'play', sources: [o.source], fromMs: slowFrom, toMs: o.traceEndMs, speed: 0.5 },
  ];
}

/**
 * 60 fps solo si la fuente es de 60 y la línea no tiene cámara lenta (plan 4.8); si no, 30. Una cámara lenta a 60 fps sobre una
 * fuente de 60 repetiría cuadros: a 30 fps de salida se ve igual de fluida y pesa la mitad.
 */
export function chooseFps(sourceFps: number, segments: readonly Segment[]): 30 | 60 {
  const slow = segments.some((s) => s.kind === 'play' && s.speed < 1);
  return sourceFps >= 59 && !slow ? 60 : 30;
}
