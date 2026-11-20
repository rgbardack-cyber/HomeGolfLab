/**
 * Detección del inicio del impacto en el audio de un video (plan 4.8, F8.3). Pura: recibe muestras mono (`Float32Array`) y la
 * frecuencia de muestreo; la decodificación (Web Audio) vive en `decode.ts`.
 *
 * Método (versión simplificada del «flujo espectral 1–8 kHz» del plan): se filtra la señal a 1–8 kHz (el golpe del palo contra
 * la bola es un transitorio de banda ancha; el viento y los pasos pesan en graves), se mide la energía en contenedores de 1 ms
 * en dB y el inicio es donde el nivel sube hasta quedar a ≤ 20 dB del pico de la ventana de búsqueda. Resolución ≈ 1–2 ms.
 *
 * Se ACEPTA solo si (plan 4.8): el pico supera ≥ 15 dB a la mediana de ±1 s; ningún otro transitorio llega a pico − 10 dB en
 * ±1,0 s (otra bola cerca); y no hay recorte digital. Si no, se devuelve el motivo y la exportación sale en silencio con aviso.
 * Nunca se genera ni se mezcla otro sonido.
 */

export type ImpactRejection = 'no_audio' | 'clipped' | 'no_transient' | 'weak' | 'second_hit';
export type ImpactResult =
  | { ok: true; onsetMs: number; peakDb: number; prominenceDb: number }
  | { ok: false; reason: ImpactRejection; onsetMs?: number; prominenceDb?: number };

export interface ImpactOptions {
  /** Semiancho de la ventana de búsqueda alrededor del impacto visual (300 ms). */
  searchMs?: number;
  /** Prominencia mínima del pico sobre la mediana de ±1 s (15 dB). */
  minProminenceDb?: number;
  /** Margen bajo el pico para contar otro golpe (10 dB). */
  secondHitDb?: number;
  /** Semiancho de la zona donde se busca otro golpe (1000 ms). */
  rivalMs?: number;
  /** Canales SIN mezclar, para detectar el recorte digital de cada uno (un canal saturado se pierde al promediar). */
  rawChannels?: Float32Array[];
  /** Cuánto antes del pico puede estar el inicio (30 ms): un golpe sube en pocos ms; más allá es ruido sostenido, no el golpe. */
  maxAttackMs?: number;
}

const BIN_MS = 1;
const FLOOR = 1e-12;

/** Biquad RBJ (forma directa I) en sitio. */
function biquad(x: Float32Array, type: 'hp' | 'lp', fc: number, sr: number): Float32Array {
  const w0 = (2 * Math.PI * fc) / sr, cos = Math.cos(w0), alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = type === 'hp' ? (1 + cos) / 2 : (1 - cos) / 2;
  const b1 = type === 'hp' ? -(1 + cos) : 1 - cos;
  const b2 = b0, a1 = -2 * cos, a2 = 1 - alpha;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Energía en dB por contenedor de 1 ms de la señal en 1–8 kHz (dos biquads por lado = pendiente de 24 dB/oct). */
export function bandEnergyDb(pcm: Float32Array, sr: number): { db: Float32Array; binMs: number } {
  const hi = Math.min(8000, sr * 0.45);
  let y = biquad(biquad(pcm, 'hp', 1000, sr), 'hp', 1000, sr);
  y = biquad(biquad(y, 'lp', hi, sr), 'lp', hi, sr);
  const per = Math.max(1, Math.round((sr * BIN_MS) / 1000)), n = Math.floor(y.length / per);
  const db = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let s = 0;
    for (let i = b * per; i < (b + 1) * per; i++) s += y[i] * y[i];
    db[b] = 10 * Math.log10(s / per + FLOOR);
  }
  return { db, binMs: (per * 1000) / sr };
}

const median = (a: ArrayLike<number>, from: number, to: number): number => {
  const v = Array.from({ length: to - from }, (_, i) => a[from + i]).sort((p, q) => p - q);
  return v.length ? v[v.length >> 1] : -Infinity;
};

/** ¿Hay recorte digital (≥ 3 muestras seguidas en ±0,999) en el rango? */
function clipped(pcm: Float32Array, from: number, to: number): boolean {
  let run = 0;
  for (let i = Math.max(0, from); i < Math.min(pcm.length, to); i++) {
    if (Math.abs(pcm[i]) >= 0.999) { if (++run >= 3) return true; } else run = 0;
  }
  return false;
}

/**
 * Busca el inicio del impacto en ±`searchMs` de `aroundMs` (el impacto visual). `onsetMs` es tiempo del audio desde su inicio:
 * quien llama lo suma al desfase del audio respecto al video si lo hubiera.
 */
export function detectImpact(pcm: Float32Array, sampleRate: number, aroundMs: number, o: ImpactOptions = {}): ImpactResult {
  const search = o.searchMs ?? 300, minProm = o.minProminenceDb ?? 15, rivalDb = o.secondHitDb ?? 10, rival = o.rivalMs ?? 1000;
  if (!(sampleRate > 0) || pcm.length < sampleRate * 0.05) return { ok: false, reason: 'no_audio' };
  const { db, binMs } = bandEnergyDb(pcm, sampleRate);
  const at = (ms: number) => Math.min(db.length - 1, Math.max(0, Math.round(ms / binMs)));
  const s0 = at(aroundMs - search), s1 = at(aroundMs + search);
  if (s1 <= s0) return { ok: false, reason: 'no_audio' };
  // Pico de la ventana de búsqueda (suavizado de 3 contenedores: un solo contenedor puede ser una muestra ruidosa).
  let peak = -Infinity, pb = s0;
  for (let b = s0; b <= s1; b++) {
    const v = (db[Math.max(0, b - 1)] + db[b] + db[Math.min(db.length - 1, b + 1)]) / 3;
    if (v > peak) { peak = v; pb = b; }
  }
  // Inicio: hacia atrás desde el pico mientras el nivel siga a ≤ 20 dB de él, y como mucho `maxAttackMs` (revisión F8: con ruido
  // sostenido entre pico−15 y pico−20 el retroceso se arrastraba decenas de ms).
  const maxBack = Math.max(1, Math.round((o.maxAttackMs ?? 30) / binMs));
  // Umbral del inicio: a ≤ 20 dB del pico y, si el ruido de fondo es alto, a la mitad de la prominencia sobre su mediana
  // (con ruido sostenido a 15–20 dB bajo el pico, «pico − 20» queda dentro del propio ruido y arrastra el inicio hacia atrás).
  const bgMedian = median(db, at(pb * binMs - rival), at(pb * binMs + rival) + 1);
  const thr = Math.max(peak - 20, bgMedian + 0.5 * (peak - bgMedian));
  let on = pb;
  while (on > 0 && pb - on < maxBack && db[on - 1] > thr) on--;
  const onsetMs = (on + 0.5) * binMs - binMs / 2;
  const ctx0 = at(onsetMs - rival), ctx1 = at(onsetMs + rival);
  const prominence = peak - median(db, ctx0, ctx1 + 1);
  const win0 = Math.round(((onsetMs - 50) * sampleRate) / 1000), win1 = Math.round(((onsetMs + 300) * sampleRate) / 1000);
  const channels = o.rawChannels?.length ? o.rawChannels : [pcm];
  if (channels.some((ch) => clipped(ch, win0, win1))) return { ok: false, reason: 'clipped', onsetMs, prominenceDb: prominence };
  if (!(prominence >= minProm)) return { ok: false, reason: prominence < 6 ? 'no_transient' : 'weak', onsetMs, prominenceDb: prominence };
  // Otro golpe: un transitorio (sube ≥ 8 dB respecto a los 10 ms previos) que llegue a pico − 10 dB, fuera de la cola del impacto.
  const skip0 = at(onsetMs - 120), skip1 = at(onsetMs + 250);
  for (let b = ctx0; b <= ctx1; b++) {
    if (b >= skip0 && b <= skip1) continue;
    if (db[b] < peak - rivalDb) continue;
    let lo = Infinity;
    for (let k = Math.max(0, b - 10); k < b; k++) lo = Math.min(lo, db[k]);
    if (db[b] - lo >= 8) return { ok: false, reason: 'second_hit', onsetMs, prominenceDb: prominence };
  }
  return { ok: true, onsetMs, peakDb: peak, prominenceDb: prominence };
}

/** Mensaje en español para cada rechazo (el aviso de la exportación en silencio). */
export const IMPACT_REJECTION_TEXT: Record<ImpactRejection, string> = {
  no_audio: 'El video no tiene audio utilizable.',
  clipped: 'No se pudo aislar el sonido del golpe: el audio está saturado.',
  no_transient: 'No se pudo aislar el sonido del golpe: no se oye un golpe claro.',
  weak: 'No se pudo aislar el sonido del golpe: se oye muy bajo frente al ruido.',
  second_hit: 'No se pudo aislar el sonido del golpe: se oye otro golpe cerca.',
};
