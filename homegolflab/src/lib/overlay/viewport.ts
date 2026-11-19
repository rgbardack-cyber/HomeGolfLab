/**
 * Vista y proyección (plan 4.2). Coordenadas normalizadas 0–1 sobre el CUADRO MOSTRADO (rotación aplicada, sin
 * letterbox ni recorte), origen arriba-izquierda, y hacia abajo. `project` convierte a píxeles del destino y es
 * la MISMA función para la vista previa y la exportación.
 */
export interface Pt2 { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface Viewport {
  srcW: number; srcH: number;
  /** Rectángulo del destino (px) donde cae el contenido visible. */
  dstRect: Rect;
  /** Región del cuadro fuente que se muestra, normalizada 0–1; sin ella, el cuadro entero. */
  crop?: Rect;
}

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

/** Rectángulo de `contentW×contentH` que cabe entero (letterbox, centrado) dentro de `box`. */
export function containRect(contentW: number, contentH: number, box: Rect): Rect {
  if (!(contentW > 0 && contentH > 0 && box.w > 0 && box.h > 0)) throw new RangeError('tamaños inválidos');
  const k = Math.min(box.w / contentW, box.h / contentH);
  const w = contentW * k, h = contentH * k;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Vista de un cuadro de `srcW×srcH` (o de su `crop`) ajustada con letterbox dentro de `box`. */
export function makeViewport(srcW: number, srcH: number, box: Rect, crop?: Rect): Viewport {
  if (!(srcW > 0 && srcH > 0)) throw new RangeError('srcW y srcH deben ser positivos');
  if (crop && !(crop.w > 0 && crop.h > 0)) throw new RangeError('el recorte debe tener tamaño positivo');
  const c = crop ?? FULL;
  return { srcW, srcH, dstRect: containRect(c.w * srcW, c.h * srcH, box), ...(crop ? { crop } : {}) };
}

/** Normalizado del cuadro fuente → píxeles del destino. */
export function project(p: Pt2, vp: Viewport): Pt2 {
  const c = vp.crop ?? FULL, d = vp.dstRect;
  return { x: d.x + ((p.x - c.x) / c.w) * d.w, y: d.y + ((p.y - c.y) / c.h) * d.h };
}

/** Píxeles del destino → normalizado del cuadro fuente (inversa de `project`). */
export function unproject(px: Pt2, vp: Viewport): Pt2 {
  const c = vp.crop ?? FULL, d = vp.dstRect;
  return { x: c.x + ((px.x - d.x) / d.w) * c.w, y: c.y + ((px.y - d.y) / d.h) * c.h };
}

/** ¿El punto normalizado cae dentro de la región visible? (con un margen opcional, en normalizado) */
export function inView(p: Pt2, vp: Viewport, margin = 0): boolean {
  const c = vp.crop ?? FULL;
  return p.x >= c.x - margin && p.x <= c.x + c.w + margin && p.y >= c.y - margin && p.y <= c.y + c.h + margin;
}

/** Escala de pantalla `u` (plan 4.2): grosores y distancias se expresan en múltiplos de u = max(dstW, dstH)/320. */
export const screenUnit = (vp: Viewport): number => Math.max(vp.dstRect.w, vp.dstRect.h) / 320;
