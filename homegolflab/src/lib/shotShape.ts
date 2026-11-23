/**
 * Tipo de tiro (plan 4.7, F6). Dos cosas separadas, para no confundir nunca una opinión del usuario con una medida:
 *
 * - `manual`: la etiqueta del usuario («Etiqueta tuya»). Siempre disponible; nunca se muestra como detectada.
 * - `auto`: rasgos calculados SOLO del tramo observado del vuelo y una clasificación que se ABSTIENE (`sin_determinar`) salvo
 *   que se cumplan todas las condiciones Y la clasificación esté validada (`SHAPE_VALIDATED`, hoy false: no hay referencia de
 *   vuelo ni clips de validación; ver F5.1/D9). Mientras tanto la salida automática es siempre null.
 *
 * Los rasgos se miden en la IMAGEN (la cámara aplana la profundidad): la curvatura lateral y la dirección inicial dependen de dónde
 * esté la cámara, y la altura sobre el horizonte exige un horizonte marcado. Los umbrales marcados [PROPUESTA] no están calibrados.
 */
import { realDeltaMs } from './media/clock';
import type { FlightTrack } from './flightTrack';

export type ShotShape = 'stinger' | 'bajo' | 'recto' | 'draw' | 'fade' | 'hook' | 'slice' | 'sin_determinar';
export const SHAPE_LABEL: Record<ShotShape, string> = {
  stinger: 'Stinger', bajo: 'Bajo', recto: 'Recto', draw: 'Draw', fade: 'Fade', hook: 'Hook', slice: 'Slice', sin_determinar: 'Sin determinar',
};
/** Formas que el usuario puede elegir como etiqueta (sin "sin determinar": para eso es quitar la etiqueta). */
export const MANUAL_SHAPES: readonly ShotShape[] = ['stinger', 'bajo', 'recto', 'draw', 'fade', 'hook', 'slice'];

/** La clasificación automática se mostrará solo si esto es true. Se enciende ÚNICAMENTE tras validar contra una referencia de vuelo. */
export const SHAPE_VALIDATED = false;

export interface ShapeFeatures {
  /** Desvío lateral máximo del recorrido respecto a su cuerda, en % de la longitud observada; + = a la derecha de la línea de tiro. null sin línea de tiro. */
  lateralCurvaturePct: number | null;
  /** Dirección de los primeros puntos respecto a la línea de tiro, en grados en la imagen; + = a la derecha. null sin línea de tiro. */
  startDirImageDeg: number | null;
  /** Altura máxima observada sobre el horizonte, en % del alto del cuadro (negativo = por debajo). null sin horizonte. */
  elevationRelHorizonPct: number | null;
  observedRealMs: number;
  view: 'frente' | 'atras';
}

export interface ShotShapeResult {
  auto: { value: ShotShape; conf: number; features: ShapeFeatures } | null;
  manual: ShotShape | null;
  source: 'auto' | 'manual' | 'none';
}

/** Marcas que pone el usuario en el primer cuadro (coordenadas normalizadas 0–1). */
export interface ShapeMarks {
  /** Punto del objetivo: la línea de tiro va de la bola (toque) a este punto. */
  target: { x: number; y: number } | null;
  /** Altura (y normalizada) del horizonte. */
  horizonY: number | null;
}

/* ───────────────────────── Rasgos ───────────────────────── */

const MIN_POINTS = 8;
const MIN_OBSERVED_MS = 300;       // [PROPUESTA]

/**
 * Rasgos del tramo observado. La línea de tiro es la recta bola→objetivo; los desvíos laterales se miden perpendiculares a ella.
 * Devuelve null si el tramo observado no alcanza (< 8 puntos o < 0,3 s reales): no se calcula nada con tan poco.
 */
export function shapeFeatures(track: FlightTrack, marks: ShapeMarks, aspect: number, view: 'frente' | 'atras'): ShapeFeatures | null {
  const p = track.observed;
  if (p.length < MIN_POINTS) return null;
  const observedRealMs = realDeltaMs(track.clock, p[0].t, p[p.length - 1].t);
  if (observedRealMs < MIN_OBSERVED_MS) return null;
  // Coordenadas en unidades de ALTO (x × aspect) para que los ángulos no dependan de la forma del cuadro.
  const pts = p.map((q) => ({ x: q.x * aspect, y: q.y }));
  let line: { dx: number; dy: number } | null = null;
  if (marks.target) {
    const dx = marks.target.x * aspect - track.tap.x * aspect, dy = marks.target.y - track.tap.y, n = Math.hypot(dx, dy);
    if (n > 1e-6) line = { dx: dx / n, dy: dy / n };
  }
  let lateralCurvaturePct: number | null = null, startDirImageDeg: number | null = null;
  if (line) {
    // Perpendicular derecha de la línea de tiro en pantalla (y crece hacia abajo): (−dy, dx) rotada.
    const right = { x: -line.dy, y: line.dx };
    const first = pts[0], last = pts[pts.length - 1];
    const chord = { x: last.x - first.x, y: last.y - first.y }, chordLen = Math.hypot(chord.x, chord.y);
    if (chordLen > 1e-6) {
      const cu = { x: chord.x / chordLen, y: chord.y / chordLen };
      let best = 0;
      for (const q of pts) {
        const dev = (q.x - first.x) * -cu.y + (q.y - first.y) * cu.x;     // distancia con signo a la cuerda (positiva a su derecha en pantalla)
        if (Math.abs(dev) > Math.abs(best)) best = dev;
      }
      // El signo se pasa a «derecha de la línea de tiro»: si la cuerda apunta contra la línea, se invierte.
      const along = cu.x * line.dx + cu.y * line.dy;
      lateralCurvaturePct = Math.round(((along >= 0 ? best : -best) / chordLen) * 1000) / 10;
    }
    const k = Math.min(pts.length - 1, 5);
    const d = { x: pts[k].x - pts[0].x, y: pts[k].y - pts[0].y };
    if (Math.hypot(d.x, d.y) > 1e-6) {
      const cross = d.x * right.x + d.y * right.y, dot = d.x * line.dx + d.y * line.dy;
      startDirImageDeg = Math.round(((Math.atan2(cross, dot) * 180) / Math.PI) * 10) / 10;
    }
  }
  let elevationRelHorizonPct: number | null = null;
  if (marks.horizonY !== null) elevationRelHorizonPct = Math.round((marks.horizonY - Math.min(...p.map((q) => q.y))) * 1000) / 10;
  return { lateralCurvaturePct, startDirImageDeg, elevationRelHorizonPct, observedRealMs: Math.round(observedRealMs), view };
}

/* ───────────────────────── Clasificación con abstención ───────────────────────── */

/** Umbrales [PROPUESTA], sin calibrar. */
export const SHAPE_THRESHOLDS = { straightPct: 1.5, hookSlicePct: 6, stingerPct: 3, lowPct: 8, minConf: 0.5 } as const;

/**
 * Clasifica con los rasgos. Se abstiene (`sin_determinar`) si falta la línea de tiro (sin ella no hay lado), si la curvatura o la
 * altura no se pueden medir, o si la confianza es baja. Zurdo/diestro invierte draw/fade (y hook/slice): un diestro con curva a la
 * izquierda de su línea hace draw/hook; un zurdo, fade/slice.
 */
export function classifyShape(f: ShapeFeatures, lefty: boolean): { value: ShotShape; conf: number } {
  const T = SHAPE_THRESHOLDS;
  if (f.lateralCurvaturePct === null || f.elevationRelHorizonPct === null) return { value: 'sin_determinar', conf: 0 };
  // Confianza: crece con el tiempo observado (hasta 1 s) y baja si la vista es frontal (la profundidad se aplana más).
  const conf = Math.min(1, f.observedRealMs / 1000) * (f.view === 'atras' ? 1 : 0.7);
  if (conf < T.minConf) return { value: 'sin_determinar', conf };
  const c = f.lateralCurvaturePct;
  const toLeft = c < 0;
  const abs = Math.abs(c);
  if (abs >= T.hookSlicePct) return { value: (lefty ? toLeft : !toLeft) ? 'slice' : 'hook', conf };
  if (abs >= T.straightPct) return { value: (lefty ? toLeft : !toLeft) ? 'fade' : 'draw', conf };
  if (f.elevationRelHorizonPct < T.stingerPct) return { value: 'stinger', conf };
  if (f.elevationRelHorizonPct < T.lowPct) return { value: 'bajo', conf };
  return { value: 'recto', conf };
}

/**
 * Resultado completo. La etiqueta del usuario (`manual`) manda y nunca se mezcla con la automática. La automática solo existe si
 * `validated` es true (hoy `SHAPE_VALIDATED` = false: siempre null) y la clasificación no se abstuvo.
 */
export function shapeResult(o: { track: FlightTrack | null; marks: ShapeMarks; aspect: number; view: 'frente' | 'atras'; lefty: boolean; manual: ShotShape | null; validated?: boolean }): ShotShapeResult {
  const manual = o.manual && o.manual !== 'sin_determinar' ? o.manual : null;
  let auto: ShotShapeResult['auto'] = null;
  if ((o.validated ?? SHAPE_VALIDATED) && o.track) {
    const features = shapeFeatures(o.track, o.marks, o.aspect, o.view);
    if (features) {
      const c = classifyShape(features, o.lefty);
      if (c.value !== 'sin_determinar') auto = { value: c.value, conf: c.conf, features };
    }
  }
  return { auto, manual, source: manual ? 'manual' : auto ? 'auto' : 'none' };
}
