/**
 * Análisis de swing a partir de puntos de postura (MediaPipe Pose, 33 puntos).
 *
 * Todo lo que se reporta aquí se puede estimar razonablemente con una sola cámara
 * y el esqueleto del jugador: cuerpo, brazos y manos. El palo no sale del esqueleto:
 * lo busca aparte `club.ts` (experimental) y nunca entra en la nota.
 * Las posiciones de manos y brazos se leen solo al inicio y en el tope, donde el cuerpo
 * casi no se mueve; en el impacto las manos van demasiado rápido para un video normal.
 */

export interface Pt { x: number; y: number; z: number; v: number }
export interface Frame { t: number; lm: Pt[]; world?: Pt[] }

export const LM = {
  NOSE: 0, L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
  // Cabeza y mano: el modelo de postura da también las orejas y, en cada mano, el meñique y el índice.
  L_EAR: 7, R_EAR: 8, L_PINKY: 17, R_PINKY: 18, L_INDEX: 19, R_INDEX: 20,
} as const;

/** Desde dónde graba la cámara: de frente al jugador, o desde atrás sobre la línea de tiro. */
export type SwingView = 'frente' | 'atras';
export const VIEW_LABEL: Record<SwingView, string> = { frente: 'De frente', atras: 'Desde atrás' };

interface TempoMetrics {
  tempoRatio: number;        // subida / bajada (ideal ≈ 3.0)
  backswingSec: number;
  downswingSec: number;
  framesUsed: number;
}

/**
 * Muñecas (EXPERIMENTAL, solo informativas: no entran en la nota). Ángulo entre el antebrazo y la mano,
 * con los puntos de índice y meñique del modelo de postura: 180° = mano alineada con el antebrazo, menos =
 * muñeca doblada. Con una sola cámara la mano suele quedar tapada y el modelo adivina, así que sirve para
 * comparar tus swings entre sí, no como medida exacta. No mide la suelta ni la cara del palo.
 * Opcionales: los resultados guardados antes del 17 nov 2026 no los traen. null = no se vio la mano.
 */
interface WristMetrics {
  leadWristAddressDeg?: number | null;
  leadWristTopDeg?: number | null;
  trailWristAddressDeg?: number | null;
  trailWristTopDeg?: number | null;
  /** Cambio de la muñeca guía del inicio al tope (negativo = se dobló más). */
  wristChangeDeg?: number | null;
}

/** Medidas de la vista desde atrás (línea de tiro). Los porcentajes son del largo del torso. */
export interface DtlMetrics extends TempoMetrics, WristMetrics {
  spineAddressDeg: number;       // inclinación hacia la bola al inicio
  kneeFlexDeg: number | null;    // flexión de rodillas al inicio (null si no se ven los tobillos)
  spineTopChangeDeg: number;     // cambio de inclinación en el tope (+ = más inclinado)
  spineImpactChangeDeg: number;  // cambio de inclinación en el impacto (− = te levantas)
  hipAdvancePct: number;         // caderas hacia la bola en el impacto (+ = se acercan)
  /** Caderas en el tope respecto al inicio (+ = hacia la bola). Opcional: los resultados guardados antes del 16 nov 2026 no lo traen. */
  hipTopPct?: number;
  headVerticalPct: number;      // mayor movimiento vertical de la cabeza (+ = sube)
  headForwardPct: number;        // mayor movimiento de la cabeza hacia la bola (+ = se acerca)
  // Brazos y manos (opcionales: los resultados guardados antes de nov 2026 no los traen)
  handsAddressPct?: number;            // manos por delante de los hombros al inicio (+ = hacia la bola)
  handsTopPct?: number;                // altura de las manos sobre la línea de hombros en el tope
  handsDepthTopPct?: number | null;    // manos detrás de los hombros en el tope (+ = lejos de la bola); null si no se ven
  /** Codo trasero en el tope. POCO FIABLE: en una profesional dio 139–154° (lo real ronda 90°) porque el
   *  brazo queda tapado y el modelo adivina. Se guarda para estudiarlo; no se muestra ni se juzga. */
  trailElbowTopDeg?: number | null;
}

export interface SwingMetrics extends TempoMetrics, WristMetrics {
  shoulderTurnDeg: number;   // giro de hombros en el tope
  hipTurnDeg: number;        // giro de caderas en el tope
  xFactorDeg: number;        // hombros − caderas
  spineAddressDeg: number;   // inclinación de columna al inicio
  spineChangeDeg: number;    // cambio de inclinación al impacto
  headSwayPct: number;       // movimiento lateral de cabeza, % del ancho de hombros
  hipShiftPct: number;       // desplazamiento de caderas al impacto, % del ancho de hombros (+ = hacia el objetivo)
  /** Caderas en el tope respecto al inicio, % del ancho de hombros (+ = se alejan del objetivo). Opcional: no está en resultados anteriores al 16 nov 2026. */
  hipSwayPct?: number;
  leadArmDeg: number;       // ángulo del codo del brazo guía en el tope (180 = recto)
  // Brazos y manos (opcionales: los resultados guardados antes de nov 2026 no los traen)
  leadArmAddressDeg?: number;          // ángulo del codo del brazo guía al inicio
  trailElbowTopDeg?: number | null;    // codo trasero en el tope: poco fiable, no se muestra (ver DtlMetrics)
  handsAddressPct?: number;            // manos respecto al centro del cuerpo al inicio, % del ancho de hombros (+ = hacia el objetivo)
  handsTopPct?: number;                // altura de las manos sobre la línea de hombros en el tope, % del torso
}

export type Severity = 'fix' | 'improve' | 'good';
export interface Feedback { severity: Severity; title: string; detail: string; drill?: string; key: string }

interface ResultBase {
  score: number;             // 0–100
  feedback: Feedback[];
  summary: string;
  focus: string[];
  events: { address: number; top: number; impact: number };
  /** Momento (ms del video) de cada posición clave, para volver a esos cuadros. */
  times?: { address: number; top: number; impact: number; /** Final del swing (F3.4): solo si se vio la pose sostenida; opcional. */ finish?: number };
  /** Confianza 0–1 de cada fase (F3.4, ver phases.ts). Debajo de 0,5 la revisión pide ajustar esa fase. No cambia la nota. */
  phaseConf?: { address: number; top: number; impact: number; finish?: number };
  /** Mano dominante que se usó. Sale del propio swing cuando se puede; si no, del perfil. */
  lefty?: boolean;
  /** Si el jugador eligió la vista a mano y el video parece de la otra, la que parece. Solo para avisar. */
  viewMismatch?: SwingView;
  /** Lo que se pudo leer del palo (experimental, ver club.ts). No afecta la nota. */
  club?: import('./club').ClubInfo;
}
/** Los resultados guardados antes de existir la vista desde atrás no traen `view`: son de frente. */
export type FrontResult = ResultBase & { view?: 'frente'; metrics: SwingMetrics };
export type DtlResult = ResultBase & { view: 'atras'; metrics: DtlMetrics };
export type SwingResult = FrontResult | DtlResult;

export interface AnalyzeOptions {
  lefty?: boolean;
  /** 'auto' (por defecto) decide la vista según la postura al inicio. */
  view?: SwingView | 'auto';
  /** Ancho ÷ alto del video. Los puntos vienen normalizados por separado en x e y; sin esto los ángulos se deforman. */
  aspect?: number;
  /** Cuántos cuadros se muestrearon en total, con los que el modelo no detectó (para avisar si se pierde al jugador). */
  sampled?: number;
}

export type SwingError = 'too_short' | 'no_swing' | 'low_visibility';

const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export function angleAt(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (m === 0) return 0;
  return deg(Math.acos(clamp(dot / m, -1, 1)));
}

const KEY = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_WRIST, LM.R_WRIST];
export function frameVisible(lm: Pt[], min = 0.5) {
  if (!lm || lm.length < 27) return false;
  return KEY.reduce((s, i) => s + (lm[i].v ?? 0), 0) / KEY.length >= min;
}

const wristY = (f: Frame) => (f.lm[LM.L_WRIST].y + f.lm[LM.R_WRIST].y) / 2;
const shoulderWidth = (f: Frame) => Math.hypot(f.lm[LM.L_SHOULDER].x - f.lm[LM.R_SHOULDER].x, f.lm[LM.L_SHOULDER].y - f.lm[LM.R_SHOULDER].y);
const torsoLen = (f: Frame) => {
  const s = mid(f.lm[LM.L_SHOULDER], f.lm[LM.R_SHOULDER]);
  const h = mid(f.lm[LM.L_HIP], f.lm[LM.R_HIP]);
  return Math.hypot(s.x - h.x, s.y - h.y);
};

/** Inclinación de la columna respecto a la vertical (grados). */
export function spineTilt(lm: Pt[]) {
  const s = mid(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
  const h = mid(lm[LM.L_HIP], lm[LM.R_HIP]);
  return angleAt(s, h, { x: h.x, y: h.y - 0.5 });
}

/** Giro de un segmento (hombros o caderas) entre dos cuadros. Usa 3D si existe; si no, el estrechamiento aparente. */
function segmentTurn(a: Frame, b: Frame, li: number, ri: number) {
  if (a.world && b.world) {
    const ang = (f: Pt[]) => Math.atan2(f[li].z - f[ri].z, f[li].x - f[ri].x);
    let d = Math.abs(deg(ang(b.world) - ang(a.world)));
    if (d > 180) d = 360 - d;
    return d;
  }
  const wa = Math.abs(a.lm[li].x - a.lm[ri].x);
  const wb = Math.abs(b.lm[li].x - b.lm[ri].x);
  return deg(Math.acos(clamp(wb / (wa + 1e-8), 0, 1)));
}

/**
 * Candidatos a "tope": mínimos locales de la altura de las manos (en ±0,4 s) tras los cuales las manos caen rápido.
 * La bajada del swing es el movimiento de manos más veloz de todos: se pide que recuperen la mitad de lo que subieron
 * en menos de 0,9 s (la mitad y no más: en el impacto el cuadro sale borroso y el modelo pierde las manos) y se
 * descartan los candidatos bastante más lentos que el mejor. Así la finalización (manos igual de altas o más que en
 * el tope, sostenidas, que bajan despacio) y los gestos de recoger el palo no se confunden con el tope, aunque desde
 * atrás la subida y la bajada midan casi lo mismo a 10 cuadros por segundo. Con la regla anterior ("la bajada más
 * rápida que la subida") el tope real se descartaba y salía la finalización: la foto "Tope" no mostraba la subida.
 */
function topCandidates(frames: Frame[], wy: number[], s: number, e: number): number[] {
  const n = frames.length, found: { i: number; speed: number; amp: number }[] = [];
  for (let i = s; i < e; i++) {
    let isMin = true;
    for (let j = i - 1; j >= 0 && frames[i].t - frames[j].t <= 400; j--) if (wy[j] < wy[i]) { isMin = false; break; }
    for (let j = i + 1; isMin && j < n && frames[j].t - frames[i].t <= 400; j++) if (wy[j] < wy[i]) isMin = false;
    if (!isMin) continue;
    if (found.length && frames[i].t - frames[found[found.length - 1].i].t <= 400) continue; // meseta del mismo tope
    // punto más bajo de las manos en los 3 s previos, y de ahí cuánto subieron
    let lo = i;
    for (let j = i - 1; j >= 0 && frames[i].t - frames[j].t <= 3000; j--) if (wy[j] > wy[lo]) lo = j;
    const amp = wy[lo] - wy[i];
    if (amp < torsoLen(frames[i]) * 0.5) continue;
    // la bajada: el primer cuadro, dentro de 0,9 s, en que las manos recuperaron la mitad de lo que subieron
    let dn = -1;
    for (let j = i + 1; j < n && frames[j].t - frames[i].t <= 900; j++) if (wy[j] >= wy[i] + amp * 0.5) { dn = j; break; }
    if (dn < 0) continue;
    if (wy[dn] > wy[lo] + amp * 0.5) continue; // las manos no vuelven a su nivel: es un salto del seguimiento, no una bajada
    found.push({ i, speed: (wy[dn] - wy[i]) / Math.max(1, frames[dn].t - frames[i].t), amp });
  }
  const best = found.reduce((m, c) => Math.max(m, c.speed), 0);
  const fast = found.filter((c) => c.speed >= best * 0.65);
  // El swing es el mayor movimiento de manos: un gesto posterior bastante más chico (recoger el palo, volver a colocarse)
  // no le gana por ser el último. Entre swings de tamaño parecido (práctica y real) sigue ganando el último.
  const big = fast.reduce((m, c) => Math.max(m, c.amp), 0);
  return fast.filter((c) => c.amp >= big * 0.75).map((c) => c.i);
}

// Bajada (tope→impacto) posible a velocidad normal. Abajo de 0,15 s: el modelo perdió las manos. Arriba de 0,6 s: no es una bajada
// normal (en 90 clips reales la mayor válida fue 0,43 s) sino cámara lenta o un clip mal leído; una cámara lenta 4× midió 0,8 s.
export const MIN_DOWNSWING_SEC = 0.15, MAX_DOWNSWING_SEC = 0.6;

/** Localiza inicio (address), tope y impacto dentro de una secuencia de cuadros. */
export function findEvents(frames: Frame[]) {
  const n = frames.length;
  const wy = frames.map(wristY);
  const s = Math.floor(n * 0.1);
  const e = Math.max(s + 1, Math.ceil(n * 0.92));
  // Con varios swings en el video gana el último que cumple (el de la bola suele ser el último). Si ninguno
  // cumple, el punto más alto, como antes: así los errores de siempre siguen saliendo.
  const cands = topCandidates(frames, wy, s, e);
  let top = cands.length ? cands[cands.length - 1] : s;
  if (!cands.length) for (let i = s; i < e; i++) if (wy[i] < wy[top]) top = i; // y menor = más arriba

  let impact = top;
  const tLimit = frames[top].t + 1500;
  for (let i = top + 1; i < n && frames[i].t <= tLimit; i++) {
    if (wy[i] > wy[impact]) impact = i;
    // en cuanto las manos vuelven a subir claramente, ya pasó el impacto
    else if (wy[impact] - wy[i] > 0.03 && impact > top) break;
  }

  // El punto más bajo de las manos se busca en los 3 s previos al tope, no en todo el video.
  let low = top;
  for (let i = top - 1; i >= 0 && frames[top].t - frames[i].t <= 3000; i--) if (wy[i] > wy[low]) low = i;
  const amp = wy[low] - wy[top];
  // Las manos se quedan abajo unos cuadros alrededor del impacto: cuenta el primero en que llegan,
  // no el último de esa meseta (si no, la bajada sale más larga de lo que es).
  for (let i = top + 1; i < impact; i++) if (wy[i] >= wy[impact] - amp * 0.05) { impact = i; break; }
  let address = low;
  for (let i = top; i >= 0; i--) {
    if (wy[i] >= wy[low] - amp * 0.08) { address = i; break; }
  }
  // Inicio real: el último cuadro con las manos quietas. Al arrancar, las manos van primero hacia
  // atrás casi sin subir, así que la altura sola lo detecta tarde (visto en un swing real: daba por
  // "inicio" un cuadro con el palo ya en camino, y las manos salían medio cuerpo atrasadas).
  const speed = (i: number) => {
    if (i <= 0) return 0;
    const a = handsMid(frames[i - 1]), b = handsMid(frames[i]);
    return Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, frames[i].t - frames[i - 1].t);
  };
  let vmax = 0;
  for (let i = address + 1; i <= top; i++) vmax = Math.max(vmax, speed(i));
  const tMin = frames[address].t - 1500;
  while (address > 0 && frames[address].t > tMin && speed(address) > vmax * 0.1) address--;
  return { address, top, impact, amplitude: amp, swings: cands.length };
}

const hipWidth = (f: Frame) => Math.hypot(f.lm[LM.L_HIP].x - f.lm[LM.R_HIP].x, f.lm[LM.L_HIP].y - f.lm[LM.R_HIP].y);

/** Qué tan "ancho" se ve el cuerpo: (hombros + caderas) ÷ (2 × torso). */
export function bodyWidthRatio(f: Frame) {
  return (shoulderWidth(f) + hipWidth(f)) / (2 * (torsoLen(f) || 1e-6));
}

/**
 * Puntaje de vista: positivo = desde atrás, negativo = de frente. Combina dos señales:
 *  - ancho aparente del cuerpo: desde atrás los dos hombros casi se tapan;
 *  - si hay puntos 3D, cuánto apunta la línea de hombros hacia la cámara (0° = de frente, 90° = de perfil).
 * Calibrado con seis fotos reales de golfistas en posición de inicio (nov 2026): de frente dieron
 * ancho 0,41–0,51 y 1–33°; de perfil, 0,17–0,31 y 57–71°. Es una muestra pequeña: revisar con videos propios.
 */
export function viewScore(f: Frame) {
  const width = (0.36 - bodyWidthRatio(f)) / 0.1;
  if (!f.world) return width;
  const l = f.world[LM.L_SHOULDER], r = f.world[LM.R_SHOULDER];
  const yaw = deg(Math.atan2(Math.abs(l.z - r.z), Math.abs(l.x - r.x)));
  return width + (yaw - 45) / 15;
}

/** Vista de un solo cuadro con el jugador en posición de inicio (para avisar en vivo). */
export function viewOfFrame(f: Pick<Frame, 'lm' | 'world'>, aspect = 1): SwingView {
  return viewScore(scaleX({ t: 0, ...f }, aspect)) > 0 ? 'atras' : 'frente';
}

/** Decide la vista con los cuadros de la posición de inicio; en el tope los hombros giran y engañarían. */
export function detectView(frames: Frame[], address: number): SwingView {
  const s = frames.slice(Math.max(0, address - 4), address + 1).map(viewScore).sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] > 0 ? 'atras' : 'frente';
}

const scaleX = (f: Frame, aspect: number): Frame => (aspect === 1 ? f : { ...f, lm: f.lm.map((p) => ({ ...p, x: p.x * aspect })) });

function buildResult<M>(metrics: M, feedback: Feedback[], score: number, ev: { address: number; top: number; impact: number }, frames: Frame[]) {
  const issues = feedback.filter((f) => f.severity !== 'good');
  const goods = feedback.filter((f) => f.severity === 'good');
  const summary =
    (goods[0] ? `Punto fuerte: ${goods[0].title.toLowerCase()}. ` : '') +
    (issues[0] ? `Lo más importante a trabajar: ${issues[0].title.toLowerCase()}.` : 'Swing muy sólido en todo lo medido. Mantén la rutina.');
  return {
    metrics, score, feedback, summary,
    focus: issues.slice(0, 3).map((f) => f.drill ?? f.title),
    events: { address: ev.address, top: ev.top, impact: ev.impact },
    times: { address: frames[ev.address].t, top: frames[ev.top].t, impact: frames[ev.impact].t },
  };
}

/** Ángulo en una articulación. Con puntos 3D no lo deforma la perspectiva; si no hay, usa la imagen. */
function jointAngle(f: Frame, a: number, b: number, c: number) {
  if (!f.world) return angleAt(f.lm[a], f.lm[b], f.lm[c]);
  const A = f.world[a], B = f.world[b], C = f.world[c];
  const v1 = [A.x - B.x, A.y - B.y, A.z - B.z], v2 = [C.x - B.x, C.y - B.y, C.z - B.z];
  const m = Math.hypot(...v1) * Math.hypot(...v2);
  if (m === 0) return 0;
  return deg(Math.acos(clamp((v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / m, -1, 1)));
}
const seen = (f: Frame, idx: number[], min = 0.5) => idx.every((i) => (f.lm[i]?.v ?? 0) >= min);
const shoulderMid = (f: Frame) => mid(f.lm[LM.L_SHOULDER], f.lm[LM.R_SHOULDER]);
const handsMid = (f: Frame) => mid(f.lm[LM.L_WRIST], f.lm[LM.R_WRIST]);
/** [hombro, codo, muñeca] del brazo guía y del trasero. El guía es el izquierdo para diestros. */
const arms = (lefty: boolean) => {
  const L: [number, number, number] = [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST];
  const R: [number, number, number] = [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST];
  return lefty ? { lead: R, trail: L } : { lead: L, trail: R };
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Ángulo (grados) en b entre b→a y b→c, con puntos en 3D. null si algún segmento mide cero. */
function angle3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }) {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z], v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const m = Math.hypot(...v1) * Math.hypot(...v2);
  if (m === 0) return null;
  return deg(Math.acos(clamp((v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / m, -1, 1)));
}

/**
 * Ángulo en la muñeca entre el antebrazo (codo → muñeca) y la mano (muñeca → punto medio de índice y meñique).
 * 180° = mano alineada con el antebrazo; menos = muñeca doblada. null si no se ven los cuatro puntos.
 * Con puntos 3D no lo deforma la perspectiva; si no hay, usa la imagen.
 */
export function wristAngle(f: Frame, side: 'L' | 'R'): number | null {
  const [el, wr, ix, pk] = side === 'L' ? [LM.L_ELBOW, LM.L_WRIST, LM.L_INDEX, LM.L_PINKY] : [LM.R_ELBOW, LM.R_WRIST, LM.R_INDEX, LM.R_PINKY];
  if (!seen(f, [el, wr, ix, pk])) return null;
  const hand = (p: Pt[]) => ({ x: (p[ix].x + p[pk].x) / 2, y: (p[ix].y + p[pk].y) / 2, z: (p[ix].z + p[pk].z) / 2 });
  if (f.world && f.world[pk] && f.world[ix]) return angle3(f.world[el], f.world[wr], hand(f.world));
  const flat = (p: { x: number; y: number }) => ({ x: p.x, y: p.y, z: 0 });
  const h = hand(f.lm);
  return angle3(flat(f.lm[el]), flat(f.lm[wr]), flat(h));
}

/** Mediana del ángulo de la muñeca en los cuadros lo..hi (los que la ven); null si ninguno. */
function wristMed(frames: Frame[], lo: number, hi: number, side: 'L' | 'R'): number | null {
  const vals: number[] = [];
  for (let j = Math.max(0, lo); j <= Math.min(frames.length - 1, hi); j++) {
    const a = wristAngle(frames[j], side);
    if (a != null) vals.push(a);
  }
  return vals.length ? round(median(vals), 0) : null;
}

function wristMetrics(frames: Frame[], ev: { address: number; top: number }, lefty: boolean): WristMetrics {
  const lead = lefty ? 'R' : 'L', trail = lefty ? 'L' : 'R';
  const leadA = wristMed(frames, ev.address - 2, ev.address, lead), leadT = wristMed(frames, ev.top - 1, ev.top + 1, lead);
  return {
    leadWristAddressDeg: leadA,
    leadWristTopDeg: leadT,
    trailWristAddressDeg: wristMed(frames, ev.address - 2, ev.address, trail),
    trailWristTopDeg: wristMed(frames, ev.top - 1, ev.top + 1, trail),
    wristChangeDeg: leadA != null && leadT != null ? leadT - leadA : null,
  };
}

/** Mediana de la inclinación de la columna en los cuadros lo..hi (un solo cuadro ruidoso no decide). */
const tiltMed = (frames: Frame[], lo: number, hi: number) => {
  const vals: number[] = [];
  for (let j = Math.max(0, lo); j <= Math.min(frames.length - 1, hi); j++) vals.push(spineTilt(frames[j].lm));
  return median(vals);
};

/**
 * Cuánto se movió el cuerpo entero respecto al inicio, medido en los tobillos, para quitárselo a la cabeza y a las
 * caderas. Solo cuenta si los dos tobillos se movieron juntos (un jugador que se corre o un teléfono que se mueve);
 * si solo se mueve uno, es el talón que se levanta o el pie que gira, y eso es parte del swing.
 */
function drift(f: Frame, a: Frame): { x: number; y: number } {
  const none = { x: 0, y: 0 };
  if (!seen(f, [LM.L_ANKLE, LM.R_ANKLE]) || !seen(a, [LM.L_ANKLE, LM.R_ANKLE])) return none;
  const d = (i: number, axis: 'x' | 'y') => f.lm[i][axis] - a.lm[i][axis];
  const out = { x: 0, y: 0 };
  for (const axis of ['x', 'y'] as const) {
    const l = d(LM.L_ANKLE, axis), r = d(LM.R_ANKLE, axis);
    if (Math.abs(l - r) > 0.015) continue; // se movieron por separado: no es un desplazamiento rígido
    const avg = (l + r) / 2;
    if (Math.abs(avg) >= 0.015) out[axis] = avg;
  }
  return out;
}

/** Centro de las caderas en el cuadro i (mediana de 3 cuadros) sin el desplazamiento del cuerpo entero. */
function hipAt(frames: Frame[], i: number, a: Frame) {
  const xs: number[] = [], ys: number[] = [];
  for (let j = Math.max(0, i - 1); j <= Math.min(frames.length - 1, i + 1); j++) {
    const h = mid(frames[j].lm[LM.L_HIP], frames[j].lm[LM.R_HIP]);
    xs.push(h.x); ys.push(h.y);
  }
  const d = drift(frames[i], a);
  return { x: median(xs) - d.x, y: median(ys) - d.y };
}

/**
 * Punto de la cabeza en los cuadros from..to: el centro entre las orejas (la nariz gira con la cabeza y desde atrás
 * se pierde). Si las dos orejas no se ven en el 70 % de los cuadros, la nariz en todos, para no mezclar los dos.
 */
function headSeries(frames: Frame[], from: number, to: number): { x: number; y: number }[] {
  const part = frames.slice(from, to + 1);
  const ears = part.filter((f) => seen(f, [LM.L_EAR, LM.R_EAR])).length >= part.length * 0.7;
  return part.map((f) => (ears ? mid(f.lm[LM.L_EAR], f.lm[LM.R_EAR]) : { x: f.lm[LM.NOSE].x, y: f.lm[LM.NOSE].y }));
}

/**
 * Quita los cuadros en que el seguimiento salta a otra persona (alguien en el cubículo de al lado o quien graba).
 * Un cuerpo no se desplaza más de ~1,5 torsos por segundo; si pasa de eso (y de un mínimo de 0,35 torsos) el cuadro
 * es de otro. Tras 6 cuadros seguidos descartados se acepta el cambio, por si la persona que se sigue es la nueva.
 */
export function stableFrames(frames: Frame[]): Frame[] {
  const out: Frame[] = [];
  let skipped = 0;
  for (const f of frames) {
    const prev = out[out.length - 1];
    if (prev && skipped < 6) {
      const a = mid(prev.lm[LM.L_HIP], prev.lm[LM.R_HIP]), b = mid(f.lm[LM.L_HIP], f.lm[LM.R_HIP]);
      const torso = torsoLen(prev) || 1e-6;
      const limit = Math.max(0.35 * torso, (1.5 * torso * Math.max(1, f.t - prev.t)) / 1000);
      if (Math.hypot(b.x - a.x, b.y - a.y) > limit) { skipped++; continue; }
    }
    skipped = 0;
    out.push(f);
  }
  return out;
}

/**
 * Dónde está el swing dentro de un video muestreado de forma gruesa: desde 0,9 s antes del inicio hasta 0,7 s
 * después del impacto (ms de video), o null si no se ve un swing. Sirve para muestrear fino solo ahí. `swings` cuenta los
 * swings del video (con varios, se ubica el último).
 */
export function findSwingWindow(input: Frame[], opts: { aspect?: number } = {}): { from: number; to: number; swings: number } | null {
  const aspect = opts.aspect && opts.aspect > 0 ? opts.aspect : 1;
  const frames = stableFrames(input.filter((f) => frameVisible(f.lm)).map((f) => scaleX(f, aspect)));
  if (frames.length < 8) return null;
  const ev = findEvents(frames);
  const A = frames[ev.address], I = frames[ev.impact];
  if (ev.amplitude < torsoLen(A) * 0.5 || ev.impact <= ev.top || ev.top <= ev.address) return null;
  return { from: Math.max(0, A.t - 900), to: I.t + 700, swings: ev.swings };
}

const withMismatch = <R extends SwingResult>(r: R, mismatch?: SwingView): R => (mismatch ? { ...r, viewMismatch: mismatch } : r);

export interface Framing { ok: boolean; hint: string }
/**
 * ¿Está el jugador bien encuadrado para leer el swing completo? Recibe los puntos tal como llegan
 * de la cámara (0–1 en cada eje). Hace falta ver cabeza y pies, dejar aire arriba para el palo y
 * estar más o menos centrado.
 */
export function framingCheck(lm: Pt[]): Framing {
  const bad = (hint: string): Framing => ({ ok: false, hint });
  if (!lm || lm.length < 29 || !frameVisible(lm)) return bad('No te veo: entra de cuerpo entero');
  const nose = lm[LM.NOSE], la = lm[LM.L_ANKLE], ra = lm[LM.R_ANKLE];
  const feetY = Math.max(la.y, ra.y);
  // Basta ver un tobillo: de perfil (vista trasera) el pie lejano queda tapado por el cercano y su visibilidad cae aunque los pies estén en cuadro.
  if (Math.max(la.v, ra.v) < 0.5 || feetY > 0.97) return bad('No veo tus pies: aleja el teléfono');
  if (nose.y < 0.16) return bad('Deja aire sobre tu cabeza para el palo: aléjate un poco');
  if (feetY - nose.y < 0.35) return bad('Acércate: te ves muy pequeño');
  const hipX = (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2;
  if (hipX < 0.3 || hipX > 0.7) return bad('Colócate en el centro del cuadro');
  const hx = (lm[LM.L_WRIST].x + lm[LM.R_WRIST].x) / 2;
  if (hx < 0.14 || hx > 0.86) return bad('Deja espacio a los lados para el palo');
  return { ok: true, hint: 'Bien colocado' };
}

/**
 * Analiza un swing. La vista (de frente o desde atrás) se detecta sola con la postura al inicio,
 * salvo que `opts.view` la fije.
 */
export function analyzeSwing(input: Frame[], opts: AnalyzeOptions = {}): SwingResult | SwingError {
  const aspect = opts.aspect && opts.aspect > 0 ? opts.aspect : 1;
  // Quita los cuadros donde el seguimiento salta a otra persona (alguien en el cubículo de al lado).
  const visibles = input.filter((f) => frameVisible(f.lm)).map((f) => scaleX(f, aspect));
  const frames = stableFrames(visibles);
  // Los cuadros donde el modelo no detectó a nadie no llegan aquí: "sampled" los cuenta.
  const total = Math.max(input.length, opts.sampled ?? 0);
  if (total >= 12 && frames.length < total * 0.4) return 'low_visibility';
  if (frames.length < 12) return 'too_short';

  const ev = findEvents(frames);
  const A = frames[ev.address], T = frames[ev.top], I = frames[ev.impact];
  // Un swing completo sube las manos al menos ~60 % del largo del torso.
  if (ev.amplitude < torsoLen(A) * 0.6 || ev.impact <= ev.top || ev.top <= ev.address) return 'no_swing';

  const backswingSec = (T.t - A.t) / 1000;
  const downswingSec = Math.max((I.t - T.t) / 1000, 0.001);
  // Una bajada de menos de 0,15 s no existe a velocidad normal: es el modelo perdiendo las manos en el impacto
  // (el impacto cae en el primer cuadro de recuperación) y daría un tempo imposible (4–79:1).
  if (backswingSec < 0.25 || backswingSec > 3 || downswingSec < MIN_DOWNSWING_SEC || downswingSec > MAX_DOWNSWING_SEC) return 'no_swing';

  // Si el seguimiento saltó en más de 30 % de los cuadros alrededor del swing (el palo tapa la lente, otra persona,
  // la persona sale del cuadro), lo que se midió no es el jugador. En un clip real con el palo sobre la lente saltó 46 %;
  // en los demás clips, 9 % como máximo.
  const lo = A.t - 1000, hi = I.t + 1000;
  const around = (l: Frame[]) => l.filter((f) => f.t >= lo && f.t <= hi).length;
  if (around(frames) < around(visibles) * 0.7) return 'no_swing';

  const auto = detectView(frames, ev.address);
  const view = !opts.view || opts.view === 'auto' ? auto : opts.view;
  // Si el jugador eligió la vista a mano y el video parece de la otra, se avisa en vez de callar.
  const mismatch = opts.view && opts.view !== 'auto' && opts.view !== auto ? auto : undefined;
  const tempo: TempoMetrics = {
    tempoRatio: round(backswingSec / downswingSec, 2),
    backswingSec: round(backswingSec, 2),
    downswingSec: round(downswingSec, 2),
    framesUsed: frames.length,
  };
  if (view === 'atras') return withMismatch(analyzeDtl(frames, ev, tempo, !!opts.lefty), mismatch);

  const sw = shoulderWidth(A) || 1e-6;
  // La subida lleva las manos hacia el lado trasero. De ahí salen el lado del objetivo y la mano
  // dominante, sin depender de lo que diga el perfil: con la cámara mirando al pecho, un diestro
  // sube hacia la izquierda de la imagen y un zurdo hacia la derecha.
  // Sin el desplazamiento rígido del cuerpo entero (teléfono que se mueve), que no es parte de la subida.
  const backDx = handsMid(T).x - handsMid(A).x - drift(T, A).x;
  const sure = Math.abs(backDx) > sw * 0.15;
  const lefty = sure ? backDx > 0 : !!opts.lefty;
  const { lead, trail } = arms(lefty);
  const [sh, el, wr] = lead;

  // Cabeza: el centro de las orejas (la nariz gira con la cabeza), contra la mediana de los cuadros del inicio y sin
  // el desplazamiento rígido del cuerpo entero (jugador que se corre o teléfono que se mueve).
  const first = Math.max(0, ev.address - 2);
  const hs = headSeries(frames, first, ev.impact);
  const h0 = median(hs.slice(0, 3).map((p) => p.x));
  let maxHead = 0;
  for (let i = ev.address; i <= ev.impact; i++) maxHead = Math.max(maxHead, Math.abs(hs[i - first].x - h0 - drift(frames[i], A).x));
  const hipA = hipAt(frames, ev.address, A);
  const hipT = hipAt(frames, ev.top, A);
  const hipI = hipAt(frames, ev.impact, A);
  // El objetivo queda al lado contrario de la subida; si no se pudo ver, del lado del hombro guía.
  const towardTarget = sure ? -Math.sign(backDx) : Math.sign(A.lm[sh].x - mid(A.lm[LM.L_SHOULDER], A.lm[LM.R_SHOULDER]).x) || 1;

  const shoulderTurn = segmentTurn(A, T, LM.L_SHOULDER, LM.R_SHOULDER);
  const hipTurn = segmentTurn(A, T, LM.L_HIP, LM.R_HIP);

  const metrics: SwingMetrics = {
    ...tempo,
    shoulderTurnDeg: round(shoulderTurn),
    hipTurnDeg: round(hipTurn),
    xFactorDeg: round(shoulderTurn - hipTurn),
    spineAddressDeg: round(tiltMed(frames, ev.address - 2, ev.address)),
    spineChangeDeg: round(tiltMed(frames, ev.impact - 1, ev.impact + 1) - tiltMed(frames, ev.address - 2, ev.address)),
    headSwayPct: round((maxHead / sw) * 100, 0),
    hipShiftPct: round((((hipI.x - hipA.x) * towardTarget) / sw) * 100, 0),
    hipSwayPct: round(((-(hipT.x - hipA.x) * towardTarget) / sw) * 100, 0) + 0, // + 0: evita el −0
    leadArmDeg: round(jointAngle(T, sh, el, wr), 0),
    leadArmAddressDeg: round(jointAngle(A, sh, el, wr), 0),
    trailElbowTopDeg: seen(T, trail) ? round(jointAngle(T, ...trail), 0) : null,
    handsAddressPct: round((((handsMid(A).x - hipA.x) * towardTarget) / sw) * 100, 0),
    handsTopPct: round(((shoulderMid(T).y - wristY(T)) / (torsoLen(A) || 1e-6)) * 100, 0),
    ...wristMetrics(frames, ev, lefty),
  };

  const { feedback, score } = coach(metrics);
  return withMismatch({ view: 'frente' as const, lefty, ...buildResult(metrics, feedback, score, ev, frames) }, mismatch);
}

/* ───────────────────────── Vista desde atrás (línea de tiro) ───────────────────────── */

/** Flexión de rodillas (0 = pierna recta). Promedia las piernas cuyos puntos se ven; null si no se ve ninguna. */
function kneeFlex(lm: Pt[]): number | null {
  const legs: [number, number, number][] = [[LM.L_HIP, LM.L_KNEE, LM.L_ANKLE], [LM.R_HIP, LM.R_KNEE, LM.R_ANKLE]];
  const vals = legs
    .filter(([h, k, a]) => lm[h] && lm[k] && lm[a] && Math.min(lm[h].v, lm[k].v, lm[a].v) >= 0.5)
    .map(([h, k, a]) => 180 - angleAt(lm[h], lm[k], lm[a]));
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

/**
 * Límites de la línea de caderas: [hasta aquí está bien, desde aquí es para corregir].
 * Los del impacto desde atrás ya existían. Los del tope, el balanceo (`sway`) y el deslizamiento
 * (`slide`) son de referencia y NO se han contrastado con swings reales: revisarlos con videos propios.
 */
const HIP = {
  dtlTop: [8, 16],     // % del torso hacia la bola en el tope
  dtlImpact: [6, 14],  // % del torso hacia la bola en el impacto
  sway: [15, 30],      // % del ancho de hombros lejos del objetivo en el tope
  slide: 55,           // % del ancho de hombros hacia el objetivo en el impacto
} as const;

export type Tone = 'good' | 'warn' | 'bad';
export interface HipRow { key: 'top' | 'impact'; label: string; pct: number; tone: Tone }
export interface HipLine { rows: HipRow[]; left: string; right: string; unit: string; note: string }

/**
 * Dónde quedan las caderas en el tope y en el impacto respecto a la línea del inicio, listo para dibujar.
 * `pct` positivo va hacia `right`. Devuelve null en resultados guardados antes de medir el tope.
 */
export function hipLine(r: SwingResult): HipLine | null {
  const tone = (v: number, [ok, bad]: readonly [number, number]): Tone => (v <= ok ? 'good' : v <= bad ? 'warn' : 'bad');
  if (r.view === 'atras') {
    const m = r.metrics;
    if (m.hipTopPct == null) return null;
    return {
      left: 'Atrás', right: 'Hacia la bola', unit: '% del torso',
      note: 'Lo ideal es que no crucen la línea hacia la bola: si se acercan, los brazos se quedan sin espacio.',
      rows: [
        { key: 'top', label: 'Tope', pct: m.hipTopPct, tone: tone(m.hipTopPct, HIP.dtlTop) },
        { key: 'impact', label: 'Impacto', pct: m.hipAdvancePct, tone: tone(m.hipAdvancePct, HIP.dtlImpact) },
      ],
    };
  }
  const m = r.metrics;
  if (m.hipSwayPct == null) return null;
  return {
    left: 'Lado trasero', right: 'Hacia el objetivo', unit: '% de hombros',
    note: 'Lo ideal: casi sobre la línea en el tope y un poco hacia el objetivo en el impacto.',
    rows: [
      { key: 'top', label: 'Tope', pct: -m.hipSwayPct + 0, tone: tone(m.hipSwayPct, HIP.sway) },
      { key: 'impact', label: 'Impacto', pct: m.hipShiftPct, tone: m.hipShiftPct < -5 ? 'bad' : m.hipShiftPct < 8 || m.hipShiftPct > HIP.slide ? 'warn' : 'good' },
    ],
  };
}

/** Valor de mayor magnitud (con su signo) de una serie. */
const peak = (xs: number[]) => xs.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);

function analyzeDtl(frames: Frame[], ev: { address: number; top: number; impact: number }, tempo: TempoMetrics, profileLefty = false): DtlResult {
  const A = frames[ev.address], T = frames[ev.top], I = frames[ev.impact];
  const torso = torsoLen(A) || 1e-6;
  const hipA = hipAt(frames, ev.address, A);
  const hipT = hipAt(frames, ev.top, A);
  const hipI = hipAt(frames, ev.impact, A);
  const handsA = mid(A.lm[LM.L_WRIST], A.lm[LM.R_WRIST]);
  // La bola está del lado hacia el que cuelgan las manos al inicio. Si casi no se separan de las caderas
  // (menos de 0,08 torsos) no hay dirección clara: se usa la nariz y, para la mano dominante, el perfil.
  const dxHands = handsA.x - hipA.x;
  const clear = Math.abs(dxHands) > torso * 0.08;
  const towardBall = (clear ? Math.sign(dxHands) : 0) || Math.sign(A.lm[LM.NOSE].x - hipA.x) || 1;

  // Cabeza: centro de las orejas (o la nariz si no se ven), contra la mediana del inicio y sin el desplazamiento del cuerpo.
  const headUp: number[] = [], headFwd: number[] = [];
  const first = Math.max(0, ev.address - 2);
  const hs = headSeries(frames, first, ev.impact);
  const h0 = { x: median(hs.slice(0, 3).map((p) => p.x)), y: median(hs.slice(0, 3).map((p) => p.y)) };
  for (let i = ev.address; i <= ev.impact; i++) {
    const d = drift(frames[i], A), n = hs[i - first];
    headUp.push((h0.y - (n.y - d.y)) / torso);                    // y menor = más arriba
    headFwd.push(((n.x - d.x - h0.x) * towardBall) / torso);
  }
  const knee = kneeFlex(A.lm);
  const spineA = tiltMed(frames, ev.address - 2, ev.address);
  // Con la cámara detrás de las manos apuntando al objetivo, un diestro mira hacia la derecha de la imagen.
  const facing = clear ? Math.sign(dxHands) : 0;
  const lefty = facing !== 0 ? facing < 0 : profileLefty;
  const { trail } = arms(lefty);
  const handsSeenTop = seen(T, [LM.L_WRIST, LM.R_WRIST]);

  const metrics: DtlMetrics = {
    ...tempo,
    spineAddressDeg: round(spineA),
    kneeFlexDeg: knee == null ? null : round(knee, 0),
    spineTopChangeDeg: round(tiltMed(frames, ev.top - 1, ev.top + 1) - spineA),
    spineImpactChangeDeg: round(tiltMed(frames, ev.impact - 1, ev.impact + 1) - spineA),
    hipAdvancePct: round((((hipI.x - hipA.x) * towardBall) / torso) * 100, 0),
    hipTopPct: round((((hipT.x - hipA.x) * towardBall) / torso) * 100, 0) + 0, // + 0: evita el −0
    headVerticalPct: round(peak(headUp) * 100, 0),
    headForwardPct: round(peak(headFwd) * 100, 0),
    handsAddressPct: round((((handsA.x - shoulderMid(A).x) * towardBall) / torso) * 100, 0),
    handsTopPct: round(((shoulderMid(T).y - wristY(T)) / torso) * 100, 0),
    handsDepthTopPct: handsSeenTop ? round(((-(handsMid(T).x - shoulderMid(T).x) * towardBall) / torso) * 100, 0) : null,
    trailElbowTopDeg: seen(T, trail) ? round(jointAngle(T, ...trail), 0) : null,
    ...wristMetrics(frames, ev, lefty),
  };
  const { feedback, score } = coachDtl(metrics);
  return { view: 'atras', lefty, ...buildResult(metrics, feedback, score, ev, frames) };
}

/**
 * Reglas de coaching para la vista desde atrás. Los rangos son de referencia, no medidas de laboratorio.
 * Rodillas, cabeza y profundidad de manos se abrieron en nov 2026 tras medir dos swings reales de una
 * profesional (rodillas 29–33°, cabeza hasta 16–21 %, manos 40–46 %) que los rangos iniciales marcaban como error.
 */
export function coachDtl(m: DtlMetrics): { feedback: Feedback[]; score: number } {
  const fb: Feedback[] = [];
  let penalty = 0;
  const add = (f: Feedback, p = 0) => { fb.push(f); penalty += p; };

  // El tempo no se juzga desde atrás: el arranque del palo va hacia la cámara y casi no se ve, así que
  // la subida sale más corta de lo que es. La misma jugadora dio 2,6–2,8:1 de frente y 1,4–1,8:1 desde atrás.

  // Inclinación al inicio
  if (m.spineAddressDeg >= 25 && m.spineAddressDeg <= 45) {
    add({ key: 'setup', severity: 'good', title: 'Buena inclinación al inicio', detail: `Te inclinas unos ${m.spineAddressDeg}° desde la cadera, dentro del rango de referencia (25–45°).` });
  } else if (m.spineAddressDeg < 25) {
    add({ key: 'setup', severity: m.spineAddressDeg < 15 ? 'fix' : 'improve', title: 'Muy erguido al inicio', detail: `Solo unos ${m.spineAddressDeg}° de inclinación. Tan de pie, los brazos no tienen espacio para pasar.`, drill: 'Apoya un palo en la espalda (cabeza, espalda y cadera) e inclínate desde la cadera hasta que el palo quede a unos 35°, 10 repeticiones.' }, m.spineAddressDeg < 15 ? 10 : 6);
  } else {
    add({ key: 'setup', severity: m.spineAddressDeg > 55 ? 'fix' : 'improve', title: 'Demasiado inclinado al inicio', detail: `Unos ${m.spineAddressDeg}° de inclinación. Tan agachado es difícil girar y mantener el equilibrio.`, drill: 'Párate recto, flexiona un poco las rodillas e inclínate solo hasta que los brazos cuelguen libres bajo los hombros.' }, m.spineAddressDeg > 55 ? 10 : 6);
  }

  // Rodillas al inicio
  if (m.kneeFlexDeg != null) {
    if (m.kneeFlexDeg >= 10 && m.kneeFlexDeg <= 38) {
      add({ key: 'knees', severity: 'good', title: 'Rodillas bien flexionadas', detail: `Unos ${m.kneeFlexDeg}° de flexión al inicio: base atlética y estable.` });
    } else if (m.kneeFlexDeg < 10) {
      add({ key: 'knees', severity: 'improve', title: 'Piernas rígidas al inicio', detail: `Apenas ${m.kneeFlexDeg}° de flexión. Con las piernas rectas cuesta girar y usar el suelo.`, drill: 'Antes de cada swing, da un pequeño salto y quédate como aterrizaste: esa es tu flexión.' }, 5);
    } else {
      add({ key: 'knees', severity: 'improve', title: 'Rodillas demasiado flexionadas', detail: `Unos ${m.kneeFlexDeg}° de flexión. Sentarte tanto limita el giro de caderas.`, drill: 'Colócate con las piernas rectas y afloja las rodillas solo hasta sentir el peso en el centro de los pies.' }, 5);
    }
  }

  // Postura en el tope
  if (Math.abs(m.spineTopChangeDeg) > 8) {
    const up = m.spineTopChangeDeg < 0;
    add({ key: 'top', severity: Math.abs(m.spineTopChangeDeg) > 14 ? 'fix' : 'improve', title: up ? 'Te levantas en la subida' : 'Te agachas en la subida', detail: `La inclinación cambia ${Math.abs(m.spineTopChangeDeg)}° entre el inicio y el tope. Luego hay que compensar en la bajada.`, drill: 'Subidas lentas frente a un espejo lateral manteniendo el pecho apuntando a la bola, 12 repeticiones.' }, Math.abs(m.spineTopChangeDeg) > 14 ? 10 : 5);
  }

  // Postura en el impacto
  const ic = m.spineImpactChangeDeg;
  if (Math.abs(ic) <= 7) {
    add({ key: 'spine', severity: 'good', title: 'Mantienes la postura', detail: 'Tu inclinación en el impacto es casi la misma que al inicio.' });
  } else if (ic < 0) {
    add({ key: 'spine', severity: ic < -14 ? 'fix' : 'improve', title: 'Te levantas en el impacto', detail: `Te enderezas ${Math.abs(ic)}° antes de pegar. Suele dar golpes topeados o con la punta.`, drill: 'Swings a media velocidad con la cadera tocando una silla detrás de ti durante todo el movimiento.' }, ic < -14 ? 14 : 7);
  } else {
    add({ key: 'spine', severity: ic > 14 ? 'fix' : 'improve', title: 'Te agachas en el impacto', detail: `Te inclinas ${ic}° más que al inicio. Suele dar golpes gordos.`, drill: 'Swings a media velocidad con la frente rozando una pared acolchada o un cojín sostenido por alguien.' }, ic > 14 ? 12 : 6);
  }

  // Línea de caderas en la subida: al girar, el centro de las caderas debe quedarse donde empezó.
  const [topOk, topBad] = HIP.dtlTop;
  const hipTop = m.hipTopPct ?? 0;
  if (hipTop > topOk) {
    add({ key: 'hipsTop', severity: hipTop > topBad ? 'fix' : 'improve', title: 'Las caderas se acercan a la bola en la subida', detail: `En el tope ya están un ${hipTop}% del largo de tu torso más cerca de la bola que al inicio. Empiezas la bajada con menos espacio para los brazos.`, drill: 'Subidas lentas con los glúteos rozando una pared o silla: al girar, la cadera trasera empuja hacia la pared en vez de despegarse, 12 repeticiones.' }, hipTop > topBad ? 8 : 4);
  }

  // Extensión temprana: caderas hacia la bola en el impacto. Con la posición del tope se sabe en qué
  // parte del swing ocurre, y con el cambio de inclinación, si además el pecho se levanta.
  const [impOk, impBad] = HIP.dtlImpact;
  if (m.hipAdvancePct <= impOk) {
    add({ key: 'extension', severity: 'good', title: 'Caderas en su sitio', detail: hipTop > topOk
      ? 'En el impacto tus caderas vuelven a la línea del inicio: recuperas el espacio para los brazos.'
      : m.hipTopPct != null
        ? 'Tus caderas se quedan en la línea del inicio en la subida y en la bajada: dejas espacio para los brazos.'
        : 'Tus caderas no se acercan a la bola en la bajada: dejas espacio para los brazos.' });
  } else {
    const down = m.hipAdvancePct - hipTop; // lo que avanzan entre el tope y el impacto
    const where = m.hipTopPct == null ? ''
      : hipTop <= topOk ? ' Ocurre en la bajada: llegas bien al tope y de ahí las caderas se van hacia la bola.'
      : down > impOk ? ' Empieza en la subida y sigue en la bajada.'
      : ' Viene de la subida: en el tope ya estaban adelantadas y no regresan.';
    const chest = m.spineImpactChangeDeg < -7 ? ` Además el pecho se levanta ${Math.abs(m.spineImpactChangeDeg)}°: las dos señales juntas son el patrón típico de extensión temprana.` : '';
    add({ key: 'extension', severity: m.hipAdvancePct > impBad ? 'fix' : 'improve', title: 'Las caderas se acercan a la bola', detail: `En el impacto están un ${m.hipAdvancePct}% del largo de tu torso más cerca de la bola que al inicio (extensión temprana). Quita espacio a los brazos y obliga a compensar con las manos.${where}${chest}`, drill: 'Colócate con los glúteos rozando una pared o silla y haz swings a media velocidad sin perder el contacto hasta después del impacto. En la bajada, siente que el bolsillo trasero del lado guía se va hacia la pared mientras giras.' }, m.hipAdvancePct > impBad ? 14 : 7);
  }

  // Cabeza
  const hv = Math.abs(m.headVerticalPct), hf = Math.abs(m.headForwardPct);
  if (hv <= 18 && hf <= 22) {
    add({ key: 'head', severity: 'good', title: 'Cabeza estable', detail: 'Tu cabeza casi no sube, baja ni se acerca a la bola durante el swing.' });
  } else if (hv >= hf) {
    add({ key: 'head', severity: hv > 30 ? 'fix' : 'improve', title: m.headVerticalPct > 0 ? 'La cabeza sube' : 'La cabeza baja', detail: `Se mueve en vertical un ${hv}% del largo de tu torso. Cambia la distancia a la bola en pleno swing.`, drill: 'Practica con una marca en la pared a la altura de tu cabeza y mantenla alineada hasta el impacto.' }, hv > 30 ? 10 : 5);
  } else {
    add({ key: 'head', severity: hf > 35 ? 'fix' : 'improve', title: m.headForwardPct > 0 ? 'La cabeza se va hacia la bola' : 'La cabeza se aleja de la bola', detail: `Se desplaza un ${hf}% del largo de tu torso. Indica que pierdes el equilibrio entre puntas y talones.`, drill: 'Swings descalzo a media velocidad sintiendo el peso en el centro de los pies.' }, hf > 35 ? 10 : 5);
  }

  // Manos al inicio: los brazos deben colgar casi bajo los hombros
  if (m.handsAddressPct != null) {
    if (m.handsAddressPct > 30) {
      add({ key: 'hands', severity: m.handsAddressPct > 45 ? 'fix' : 'improve', title: 'Estiras los brazos hacia la bola', detail: `Tus manos quedan un ${m.handsAddressPct}% del largo de tu torso por delante de los hombros. Estás lejos de la bola y el swing pierde control.`, drill: 'Colócate, suelta el palo y deja colgar los brazos: donde caen las manos es donde debes tomar el palo.' }, m.handsAddressPct > 45 ? 8 : 5);
    } else if (m.handsAddressPct < -5) {
      add({ key: 'hands', severity: 'improve', title: 'Manos muy pegadas al cuerpo', detail: 'Tus manos quedan por detrás de la línea de los hombros. Falta espacio para que pasen los brazos.', drill: 'Al colocarte, deja un puño de distancia entre el extremo del palo y tus muslos.' }, 4);
    } else {
      add({ key: 'hands', severity: 'good', title: 'Brazos cuelgan libres al inicio', detail: 'Tus manos quedan casi bajo los hombros: buena distancia a la bola.' });
    }
  }
  // Manos en el tope: profundidad
  if (m.handsDepthTopPct != null) {
    if (m.handsDepthTopPct > 65) {
      add({ key: 'depth', severity: 'improve', title: 'Manos muy atrás en el tope', detail: `Quedan un ${m.handsDepthTopPct}% del largo de tu torso por detrás de los hombros: subida plana, alrededor del cuerpo.`, drill: 'Subidas lentas sintiendo que las manos suben sobre el hombro trasero, no detrás de la espalda.' }, 4);
    } else if (m.handsDepthTopPct < -20) {
      add({ key: 'depth', severity: 'improve', title: 'Manos por delante en el tope', detail: 'Tus manos suben por fuera, del lado de la bola: subida empinada, con poco giro.', drill: 'Subidas lentas girando el pecho hasta dar la espalda al objetivo antes de levantar los brazos.' }, 4);
    }
  }
  armRules(m, add);

  const order: Record<Severity, number> = { fix: 0, improve: 1, good: 2 };
  fb.sort((a, b) => order[a.severity] - order[b.severity]);
  return { feedback: fb, score: Math.round(clamp(96 - penalty, 35, 98)) };
}

/** Reglas de manos en el tope, comunes a las dos vistas. */
function armRules(m: { handsTopPct?: number }, add: (f: Feedback, p?: number) => void) {
  if (m.handsTopPct != null && m.handsTopPct < 0) {
    add({ key: 'height', severity: 'improve', title: 'Manos bajas en el tope', detail: 'Tus manos no llegan a la altura de los hombros: la subida queda corta y pierdes recorrido.', drill: 'Sin bola, sube hasta sentir las manos por encima del hombro trasero y sostén dos segundos, 10 repeticiones.' }, 4);
  }
}

/**
 * Límites del tempo (subida ÷ bajada): [hasta aquí es apresurado, desde aquí es lento] y, más allá, "corregir".
 * Con video de teléfono a 30 cuadros por segundo la bajada (≈ 0,3 s) se mide con un cuadro de error (≈ ±10 %),
 * así que un 3:1 perfecto puede salir entre 2,7 y 3,4: la banda buena es ancha a propósito.
 */
export const TEMPO = { fastOk: 2.3, slowOk: 3.7, fastBad: 1.3, slowBad: 5.0 } as const;
// "Corregir" solo en los extremos: en pruebas con un mismo swing real el tempo salió entre 1,2 y 2,8 según dónde se
// decidía que empezaba la subida (las manos casi no se mueven al arrancar), así que no se castiga lo dudoso.

/** Límite de inclinación lateral desde el frente: [hasta aquí está bien, desde aquí es para corregir] en grados. */
export const SPINE_SIDE = [15, 22] as const;

/** Regla de tempo, común a las dos vistas. */
function tempoRule(m: TempoMetrics, add: (f: Feedback, p?: number) => void) {
  if (m.tempoRatio >= TEMPO.fastOk && m.tempoRatio <= TEMPO.slowOk) {
    add({ key: 'tempo', severity: 'good', title: 'Tempo equilibrado', detail: `Tu relación subida/bajada es ${m.tempoRatio}:1, cerca del 3:1 de referencia. Con video de teléfono es una estimación (depende de dónde se marca el inicio de la subida): compárala entre tus swings.` });
  } else if (m.tempoRatio < TEMPO.fastOk) {
    const sev: Severity = m.tempoRatio < TEMPO.fastBad ? 'fix' : 'improve';
    add({ key: 'tempo', severity: sev, title: 'Subida apresurada', detail: `Tempo ${m.tempoRatio}:1. La subida es corta respecto a la bajada, lo que suele quitar control y distancia.`, drill: 'Cuenta "uno-dos-tres" en la subida y "ya" en la bajada, 10 swings sin bola.' }, sev === 'fix' ? 14 : 7);
  } else {
    const sev: Severity = m.tempoRatio > TEMPO.slowBad ? 'fix' : 'improve';
    add({ key: 'tempo', severity: sev, title: 'Subida demasiado lenta', detail: `Tempo ${m.tempoRatio}:1. Una subida tan larga rompe el ritmo y dificulta repetir el swing.`, drill: 'Swings continuos sin pausa (ida y vuelta) con un wedge, 3 series de 8.' }, sev === 'fix' ? 12 : 6);
  }
}

/** Reglas de coaching de la vista de frente: convierte métricas en observaciones, ejercicios y una nota 0–100. */
export function coach(m: SwingMetrics): { feedback: Feedback[]; score: number } {
  const fb: Feedback[] = [];
  let penalty = 0;
  const add = (f: Feedback, p = 0) => { fb.push(f); penalty += p; };

  tempoRule(m, add);

  // Giro de hombros
  if (m.shoulderTurnDeg >= 75) {
    add({ key: 'shoulders', severity: 'good', title: 'Buen giro de hombros', detail: `Giras unos ${m.shoulderTurnDeg}° en el tope, suficiente para generar potencia.` });
  } else {
    const sev: Severity = m.shoulderTurnDeg < 55 ? 'fix' : 'improve';
    add({ key: 'shoulders', severity: sev, title: 'Giro de hombros corto', detail: `Unos ${m.shoulderTurnDeg}° en el tope (referencia: 80–100°). Pierdes recorrido y potencia.`, drill: 'Cruza un palo sobre los hombros y gira hasta que apunte a la bola, 15 repeticiones.' }, sev === 'fix' ? 14 : 7);
  }

  // Caderas / X-factor
  if (m.hipTurnDeg > 60) {
    add({ key: 'hips', severity: 'improve', title: 'Caderas giran de más', detail: `Unos ${m.hipTurnDeg}° de giro de cadera. Con tanta cadera se pierde la tensión entre tronco y piernas.`, drill: 'Subida con una pelota o cojín entre las rodillas para estabilizar la base.' }, 6);
  } else if (m.xFactorDeg >= 30) {
    add({ key: 'hips', severity: 'good', title: 'Buena separación tronco-cadera', detail: `Diferencia de ${m.xFactorDeg}° entre hombros y caderas: buena fuente de potencia.` });
  }

  // Inclinación lateral. De frente se ve cuánto se inclina el tronco hacia un lado, no hacia delante, y un buen
  // swing la aumenta unos 10–15° hacia atrás en el impacto: solo se marca lo grande. La inclinación hacia delante
  // (levantarse o agacharse) se juzga desde atrás.
  const sc = Math.abs(m.spineChangeDeg);
  if (sc <= SPINE_SIDE[0]) {
    add({ key: 'spine', severity: 'good', title: 'Postura estable', detail: 'La inclinación lateral del tronco cambia poco entre el inicio y el impacto.' });
  } else {
    const sev: Severity = sc > SPINE_SIDE[1] ? 'fix' : 'improve';
    add({ key: 'spine', severity: sev, title: 'Mucha inclinación lateral en el impacto', detail: `El tronco se inclina ${sc}° de lado entre el inicio y el impacto. Algo de inclinación hacia atrás es normal; tanta mueve el punto bajo del swing. De frente no se ve si te levantas o te agachas: eso se mide mejor desde atrás.`, drill: 'Swings a media velocidad con la cadera tocando una silla detrás de ti durante todo el movimiento.' }, sev === 'fix' ? 8 : 4);
  }

  // Cabeza
  if (m.headSwayPct <= 25) {
    add({ key: 'head', severity: 'good', title: 'Cabeza quieta', detail: 'Tu cabeza casi no se desplaza durante el swing.' });
  } else {
    const sev: Severity = m.headSwayPct > 45 ? 'fix' : 'improve';
    add({ key: 'head', severity: sev, title: 'La cabeza se desplaza', detail: `Se mueve lateralmente un ${m.headSwayPct}% del ancho de tus hombros. Dificulta el contacto limpio.`, drill: 'Practica frente a una pared o espejo con una marca a la altura de la cabeza y no la pierdas.' }, sev === 'fix' ? 12 : 6);
  }

  // Caderas en la subida: deben girar casi en su sitio, no irse hacia el lado trasero
  const [swayOk, swayBad] = HIP.sway;
  if (m.hipSwayPct != null && m.hipSwayPct > swayOk) {
    add({ key: 'sway', severity: m.hipSwayPct > swayBad ? 'fix' : 'improve', title: 'Las caderas se desplazan en la subida', detail: `En el tope están un ${m.hipSwayPct}% del ancho de tus hombros más lejos del objetivo que al inicio. Te desplazas en vez de girar, y luego cuesta volver a tiempo a la bola.`, drill: 'Subidas lentas con una silla o una pared pegada a la cadera trasera: gira sin empujarla, 12 repeticiones.' }, m.hipSwayPct > swayBad ? 8 : 4);
  }

  // Transferencia hacia el objetivo
  if (m.hipShiftPct > HIP.slide) {
    add({ key: 'shift', severity: 'improve', title: 'Las caderas se deslizan de más', detail: `En el impacto avanzaron un ${m.hipShiftPct}% del ancho de tus hombros hacia el objetivo. Tanto desplazamiento sin giro deja el cuerpo por delante de la bola y las manos atrás.`, drill: 'Swings a media velocidad con una silla o varilla junto a la cadera guía: llega a rozarla y gira, sin empujarla.' }, 4);
  } else if (m.hipShiftPct >= 8) {
    add({ key: 'shift', severity: 'good', title: 'Transfieres el peso al frente', detail: 'Tus caderas avanzan hacia el objetivo en el impacto.' });
  } else {
    const sev: Severity = m.hipShiftPct < -5 ? 'fix' : 'improve';
    add({ key: 'shift', severity: sev, title: 'Peso atrás en el impacto', detail: 'Las caderas no avanzan hacia el objetivo. Suele producir golpes débiles o altos.', drill: 'Paso al frente: inicia la bajada dando un pequeño paso con el pie guía, 10 repeticiones.' }, sev === 'fix' ? 12 : 6);
  }

  // Brazo guía
  if (m.leadArmDeg < 140) {
    add({ key: 'arm', severity: 'improve', title: 'Brazo guía muy flexionado', detail: `Codo a ${m.leadArmDeg}° en el tope. Un brazo más extendido da un arco más ancho y consistente.`, drill: 'Subidas lentas hasta la altura del pecho manteniendo el brazo guía largo, 12 repeticiones.' }, 5);
  } else if (m.leadArmAddressDeg != null && m.leadArmAddressDeg < 150) {
    add({ key: 'arm', severity: 'improve', title: 'Brazo guía doblado al inicio', detail: `Codo a ${m.leadArmAddressDeg}° antes de empezar. Empieza con el brazo guía largo y relajado.`, drill: 'Al colocarte, deja que el brazo guía cuelgue recto y forme una línea con el palo.' }, 4);
  }

  // Manos al inicio
  if (m.handsAddressPct != null) {
    if (m.handsAddressPct < -20) {
      add({ key: 'hands', severity: 'improve', title: 'Manos atrasadas al inicio', detail: 'Tus manos quedan por detrás del centro del cuerpo, lejos del objetivo. Favorece el cuchareo en el impacto.', drill: 'Colócate con las manos frente a la cara interna del muslo guía.' }, 4);
    } else if (m.handsAddressPct > 85) {
      add({ key: 'hands', severity: 'improve', title: 'Manos muy adelantadas al inicio', detail: 'Tus manos quedan muy por delante del centro del cuerpo. Cierra la cara y quita altura al golpe.', drill: 'Colócate con las manos frente a la cara interna del muslo guía, no más allá.' }, 3);
    }
  }
  armRules(m, add);

  const order: Record<Severity, number> = { fix: 0, improve: 1, good: 2 };
  fb.sort((a, b) => order[a.severity] - order[b.severity]);
  return { feedback: fb, score: Math.round(clamp(96 - penalty, 35, 98)) };
}

export const SWING_ERROR_TEXT: Record<SwingError, string> = {
  too_short: 'No se detectó tu cuerpo el tiempo suficiente. Graba el swing completo, de cuerpo entero.',
  no_swing: 'No se detectó un swing completo. Graba un solo swing, a velocidad normal (no en cámara lenta), desde antes de empezar hasta un poco después del golpe, con las manos y los pies dentro del cuadro y nadie más en la imagen.',
  low_visibility: 'No se te ve con claridad. Mejora la luz y coloca la cámara de frente o desde atrás, a unos 3 metros, con el cuerpo entero en el cuadro.',
};
