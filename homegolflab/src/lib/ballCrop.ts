/**
 * Análisis de la bola en un RECORTE a resolución nativa (plan F5.3). A 640 px de ancho una bola de 3 px de diámetro en un
 * video de 1920 queda en 1 px y el tracker (`minArea` 4) no la ve; recortando alrededor de la región de búsqueda (ROI)
 * a resolución nativa conserva sus píxeles. Todo es puro (sin DOM): el que llama lee los píxeles del video y esto decide
 * qué recorte pedir, normaliza el contraste en una COPIA (el cuadro original no se toca) y devuelve las coordenadas al
 * cuadro completo, que son las que se guardan (plan 4.2).
 */
import type { Gray, P2, Roi } from './ballflight';

/** Lado máximo (px) de un recorte nativo: acota el costo de los componentes conectados. */
export const MAX_CROP_SIDE = 480;

export interface CropRect { x0: number; y0: number; w: number; h: number }

/**
 * Recorte nativo para una ROI dada en píxeles de ANÁLISIS (`analysisW × analysisH`, el tamaño al que corre el tracker):
 * se escala a píxeles nativos, se limita a `MAX_CROP_SIDE` (centrado en la ROI) y al cuadro. `null` si queda vacío.
 */
export function nativeCropFor(roi: Roi, analysis: { w: number; h: number }, native: { w: number; h: number }): CropRect | null {
  const kx = native.w / analysis.w, ky = native.h / analysis.h;
  let x0 = roi.x0 * kx, x1 = roi.x1 * kx, y0 = roi.y0 * ky, y1 = roi.y1 * ky;
  if (x1 - x0 > MAX_CROP_SIDE) { const c = (x0 + x1) / 2; x0 = c - MAX_CROP_SIDE / 2; x1 = c + MAX_CROP_SIDE / 2; }
  if (y1 - y0 > MAX_CROP_SIDE) { const c = (y0 + y1) / 2; y0 = c - MAX_CROP_SIDE / 2; y1 = c + MAX_CROP_SIDE / 2; }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(native.w, Math.ceil(x1)); y1 = Math.min(native.h, Math.ceil(y1));
  const w = x1 - x0, h = y1 - y0;
  return w > 0 && h > 0 ? { x0, y0, w, h } : null;
}

/** Copia del recorte `r` de una imagen en grises nativa. */
export function cropGray(g: Gray, r: CropRect): Gray {
  const data = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) {
    const src = (r.y0 + y) * g.w + r.x0;
    data.set(g.data.subarray(src, src + r.w), y * r.w);
  }
  return { data, w: r.w, h: r.h };
}

/**
 * Normalización local de contraste sobre una COPIA: resta la media local (ventana de `2·radius+1`, por imagen integral) y
 * reescala para que el desvío típico del fondo quede en ~`spread` niveles de gris, centrado en 128. Hace que una bola tenue
 * sobre un fondo de brillo distinto supere el umbral `diff` del tracker sin tocar el cuadro original. Con fondo plano no cambia nada.
 */
export function normalizeLocalContrast(g: Gray, radius = 12, spread = 40): Gray {
  const { w, h } = g;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g.data[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  // Desvío global de la imagen respecto de su media local: escala común para todo el recorte.
  const meanAt = (x: number, y: number) => {
    const xa = Math.max(0, x - radius), xb = Math.min(w, x + radius + 1), ya = Math.max(0, y - radius), yb = Math.min(h, y + radius + 1);
    const sum = integral[yb * (w + 1) + xb] - integral[ya * (w + 1) + xb] - integral[yb * (w + 1) + xa] + integral[ya * (w + 1) + xa];
    return sum / ((xb - xa) * (yb - ya));
  };
  let acc = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = g.data[y * w + x] - meanAt(x, y); acc += d * d; }
  const sd = Math.sqrt(acc / (w * h));
  const k = sd > 1e-6 ? Math.min(8, spread / Math.max(sd, 1)) : 1;       // acotado: no amplificar ruido sin límite
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = Math.max(0, Math.min(255, Math.round(128 + (g.data[y * w + x] - meanAt(x, y)) * k)));
  return { data: out, w, h };
}

/** Un punto del recorte (px) → coordenadas normalizadas 0–1 del cuadro COMPLETO. */
export const cropToFull = (p: P2, r: CropRect, native: { w: number; h: number }): P2 => ({ x: (r.x0 + p.x) / native.w, y: (r.y0 + p.y) / native.h });

/** Un punto normalizado del cuadro completo → píxeles del recorte (para sembrar el tracker con el toque). */
export const fullToCrop = (p: P2, r: CropRect, native: { w: number; h: number }): P2 => ({ x: p.x * native.w - r.x0, y: p.y * native.h - r.y0 });

/** Reducción por promedio de bloques (lo que hace el análisis a ~640 px); sirve para comparar con el recorte nativo en pruebas. */
export function downscaleGray(g: Gray, w: number, h: number): Gray {
  const out = new Uint8Array(w * h);
  const kx = g.w / w, ky = g.h / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xa = Math.floor(x * kx), xb = Math.max(xa + 1, Math.floor((x + 1) * kx)), ya = Math.floor(y * ky), yb = Math.max(ya + 1, Math.floor((y + 1) * ky));
    let s = 0, n = 0;
    for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) { s += g.data[yy * g.w + xx]; n++; }
    out[y * w + x] = s / n;
  }
  return { data: out, w, h };
}
