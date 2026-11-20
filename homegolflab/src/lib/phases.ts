/**
 * Fase `finish` y confianza por fase (plan 4.4, F3.4). Funciones PURAS que no cambian `findEvents` ni `analyzeSwing`:
 * inicio, tope e impacto salen exactamente como antes (no puede empeorar ningún clip) y aquí solo se les agrega la
 * confianza y el final. Los umbrales marcados [PROPUESTA] son puntos de partida que se fijan con datos piloto; no se
 * mueven para que un clip salga bien.
 */
import { LM, type Frame } from './swing';

const wristY = (f: Frame) => (f.lm[LM.L_WRIST].y + f.lm[LM.R_WRIST].y) / 2;
const wristV = (f: Frame) => Math.min(f.lm[LM.L_WRIST].v, f.lm[LM.R_WRIST].v);
const handsXY = (f: Frame) => ({ x: (f.lm[LM.L_WRIST].x + f.lm[LM.R_WRIST].x) / 2, y: wristY(f) });
const torso = (f: Frame) => {
  const sx = (f.lm[LM.L_SHOULDER].x + f.lm[LM.R_SHOULDER].x) / 2, sy = (f.lm[LM.L_SHOULDER].y + f.lm[LM.R_SHOULDER].y) / 2;
  const hx = (f.lm[LM.L_HIP].x + f.lm[LM.R_HIP].x) / 2, hy = (f.lm[LM.L_HIP].y + f.lm[LM.R_HIP].y) / 2;
  return Math.hypot(sx - hx, sy - hy) || 0.3;
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ───────────────────────── Final (finish) ───────────────────────── */

/** [PROPUESTA] Ventana tras el impacto en la que se busca el final, y cuánto deben quedarse quietas las manos. */
export const FINISH = { searchMs: 2000, holdMs: 300, minRiseTorso: 0.5, stillRadiusTorso: 0.06 } as const;

export interface FinishResult { t: number; conf: number }

/**
 * Final del swing: tras el impacto las manos suben hasta su punto más alto y se quedan quietas ≥ 0,3 s. Devuelve el
 * primer cuadro de esa pose sostenida, o null si no hay datos suficientes (los cuadros no cubren 0,3 s de quietud) o las
 * manos no suben lo bastante (no hay pose final, p. ej. un chip). `frames` deben estar ordenados por tiempo.
 */
export function findFinish(frames: readonly Frame[], impactMs: number): FinishResult | null {
  const post = frames.filter((f) => f.t >= impactMs && f.t <= impactMs + FINISH.searchMs);
  if (post.length < 4) return null;
  const y0 = wristY(post[0]);
  let ymin = Infinity;
  for (const f of post) ymin = Math.min(ymin, wristY(f));
  const tl = torso(post[0]);
  if (y0 - ymin < FINISH.minRiseTorso * tl) return null;       // las manos no suben: no hay pose final
  // Primer cuadro en que las manos están cerca de su punto más alto (≤ 15 % del recorrido por debajo) y se quedan quietas.
  const near = ymin + (y0 - ymin) * 0.15;
  for (let i = 0; i < post.length; i++) {
    if (wristY(post[i]) > near) continue;
    const c = handsXY(post[i]);
    const hold = post.filter((f) => f.t >= post[i].t && f.t <= post[i].t + FINISH.holdMs);
    // Los datos deben cubrir toda la quietud pedida: si el video (o el muestreo) termina antes, no se afirma.
    if (post[post.length - 1].t < post[i].t + FINISH.holdMs) return null;
    const still = hold.every((f) => { const p = handsXY(f); return Math.hypot(p.x - c.x, p.y - c.y) <= FINISH.stillRadiusTorso * tl; });
    if (still) {
      const vis = hold.reduce((s, f) => s + wristV(f), 0) / hold.length;
      return { t: post[i].t, conf: clamp01(vis) };
    }
  }
  return null;
}

/* ───────────────────────── Confianza por fase ───────────────────────── */

export interface PhaseConf { address: number; top: number; impact: number; finish?: number }

const meanVis = (frames: readonly Frame[], t: number, radiusMs = 100) => {
  const near = frames.filter((f) => Math.abs(f.t - t) <= radiusMs);
  return near.length ? near.reduce((s, f) => s + wristV(f), 0) / near.length : 0;
};

/**
 * Confianza 0–1 por fase = visibilidad de las manos cerca de la fase × nitidez del criterio (plan 4.3). Debajo de 0,5 la
 * pantalla pide revisar esa fase. La nitidez de cada una:
 * - inicio: las manos llevan quietas antes de arrancar (poco movimiento en los 0,3 s previos);
 * - tope: el pico es marcado (las manos a ±0,2 s están bastante más abajo, no en una meseta);
 * - impacto: la bajada cae dentro de lo físicamente normal (0,2–0,5 s mide bien; fuera de eso baja).
 */
export function phaseConfidence(frames: readonly Frame[], t: { address: number; top: number; impact: number }): PhaseConf {
  const at = (ms: number) => frames.reduce((b, f) => (Math.abs(f.t - ms) < Math.abs(b.t - ms) ? f : b), frames[0]);
  const A = at(t.address), T = at(t.top), tl = torso(A);

  const before = frames.filter((f) => f.t >= t.address - 300 && f.t <= t.address);
  let move = 0;
  for (let i = 1; i < before.length; i++) { const a = handsXY(before[i - 1]), b = handsXY(before[i]); move = Math.max(move, Math.hypot(b.x - a.x, b.y - a.y)); }
  const sharpAddress = before.length >= 2 ? clamp01(1 - move / (0.04 * tl)) : 0.5;

  const around = frames.filter((f) => Math.abs(f.t - t.top) >= 150 && Math.abs(f.t - t.top) <= 250);
  const prom = around.length ? around.reduce((s, f) => s + wristY(f), 0) / around.length - wristY(T) : 0;
  const sharpTop = clamp01(prom / (0.15 * tl));

  const down = (t.impact - t.top) / 1000;
  const sharpImpact = down >= 0.2 && down <= 0.5 ? 1 : down >= 0.15 && down <= 0.6 ? 0.6 : 0.2;

  return {
    address: round2(meanVis(frames, t.address) * (0.4 + 0.6 * sharpAddress)),
    top: round2(meanVis(frames, t.top) * (0.4 + 0.6 * sharpTop)),
    impact: round2(meanVis(frames, t.impact) * sharpImpact),
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
