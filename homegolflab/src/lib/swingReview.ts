/**
 * Revisión de swing en video (plan 4.4, F3.2): guías por cuadro a partir de la pista de postura de la pasada fina.
 * Todo es puro (sin DOM): la vista previa y la exportación llaman a las mismas funciones con el mismo instante.
 *
 * Definición única de las guías (plan 4.4):
 * - Cabeza: punto en el centro de las orejas (o la nariz si las orejas faltan en > 30 % de los cuadros, igual que swing.ts)
 *   y una referencia FIJA en su posición del inicio (círculo punteado). Muestra el desplazamiento, no un juicio.
 * - Torso: línea centro de hombros → centro de caderas en el cuadro actual y la del inicio, punteada.
 * - Brazo guía: hombro → codo → muñeca del lado guía (zurdo = brazo derecho). Solo de inicio a impacto.
 * - Caderas: línea entre las dos caderas, actual y del inicio.
 *
 * Confianza (4.3): de un punto = min(visibilidad, presencia). La pasada actual solo captura la visibilidad (el modelo de
 * `pose.ts` no entrega `presence` en JS), así que aquí `conf = visibilidad`. Una guía es la mínima de sus puntos y, si
 * algún punto salta más del 8 % del largo del torso respecto a la muestra anterior, queda como mucho en 0,5 (atenuada).
 */
import type { MediaMs } from './media/clock';
import { POSE_LANDMARKS, POSE_STRIDE, type PoseTrack } from './media/poseTrack';
import { CONF, type GuideItem, type GuideKind, type OverlayModel, type SkeletonPoint, type SkeletonSample } from './overlay/model';
import type { Pt2 } from './overlay/viewport';
import type { SwingView } from './swing';
import { t } from '@/i18n';

export const LMI = { NOSE: 0, L_EAR: 7, R_EAR: 8, L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24 } as const;

/** Salto máximo de un punto entre dos muestras seguidas, como fracción del largo del torso, para considerarlo estable. */
export const JUMP_FRACTION = 0.08;
/** Confianza máxima de una guía con un punto inestable. */
export const UNSTABLE_CONF = 0.5;

/* ───────────────────────── Interpolación ───────────────────────── */

/** Muestra i de la pista como puntos {x, y, conf}. */
export function sampleAt(track: PoseTrack, i: number): SkeletonPoint[] {
  const o = i * POSE_LANDMARKS * POSE_STRIDE;
  return Array.from({ length: POSE_LANDMARKS }, (_, k) => {
    const b = o + k * POSE_STRIDE;
    // canal 2 = visibilidad, canal 3 = presencia (la pasada actual guarda la visibilidad en ambos): conf = min.
    return { x: track.lm[b], y: track.lm[b + 1], conf: Math.min(track.lm[b + 2], track.lm[b + 3]) };
  });
}

/**
 * Postura en el instante `t` (ms de medio) interpolando entre las dos muestras vecinas (30/s → se muestra a 60/s).
 * Fuera del rango de la pista, o con un hueco entre muestras mayor que 1,5 periodos, devuelve la muestra más cercana si
 * está a ≤ 1 periodo, o null.
 */
export function poseAt(track: PoseTrack, t: MediaMs): SkeletonSample | null {
  const n = track.t.length;
  if (!n) return null;
  const period = 1000 / track.hz;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (track.t[mid] < t) lo = mid + 1; else hi = mid; }
  const j = lo;                                   // primera muestra con t[j] >= t
  const nearest = (k: number) => (Math.abs(track.t[k] - t) <= period ? { t, pts: sampleAt(track, k) } : null);
  if (track.t[j] === t) return { t, pts: sampleAt(track, j) };
  if (j === 0 || track.t[j] < t) return nearest(j);        // antes de la primera o después de la última
  const i = j - 1, span = track.t[j] - track.t[i];
  if (span > period * 1.5) return nearest(Math.abs(track.t[i] - t) <= Math.abs(track.t[j] - t) ? i : j);
  const k = (t - track.t[i]) / span;
  const a = sampleAt(track, i), b = sampleAt(track, j);
  return { t, pts: a.map((p, m) => ({ x: p.x + (b[m].x - p.x) * k, y: p.y + (b[m].y - p.y) * k, conf: Math.min(p.conf, b[m].conf) })) };
}

/** Todas las muestras de la pista como `SkeletonSample[]` (para el esqueleto del compositor). */
export function skeletonSamples(track: PoseTrack): SkeletonSample[] {
  return Array.from({ length: track.t.length }, (_, i) => ({ t: track.t[i], pts: sampleAt(track, i) }));
}

/* ───────────────────────── Guías ───────────────────────── */

export interface GuideSet { head: boolean; torso: boolean; leadArm: boolean; hips: boolean }

/** Guías que se encienden por defecto en cada vista (plan 4.4). */
export const DEFAULT_GUIDES: Record<SwingView, GuideSet> = {
  frente: { head: true, torso: true, leadArm: true, hips: false },
  atras: { head: true, torso: false, leadArm: true, hips: false },
};
export const GUIDE_LABEL: Record<GuideKind, string> = { head: 'Cabeza', torso: 'Torso', leadArm: 'Brazo guía', hips: 'Caderas' };
/** Etiqueta en el idioma actual. */
export const guideLabel = (k: GuideKind): string => t(`guide.${k}`);

export interface ReviewContext {
  track: PoseTrack;
  /** Mano dominante del resultado (`r.lefty`); si el usuario la cambia en la revisión se pasa la elegida. */
  lefty: boolean;
  view: SwingView;
  times: { address: MediaMs; top: MediaMs; impact: MediaMs };
}

const mid = (a: Pt2, b: Pt2): Pt2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
/** Solo las coordenadas (los ítems de guía llevan la confianza aparte, no dentro del punto). */
const xy = (p: Pt2): Pt2 => ({ x: p.x, y: p.y });
const dist = (a: Pt2, b: Pt2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Lado guía: zurdo = brazo derecho (lleva el palo adelante); diestro = brazo izquierdo. */
export const leadArmIndices = (lefty: boolean): [number, number, number] => (lefty ? [LMI.R_SHOULDER, LMI.R_ELBOW, LMI.R_WRIST] : [LMI.L_SHOULDER, LMI.L_ELBOW, LMI.L_WRIST]);

/** ¿La cabeza se sigue con las orejas? Si faltan (conf < CONF.hide) en > 30 % de las muestras, se usa la nariz (como swing.ts). */
export function headUsesNose(track: PoseTrack): boolean {
  const n = track.t.length;
  if (!n) return true;
  let miss = 0;
  for (let i = 0; i < n; i++) {
    const s = sampleAt(track, i);
    if (Math.min(s[LMI.L_EAR].conf, s[LMI.R_EAR].conf) < CONF.hide) miss++;
  }
  return miss / n > 0.3;
}

interface Pt { x: number; y: number; conf: number }
interface Geo { head: Pt; torsoA: Pt; torsoB: Pt; hipL: Pt; hipR: Pt; shoulder: Pt; elbow: Pt; wrist: Pt; torsoLen: number; points: Pt[] }

function geometry(pts: SkeletonPoint[], ctx: ReviewContext, useNose: boolean): Geo {
  const ears = { ...mid(pts[LMI.L_EAR], pts[LMI.R_EAR]), conf: Math.min(pts[LMI.L_EAR].conf, pts[LMI.R_EAR].conf) };
  const head: Pt = useNose ? pts[LMI.NOSE] : ears;
  const sh = { ...mid(pts[LMI.L_SHOULDER], pts[LMI.R_SHOULDER]), conf: Math.min(pts[LMI.L_SHOULDER].conf, pts[LMI.R_SHOULDER].conf) };
  const hp = { ...mid(pts[LMI.L_HIP], pts[LMI.R_HIP]), conf: Math.min(pts[LMI.L_HIP].conf, pts[LMI.R_HIP].conf) };
  const [s, e, w] = leadArmIndices(ctx.lefty).map((i) => pts[i]);
  return { head, torsoA: sh, torsoB: hp, hipL: pts[LMI.L_HIP], hipR: pts[LMI.R_HIP], shoulder: s, elbow: e, wrist: w, torsoLen: dist(sh, hp), points: [] };
}

/**
 * Guías en el instante `t`. Devuelve ítems del compositor ya con su confianza (las de conf < CONF.hide se devuelven igual:
 * `buildDrawList` no las dibuja y `hiddenGuides` las reporta para el aviso "Guía oculta"). Solo guías activadas en `on` y
 * solo en su intervalo: cabeza/torso/caderas de inicio a impacto + 0,3 s; brazo guía de inicio a impacto.
 */
export function guidesAt(ctx: ReviewContext, t: MediaMs, on: GuideSet, opts: { useNose?: boolean } = {}): GuideItem[] {
  const { address, impact } = ctx.times;
  if (t < address || t > impact + 300) return [];
  const cur = poseAt(ctx.track, t), ref = poseAt(ctx.track, address);
  if (!cur || !ref) return [];
  const useNose = opts.useNose ?? headUsesNose(ctx.track);
  const g = geometry(cur.pts, ctx, useNose), r = geometry(ref.pts, ctx, useNose);
  // Estabilidad: salto de los puntos clave respecto a la muestra anterior (a ~1 periodo), relativo al torso del inicio.
  const prev = poseAt(ctx.track, t - 1000 / ctx.track.hz);
  const torso = r.torsoLen > 1e-6 ? r.torsoLen : 0.3;
  const jumpy = (idx: number[]) => !!prev && idx.some((i) => dist(cur.pts[i], prev.pts[i]) > JUMP_FRACTION * torso);
  const cap = (conf: number, unstable: boolean) => (unstable ? Math.min(conf, UNSTABLE_CONF) : conf);
  const id = (k: string) => `${k}`;
  const out: GuideItem[] = [];
  const line = (guide: GuideKind, key: string, role: 'current' | 'reference', a: Pt2, b: Pt2, conf: number, toMs: number): GuideItem => ({ id: id(key), guide, shape: 'line', role, a: xy(a), b: xy(b), conf, fromMs: t, toMs });
  const circle = (guide: GuideKind, key: string, role: 'current' | 'reference', c: Pt2, rr: number, conf: number, toMs: number): GuideItem => ({ id: id(key), guide, shape: 'circle', role, center: xy(c), r: rr, conf, fromMs: t, toMs });
  const here = t;

  if (on.head) {
    const idx = useNose ? [LMI.NOSE] : [LMI.L_EAR, LMI.R_EAR];
    out.push(circle('head', 'head-ref', 'reference', r.head, 6, r.head.conf, here));
    out.push(circle('head', 'head-cur', 'current', g.head, 2.5, cap(g.head.conf, jumpy(idx)), here));
  }
  if (on.torso) {
    const idx = [LMI.L_SHOULDER, LMI.R_SHOULDER, LMI.L_HIP, LMI.R_HIP];
    out.push(line('torso', 'torso-ref', 'reference', r.torsoA, r.torsoB, Math.min(r.torsoA.conf, r.torsoB.conf), here));
    out.push(line('torso', 'torso-cur', 'current', g.torsoA, g.torsoB, cap(Math.min(g.torsoA.conf, g.torsoB.conf), jumpy(idx)), here));
  }
  if (on.hips) {
    out.push(line('hips', 'hips-ref', 'reference', r.hipL, r.hipR, Math.min(r.hipL.conf, r.hipR.conf), here));
    out.push(line('hips', 'hips-cur', 'current', g.hipL, g.hipR, cap(Math.min(g.hipL.conf, g.hipR.conf), jumpy([LMI.L_HIP, LMI.R_HIP])), here));
  }
  if (on.leadArm && t <= impact) {
    const idx = leadArmIndices(ctx.lefty);
    const unstable = jumpy(idx);
    out.push(line('leadArm', 'arm-upper', 'current', g.shoulder, g.elbow, cap(Math.min(g.shoulder.conf, g.elbow.conf), unstable), here));
    out.push(line('leadArm', 'arm-fore', 'current', g.elbow, g.wrist, cap(Math.min(g.elbow.conf, g.wrist.conf), unstable), here));
  }
  return out;
}

/** Guías encendidas que en este instante no se ven bien (conf < CONF.hide): para el aviso "Guía oculta: no se ve bien". */
export function hiddenGuides(items: readonly GuideItem[]): GuideKind[] {
  const worst = new Map<GuideKind, number>();
  for (const g of items) if (g.role === 'current') worst.set(g.guide, Math.min(worst.get(g.guide) ?? 1, g.conf));
  return [...worst].filter(([, c]) => c < CONF.hide).map(([k]) => k);
}

/** Modelo del compositor para el instante `t`: esqueleto interpolado + guías. */
export function reviewModelAt(ctx: ReviewContext, t: MediaMs, on: GuideSet, show: { skeleton: boolean }, opts: { useNose?: boolean } = {}): OverlayModel {
  const s = poseAt(ctx.track, t);
  return { skeleton: s ? [s] : [], guides: guidesAt(ctx, t, on, opts), show: { skeleton: show.skeleton } };
}

/** Las guías de la otra vista no se muestran mezcladas: si la vista del resultado no es la pedida, no hay guías. */
export function guidesAllowed(resultView: SwingView | undefined, viewMismatch: SwingView | undefined, userView: SwingView | 'auto'): boolean {
  if (viewMismatch) return false;
  return userView === 'auto' || !resultView || userView === resultView;
}

/* ───────────────────────── Sincronía de dos clips (F4.1) ───────────────────────── */

/** Fases con tiempo de medio, en el orden del swing. */
export type PhaseTimes = Partial<Record<'address' | 'top' | 'impact' | 'finish', MediaMs>>;
const WARP_ORDER = ['address', 'top', 'impact', 'finish'] as const;

export interface Warp {
  /** Instante del clip B que corresponde al instante `tA` del clip A (el reloj maestro es A). */
  toB: (tA: MediaMs) => MediaMs;
  /** Inverso: instante de A para un instante de B. */
  toA: (tB: MediaMs) => MediaMs;
  /** Fases usadas (comunes a los dos clips). */
  keys: readonly (typeof WARP_ORDER)[number][];
  /** Velocidad relativa de B respecto a A en cada tramo entre fases (B dura `rate`× lo de A... = ΔB/ΔA). */
  rates: number[];
}

/**
 * Deformación del tiempo por tramos lineales que alinea EXACTAMENTE las fases comunes de A y B (plan 4.4 de F4).
 * - Solo se usan las fases presentes en ambos; con 1 fase es un desfase puro y con 0 devuelve null.
 * - Antes de la primera y después de la última fase la pendiente es 1 (tiempo real, sin deformar).
 * - Si las fases de alguno no están en orden estricto creciente devuelve null (no se puede sincronizar).
 * Es estrictamente creciente y por eso invertible (monotonía).
 */
export function buildWarp(a: PhaseTimes, b: PhaseTimes): Warp | null {
  const keys = WARP_ORDER.filter((k) => a[k] !== undefined && b[k] !== undefined);
  if (!keys.length) return null;
  const xa = keys.map((k) => a[k] as number), xb = keys.map((k) => b[k] as number);
  for (let i = 1; i < keys.length; i++) if (!(xa[i] > xa[i - 1]) || !(xb[i] > xb[i - 1])) return null;
  const rates = keys.slice(1).map((_, i) => (xb[i + 1] - xb[i]) / (xa[i + 1] - xa[i]));
  const map = (x: number, from: number[], to: number[]): number => {
    const n = from.length;
    if (x <= from[0]) return to[0] + (x - from[0]);
    if (x >= from[n - 1]) return to[n - 1] + (x - from[n - 1]);
    let i = 0;
    while (x > from[i + 1]) i++;
    return to[i] + ((x - from[i]) * (to[i + 1] - to[i])) / (from[i + 1] - from[i]);
  };
  return { toB: (t) => map(t, xa, xb), toA: (t) => map(t, xb, xa), keys, rates };
}

/** Un tramo con velocidad relativa fuera de [1/2, 2] es una sincronía dudosa (otro tempo o una fase mal marcada). */
export const WARP_RATE_LIMITS: readonly [number, number] = [0.5, 2];
export const warpSuspicious = (w: Warp): boolean => w.rates.some((r) => r < WARP_RATE_LIMITS[0] || r > WARP_RATE_LIMITS[1]);
