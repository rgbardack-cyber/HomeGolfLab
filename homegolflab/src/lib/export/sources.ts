import type { MediaMs } from '../media/clock';
import type { PoseTrack } from '../media/poseTrack';
import type { SwingResult } from '../swing';
import type { ExportSource } from './render';

type Marks = Partial<Record<'address' | 'top' | 'impact' | 'finish', MediaMs>>;

/**
 * Fases para exportar: las del análisis con los ajustes manuales del usuario por encima (mandan). `null` si faltan inicio, tope o
 * impacto o si quedan fuera de orden (no hay plantilla de swing posible).
 */
export function exportTimes(r: Pick<SwingResult, 'times'>, manual: Marks = {}): { address: MediaMs; top: MediaMs; impact: MediaMs; finish?: MediaMs } | null {
  const t = r.times;
  if (!t) return null;
  const address = manual.address ?? t.address, top = manual.top ?? t.top, impact = manual.impact ?? t.impact;
  const finish = manual.finish ?? t.finish;
  if (!(address < top && top < impact) || (finish !== undefined && !(impact < finish))) return null;
  return { address, top, impact, ...(finish !== undefined ? { finish } : {}) };
}

/** Una fuente del render a partir de un análisis guardado. */
export function swingExportSource(id: string, ref: { w: number; h: number }, track: PoseTrack | null, r: SwingResult, manual: Marks = {}, lefty?: boolean): ExportSource | null {
  const times = exportTimes(r, manual);
  if (!times) return null;
  return { id, w: ref.w, h: ref.h, track, times, lefty: lefty ?? r.lefty ?? false, view: r.view ?? 'frente' };
}
