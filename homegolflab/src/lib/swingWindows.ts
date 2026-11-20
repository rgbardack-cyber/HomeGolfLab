/**
 * Todas las ventanas de swing de un video (F3.5, cierra #10). `findSwingWindow` devuelve solo la del ÚLTIMO swing; aquí se
 * repite sobre los cuadros anteriores a cada ventana para listar los demás (práctica y real). No cambia `findSwingWindow` ni
 * `findEvents`: la ventana por defecto es exactamente la que la app ya analizaba.
 */
import { findSwingWindow, type Frame } from './swing';

export interface SwingWindow {
  /** Ventana de muestreo fino (ms de video): 0,9 s antes del inicio hasta 0,7 s después del impacto. */
  from: number; to: number;
  /** Posición cronológica (0 = el primero). */
  index: number;
  /** La que la app analiza por defecto (la última). */
  isDefault: boolean;
}

/** Margen que se deja al buscar hacia atrás: la ventana siguiente no debe solaparse con la anterior. */
const GAP_MS = 100;

export function swingWindows(coarse: Frame[], opts: { aspect?: number } = {}, max = 6): SwingWindow[] {
  const found: { from: number; to: number }[] = [];
  let pool = coarse;
  while (found.length < max) {
    const w = findSwingWindow(pool, opts);
    if (!w) break;
    found.unshift({ from: w.from, to: w.to });
    const before = pool.filter((f) => f.t < w.from - GAP_MS);
    if (before.length < 8 || before.length === pool.length) break;
    pool = before;
  }
  return found.map((w, i) => ({ ...w, index: i, isDefault: i === found.length - 1 }));
}
