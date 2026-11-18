/**
 * Búsqueda del palo en un cuadro de video (EXPERIMENTAL).
 *
 * El modelo de postura no ve el palo, así que aquí se busca con visión clásica: la varilla es una
 * línea fina y recta que sale de las manos. Se barren todas las direcciones alrededor de las manos
 * y se queda la que tiene el tramo fino más largo.
 *
 * Límites que hay que tener presentes:
 *  - Solo sirve con el palo casi quieto (inicio y tope). En la bajada la varilla sale borrosa.
 *  - Falla con fondos llenos de líneas (rejas, persianas, bordes de alfombra) o con poco contraste.
 *  - Lee la dirección de la varilla en la imagen, no la cara del palo ni la trayectoria.
 * Por eso lo que sale de aquí se muestra aparte, marcado como experimental, y no entra en la nota.
 */
import { LM, type Feedback, type Pt, type SwingView } from './swing';

export interface Gray { data: Uint8Array; width: number; height: number }

export function toGray(img: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }): Gray {
  const n = img.width * img.height;
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = (img.data[j] * 77 + img.data[j + 1] * 150 + img.data[j + 2] * 29) >> 8;
  return { data: out, width: img.width, height: img.height };
}

export interface Shaft {
  /** Dirección de las manos a la cabeza del palo, en grados de imagen: 0 = derecha, 90 = abajo. */
  angleDeg: number;
  lengthPx: number;
  tip: { x: number; y: number };
  /** 0–1. Combina el largo hallado con cuánto destaca sobre la segunda mejor dirección. */
  confidence: number;
}

export interface ShaftOptions {
  /** Puntos (px) hacia los que NO puede apuntar el palo: los codos, para no confundir un antebrazo. */
  avoid?: { x: number; y: number }[];
  /** Diferencia mínima de gris (0–255) entre la varilla y sus dos lados. */
  minContrast?: number;
  /** Máscara del cuerpo (ver bodyMask), del mismo tamaño que la imagen: 1 = sobre el jugador. */
  mask?: Uint8Array;
  /** Direcciones posibles (grados de imagen). Al inicio el palo solo puede apuntar hacia abajo. */
  allow?: (angleDeg: number) => boolean;
}

/** Al inicio la cabeza del palo está en el suelo: la varilla apunta hacia abajo. */
export const pointsDown = (angleDeg: number) => angleDeg >= 20 && angleDeg <= 160;

/**
 * Marca los píxeles que caen sobre el jugador (tronco, brazos, piernas y cabeza) a partir de los
 * puntos de postura en px. Sirve para no tomar por palo la raya del pantalón o una costura: una
 * línea que vive entera sobre el cuerpo no es un palo. La varilla sí puede cruzar por delante del
 * cuerpo (al inicio pasa frente a las piernas), pero además sale de él hasta el suelo.
 */
export function bodyMask(width: number, height: number, lm: { x: number; y: number }[], unit: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const disc = (cx: number, cy: number, r: number) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[y * width + x] = 1;
  };
  const limb = (a: number, b: number, r: number) => {
    const A = lm[a], B = lm[b];
    if (!A || !B) return;
    const n = Math.max(1, Math.ceil(Math.hypot(B.x - A.x, B.y - A.y) / (r * 0.5)));
    for (let i = 0; i <= n; i++) disc(A.x + ((B.x - A.x) * i) / n, A.y + ((B.y - A.y) * i) / n, r);
  };
  const r = unit * 0.13;
  for (const [a, b] of [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [11, 13], [13, 15], [12, 14], [14, 16]]) limb(a, b, r);
  limb(27, 31, r * 0.8); limb(28, 32, r * 0.8); // pies
  // Interior del tronco: de hombros a caderas, tan ancho como el cuerpo se vea.
  if (lm[11] && lm[12] && lm[23] && lm[24]) {
    const half = Math.max(Math.hypot(lm[11].x - lm[12].x, lm[11].y - lm[12].y), Math.hypot(lm[23].x - lm[24].x, lm[23].y - lm[24].y)) / 2 + r;
    const sx = (lm[11].x + lm[12].x) / 2, sy = (lm[11].y + lm[12].y) / 2, hx = (lm[23].x + lm[24].x) / 2, hy = (lm[23].y + lm[24].y) / 2;
    const n = Math.max(1, Math.ceil(Math.hypot(hx - sx, hy - sy) / (half * 0.5)));
    for (let i = 0; i <= n; i++) disc(sx + ((hx - sx) * i) / n, sy + ((hy - sy) * i) / n, half);
  }
  if (lm[0]) disc(lm[0].x, lm[0].y, unit * 0.22);  // cabeza y gorra
  return mask;
}

/**
 * Busca la varilla cerca de `hands` (px, el punto medio de las muñecas). `unit` es el largo del
 * torso en px: fija la escala (grosor esperado, largo mínimo y máximo del palo).
 *
 * Las muñecas no están justo sobre la varilla (el grip queda unos centímetros más allá), así que
 * no se exige que la línea pase por ese punto: se prueban todas las rectas que pasan a menos de
 * 0,3 torsos de las manos y se queda el tramo fino más largo que arranque cerca de ellas.
 */
export function findShaft(g: Gray, hands: { x: number; y: number }, unit: number, opts: ShaftOptions = {}): Shaft | null {
  if (!(unit > 20)) return null;
  const { data, width: W, height: H } = g;
  const side = Math.min(7, Math.max(2, Math.round(unit / 45) + 2)); // separación a cada lado de la línea
  const tMax = Math.round(unit * 2.5), rhoMax = Math.round(unit * 0.3);
  const nearBy = unit * 0.75, gapMax = Math.max(4, Math.round(unit * 0.1));
  const minLen = unit * 0.7, thr = opts.minContrast ?? 14, mask = opts.mask;
  const onBody = (x: number, y: number) => !!mask && x >= 0 && y >= 0 && x < W && y < H && mask[(y | 0) * W + (x | 0)] === 1;
  const px = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : data[(y | 0) * W + (x | 0)]);

  // Mejor tramo por dirección (grados, de las manos hacia la punta).
  const len = new Float32Array(360), rhoOf = new Float32Array(360), tipOf = new Float32Array(360);
  for (let a = 0; a < 180; a++) {
    const th = (a * Math.PI) / 180, dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
    // Línea fina: el centro es más claro (o más oscuro) que LOS DOS lados. Un borde simple no pasa.
    // Devuelve +1 si la línea es más clara que el fondo, −1 si más oscura, 0 si no hay línea.
    // Cada lectura promedia 5 puntos a lo largo de la recta: una línea de verdad sobrevive al promedio;
    // el grano del pasto o de la grava, que no sigue ninguna dirección, se cancela.
    const along = (x: number, y: number) => {
      let sum = 0;
      for (let k = -4; k <= 4; k += 2) { const v = px(x + dx * k, y + dy * k); if (v < 0) return -1; sum += v; }
      return sum / 5;
    };
    const thin = (x: number, y: number) => {
      const c = along(x, y), p = along(x + nx * side, y + ny * side), q = along(x - nx * side, y - ny * side);
      if (c < 0 || p < 0 || q < 0) return 0;
      const d1 = c - p, d2 = c - q;
      return d1 > thr && d2 > thr ? 1 : d1 < -thr && d2 < -thr ? -1 : 0;
    };
    for (let rho = -rhoMax; rho <= rhoMax; rho += 3) {
      const ox = hands.x + nx * rho, oy = hands.y + ny * rho;
      let start = 0, last = 0, hits = 0, outHits = 0, seenOff = 0, gap = 0, open = false;
      // La varilla es clara u oscura de forma sostenida; el pasto o la grava cambian de signo a cada paso.
      // Un tramo admite como mucho dos cambios de signo, y solo tras un trecho largo del mismo (la varilla
      // pasa del cielo al pasto); cualquier otro cambio corta el tramo.
      let pol = 0, flips = 0, streak = 0;
      const close = () => {
        open = false;
        const span = last - start;
        // Hace falta un trecho fuera del cuerpo: una raya del pantalón, por larga que sea, no lo tiene.
        if (span < minLen || outHits * 2 < unit * 0.35 || hits / (hits + seenOff + 1) < 0.6) return;
        const through = start < 0 && last > 0;
        if ((through ? 0 : Math.min(Math.abs(start), Math.abs(last))) > nearBy) return; // no nace cerca de las manos
        // De las manos hacia la punta: el extremo más lejano.
        const tip = Math.abs(last) >= Math.abs(start) ? last : start;
        const L = through ? Math.abs(tip) : span;
        const dir = tip > 0 ? a : a + 180;
        if (L > len[dir]) { len[dir] = L; rhoOf[dir] = rho; tipOf[dir] = tip; }
        if (through) { // el otro lado también cuenta, para reconocer líneas del fondo que cruzan
          const other = tip > 0 ? a + 180 : a, Lo = Math.min(Math.abs(start), Math.abs(last));
          if (Lo > len[other]) { len[other] = Lo; rhoOf[other] = rho; tipOf[other] = tip > 0 ? start : last; }
        }
      };
      for (let t = -tMax; t <= tMax; t += 2) {
        const x = ox + dx * t, y = oy + dy * t;
        // Tolerancia de ±2 px a los lados para no perder la varilla por un grado de error.
        // Si alguna de las tres lecturas sigue con el mismo signo que el tramo, manda esa.
        const a0 = thin(x, y), a1 = thin(x + nx * 2, y + ny * 2), a2 = thin(x - nx * 2, y - ny * 2);
        const here = open && pol !== 0 && (a0 === pol || a1 === pol || a2 === pol) ? pol : a0 || a1 || a2;
        if (here) {
          if (open && here !== pol) {
            if (streak * 2 >= unit * 0.3 && flips < 2) { flips++; pol = here; streak = 0; }
            else { gap = 0; close(); }
          }
          if (!open) { open = true; start = t; hits = 0; outHits = 0; seenOff = 0; flips = 0; streak = 0; pol = here; }
          hits++; streak++; last = t; seenOff += gap; gap = 0;
          if (!onBody(x, y)) outHits++;
        } else if (open) { gap++; if (gap * 2 > gapMax) { gap = 0; close(); } }
      }
      if (open) close();
    }
  }

  const avoid = (opts.avoid ?? []).map((p) => (Math.atan2(p.y - hands.y, p.x - hands.x) * 180) / Math.PI);
  const apart = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  // Una línea que sigue igual de larga al otro lado de las manos es del fondo (horizonte, zócalo), no un palo:
  // no puede ganar ni cuenta como rival.
  const valid = new Float32Array(360);
  for (let a = 0; a < 360; a++) {
    if (len[a] < minLen || avoid.some((v) => apart(a, v) < 15)) continue; // tampoco un antebrazo
    if (opts.allow && !opts.allow(a)) continue;
    let crosses = false;
    for (let d = -3; d <= 3 && !crosses; d++) crosses = len[(a + 180 + d + 360) % 360] >= len[a] * 0.6;
    if (!crosses) valid[a] = len[a];
  }
  let bestA = 0;
  for (let a = 1; a < 360; a++) if (valid[a] > valid[bestA]) bestA = a;
  const L = valid[bestA];
  if (L < minLen) return null;
  let second = 0;
  for (let a = 0; a < 360; a++) if (apart(a, bestA) > 15 && valid[a] > second) second = valid[a];

  // rhoOf/tipOf se guardaron con la normal y el sentido del ángulo base (0–179).
  const base = bestA % 180, bth = (base * Math.PI) / 180;
  const tip = {
    x: hands.x - Math.sin(bth) * rhoOf[bestA] + Math.cos(bth) * tipOf[bestA],
    y: hands.y + Math.cos(bth) * rhoOf[bestA] + Math.sin(bth) * tipOf[bestA],
  };
  return {
    angleDeg: bestA,
    lengthPx: Math.hypot(tip.x - hands.x, tip.y - hands.y),
    tip,
    confidence: Math.max(0, Math.min(1, L / (unit * 1.4)) * (1 - second / L)),
  };
}

/* ───────────────────────── Lectura del palo en las posiciones clave ───────────────────────── */

export interface ClubInfo {
  /** De frente, al inicio: inclinación de la varilla respecto a la vertical (+ = manos por delante de la cabeza del palo). */
  addressLeanDeg?: number;
  /** Desde atrás, al inicio: ángulo de la varilla con el suelo. */
  addressPlaneDeg?: number;
  /** De frente, en el tope: 0 = paralelo al suelo apuntando al objetivo; + = le falta para llegar; − = se pasa. */
  topDeg?: number;
  feedback: Feedback[];
}

/**
 * Confianza mínima para mostrar una lectura del palo. Probado en nov 2026 con ~50 fotos reales de
 * golfistas: por encima de este umbral acertó más o menos 6 de cada 10 veces; los fallos fueron
 * líneas del fondo o de la ropa. Por eso es experimental y siempre se dibuja sobre la imagen.
 */
export const SHAFT_MIN_CONFIDENCE = 0.5;

/**
 * Convierte las varillas halladas al inicio y en el tope en medidas y observaciones.
 * `towardTarget` es +1 si el objetivo queda a la derecha de la imagen y −1 si a la izquierda
 * (solo importa de frente). Devuelve null si no hay nada confiable que decir.
 */
export function readClub(view: SwingView, address: Shaft | null, top: Shaft | null, towardTarget: number): ClubInfo | null {
  const ok = (s: Shaft | null): s is Shaft => !!s && s.confidence >= SHAFT_MIN_CONFIDENCE;
  const info: ClubInfo = { feedback: [] };
  const rad = (s: Shaft) => (s.angleDeg * Math.PI) / 180;
  const r1 = (v: number) => Math.round(v) || 0; // evita el −0

  if (ok(address)) {
    const dx = Math.cos(rad(address)), dy = Math.sin(rad(address));
    if (dy > 0.3) { // al inicio la cabeza del palo está por debajo de las manos; si no, la lectura es falsa
      if (view === 'frente') {
        info.addressLeanDeg = r1((Math.atan2(-dx * towardTarget, dy) * 180) / Math.PI);
        if (info.addressLeanDeg < -8) {
          info.feedback.push({ key: 'club-address', severity: 'improve', title: 'Manos detrás del palo al inicio', detail: `La varilla se inclina ${Math.abs(info.addressLeanDeg)}° alejándose del objetivo. Con hierros, las manos deben quedar a la altura de la bola o un poco por delante.`, drill: 'Colócate con la varilla apuntando a la cara interna del muslo guía.' });
        }
      } else {
        info.addressPlaneDeg = r1((Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI);
      }
    }
  }
  if (view === 'frente' && ok(top)) {
    const dx = Math.cos(rad(top)), dy = Math.sin(rad(top));
    info.topDeg = r1((Math.atan2(-dy, dx * towardTarget) * 180) / Math.PI);
    if (info.topDeg < -12) {
      info.feedback.push({ key: 'club-top', severity: 'improve', title: 'El palo pasa de la paralela en el tope', detail: `La cabeza del palo cae ${Math.abs(info.topDeg)}° por debajo de la horizontal. Una subida tan larga cuesta controlarla y suele venir de doblar el brazo guía o soltar las muñecas.`, drill: 'Subidas hasta tres cuartos, parando cuando el brazo guía queda paralelo al suelo, 10 repeticiones.' });
    } else if (info.topDeg <= 35) {
      info.feedback.push({ key: 'club-top', severity: 'good', title: 'Palo cerca de la paralela en el tope', detail: 'La varilla queda casi paralela al suelo apuntando al objetivo: una subida completa y controlada.' });
    }
  }
  return info.addressLeanDeg == null && info.addressPlaneDeg == null && info.topDeg == null ? null : info;
}

/** +1 si el objetivo queda a la derecha de la imagen, −1 si a la izquierda (vista de frente). */
export function targetSide(lm: Pt[], lefty: boolean): number {
  const lead = lm[lefty ? LM.R_SHOULDER : LM.L_SHOULDER], trail = lm[lefty ? LM.L_SHOULDER : LM.R_SHOULDER];
  return Math.sign(lead.x - trail.x) || 1;
}
