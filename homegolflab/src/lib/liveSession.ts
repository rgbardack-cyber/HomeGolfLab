import type { SwingResult } from './swing';

/** Datos de la sesión en vivo que se guarda al terminar (el mejor swing y cuántos hubo). */
export interface LiveSessionPayload {
  type: 'swing';
  live: true;
  score: number;
  tempoRatio: number;
  swing: SwingResult;
  shots: number;
}

export function liveSessionPayload(list: SwingResult[]): LiveSessionPayload | null {
  if (!list.length) return null;
  const best = list.reduce((a, b) => (b.score > a.score ? b : a));
  return { type: 'swing', live: true, score: best.score, tempoRatio: best.metrics.tempoRatio, swing: best, shots: list.length };
}

/**
 * Cierra la sesión en vivo: devuelve lo que hay que guardar y VACÍA la lista, de modo que un segundo
 * llamado (doble toque en "Terminar", o terminar y volver a iniciar) no guarda lo mismo otra vez
 * ni arrastra los swings de la sesión anterior (#18).
 */
export function drainLiveSwings(ref: { current: SwingResult[] }): LiveSessionPayload | null {
  const list = ref.current;
  ref.current = [];
  return liveSessionPayload(list);
}
