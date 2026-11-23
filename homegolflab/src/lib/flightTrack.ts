/**
 * Seguimiento de bola v2 (plan 4.6, F5.5): el contrato `FlightTrack` y las funciones PURAS que lo interpretan:
 * huecos, última posición distinguible, descenso en la imagen y continuación estimada. Nada aquí toca píxeles ni DOM.
 *
 * Honestidad: lo observado son SOLO puntos detectados. El descenso se declara "en la imagen" (desde atrás la perspectiva
 * puede adelantarlo) y nunca es el ápice real; la continuación es una extrapolación con un modelo, no una medición, y
 * nunca alimenta distancia, velocidad ni tipo de tiro. Los umbrales marcados [PROPUESTA] no están calibrados con una
 * referencia de vuelo (F5.1 está bloqueada hasta tener posiciones marcadas a mano).
 */
import { frameOf, realDeltaMs, type Clock, type MediaMs } from './media/clock';
import type { FlightLayer, FlightSegment } from './overlay/model';
import type { TrackResult } from './ballflight';

export interface FlightPointV2 { t: MediaMs; frame: number; x: number; y: number; conf: number; source: 'detected' | 'estimated' }

export interface DescentEvidence {
  apexIndex: number | null;
  pointsAfter: number;
  /** Caída en y (fracción del alto) entre el ápice y el último punto. */
  drop: number;
  /** Desviación de los residuos del ajuste cuadrático del tramo ascendente (fracción del alto). */
  sigma: number;
  /** Coeficiente cuadrático de y(t) alrededor del ápice (> 0 = ápice real en la imagen). */
  curvature: number;
  /** Estadístico t de la pendiente de y tras el ápice. */
  slopeT: number;
  /** Mayor retroceso de x contra el sentido del recorrido (fracción del alto). */
  maxXReversal: number;
  /** Reglas del plan 4.6 que no se cumplieron (vacío si se confirmó). */
  failed: string[];
}

export interface FlightTrack {
  v: 2;
  sourceId: string;
  clock: Clock;
  tap: { x: number; y: number; t: MediaMs };
  observed: FlightPointV2[];
  gaps: { fromFrame: number; toFrame: number }[];
  lastDistinguishable: { frame: number; t: MediaMs } | null;
  descent: { state: 'confirmed' | 'not_confirmed' | 'insufficient'; fromIndex?: number; evidence: DescentEvidence; frame: 'image' };
  continuation: { state: 'shown' | 'abstained'; reason?: string; points: FlightPointV2[]; model?: 'quad2d' | 'rational2d'; horizonMs?: number };
  released: boolean;
  endReason: 'lost' | 'window' | 'clip_end' | 'frame_exit' | null;
  engine: string;
}

export const FLIGHT_ENGINE = 'ballflight@2';
/** Confianza de un punto detectado: el motor actual no la mide, así que es un valor fijo (no calibrado). */
export const DETECTED_CONF = 0.8;

/* ───────────────────────── Huecos y última posición ───────────────────────── */

/** Tramos entre dos puntos vistos separados por cuadros sin detección. */
export function findGaps(observed: readonly FlightPointV2[]): { fromFrame: number; toFrame: number }[] {
  const out: { fromFrame: number; toFrame: number }[] = [];
  for (let i = 1; i < observed.length; i++) if (observed[i].frame - observed[i - 1].frame > 1) out.push({ fromFrame: observed[i - 1].frame, toFrame: observed[i].frame });
  return out;
}

export const lastDistinguishable = (observed: readonly FlightPointV2[]): { frame: number; t: MediaMs } | null => {
  const p = observed[observed.length - 1];
  return p ? { frame: p.frame, t: p.t } : null;
};

/* ───────────────────────── Ajustes mínimos ───────────────────────── */

/** Mínimos cuadrados de grado 2: devuelve [c0, c1, c2] de y = c0 + c1·x + c2·x² (x centrado por quien llama). */
function fit2(xs: number[], ys: number[]): [number, number, number] | null {
  const n = xs.length;
  if (n < 3) return null;
  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i], x2 = x * x;
    s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2; t0 += y; t1 += x * y; t2 += x2 * y;
  }
  // Sistema normal 3×3 por Cramer.
  const m = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]];
  const det = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-18) return null;
  const col = (k: number) => m.map((r, i) => r.map((v, j) => (j === k ? [t0, t1, t2][i] : v)));
  return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d];
}
const evalQ = (c: [number, number, number], x: number) => c[0] + c[1] * x + c[2] * x * x;
const rms = (r: number[]) => (r.length ? Math.sqrt(r.reduce((a, b) => a + b * b, 0) / r.length) : 0);
const median3 = (a: number[], i: number) => { const w = [a[Math.max(0, i - 1)], a[i], a[Math.min(a.length - 1, i + 1)]].sort((p, q) => p - q); return w[1]; };

/* ───────────────────────── Descenso (en la imagen) ───────────────────────── */

export interface DescentOptions {
  clock: Clock;
  /** Alto del cuadro analizado, en píxeles de análisis (para el mínimo de σ de 1,5 px). */
  analysisH: number;
  /** Ancho ÷ alto del cuadro: el retroceso de x se mide en unidades de ALTO, como σ (revisión F5). 1 si no se da. */
  aspect?: number;
  /** Comprobación de vecinos (t−1, t+1) hecha sobre píxeles. El índice es el de `observed` (solo puntos detectados). false = la mancha NO pasó. Sin función, no se exige. */
  neighborOk?: (i: number) => boolean;
}

const emptyEvidence = (failed: string[]): DescentEvidence => ({ apexIndex: null, pointsAfter: 0, drop: 0, sigma: 0, curvature: 0, slopeT: 0, maxXReversal: 0, failed });

/**
 * Reglas del plan 4.6 (todas deben cumplirse): ≥ 8 puntos; ápice = mínimo de y suavizado que no es el último; tras él
 * ≥ 4 puntos con conf ≥ 0,6 (≥ 3 si el video real es de 30 cuadros/s) sin huecos de más de 2 cuadros; caída ≥
 * max(3σ, 0,6 % del alto) [PROPUESTA]; curvatura positiva y pendiente posterior con t ≥ 3 [PROPUESTA]; x sin
 * retrocesos mayores que σ; y vecinos válidos.
 */
export function detectDescent(observed: readonly FlightPointV2[], o: DescentOptions): FlightTrack['descent'] {
  const n = observed.length;
  if (n < 8) return { state: 'insufficient', evidence: emptyEvidence(['menos de 8 puntos']), frame: 'image' };
  const t0 = observed[0].t;
  const ts = observed.map((p) => realDeltaMs(o.clock, t0, p.t) / 1000);   // segundos REALES
  const ys = observed.map((p) => p.y), xs = observed.map((p) => p.x * (o.aspect && o.aspect > 0 ? o.aspect : 1));
  const sm = ys.map((_, i) => median3(ys, i));
  let a = -1, best = Infinity;
  for (let i = 0; i < n - 1; i++) if (sm[i] < best) { best = sm[i]; a = i; }
  const failed: string[] = [];
  const realFps = o.clock.fpsNominal / o.clock.timeScale;
  const need = realFps >= 50 ? 4 : 3;
  const after = observed.slice(a + 1);
  if (a < 3) failed.push('sin subida previa al ápice');                    // un descenso exige haber visto antes la subida
  if (after.length < need) failed.push(`menos de ${need} puntos tras el ápice`);
  if (after.some((p) => p.conf < 0.6)) failed.push('puntos con confianza < 0,6');
  for (let i = a + 1; i < n; i++) if (observed[i].frame - observed[i - 1].frame > 2) { failed.push('hueco de más de 2 cuadros'); break; }

  // σ: residuos del ajuste cuadrático del tramo ascendente (mínimo 1,5 px de análisis).
  const sigMin = 1.5 / Math.max(1, o.analysisH);
  let sigma = sigMin;
  if (a >= 3) {
    const c = fit2(ts.slice(0, a + 1), ys.slice(0, a + 1));
    if (c) sigma = Math.max(sigMin, rms(ys.slice(0, a + 1).map((y, i) => y - evalQ(c, ts[i]))));
  }
  const drop = ys[n - 1] - ys[a];
  if (drop < Math.max(3 * sigma, 0.006)) failed.push('caída insuficiente');

  // Curvatura positiva alrededor del ápice.
  const lo = Math.max(0, a - 4), hi = Math.min(n - 1, a + 4);
  const cq = fit2(ts.slice(lo, hi + 1).map((t) => t - ts[a]), ys.slice(lo, hi + 1));
  const curvature = cq ? cq[2] : 0;
  if (!(curvature > 0)) failed.push('sin curvatura de ápice');

  // Pendiente posterior significativa (t de la regresión lineal de y sobre t desde el ápice).
  let slopeT = 0;
  {
    const px = ts.slice(a), py = ys.slice(a), m = px.length;
    if (m >= 3) {
      const mx = px.reduce((s, v) => s + v, 0) / m, my = py.reduce((s, v) => s + v, 0) / m;
      let sxx = 0, sxy = 0;
      for (let i = 0; i < m; i++) { sxx += (px[i] - mx) ** 2; sxy += (px[i] - mx) * (py[i] - my); }
      if (sxx > 0) {
        const b = sxy / sxx, resid = py.map((y, i) => y - (my + b * (px[i] - mx)));
        const se = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / Math.max(1, m - 2) / sxx);
        slopeT = se > 1e-12 ? b / se : b > 0 ? Infinity : 0;
      }
    }
  }
  if (!(slopeT >= 3)) failed.push('pendiente posterior sin significancia');

  // x sin retrocesos mayores que σ (sentido del recorrido = signo del desplazamiento total).
  const dirX = Math.sign(xs[n - 1] - xs[0]) || 1;
  let maxXReversal = 0;
  for (let i = 1; i < n; i++) maxXReversal = Math.max(maxXReversal, -(xs[i] - xs[i - 1]) * dirX);
  if (maxXReversal > sigma) failed.push('x retrocede');

  if (o.neighborOk) for (let i = a + 1; i < n; i++) if (!o.neighborOk(i)) { failed.push('comprobación de vecinos'); break; }

  const evidence: DescentEvidence = { apexIndex: a, pointsAfter: after.length, drop, sigma, curvature, slopeT, maxXReversal, failed };
  return failed.length ? { state: 'not_confirmed', evidence, frame: 'image' } : { state: 'confirmed', fromIndex: a, evidence, frame: 'image' };
}

/* ───────────────────────── Continuación estimada ───────────────────────── */

export interface ContinuationOptions {
  clock: Clock;
  /** Relación ancho/alto del cuadro (para medir el error en unidades de alto). */
  aspect: number;
  /** Fin del clip en ms de medio. */
  clipEndMs: MediaMs;
  /** Permiso: la validación de 6.3 pasó para esta vista, o la bandera `flightEstimate` (pruebas internas) está encendida. */
  allowed: boolean;
  /** Máximo error cuadrático medio del ajuste, en fracción del alto (1,5 % [PROPUESTA]). */
  maxRms?: number;
}

const abstain = (reason: string): FlightTrack['continuation'] => ({ state: 'abstained', reason, points: [] });

/**
 * Continuación estimada con un modelo cuadrático 2D de x(t) e y(t): solo con ≥ 8 puntos en ≥ 0,25 s reales, sin huecos de
 * más de 3 cuadros en los últimos 6, RMS ≤ 1,5 % del alto y permiso. Horizonte ≤ min(duración observada, 1,0 s reales, fin
 * del clip, salida del cuadro). Si algo falla, se abstiene con el motivo (nada se dibuja).
 */
export function estimateContinuation(observed: readonly FlightPointV2[], o: ContinuationOptions): FlightTrack['continuation'] {
  if (!o.allowed) return abstain('sin validación para esta vista');
  if (!(o.aspect > 0) || !Number.isFinite(o.aspect)) return abstain('proporción del cuadro inválida');
  const n = observed.length;
  if (n < 8) return abstain('menos de 8 puntos observados');
  const first = observed[0], last = observed[n - 1];
  const durMs = realDeltaMs(o.clock, first.t, last.t);
  if (durMs < 250) return abstain('menos de 0,25 s observados');
  const tail = observed.slice(-6);
  for (let i = 1; i < tail.length; i++) if (tail[i].frame - tail[i - 1].frame > 3) return abstain('huecos de más de 3 cuadros al final');
  const ts = observed.map((p) => realDeltaMs(o.clock, first.t, p.t) / 1000);
  const cx = fit2(ts, observed.map((p) => p.x * o.aspect)), cy = fit2(ts, observed.map((p) => p.y));
  if (!cx || !cy) return abstain('el ajuste no es posible');
  const err = observed.map((p, i) => Math.hypot(evalQ(cx, ts[i]) - p.x * o.aspect, evalQ(cy, ts[i]) - p.y));
  const e = rms(err);
  if (e > (o.maxRms ?? 0.015)) return abstain('el modelo no ajusta lo visto');
  const clipLeftMs = realDeltaMs(o.clock, last.t, o.clipEndMs);
  const horizonMs = Math.min(durMs, 1000, clipLeftMs);
  if (!(horizonMs > 0)) return abstain('no queda clip');
  const stepMs = 1000 / (o.clock.fpsNominal / o.clock.timeScale);       // un cuadro, en tiempo real
  const points: FlightPointV2[] = [];
  let exited = false;
  for (let k = 1; k * stepMs <= horizonMs + 1e-6; k++) {
    const tr = ts[n - 1] + (k * stepMs) / 1000;
    const x = evalQ(cx, tr) / o.aspect, y = evalQ(cy, tr);
    if (x < 0 || x > 1 || y < 0 || y > 1) { exited = true; break; }
    const t = last.t + (k * stepMs) / o.clock.timeScale;
    points.push({ t, frame: frameOf(o.clock, t), x, y, conf: 0.6, source: 'estimated' });
  }
  if (!points.length) return abstain(exited ? 'sale del cuadro de inmediato' : 'sin puntos que mostrar');
  return { state: 'shown', points, model: 'quad2d', horizonMs: realDeltaMs(o.clock, last.t, points[points.length - 1].t) };
}

/* ───────────────────────── Construcción y capa del compositor ───────────────────────── */

export interface BuildOptions {
  sourceId: string;
  clock: Clock;
  tap: { x: number; y: number; t: MediaMs };
  aspect: number;
  analysisH: number;
  clipEndMs: MediaMs;
  allowEstimate: boolean;
  neighborOk?: (i: number) => boolean;
}

/** Arma el `FlightTrack` v2 a partir del resultado del seguimiento (los puntos 'detected'). */
export function buildFlightTrack(res: TrackResult, o: BuildOptions): FlightTrack {
  const released = res.released ?? true;
  const observed: FlightPointV2[] = released
    ? res.points.filter((p) => p.source === 'detected').map((p) => ({ t: p.t, frame: frameOf(o.clock, p.t), x: p.x, y: p.y, conf: DETECTED_CONF, source: 'detected' as const }))
    : [];
  const last = observed[observed.length - 1];
  const exited = !!last && (last.x < 0.02 || last.x > 0.98 || last.y < 0.02);
  const endReason: FlightTrack['endReason'] = res.endReason === 'lost' ? (exited ? 'frame_exit' : 'lost') : res.endReason === 'window' ? 'window' : last && last.t >= o.clipEndMs - 1000 / o.clock.fpsNominal ? 'clip_end' : res.endReason;
  return {
    v: 2, sourceId: o.sourceId, clock: o.clock, tap: o.tap, observed,
    gaps: findGaps(observed), lastDistinguishable: lastDistinguishable(observed),
    descent: detectDescent(observed, { clock: o.clock, analysisH: o.analysisH, aspect: o.aspect, neighborOk: o.neighborOk }),
    continuation: estimateContinuation(observed, { clock: o.clock, aspect: o.aspect, clipEndMs: o.clipEndMs, allowed: o.allowEstimate }),
    released, endReason, engine: FLIGHT_ENGINE,
  };
}

/**
 * Capa del compositor (`overlay/model.ts`): tramos observados en verde, huecos en gris punteado, descenso confirmado en
 * dorado, continuación en morado y el anillo de "última vez vista" si se perdió la bola.
 */
export function flightLayer(track: FlightTrack): FlightLayer {
  const segments: FlightSegment[] = [];
  const obs = track.observed, from = track.descent.state === 'confirmed' ? track.descent.fromIndex ?? Infinity : Infinity;
  for (let i = 1; i < obs.length; i++) {
    const a = obs[i - 1], b = obs[i];
    const kind = b.frame - a.frame > 1 ? 'gap' : i > from ? 'descent' : 'observed';
    segments.push({ kind, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, tA: a.t, tB: b.t });
  }
  if (track.continuation.state === 'shown' && obs.length) {
    let prev = obs[obs.length - 1];
    for (const p of track.continuation.points) {
      segments.push({ kind: 'estimated', a: { x: prev.x, y: prev.y }, b: { x: p.x, y: p.y }, tA: prev.t, tB: p.t, conf: p.conf });
      prev = p;
    }
  }
  const last = obs[obs.length - 1];
  return {
    segments,
    dots: obs.map((p) => ({ x: p.x, y: p.y, t: p.t, kind: 'detected' as const, conf: p.conf })),
    tap: { x: track.tap.x, y: track.tap.y },
    ...(last && (track.endReason === 'lost' || track.endReason === 'frame_exit') ? { lost: { x: last.x, y: last.y, t: last.t } } : {}),
  };
}
