/**
 * Seguimiento de los primeros instantes de vuelo de la bola en un VIDEO ya grabado.
 *
 * Qué hace: a partir del punto donde el usuario toca la bola, busca en cada cuadro manchas
 * pequeñas que cambiaron respecto al cuadro anterior (más claras o más oscuras), elige la más
 * cercana a donde se esperaba la bola y la va siguiendo.
 *
 * Qué NO hace, a propósito: no calcula distancia, altura, velocidad ni dirección en unidades
 * reales. Un solo teléfono no las mide en un tiro completo. Solo entrega puntos en la imagen
 * (0–1), cuántos se detectaron, cuánto tiempo se siguió y un ángulo EN LA IMAGEN (no real).
 *
 * Cada punto es 'detected' (se encontró una mancha en ese cuadro) o 'estimated' (inferido).
 * El seguimiento nunca crea puntos 'estimated': la fuente existe para que otras partes del
 * código (o una mejora futura) los distingan sin ambigüedad.
 *
 * Con bola blanca contra cielo claro se espera perderla pronto: no hay contraste que seguir.
 */

import { realDeltaMs, type Clock } from './media/clock';
import { fmtNumber, t } from '@/i18n';

export interface P2 { x: number; y: number }

/** Imagen en escala de grises, una por cuadro analizado. */
export interface Gray { data: Uint8Array | Uint8ClampedArray; w: number; h: number }

/** Región en píxeles: x0,y0 incluidos; x1,y1 excluidos. */
export interface Roi { x0: number; y0: number; x1: number; y1: number }

export interface Blob {
  area: number;
  /** Centro en píxeles. */
  cx: number; cy: number;
  minX: number; minY: number; maxX: number; maxY: number;
  /** 1 = apareció algo más claro; −1 = apareció algo más oscuro. */
  sign: 1 | -1;
}

export interface FlightPoint {
  /** Milisegundos del video (v.currentTime tras 'seeked'). */
  t: number;
  /** Posición normalizada 0–1 sobre el ancho y el alto del video. */
  x: number; y: number;
  source: 'detected' | 'estimated';
}

/* ───────────────────────── Ayudas de imagen ───────────────────────── */

/** Tamaño de análisis: unos 640 px de ancho (y no más de `maxSide` de lado largo), con proporción intacta. */
export function analysisSize(vw: number, vh: number, targetW = 640, maxSide = 1000): { w: number; h: number } {
  if (!(vw > 0) || !(vh > 0)) return { w: 0, h: 0 };
  const k = Math.min(1, targetW / vw, maxSide / Math.max(vw, vh));
  return { w: Math.max(8, Math.round(vw * k)), h: Math.max(8, Math.round(vh * k)) };
}

/** RGBA (de getImageData) a grises. */
export function toGray(rgba: ArrayLike<number>, w: number, h: number): Gray {
  const data = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) data[i] = (rgba[j] * 3 + rgba[j + 1] * 6 + rgba[j + 2]) / 10;
  return { data, w, h };
}

/** Dos cuadros con exactamente los mismos píxeles (video a menos fps que el muestreo: el cuadro se repite). */
export function framesIdentical(a: Gray, b: Gray): boolean {
  if (a.w !== b.w || a.h !== b.h) return false;
  const x = a.data, y = b.data;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

function clampRoi(r: Roi | undefined, w: number, h: number): Roi {
  if (!r) return { x0: 0, y0: 0, x1: w, y1: h };
  return {
    x0: Math.max(0, Math.floor(r.x0)), y0: Math.max(0, Math.floor(r.y0)),
    x1: Math.min(w, Math.ceil(r.x1)), y1: Math.min(h, Math.ceil(r.y1)),
  };
}

/* ───────────────────────── Manchas ───────────────────────── */

export interface BlobOptions {
  roi?: Roi;
  /** Cambio mínimo de gris (0–255) para contar un píxel. */
  diff?: number;
  minArea?: number;
  /** 0 = ambos signos; 1 = solo lo que se aclara; −1 = solo lo que se oscurece. */
  sign?: 0 | 1 | -1;
}

/**
 * Componentes conectados (8 vecinos) de píxeles que cambiaron entre dos cuadros. Usa los dos
 * sentidos: lo que se aclara (bola blanca sobre fondo oscuro) y lo que se oscurece (bola oscura
 * sobre fondo claro). Cada mancha lleva su signo, porque una bola que se mueve deja una mancha
 * donde llega y otra de signo contrario donde estaba.
 */
export function detectBlobs(prev: Gray, cur: Gray, o: BlobOptions = {}): Blob[] {
  const { w, h } = cur;
  if (prev.w !== w || prev.h !== h) return [];
  const diffT = o.diff ?? 28, minArea = o.minArea ?? 4, sign = o.sign ?? 0;
  const r = clampRoi(o.roi, w, h);
  const rw = r.x1 - r.x0, rh = r.y1 - r.y0;
  if (rw <= 0 || rh <= 0) return [];

  const mask = new Int8Array(rw * rh);
  let any = false;
  for (let y = 0; y < rh; y++) {
    let src = (y + r.y0) * w + r.x0;
    for (let x = 0; x < rw; x++, src++) {
      const d = cur.data[src] - prev.data[src];
      if (d >= diffT) { if (sign >= 0) { mask[y * rw + x] = 1; any = true; } }
      else if (d <= -diffT) { if (sign <= 0) { mask[y * rw + x] = -1; any = true; } }
    }
  }
  if (!any) return [];

  const out: Blob[] = [];
  const stack = new Int32Array(rw * rh);
  for (let start = 0; start < mask.length; start++) {
    const s = mask[start];
    if (s === 0) continue;
    let sp = 0, area = 0, sx = 0, sy = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    mask[start] = 0; stack[sp++] = start;
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % rw, y = (idx - x) / rw;
      area++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= rh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= rw || (dx === 0 && dy === 0)) continue;
          const n = ny * rw + nx;
          if (mask[n] === s) { mask[n] = 0; stack[sp++] = n; }
        }
      }
    }
    if (area >= minArea) {
      out.push({
        area, cx: r.x0 + sx / area, cy: r.y0 + sy / area,
        minX: r.x0 + minX, minY: r.y0 + minY, maxX: r.x0 + maxX, maxY: r.y0 + maxY,
        sign: s as 1 | -1,
      });
    }
  }
  return out;
}

/**
 * ¿La bola es más clara o más oscura que lo que la rodea? Se mira en el primer cuadro, alrededor del
 * punto tocado. 'any' si no hay contraste claro (p. ej. bola blanca contra cielo claro): ahí se aceptan
 * los dos signos y el seguimiento es mucho menos fiable.
 */
export function estimatePolarity(g: Gray, x: number, y: number, minDelta = 12): 'bright' | 'dark' | 'any' {
  const best = ballContrast(g, x, y);
  return best >= minDelta ? 'bright' : best <= -minDelta ? 'dark' : 'any';
}

/**
 * Contraste con signo de lo que haya alrededor del punto (±5 px) contra la mediana de un anillo a 12 px: positivo = algo más
 * claro que su entorno (una bola blanca sobre pasto), negativo = más oscuro, cerca de 0 = nada que se distinga.
 */
export function ballContrast(g: Gray, x: number, y: number, reach = 5): number {
  return ballSpot(g, x, y, reach).delta;
}

/** Como `ballContrast`, pero también dice DÓNDE (px) está ese contraste máximo: el centro de la bola. */
export function ballSpot(g: Gray, x: number, y: number, reach = 5): { delta: number; x: number; y: number; bg: number } {
  const at = (px: number, py: number) => g.data[Math.min(g.h - 1, Math.max(0, Math.round(py))) * g.w + Math.min(g.w - 1, Math.max(0, Math.round(px)))];
  const ring: number[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * 2 * Math.PI;
    ring.push(at(x + 12 * Math.cos(a), y + 12 * Math.sin(a)));
  }
  ring.sort((a, b) => a - b);
  const bg = (ring[7] + ring[8]) / 2; // mediana: robusta a un borde cercano
  let best = 0, bx = x, by = y;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += at(x + dx + i, y + dy + j);
      const d = s / 9 - bg;
      if (Math.abs(d) > Math.abs(best)) { best = d; bx = x + dx; by = y + dy; }
    }
  }
  return { delta: best, x: bx, y: by, bg };
}

/* ───────────────────────── Seguimiento ───────────────────────── */

export interface TrackerOptions {
  w: number; h: number;
  /** Cambio de gris para contar un píxel (28). */
  diff?: number;
  /** Salto máximo entre dos detecciones, como fracción del ancho (0.25). */
  maxStepFrac?: number;
  minArea?: number;
  /** Área máxima de una mancha como fracción de la imagen (0.002). Más grande: no es la bola. */
  maxAreaFrac?: number;
  /** Una mancha más grande que esto × el área de la bola ya vista se descarta (6). */
  maxAreaRatio?: number;
  /** Cuadros seguidos sin ver la bola antes de darla por perdida (4). */
  maxMisses?: number;
  /** Ventana de seguimiento desde el primer punto, en ms (4000). */
  maxFollowMs?: number;
  /** Si se pierde con menos puntos que estos, se descarta y se espera otro arranque (3). */
  minPoints?: number;
  polarity?: 'auto' | 'bright' | 'dark' | 'any';
  /**
   * Reloj del video (F5.2). Con él, los umbrales en SEGUNDOS (la espera de 0,3 s tras salir la bola y `maxFollowMs`) se miden
   * en tiempo REAL: un tiro grabado a 60 cuadros y reproducido a media velocidad da los mismos puntos. Sin reloj, `t` ya es
   * tiempo real (como antes).
   */
  clock?: Clock;
}

export type EndReason = 'lost' | 'window' | null;

export interface TrackResult {
  points: FlightPoint[];
  /** Instante (ms de video) del primer cuadro en que ya no se vio la bola; null si no se perdió. */
  lostAtMs: number | null;
  endReason: EndReason;
  /**
   * ¿Se vio la bola quieta donde se tocó y luego salir de ahí? Solo entonces los puntos pueden ser su vuelo: antes de que
   * la bola salga, lo que se mueve cerca (palo, manos, cuerpo) no es la bola. false = no se pudo confirmar.
   */
  released?: boolean;
}

export class BallTracker {
  readonly points: FlightPoint[] = [];
  done = false;
  endReason: EndReason = null;
  lostAtMs: number | null = null;
  readonly maxFollowMs: number;

  private readonly w: number;
  private readonly h: number;
  private readonly o: Required<Omit<TrackerOptions, 'w' | 'h' | 'clock'>>;
  private readonly clock: Clock | null;
  private readonly startPx: P2;
  private ready = false;
  private sign: 0 | 1 | -1 = 0;
  private last: { x: number; y: number; t: number } | null = null;
  private vel: { vx: number; vy: number } | null = null; // px por ms
  private refArea: number | null = null;
  private misses = 0;
  private missStartT = 0;
  private firstT: number | null = null;
  private refContrast = 0;   // contraste de la bola quieta en el primer cuadro; 0 = no se distinguía
  private spot: P2 = { x: 0, y: 0 };
  private released = false;
  private releasedT: number | null = null;
  private ballArea: number | null = null; // área de la bola quieta (px): se restituye tras un arranque falso

  /** `start`: punto tocado por el usuario, normalizado 0–1. */
  constructor(start: P2, opts: TrackerOptions) {
    this.w = opts.w; this.h = opts.h;
    this.o = {
      diff: opts.diff ?? 28, maxStepFrac: opts.maxStepFrac ?? 0.25, minArea: opts.minArea ?? 4,
      maxAreaFrac: opts.maxAreaFrac ?? 0.002, maxAreaRatio: opts.maxAreaRatio ?? 6,
      maxMisses: opts.maxMisses ?? 4, maxFollowMs: opts.maxFollowMs ?? 4000,
      minPoints: opts.minPoints ?? 3, polarity: opts.polarity ?? 'auto',
    };
    this.maxFollowMs = this.o.maxFollowMs;
    this.clock = opts.clock ?? null;
    this.startPx = { x: start.x * this.w, y: start.y * this.h };
  }

  /** Milisegundos REALES entre dos instantes de medio (con reloj; sin él, la diferencia tal cual). */
  private real(a: number, b: number): number { return this.clock ? realDeltaMs(this.clock, a, b) : b - a; }

  /** ¿Se está esperando a que la bola salga de su sitio? (con contraste suficiente para saberlo). */
  get waiting(): boolean { return this.ready && this.refContrast !== 0 && !this.released; }

  /** Instante (ms) del primer punto detectado, o null si aún no hay. */
  get firstDetectedMs(): number | null { return this.firstT; }

  private init(first: Gray) {
    const p = this.o.polarity === 'auto' ? estimatePolarity(first, this.startPx.x, this.startPx.y) : this.o.polarity;
    this.sign = p === 'bright' ? 1 : p === 'dark' ? -1 : 0;
    const spot = ballSpot(first, this.startPx.x, this.startPx.y);
    this.refContrast = this.sign === 0 ? 0 : spot.delta;
    this.spot = { x: spot.x, y: spot.y };
    // Tamaño de la bola quieta (px que contrastan como ella en ±8 px): lo que sea mucho más grande no es la bola.
    if (this.refContrast !== 0) {
      let area = 0;
      for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
        const px = Math.round(spot.x + dx), py = Math.round(spot.y + dy);
        if (px < 0 || py < 0 || px >= first.w || py >= first.h) continue;
        if ((first.data[py * first.w + px] - spot.bg) * Math.sign(spot.delta) >= Math.abs(spot.delta) * 0.5) area++;
      }
      if (area >= this.o.minArea) this.refArea = this.ballArea = area;
    }
    this.ready = true;
  }

  private predicted(t: number): P2 {
    if (!this.last) return this.startPx;
    if (!this.vel) return { x: this.last.x, y: this.last.y };
    const dt = t - this.last.t;
    return { x: this.last.x + this.vel.vx * dt, y: this.last.y + this.vel.vy * dt };
  }

  private gate(t: number): number {
    const maxStep = this.o.maxStepFrac * this.w;
    if (!this.last || !this.vel) return maxStep;
    const minGate = 0.03 * this.w;
    const dt = Math.max(0, t - this.last.t);
    const speed = Math.hypot(this.vel.vx, this.vel.vy);
    return Math.min(maxStep, minGate + 0.6 * speed * dt);
  }

  /** Región donde se buscará la bola en el cuadro de tiempo `t`: sigue a la última posición. */
  roi(t: number): Roi {
    const p = this.predicted(t), half = this.gate(t) + 12;
    return { x0: p.x - half, y0: p.y - half, x1: p.x + half, y1: p.y + half };
  }

  /**
   * Procesa un cuadro. `prev` es el cuadro anterior distinto y `cur` el actual; `t` en ms de video.
   * Devuelve el punto detectado o null.
   */
  feed(prev: Gray, cur: Gray, t: number): FlightPoint | null {
    if (this.done) return null;
    if (!this.ready) this.init(prev);
    // Mientras la bola siga quieta en su sitio no puede haber vuelo: lo que se mueve cerca (palo, manos, cuerpo) no cuenta.
    // Sin contraste con el entorno (bola blanca contra cielo claro) no se puede saber cuándo sale y no se confirma nada.
    if (this.refContrast !== 0 && !this.released) {
      const c = ballContrast(cur, this.spot.x, this.spot.y, 2);
      if (c * this.refContrast > 0 && Math.abs(c) >= Math.abs(this.refContrast) * 0.5) return null;
      this.released = true; this.releasedT = t;
    }
    // La bola sale de golpe: si tras soltarse no aparece nada en 0,3 s, lo que aparezca después ya no es su vuelo.
    if (this.releasedT !== null && this.firstT === null && this.real(this.releasedT, t) > 300) {
      this.done = true; this.endReason = 'lost'; this.lostAtMs = this.releasedT;
      return null;
    }
    if (this.firstT !== null && this.real(this.firstT, t) > this.o.maxFollowMs) {
      this.done = true; this.endReason = 'window';
      return null;
    }

    const pred = this.predicted(t), gate = this.gate(t);
    const blobs = detectBlobs(prev, cur, { roi: this.roi(t), diff: this.o.diff, minArea: this.o.minArea, sign: this.sign });
    const absMax = this.o.maxAreaFrac * this.w * this.h;
    const minFirst = 0.02 * this.w;
    const refMax = this.refArea === null ? Infinity : this.refArea * this.o.maxAreaRatio;

    let best: Blob | null = null, bestD = Infinity;
    for (const b of blobs) {
      if (b.area > absMax || b.area > refMax) continue; // demasiado grande: cuerpo, palo, sombra
      const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
      if (Math.max(bw, bh) > 3 * Math.min(bw, bh)) continue; // alargada (varilla, brazo): una bola es compacta
      const d = Math.hypot(b.cx - pred.x, b.cy - pred.y);
      // Sin polaridad conocida también llegan las manchas donde la bola ESTABA; la detección debe haberse movido respecto al último punto (o al toque).
      if (!this.vel && this.sign === 0 && d < minFirst) continue;
      if (d <= gate && d < bestD) { best = b; bestD = d; }
    }

    if (best) {
      if (this.last && t > this.last.t) {
        const dt = t - this.last.t;
        this.vel = { vx: (best.cx - this.last.x) / dt, vy: (best.cy - this.last.y) / dt };
      }
      this.last = { x: best.cx, y: best.cy, t };
      this.refArea = this.refArea === null ? best.area : (this.refArea + best.area) / 2;
      if (this.firstT === null) this.firstT = t;
      this.misses = 0;
      const pt: FlightPoint = { t, x: (best.cx + 0.5) / this.w, y: (best.cy + 0.5) / this.h, source: 'detected' };
      this.points.push(pt);
      return pt;
    }

    // Sin bola en este cuadro. Antes del primer punto no cuenta: aún no ha salido.
    if (this.firstT === null) return null;
    if (this.misses === 0) this.missStartT = t;
    this.misses++;
    if (this.misses >= this.o.maxMisses) {
      if (this.points.length < this.o.minPoints) this.reset(t); // arranque falso: seguir esperando
      else { this.done = true; this.endReason = 'lost'; this.lostAtMs = this.missStartT; }
    }
    return null;
  }

  /**
   * Una bola que sale se ALEJA de donde estaba. Un palo o una mano que dan vueltas cerca del toque (puntos que regresan, que
   * se enroscan) no son su vuelo. Con menos de 3 puntos no se puede juzgar.
   */
  private flightLike(): boolean {
    const p = this.points;
    if (p.length < 3) return true;
    const d = p.map((q) => Math.hypot(q.x * this.w - this.startPx.x, q.y * this.h - this.startPx.y));
    let away = 0;
    for (let i = 1; i < d.length; i++) if (d[i] >= d[i - 1] - 1.5) away++;
    return away >= (d.length - 1) * 0.8 && d[d.length - 1] > d[0];
  }

  private reset(t: number) {
    this.points.length = 0;
    this.last = null; this.vel = null; this.refArea = this.ballArea;
    if (this.releasedT !== null) this.releasedT = t; // otros 0,3 s de espera, no los que ya pasaron
    this.misses = 0; this.firstT = null;
  }

  result(): TrackResult {
    return { points: [...this.points], lostAtMs: this.lostAtMs, endReason: this.endReason, released: this.released && this.flightLike() };
  }
}

/** Recorre una lista de cuadros ya cargados (pruebas). Salta los cuadros idénticos al anterior. */
export function trackFrames(frames: { gray: Gray; t: number }[], start: P2, opts: TrackerOptions): TrackResult {
  const tr = new BallTracker(start, opts);
  let prev: Gray | null = null;
  for (const f of frames) {
    if (prev) {
      if (framesIdentical(prev, f.gray)) continue;
      tr.feed(prev, f.gray, f.t);
      if (tr.done) break;
    }
    prev = f.gray;
  }
  return tr.result();
}

/* ───────────────────────── Resumen y ángulo ───────────────────────── */

/**
 * Ángulo de salida EN LA IMAGEN, medido desde la vertical (0° = recto hacia arriba de la imagen,
 * + = a la derecha), con los primeros puntos DETECTADOS. No es el ángulo real del tiro: depende de
 * dónde esté la cámara. `aspect` = ancho ÷ alto del video. Null si hay menos de 3 puntos detectados
 * o casi no se movieron.
 */
export function launchAngleDeg(points: FlightPoint[], aspect: number, n = 5): number | null {
  const det = points.filter((p) => p.source === 'detected').slice(0, n);
  if (det.length < 3) return null;
  const a = det[0], b = det[det.length - 1];
  const dx = (b.x - a.x) * aspect, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 0.02) return null;
  return Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI) * 10) / 10;
}

export interface FlightSummary {
  detected: number;
  estimated: number;
  /** Segundos entre el primer y el último punto detectado. */
  followedS: number;
  /** Segundos, contados desde el primer punto detectado, a los que se perdió la bola; null si no se perdió. */
  lostAtS: number | null;
  /** Ángulo en la imagen, no real. */
  launchAngleDeg: number | null;
  endReason: EndReason;
  /** Ver TrackResult.released. Sin confirmar, no se muestra trayectoria ni ángulo. */
  released: boolean;
}

/**
 * Tarjetas de resumen que muestra la pantalla. El ángulo de salida EN LA IMAGEN NO se muestra (#4): depende de dónde
 * esté la cámara y, sin una referencia de vuelo, no hay forma de decir que se parece al real. `launchAngleDeg` queda
 * como dato interno para probar y para la clasificación futura.
 */
export function flightStatCards(s: FlightSummary): { label: string; value: string; unit: string }[] {
  const fmt = (n: number) => fmtNumber(n, 1);
  return [
    { label: t('flight.points'), value: String(s.detected), unit: '' },
    { label: t('flight.followed'), value: s.detected > 1 ? fmt(s.followedS) : '—', unit: s.detected > 1 ? 's' : '' },
  ];
}

export function summarizeFlight(res: TrackResult, aspect: number): FlightSummary {
  const released = res.released ?? true;
  const det = released ? res.points.filter((p) => p.source === 'detected') : [];
  const first = det[0], last = det[det.length - 1];
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    detected: det.length,
    estimated: released ? res.points.length - det.length : 0,
    followedS: first && last ? r1((last.t - first.t) / 1000) : 0,
    lostAtS: first && res.lostAtMs !== null ? r1(Math.max(0, res.lostAtMs - first.t) / 1000) : null,
    launchAngleDeg: released ? launchAngleDeg(res.points, aspect) : null,
    endReason: res.endReason,
    released,
  };
}
