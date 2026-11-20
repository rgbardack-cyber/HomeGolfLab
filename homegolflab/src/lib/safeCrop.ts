/**
 * Recorte seguro para la comparación (F4.2): región del cuadro fuente que deja ver el cuerpo entero y el palo en el tope.
 * Pura. Devuelve un `Rect` normalizado (0–1 sobre el cuadro mostrado) para `makeViewport(..., crop)` y si hace falta letterbox.
 *
 * Caja = unión de los landmarks con confianza ≥ CONF.hide en la ventana [from, to]
 *      + margen arriba para el palo: al menos `SHAFT_TORSOS` × largo del torso sobre las manos en el tope [PROPUESTA],
 *        o la punta de la varilla si `findShaft` la encontró (la que quede más arriba)
 *      + 5 % del ancho de la caja a cada lado.
 * Luego se amplía (centrada, sin salirse del cuadro) hasta la proporción del panel. Si no cabe, se muestra el cuadro
 * entero y el panel hace letterbox: nunca se recorta cuerpo ni palo para llenar el panel.
 */
import { POSE_LANDMARKS, type PoseTrack } from './media/poseTrack';
import { CONF } from './overlay/model';
import type { Pt2, Rect } from './overlay/viewport';
import { LMI, sampleAt } from './swingReview';

export const SHAFT_TORSOS = 1.3;
export const SIDE_MARGIN = 0.05;

export interface CropOptions {
  from: number; to: number;
  /** Instante del tope (ms de medio) para medir el margen del palo. */
  top: number;
  /** Punta de la varilla en el tope (normalizada), si `findShaft` la encontró. */
  shaftTip?: Pt2 | null;
  /** Proporción ancho/alto del panel (px). */
  panelAspect: number;
  /** Proporción ancho/alto del cuadro fuente (px). */
  srcAspect: number;
}
export interface CropResult { rect: Rect; letterbox: boolean; box: Rect }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function safeCrop(track: PoseTrack, o: CropOptions): CropResult | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
  let topIdx = -1, bestD = Infinity;
  for (let i = 0; i < track.t.length; i++) {
    const t = track.t[i];
    const d = Math.abs(t - o.top);
    if (d < bestD) { bestD = d; topIdx = i; }
    if (t < o.from || t > o.to) continue;
    for (const p of sampleAt(track, i).slice(0, POSE_LANDMARKS)) {
      if (p.conf < CONF.hide) continue;
      any = true;
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
  }
  if (!any) return null;
  // Margen arriba para el palo, medido en el tope.
  if (topIdx >= 0) {
    const s = sampleAt(track, topIdx);
    const hands = [s[LMI.L_WRIST], s[LMI.R_WRIST]].filter((p) => p.conf >= CONF.hide);
    const sh = [s[LMI.L_SHOULDER], s[LMI.R_SHOULDER]], hp = [s[LMI.L_HIP], s[LMI.R_HIP]];
    if (hands.length && sh.every((p) => p.conf >= CONF.hide) && hp.every((p) => p.conf >= CONF.hide)) {
      const torso = Math.hypot((sh[0].x + sh[1].x) / 2 - (hp[0].x + hp[1].x) / 2, (sh[0].y + sh[1].y) / 2 - (hp[0].y + hp[1].y) / 2);
      const handY = Math.min(...hands.map((p) => p.y));
      y0 = Math.min(y0, handY - SHAFT_TORSOS * torso);
    }
  }
  if (o.shaftTip) { y0 = Math.min(y0, o.shaftTip.y); x0 = Math.min(x0, o.shaftTip.x); x1 = Math.max(x1, o.shaftTip.x); }
  const side = (x1 - x0) * SIDE_MARGIN;
  x0 -= side; x1 += side;
  // Si la caja sale del cuadro, el palo o el cuerpo quedan cortados por la propia imagen: se limita y no se inventa.
  const box: Rect = { x: clamp01(x0), y: clamp01(y0), w: 0, h: 0 };
  box.w = clamp01(x1) - box.x; box.h = clamp01(y1) - box.y;
  if (!(box.w > 0 && box.h > 0)) return null;
  // Ampliar hasta la proporción del panel (en píxeles), centrada.
  let w = box.w, h = box.h;
  const boxAspect = (w * o.srcAspect) / h;
  if (boxAspect < o.panelAspect) w = (h * o.panelAspect) / o.srcAspect; else h = (w * o.srcAspect) / o.panelAspect;
  if (w > 1 + 1e-9 || h > 1 + 1e-9) return { rect: { x: 0, y: 0, w: 1, h: 1 }, letterbox: true, box };
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const x = Math.min(1 - w, Math.max(0, cx - w / 2)), y = Math.min(1 - h, Math.max(0, cy - h / 2));
  return { rect: { x, y, w, h }, letterbox: false, box };
}
