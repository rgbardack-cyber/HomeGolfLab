import type { MediaMs } from './clock';
import type { Frame } from '../swing';

/**
 * Pista de postura de la pasada fina (plan 4.4): n muestras de 33 landmarks × (x, y, visibilidad, presencia).
 * `lm` es Float32Array de n×33×4; `t` es Float64Array de n instantes de medio. No va a localStorage ni como JSON
 * (pesa demasiado): se guarda como binario en el backend de medios.
 */
export interface PoseTrack {
  v: 1;
  sourceId: string;
  fromMs: MediaMs;
  toMs: MediaMs;
  /** Muestras por segundo de la pasada (30 en el muestreo fino actual). */
  hz: number;
  t: Float64Array;
  lm: Float32Array;
}

export const POSE_LANDMARKS = 33;
export const POSE_STRIDE = 4;

/**
 * Convierte los cuadros de postura de la pasada fina en una pista binaria. `Frame.t` ya es el tiempo de medio (ms) del
 * video. Los cuadros sin los 33 puntos se omiten. La presencia no se captura en la pasada actual (el modelo de `pose.ts`
 * solo entrega la visibilidad en JS): el canal de presencia lleva la visibilidad, así que conf = visibilidad.
 */
export function framesToPoseTrack(frames: readonly Frame[], sourceId: string, hz: number): PoseTrack {
  const ok = frames.filter((f) => f.lm.length === POSE_LANDMARKS).sort((a, b) => a.t - b.t);
  const n = ok.length;
  const t = new Float64Array(n), lm = new Float32Array(n * POSE_LANDMARKS * POSE_STRIDE);
  ok.forEach((f, i) => {
    t[i] = f.t;
    f.lm.forEach((p, k) => { const o = (i * POSE_LANDMARKS + k) * POSE_STRIDE; lm[o] = p.x; lm[o + 1] = p.y; lm[o + 2] = p.v; lm[o + 3] = p.v; });
  });
  return { v: 1, sourceId, fromMs: n ? t[0] : 0, toMs: n ? t[n - 1] : 0, hz, t, lm };
}

/** Formato: uint32 LE con el largo del encabezado JSON · encabezado JSON · t (Float64 LE) · lm (Float32 LE). */
export function encodePoseTrack(tr: PoseTrack): Blob {
  const n = tr.t.length;
  if (tr.lm.length !== n * POSE_LANDMARKS * POSE_STRIDE) throw new RangeError(`lm debe tener ${n}×${POSE_LANDMARKS}×${POSE_STRIDE} valores, trae ${tr.lm.length}`);
  const head = new TextEncoder().encode(JSON.stringify({ v: 1, sourceId: tr.sourceId, fromMs: tr.fromMs, toMs: tr.toMs, hz: tr.hz, n }));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, head.length, true);
  // Se copian los arreglos a su propio buffer: si vienen de una vista (subarray) no se arrastra el buffer entero.
  const t = new Uint8Array(new Float64Array(tr.t).buffer);
  const lm = new Uint8Array(new Float32Array(tr.lm).buffer);
  return new Blob([len, head, t, lm], { type: 'application/octet-stream' });
}

export function decodePoseTrack(buf: ArrayBuffer): PoseTrack {
  if (buf.byteLength < 4) throw new RangeError('pista de postura vacía o truncada');
  const hl = new DataView(buf).getUint32(0, true);
  if (4 + hl > buf.byteLength) throw new RangeError('encabezado de la pista truncado');
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))) as { v: number; sourceId: string; fromMs: number; toMs: number; hz: number; n: number };
  if (head.v !== 1 || !Number.isInteger(head.n) || head.n < 0) throw new RangeError('versión o tamaño de pista no válidos');
  const tBytes = head.n * 8, lmBytes = head.n * POSE_LANDMARKS * POSE_STRIDE * 4;
  if (4 + hl + tBytes + lmBytes !== buf.byteLength) throw new RangeError('el tamaño de la pista no coincide con su encabezado');
  // slice() para alinear (el desplazamiento 4+hl no es múltiplo de 8) y no depender del buffer original.
  const t = new Float64Array(buf.slice(4 + hl, 4 + hl + tBytes));
  const lm = new Float32Array(buf.slice(4 + hl + tBytes));
  return { v: 1, sourceId: head.sourceId, fromMs: head.fromMs, toMs: head.toMs, hz: head.hz, t, lm };
}
