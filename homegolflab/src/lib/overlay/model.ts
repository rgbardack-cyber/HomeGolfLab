/**
 * Modelo de capas del overlay (plan 4.6, F1.2): datos puros, sin canvas ni DOM. Una sola fuente de estilos para la
 * vista previa, la exportación y la leyenda. Todas las posiciones van normalizadas 0–1 sobre el cuadro mostrado
 * (ver viewport.ts); los grosores van en múltiplos de la escala de pantalla `u` (max(dstW, dstH)/320).
 */
import type { MediaMs } from '@/lib/media/clock';
import type { Pt2 } from './viewport';
import { t } from '@/i18n';

/** Confianza 0–1. Por debajo de `hide` no se dibuja nada; entre `hide` y `solid` se dibuja atenuado y (líneas) punteado. */
export const CONF = { hide: 0.4, solid: 0.6 } as const;

/* ───────────────────────── Esqueleto ───────────────────────── */

/** Pares de puntos de MediaPipe Pose que forman los huesos que se dibujan (los mismos de `drawSkeleton`). */
export const BONES: readonly (readonly [number, number])[] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
  [15, 17], [15, 19], [16, 18], [16, 20],
];
export const JOINTS: readonly number[] = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export const SKELETON_STYLE = { bone: 'rgba(109,207,142,0.95)', joint: '#E8C04A', boneWidth: 1.4, jointRadius: 2 } as const;

export interface SkeletonPoint extends Pt2 { conf: number }
export interface SkeletonSample { t: MediaMs; pts: SkeletonPoint[] }

/* ───────────────────────── Guías del swing ───────────────────────── */

export type GuideKind = 'head' | 'torso' | 'leadArm' | 'hips';
export interface GuideItem {
  id: string;
  guide: GuideKind;
  shape: 'line' | 'circle';
  /** 'reference' = posición fija del inicio (punteada); 'current' = la del cuadro actual (continua). */
  role: 'reference' | 'current';
  a?: Pt2; b?: Pt2;                // línea
  center?: Pt2; r?: number;        // círculo; r en unidades u
  conf: number;
  fromMs: MediaMs; toMs: MediaMs;  // intervalo en que se muestra (inclusive)
}
export const GUIDE_STYLE = {
  current: { color: '#FFFFFF', width: 1.4, dash: [] as number[] },
  reference: { color: '#E8C04A', width: 1.2, dash: [3, 2.5] as number[] },
  /** Entre CONF.hide y CONF.solid: punteado y a media opacidad. */
  faded: { alpha: 0.5, dash: [2, 2.5] as number[] },
  outline: 'rgba(0,0,0,0.55)', outlineExtra: 1.6,
} as const;

/* ───────────────────────── Trazo de la bola ───────────────────────── */

export type FlightKind = 'observed' | 'descent' | 'gap' | 'estimated';
export interface FlightStyle { color: string; width: number; dash: number[]; label: string }

/** Tabla de estilos del plan 4.6. El morado (#9B7BEA) es PROPUESTA: validar contraste con fondos reales. */
export const FLIGHT_STYLES: Record<FlightKind, FlightStyle> = {
  observed: { color: '#6DCF8E', width: 1.8, dash: [], get label() { return t('overlay.observed'); } },
  descent: { color: '#E8C04A', width: 1.8, dash: [], get label() { return t('overlay.descent'); } },
  gap: { color: 'rgba(255,255,255,0.7)', width: 1.0, dash: [1.5, 2.5], get label() { return t('overlay.gap'); } },
  estimated: { color: '#9B7BEA', width: 1.2, dash: [3, 2.5], get label() { return t('overlay.estimated'); } },
};
export const FLIGHT_OUTLINE = { color: 'rgba(0,0,0,0.55)', extra: 1.4 } as const;
/** La continuación estimada se desvanece de 0,9 a 0,4 a lo largo de su recorrido (longitud acumulada, en orden cronológico). */
export const ESTIMATED_ALPHA = { from: 0.9, to: 0.4 } as const;
/** Etiqueta en el idioma actual. */
export const lostLabel = (): string => t('overlay.lost');

/** Leyenda en el orden en que se muestra (la misma para vista previa y exportación). */
export const FLIGHT_LEGEND: readonly { kind: FlightKind | 'lost'; label: string }[] = [
  { kind: 'observed', get label() { return FLIGHT_STYLES.observed.label; } },
  { kind: 'descent', get label() { return FLIGHT_STYLES.descent.label; } },
  { kind: 'gap', get label() { return FLIGHT_STYLES.gap.label; } },
  { kind: 'estimated', get label() { return FLIGHT_STYLES.estimated.label; } },
  { kind: 'lost', get label() { return lostLabel(); } },
];

export interface FlightSegment {
  kind: FlightKind;
  a: Pt2; b: Pt2;
  /** Instantes de medio de los extremos; el segmento crece entre tA y tB y está completo desde tB. */
  tA: MediaMs; tB: MediaMs;
  /** Si se da y es < CONF.hide, el segmento no se dibuja. */
  conf?: number;
}
export interface FlightDot extends Pt2 { t: MediaMs; kind: 'detected' | 'estimated'; conf?: number }
export interface FlightLayer {
  segments: FlightSegment[];
  dots?: FlightDot[];
  /** Anillo donde se tocó la bola (siempre visible). */
  tap?: Pt2;
  /** Última posición vista de la bola; aparece desde `t`. */
  lost?: { x: number; y: number; t: MediaMs };
}

/* ───────────────────────── Etiquetas y modelo completo ───────────────────────── */

export interface LabelItem { text: string; at: Pt2; fromMs: MediaMs; toMs: MediaMs; align?: 'left' | 'center' | 'right' }
export const LABEL_STYLE = { color: '#FFFFFF', bg: 'rgba(0,0,0,0.6)', size: 8 } as const;

export interface OverlayModel {
  skeleton?: SkeletonSample[];   // ordenadas por t
  guides?: GuideItem[];
  flight?: FlightLayer;
  labels?: LabelItem[];
  /** Interruptores por capa; por defecto todas visibles. */
  show?: { skeleton?: boolean; guides?: boolean; flight?: boolean; labels?: boolean };
}
