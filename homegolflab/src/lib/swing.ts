/**
 * Análisis de swing a partir de puntos de postura (MediaPipe Pose, 33 puntos).
 *
 * Todo lo que se reporta aquí se puede estimar razonablemente con una sola cámara
 * y el esqueleto del jugador. NO se reporta trayectoria del palo ni ángulo de la cara:
 * eso requiere seguir el palo, no el cuerpo.
 */

export interface Pt { x: number; y: number; z: number; v: number }
export interface Frame { t: number; lm: Pt[]; world?: Pt[] }

export const LM = {
  NOSE: 0, L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26,
} as const;

export interface SwingMetrics {
  tempoRatio: number;        // subida / bajada (ideal ≈ 3.0)
  backswingSec: number;
  downswingSec: number;
  shoulderTurnDeg: number;   // giro de hombros en el tope
  hipTurnDeg: number;        // giro de caderas en el tope
  xFactorDeg: number;        // hombros − caderas
  spineAddressDeg: number;   // inclinación de columna al inicio
  spineChangeDeg: number;    // cambio de inclinación al impacto
  headSwayPct: number;       // movimiento lateral de cabeza, % del ancho de hombros
  hipShiftPct: number;       // desplazamiento de caderas al impacto, % del ancho de hombros (+ = hacia el objetivo)
  leadArmDeg: number;        // ángulo del codo del brazo guía en el tope (180 = recto)
  framesUsed: number;
}

export type Severity = 'fix' | 'improve' | 'good';
export interface Feedback { severity: Severity; title: string; detail: string; drill?: string; key: string }

export interface SwingResult {
  metrics: SwingMetrics;
  score: number;             // 0–100
  feedback: Feedback[];
  summary: string;
  focus: string[];
  events: { address: number; top: number; impact: number };
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

/** Localiza inicio (address), tope y impacto dentro de una secuencia de cuadros. */
export function findEvents(frames: Frame[]) {
  const n = frames.length;
  const wy = frames.map(wristY);
  const s = Math.floor(n * 0.1);
  const e = Math.max(s + 1, Math.ceil(n * 0.92));
  let top = s;
  for (let i = s; i < e; i++) if (wy[i] < wy[top]) top = i; // y menor = más arriba

  let impact = top;
  const tLimit = frames[top].t + 1500;
  for (let i = top + 1; i < n && frames[i].t <= tLimit; i++) {
    if (wy[i] > wy[impact]) impact = i;
    // en cuanto las manos vuelven a subir claramente, ya pasó el impacto
    else if (wy[impact] - wy[i] > 0.03 && impact > top) break;
  }

  let low = 0;
  for (let i = 0; i <= top; i++) if (wy[i] > wy[low]) low = i;
  const amp = wy[low] - wy[top];
  let address = low;
  for (let i = top; i >= 0; i--) {
    if (wy[i] >= wy[low] - amp * 0.08) { address = i; break; }
  }
  return { address, top, impact, amplitude: amp };
}

export function analyzeSwing(input: Frame[], opts: { lefty?: boolean } = {}): SwingResult | SwingError {
  const frames = input.filter((f) => frameVisible(f.lm));
  if (input.length >= 12 && frames.length < input.length * 0.4) return 'low_visibility';
  if (frames.length < 12) return 'too_short';

  const ev = findEvents(frames);
  const A = frames[ev.address], T = frames[ev.top], I = frames[ev.impact];
  // Un swing completo sube las manos al menos ~60 % del largo del torso.
  if (ev.amplitude < torsoLen(A) * 0.6 || ev.impact <= ev.top || ev.top <= ev.address) return 'no_swing';

  const backswingSec = (T.t - A.t) / 1000;
  const downswingSec = Math.max((I.t - T.t) / 1000, 0.001);
  if (backswingSec < 0.25 || backswingSec > 3 || downswingSec > 1.2) return 'no_swing';

  const sw = shoulderWidth(A) || 1e-6;
  const lefty = !!opts.lefty;
  // Brazo guía: izquierdo para diestros.
  const [sh, el, wr] = lefty ? [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST] : [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST];

  let maxHead = 0;
  for (let i = ev.address; i <= ev.impact; i++) {
    maxHead = Math.max(maxHead, Math.abs(frames[i].lm[LM.NOSE].x - A.lm[LM.NOSE].x));
  }
  const hipA = mid(A.lm[LM.L_HIP], A.lm[LM.R_HIP]);
  const hipI = mid(I.lm[LM.L_HIP], I.lm[LM.R_HIP]);
  // El objetivo está del lado del hombro guía.
  const towardTarget = Math.sign(A.lm[sh].x - mid(A.lm[LM.L_SHOULDER], A.lm[LM.R_SHOULDER]).x) || 1;

  const shoulderTurn = segmentTurn(A, T, LM.L_SHOULDER, LM.R_SHOULDER);
  const hipTurn = segmentTurn(A, T, LM.L_HIP, LM.R_HIP);

  const metrics: SwingMetrics = {
    tempoRatio: round(backswingSec / downswingSec, 2),
    backswingSec: round(backswingSec, 2),
    downswingSec: round(downswingSec, 2),
    shoulderTurnDeg: round(shoulderTurn),
    hipTurnDeg: round(hipTurn),
    xFactorDeg: round(shoulderTurn - hipTurn),
    spineAddressDeg: round(spineTilt(A.lm)),
    spineChangeDeg: round(spineTilt(I.lm) - spineTilt(A.lm)),
    headSwayPct: round((maxHead / sw) * 100, 0),
    hipShiftPct: round((((hipI.x - hipA.x) * towardTarget) / sw) * 100, 0),
    leadArmDeg: round(angleAt(T.lm[sh], T.lm[el], T.lm[wr]), 0),
    framesUsed: frames.length,
  };

  const { feedback, score } = coach(metrics);
  const issues = feedback.filter((f) => f.severity !== 'good');
  const goods = feedback.filter((f) => f.severity === 'good');
  const summary =
    (goods[0] ? `Punto fuerte: ${goods[0].title.toLowerCase()}. ` : '') +
    (issues[0] ? `Lo más importante a trabajar: ${issues[0].title.toLowerCase()}.` : 'Swing muy sólido en todo lo medido. Mantén la rutina.');

  return {
    metrics, score, feedback, summary,
    focus: issues.slice(0, 3).map((f) => f.drill ?? f.title),
    events: { address: ev.address, top: ev.top, impact: ev.impact },
  };
}

/** Reglas de coaching: convierte métricas en observaciones, ejercicios y una nota 0–100. */
export function coach(m: SwingMetrics): { feedback: Feedback[]; score: number } {
  const fb: Feedback[] = [];
  let penalty = 0;
  const add = (f: Feedback, p = 0) => { fb.push(f); penalty += p; };

  // Tempo
  if (m.tempoRatio >= 2.6 && m.tempoRatio <= 3.4) {
    add({ key: 'tempo', severity: 'good', title: 'Tempo equilibrado', detail: `Tu relación subida/bajada es ${m.tempoRatio}:1, muy cerca del 3:1 de referencia.` });
  } else if (m.tempoRatio < 2.6) {
    const sev: Severity = m.tempoRatio < 2 ? 'fix' : 'improve';
    add({ key: 'tempo', severity: sev, title: 'Subida apresurada', detail: `Tempo ${m.tempoRatio}:1. La subida es corta respecto a la bajada, lo que suele quitar control y distancia.`, drill: 'Cuenta "uno-dos-tres" en la subida y "ya" en la bajada, 10 swings sin bola.' }, sev === 'fix' ? 14 : 7);
  } else {
    const sev: Severity = m.tempoRatio > 4.2 ? 'fix' : 'improve';
    add({ key: 'tempo', severity: sev, title: 'Subida demasiado lenta', detail: `Tempo ${m.tempoRatio}:1. Una subida tan larga rompe el ritmo y dificulta repetir el swing.`, drill: 'Swings continuos sin pausa (ida y vuelta) con un wedge, 3 series de 8.' }, sev === 'fix' ? 12 : 6);
  }

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

  // Postura al impacto
  const sc = Math.abs(m.spineChangeDeg);
  if (sc <= 6) {
    add({ key: 'spine', severity: 'good', title: 'Postura estable', detail: 'Mantienes la inclinación de la columna desde el inicio hasta el impacto.' });
  } else {
    const sev: Severity = sc > 12 ? 'fix' : 'improve';
    add({ key: 'spine', severity: sev, title: 'Pierdes la postura en el impacto', detail: `La columna cambia ${sc}° entre el inicio y el impacto. Eso mueve el punto bajo del swing y causa golpes gordos o topeados.`, drill: 'Swings a media velocidad con la cadera tocando una silla detrás de ti durante todo el movimiento.' }, sev === 'fix' ? 14 : 7);
  }

  // Cabeza
  if (m.headSwayPct <= 25) {
    add({ key: 'head', severity: 'good', title: 'Cabeza quieta', detail: 'Tu cabeza casi no se desplaza durante el swing.' });
  } else {
    const sev: Severity = m.headSwayPct > 45 ? 'fix' : 'improve';
    add({ key: 'head', severity: sev, title: 'La cabeza se desplaza', detail: `Se mueve lateralmente un ${m.headSwayPct}% del ancho de tus hombros. Dificulta el contacto limpio.`, drill: 'Practica frente a una pared o espejo con una marca a la altura de la cabeza y no la pierdas.' }, sev === 'fix' ? 12 : 6);
  }

  // Transferencia hacia el objetivo
  if (m.hipShiftPct >= 8) {
    add({ key: 'shift', severity: 'good', title: 'Transfieres el peso al frente', detail: 'Tus caderas avanzan hacia el objetivo en el impacto.' });
  } else {
    const sev: Severity = m.hipShiftPct < -5 ? 'fix' : 'improve';
    add({ key: 'shift', severity: sev, title: 'Peso atrás en el impacto', detail: 'Las caderas no avanzan hacia el objetivo. Suele producir golpes débiles o altos.', drill: 'Paso al frente: inicia la bajada dando un pequeño paso con el pie guía, 10 repeticiones.' }, sev === 'fix' ? 12 : 6);
  }

  // Brazo guía
  if (m.leadArmDeg < 140) {
    add({ key: 'arm', severity: 'improve', title: 'Brazo guía muy flexionado', detail: `Codo a ${m.leadArmDeg}° en el tope. Un brazo más extendido da un arco más ancho y consistente.`, drill: 'Subidas lentas hasta la altura del pecho manteniendo el brazo guía largo, 12 repeticiones.' }, 5);
  }

  const order: Record<Severity, number> = { fix: 0, improve: 1, good: 2 };
  fb.sort((a, b) => order[a.severity] - order[b.severity]);
  return { feedback: fb, score: Math.round(clamp(96 - penalty, 35, 98)) };
}

export const SWING_ERROR_TEXT: Record<SwingError, string> = {
  too_short: 'No se detectó tu cuerpo el tiempo suficiente. Graba el swing completo, de cuerpo entero.',
  no_swing: 'No se detectó un swing completo. Asegúrate de que se vea desde el inicio hasta el final, con las manos y los pies dentro del cuadro.',
  low_visibility: 'No se te ve con claridad. Mejora la luz y coloca la cámara de frente, a unos 3 metros, con el cuerpo entero en el cuadro.',
};
