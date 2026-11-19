// Maniquí 3D paramétrico de un golfista diestro visto de frente. Sirve para dos cosas a la vez:
//  1) dibujar el golfista 2D animado (golfista.html), y
//  2) producir los 33 puntos de postura (formato MediaPipe) del mismo swing, para probar el análisis
//     de la app sin modelo de visión (probar-swing.mjs).
// Es un maniquí inventado para ejercitar el código: NO es evidencia de cómo se ve un swing real.
//
// Unidades: metros. X = derecha de la imagen (hacia el objetivo para un diestro de frente),
// Y = arriba, Z = hacia la cámara. El golfista mira a la cámara.

export const W = 720, H = 1280;           // video vertical, como lo grabaría un teléfono
export const ASPECT = W / H;
const VIEW_H = 2.9;                         // metros visibles en vertical
const Y_FLOOR = 0.90;                       // y normalizada del suelo

export const SW = 0.40, HW = 0.30, SPINE = 0.50, ARM_U = 0.30, ARM_F = 0.27, LEG_U = 0.45, LEG_L = 0.45, PELVIS_Y = 0.95;
const BEND = (32 * Math.PI) / 180;          // inclinación hacia adelante (constante)
const rad = (d) => (d * Math.PI) / 180;

const EASE = { io: (u) => u * u * (3 - 2 * u), in: (u) => u * u, out: (u) => 1 - (1 - u) * (1 - u) };
export function keys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [t0, v0] = ks[i - 1], [t1, v1, e] = ks[i];
      return v0 + (v1 - v0) * EASE[e || 'io']((t - t0) / Math.max(1e-9, t1 - t0));
    }
  }
  return ks[ks.length - 1][1];
}

/** Parámetros de cada swing. Los defectos se activan cambiando un solo parámetro. */
export const BASE = { back: 1.05, down: 0.33, shTop: 95, hipTop: 42, headSway: 0.03, hipShift: 0.07, leanImpact: -5, reach: 0.99 };
export const VARIANTS = {
  bueno: { label: 'Swing equilibrado', ...BASE },
  rapido: { label: 'Subida apresurada', ...BASE, back: 0.5, down: 0.36 },
  corto: { label: 'Giro de hombros corto', ...BASE, shTop: 42, hipTop: 30 },
  cabeza: { label: 'La cabeza se desplaza', ...BASE, headSway: 0.2 },
  postura: { label: 'Pierde la postura', ...BASE, leanImpact: -17 },
  peso: { label: 'Peso atrás en el impacto', ...BASE, hipShift: -0.06 },
  brazo: { label: 'Brazo guía flexionado', ...BASE, reach: 0.74 },
};
export const VARIANT_LABELS = Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, v.label]));

export function timeline(p) {
  const T0 = 1.0, top = T0 + p.back, imp = top + p.down, fin = imp + 0.6, end = fin + 1.2;
  return { T0, top, imp, fin, end };
}
export const duration = (variant) => timeline(VARIANTS[variant]).end;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / (len(a) || 1));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Cinemática inversa de dos huesos: codo (o rodilla) entre un hombro y una muñeca. `pole` indica hacia dónde dobla. */
function ik(S, Wr, a, b, pole) {
  let d = sub(Wr, S), dist = len(d);
  const maxD = (a + b) * 0.999;
  if (dist > maxD) { d = mul(norm(d), maxD); dist = maxD; Wr = add(S, d); }
  const dir = norm(d);
  const along = (a * a - b * b + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  let p = sub(pole, mul(dir, dot(pole, dir)));
  p = norm(p);
  return { mid: add(add(S, mul(dir, along)), mul(p, h)), end: Wr };
}

/** Todas las articulaciones (3D) del swing en el instante t. */
export function pose(t, variant = 'bueno') {
  const p = typeof variant === 'string' ? VARIANTS[variant] : variant;
  const { T0, top, imp, fin, end } = timeline(p);
  const ts = keys(t, [[0, 0], [T0, 0], [top, p.shTop, 'io'], [imp, -12, 'in'], [fin, -85, 'out'], [end, -85]]);
  const th = keys(t, [[0, 0], [T0, 0], [top, p.hipTop, 'io'], [imp, -30, 'in'], [fin, -60, 'out'], [end, -60]]);
  const lean = rad(keys(t, [[0, -3], [T0, -3], [top, -5, 'io'], [imp, p.leanImpact, 'in'], [fin, 8, 'out'], [end, 8]]));
  const hipX = keys(t, [[0, 0], [T0, 0], [top, -0.03, 'io'], [imp, p.hipShift, 'in'], [fin, p.hipShift + 0.1, 'out'], [end, p.hipShift + 0.1]]);
  const headX = keys(t, [[0, 0], [T0, 0], [top, -p.headSway, 'io'], [imp, 0.02, 'in'], [fin, 0.06, 'out'], [end, 0.06]]);

  const P = [hipX, PELVIS_Y, 0];
  const M = add(P, [SPINE * Math.cos(BEND) * Math.sin(lean), SPINE * Math.cos(BEND) * Math.cos(lean), SPINE * Math.sin(BEND)]);
  const ax = (a) => [Math.cos(rad(a)), 0, Math.sin(rad(a))];
  const SL = add(M, mul(ax(ts), SW / 2)), SR = sub(M, mul(ax(ts), SW / 2));
  const HL = add(P, mul(ax(th), HW / 2)), HR = sub(P, mul(ax(th), HW / 2));

  // Manos (centro del agarre) relativas a los hombros; con `reach` < 1 el brazo guía queda flexionado.
  const k = p.shTop / 95;
  const off = [
    keys(t, [[0, 0.06], [T0, 0.06], [top, -0.46 * k, 'io'], [imp, 0.06, 'in'], [fin, 0.26, 'out'], [end, 0.26]]),
    keys(t, [[0, -0.57], [T0, -0.57], [top, 0.28 * k, 'io'], [imp, -0.55, 'in'], [fin, 0.04, 'out'], [end, 0.04]]),
    keys(t, [[0, 0.12], [T0, 0.12], [top, -0.12, 'io'], [imp, 0.12, 'in'], [fin, -0.05, 'out'], [end, -0.05]]),
  ];
  let Hc = add(M, off);
  const toH = sub(Hc, SL), dH = len(toH), maxReach = (ARM_U + ARM_F) * p.reach;
  if (dH > maxReach) Hc = add(SL, mul(toH, maxReach / dH));
  const grip = [0.035, 0, 0];
  const WL = add(Hc, grip), WR = sub(Hc, grip);
  const armL = ik(SL, WL, ARM_U, ARM_F, [0.3, -1, 0.2]);
  const armR = ik(SR, WR, ARM_U, ARM_F, [-0.3, -1, 0.2]);

  const nose = [M[0] - (M[0] - 0) * 0 + (headX + 0.02), M[1] + 0.22, M[2] + 0.14];
  nose[0] = headX; // la cabeza se mueve por su cuenta; el cuello se estira un poco si hace falta

  const ankleL = [0.2, 0.08, 0], ankleR = [-0.2, 0.08, 0];
  const legL = ik(HL, ankleL, LEG_U, LEG_L, [0.05, 0, 1]);
  const legR = ik(HR, ankleR, LEG_U, LEG_L, [-0.05, 0, 1]);

  const clubAngle = rad(keys(t, [[0, -90], [T0, -90], [top, 12, 'io'], [imp, -88, 'in'], [fin, -205, 'out'], [end, -205]]));
  const hands = Hc;
  const clubHead = [hands[0] + Math.cos(clubAngle) * 0.95, hands[1] + Math.sin(clubAngle) * 0.95, hands[2]];

  // Bola: quieta hasta el impacto y luego sale hacia el objetivo.
  const ball0 = [0.18, 0.03, 0.55];
  const tb = Math.max(0, t - imp);
  const ball = tb <= 0 ? ball0 : [ball0[0] + 1.6 * tb, ball0[1] + 1.8 * tb - 3.2 * tb * tb + 0.0, ball0[2] + 1.2 * tb];

  return { t, P, M, SL, SR, HL, HR, elbowL: armL.mid, wristL: armL.end, elbowR: armR.mid, wristR: armR.end, nose, kneeL: legL.mid, kneeR: legR.mid, ankleL, ankleR, hands, clubHead, ball, ts, th };
}

/** Metros → fracción de la imagen (0–1). */
export const toImg = (v) => [0.5 + v[0] / (VIEW_H * ASPECT), Y_FLOOR - v[1] / VIEW_H, -v[2] / (VIEW_H * ASPECT)];
export const toPx = (v) => { const i = toImg(v); return [i[0] * W, i[1] * H]; };

/** Los 33 puntos de MediaPipe (imagen normalizada + 3D en metros centrado en la cadera) de una pose. */
export function landmarks(j) {
  const around = (c, dx = 0, dy = 0, dz = 0) => add(c, [dx, dy, dz]);
  const pts = new Array(33);
  const set = (i, v) => { pts[i] = v; };
  const n = j.nose;
  set(0, n);
  set(1, around(n, 0.03, 0.03, 0.05)); set(2, around(n, 0.03, 0.03, 0.05)); set(3, around(n, 0.05, 0.03, 0.04));
  set(4, around(n, -0.03, 0.03, 0.05)); set(5, around(n, -0.03, 0.03, 0.05)); set(6, around(n, -0.05, 0.03, 0.04));
  set(7, around(n, 0.09, 0, -0.02)); set(8, around(n, -0.09, 0, -0.02));
  set(9, around(n, 0.02, -0.06, 0.03)); set(10, around(n, -0.02, -0.06, 0.03));
  set(11, j.SL); set(12, j.SR); set(13, j.elbowL); set(14, j.elbowR); set(15, j.wristL); set(16, j.wristR);
  set(17, around(j.wristL, 0.02, -0.04)); set(18, around(j.wristR, -0.02, -0.04));
  set(19, around(j.wristL, 0.02, -0.05)); set(20, around(j.wristR, -0.02, -0.05));
  set(21, around(j.wristL, 0.03, -0.02)); set(22, around(j.wristR, -0.03, -0.02));
  set(23, j.HL); set(24, j.HR); set(25, j.kneeL); set(26, j.kneeR); set(27, j.ankleL); set(28, j.ankleR);
  set(29, around(j.ankleL, 0, -0.06, -0.06)); set(30, around(j.ankleR, 0, -0.06, -0.06));
  set(31, around(j.ankleL, 0.02, -0.06, 0.12)); set(32, around(j.ankleR, -0.02, -0.06, 0.12));
  const lm = pts.map((v) => { const i = toImg(v); return { x: i[0], y: i[1], z: i[2], v: 0.99 }; });
  // 3D "mundo": origen en la mitad de la cadera, y hacia abajo, z negativa hacia la cámara.
  const o = j.P;
  const world = pts.map((v) => ({ x: v[0] - o[0], y: -(v[1] - o[1]), z: -(v[2] - o[2]), v: 0.99 }));
  return { lm, world };
}

/** Secuencia de cuadros {t (ms), lm, world} a `fps` cuadros por segundo, como los pasa la app al análisis. */
export function frames(variant = 'bueno', fps = 20) {
  const d = duration(variant), out = [];
  for (let t = 0; t < d; t += 1 / fps) out.push({ t: t * 1000, ...landmarks(pose(t, variant)) });
  return out;
}
