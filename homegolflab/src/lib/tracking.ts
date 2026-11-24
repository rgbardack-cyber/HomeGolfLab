/**
 * Ball tracking con una sola cámara (putt y chip rodado).
 *
 * Mide de verdad, a partir de los cuadros de video: dirección de salida respecto a la línea
 * al objetivo y velocidad inicial. La escala sale de la distancia bola→objetivo que indica
 * el jugador, así que es una aproximación (no corrige perspectiva).
 *
 * Un swing completo NO se puede medir así: a 30 cuadros por segundo la bola sale del cuadro
 * en 1–2 imágenes. Para eso existe el registro manual de tiros.
 */
import { t } from '@/i18n';

export interface P2 { x: number; y: number }
export interface TrackPoint extends P2 { t: number }

export interface Detection extends P2 { count: number }

/**
 * Busca el centro de los píxeles que cambiaron entre dos cuadros y que además son claros
 * (la bola es blanca). Las imágenes son RGBA del mismo tamaño. Devuelve coordenadas 0–1.
 */
export function detectMovingBright(
  prev: Uint8ClampedArray, cur: Uint8ClampedArray, w: number, h: number,
  o: { diff?: number; bright?: number; minCount?: number; maxFrac?: number; accept?: (x: number, y: number) => boolean } = {},
): Detection | null {
  const diffT = o.diff ?? 38, brightT = o.bright ?? 150, minCount = o.minCount ?? 4, maxFrac = o.maxFrac ?? 0.03;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const g = (cur[i] * 3 + cur[i + 1] * 6 + cur[i + 2]) / 10;
      if (g < brightT) continue;
      const gp = (prev[i] * 3 + prev[i + 1] * 6 + prev[i + 2]) / 10;
      if (g - gp < diffT) continue; // solo donde APARECE algo claro
      if (o.accept && !o.accept(x / w, y / h)) continue;
      sx += x; sy += y; n++;
    }
  }
  if (n < minCount || n > w * h * maxFrac) return null;
  return { x: sx / n / w, y: sy / n / h, count: n };
}

export interface ShotInput {
  points: TrackPoint[];     // posiciones de la bola tras el golpe (0–1), t en ms
  start: P2;                // bola en reposo
  target: P2;               // objetivo (hoyo / marca)
  distanceM: number;        // distancia real bola→objetivo
  aspect: number;           // ancho/alto del video, para no deformar ángulos
}

export interface ShotMetrics {
  directionDeg: number;     // + = derecha de la línea, − = izquierda
  speedMps: number;         // velocidad inicial
  missCm: number;           // desvío lateral proyectado a la distancia del objetivo (+ derecha)
  onLine: boolean;          // pasaría dentro del ancho del hoyo (±5.4 cm)
  trackedM: number;         // distancia seguida por la cámara
  quality: number;          // 1–10 según precisión de dirección
  points: number;
}

const HOLE_HALF_CM = 5.4;

export function analyzeShot(inp: ShotInput): ShotMetrics | null {
  const ax = inp.aspect || 1;
  const toPx = (p: P2) => ({ x: p.x * ax, y: p.y });
  const s = toPx(inp.start), g = toPx(inp.target);
  const line = { x: g.x - s.x, y: g.y - s.y };
  const lineLen = Math.hypot(line.x, line.y);
  if (lineLen < 0.05 || inp.distanceM <= 0) return null;
  const u = { x: line.x / lineLen, y: line.y / lineLen };
  const mPerUnit = inp.distanceM / lineLen;

  // Solo puntos que avanzan hacia el objetivo y se alejan cada vez más de la salida.
  const pts: { along: number; lat: number; t: number }[] = [];
  for (const p of inp.points) {
    const q = toPx(p);
    const d = { x: q.x - s.x, y: q.y - s.y };
    const along = d.x * u.x + d.y * u.y;
    const lat = d.x * -u.y + d.y * u.x; // + = derecha visto hacia el objetivo (y de pantalla hacia abajo)
    if (along <= 0.02 * lineLen) continue;
    if (pts.length && along <= pts[pts.length - 1].along) continue;
    pts.push({ along, lat, t: p.t });
  }
  if (pts.length < 3) return null;

  // Dirección: ajuste por mínimos cuadrados de lat = k·along (pasa por la salida).
  let sxx = 0, sxy = 0;
  for (const p of pts) { sxx += p.along * p.along; sxy += p.along * p.lat; }
  const k = sxy / sxx;
  const directionDeg = (Math.atan(k) * 180) / Math.PI;

  // Velocidad inicial: primeros puntos.
  const a = pts[0], b = pts[Math.min(pts.length - 1, 3)];
  const dt = (b.t - a.t) / 1000;
  const speedMps = dt > 0 ? (Math.hypot(b.along - a.along, b.lat - a.lat) * mPerUnit) / dt : 0;

  const missCm = k * inp.distanceM * 100;
  const absDir = Math.abs(directionDeg);
  const quality = Math.max(1, Math.min(10, Math.round(10 - absDir * 1.5)));
  const r = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    directionDeg: r(directionDeg), speedMps: r(speedMps, 2), missCm: r(missCm),
    onLine: Math.abs(missCm) <= HOLE_HALF_CM, trackedM: r(pts[pts.length - 1].along * mPerUnit, 2),
    quality, points: pts.length,
  };
}

/** Un tiro guardado, medido con cámara o anotado a mano. Distancias en metros. */
export interface Shot {
  id: string;
  source: 'camera' | 'manual';
  club: string;
  lateralM: number;   // + derecha
  carryM: number;     // distancia (para cámara: distancia al objetivo)
  speedMps?: number;
  directionDeg?: number;
  onLine?: boolean;
  quality?: number;
  at: string;
}

export interface Dispersion { count: number; avgCarryM: number; lateralStdM: number; carryStdM: number; avgLateralM: number; consistency: number }

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };

export function dispersion(shots: Shot[]): Dispersion | null {
  if (!shots.length) return null;
  const lat = shots.map((s) => s.lateralM), car = shots.map((s) => s.carryM);
  const avgCarry = mean(car);
  const ratio = (std(lat) + std(car)) / (2 * (Math.abs(avgCarry) || 1));
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    count: shots.length, avgCarryM: r(avgCarry), lateralStdM: r(std(lat)), carryStdM: r(std(car)), avgLateralM: r(mean(lat)),
    consistency: shots.length < 2 ? 0 : Math.max(0, Math.min(100, Math.round(100 - ratio * 200))),
  };
}

export const CLUBS = ['Putter', 'LW', 'SW', 'PW', 'Hierro 9', 'Hierro 8', 'Hierro 7', 'Hierro 6', 'Hierro 5', 'Hierro 4', 'Híbrido', 'Madera 5', 'Madera 3', 'Driver'];

/** Nombre del palo en el idioma actual. El valor guardado sigue siendo el de `CLUBS` (en español); un nombre desconocido se muestra tal cual. */
export function clubLabel(club: string): string {
  const m = /^(Hierro|Madera) (\d)$/.exec(club);
  if (m) return t(m[1] === 'Hierro' ? 'club.iron' : 'club.wood', { n: m[2] });
  if (club === 'Putter') return t('club.putter');
  if (club === 'Híbrido') return t('club.hybrid');
  if (club === 'Driver') return t('club.driver');
  return club;
}
