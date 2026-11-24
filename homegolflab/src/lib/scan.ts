/**
 * Escaneo de HomeLAB: el jugador toma una foto o un video de su espacio y el servidor
 * (visión de Claude) devuelve medidas estimadas, equipo visible y cómo montar la práctica.
 */
import { getLocale, t } from '@/i18n';
import type { Floor, Gear, Space } from './homelab';

export interface ScanResult {
  usable: boolean;
  summary: string;
  lengthM: number;
  widthM: number;
  ceilingM: number;
  floor: Floor;
  gear: Gear[];
  confidence: 'alta' | 'media' | 'baja';
  observations: string[];
  safety: string[];
  setup: string[];
}

/** Lo que se guarda del escaneo junto al espacio, para mostrarlo en HomeLAB. */
export type ScanInfo = Pick<ScanResult, 'summary' | 'confidence' | 'observations' | 'safety' | 'setup'> & { at: string };

export interface ScanImage { media_type: 'image/jpeg'; data: string }

const API = import.meta.env?.VITE_API_URL ?? '';
const MAX_SIDE = 1280;
const FLOORS: Floor[] = ['alfombra', 'cesped', 'duro'];
const GEARS: Gear[] = ['putter', 'wedge', 'hierros', 'red', 'matPutt', 'matGolpeo', 'foam', 'varillas', 'vaso', 'espejo'];

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.round(Math.min(hi, Math.max(lo, n)) * 10) / 10;
};

/** Convierte la respuesta del servidor en un espacio válido; nunca confía en los valores tal cual llegan. */
export function scanToSpace(r: ScanResult, extraGear: Gear[] = []): Space {
  const gear = [...new Set([...(Array.isArray(r.gear) ? r.gear : []), ...extraGear])].filter((g) => GEARS.includes(g));
  return {
    lengthM: clamp(r.lengthM, 1, 30, 3),
    widthM: clamp(r.widthM, 1, 30, 2),
    ceilingM: clamp(r.ceilingM, 1.8, 6, 2.4),
    floor: FLOORS.includes(r.floor) ? r.floor : 'duro',
    gear,
  };
}

export function scanInfo(r: ScanResult): ScanInfo {
  const list = (a: unknown) => (Array.isArray(a) ? a.filter((s): s is string => typeof s === 'string').slice(0, 8) : []);
  return { summary: String(r.summary ?? ''), confidence: r.confidence ?? 'baja', observations: list(r.observations), safety: list(r.safety), setup: list(r.setup), at: new Date().toISOString() };
}

function toJpeg(source: CanvasImageSource, w: number, h: number): ScanImage {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  return { media_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82).split(',')[1] };
}

/** Foto → 1 imagen reducida. Video → 3 cuadros repartidos a lo largo del clip. */
export async function fileToImages(file: File): Promise<ScanImage[]> {
  if (file.type.startsWith('video/')) {
    const url = URL.createObjectURL(file);
    try {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('No se pudo leer el video.')); });
      const out: ScanImage[] = [];
      for (const f of [0.15, 0.5, 0.85]) {
        await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = (v.duration || 1) * f; });
        out.push(toJpeg(v, v.videoWidth, v.videoHeight));
      }
      return out;
    } finally { URL.revokeObjectURL(url); }
  }
  const bmp = await createImageBitmap(file);
  try { return [toJpeg(bmp, bmp.width, bmp.height)]; } finally { bmp.close(); }
}

export class ScanError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

export async function scanSpace(images: ScanImage[], notes?: string): Promise<ScanResult> {
  let res: Response;
  try {
    res = await fetch(`${API}/api/homelab/scan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ images, notes: notes || undefined, language: getLocale() }) });
  } catch {
    throw new ScanError(t('hl.scan.errOffline'), 'offline');
  }
  const body = await res.json().catch(() => null);
  // Sin servidor (por ejemplo, en la versión de prueba publicada en GitHub Pages) /api responde 404 con una página, no con JSON.
  if (res.status === 404 || res.status === 405 || (!res.ok && !body)) throw new ScanError(t('hl.scan.errNotConfigured'), 'not_configured');
  if (!res.ok) throw new ScanError(body?.error ?? t('hl.scan.errFailed'), body?.code ?? (res.status >= 500 ? 'unavailable' : undefined));
  return body as ScanResult;
}
