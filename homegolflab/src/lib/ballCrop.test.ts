import { describe, expect, it } from 'vitest';
import { detectBlobs, type Gray } from './ballflight';
import { cropGray, cropToFull, downscaleGray, fullToCrop, MAX_CROP_SIDE, nativeCropFor, normalizeLocalContrast } from './ballCrop';

const NW = 1920, NH = 1080;

/** Cuadro nativo con fondo `bg` y una bola de radio `r` (px nativos) con valor `v` en (cx, cy). */
function native(bg: number, balls: { cx: number; cy: number; r: number; v: number }[], gradient = 0): Gray {
  const data = new Uint8Array(NW * NH);
  for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) data[y * NW + x] = bg + (gradient ? (x / NW) * gradient : 0);
  for (const b of balls) {
    for (let y = Math.floor(b.cy - b.r - 1); y <= Math.ceil(b.cy + b.r + 1); y++) for (let x = Math.floor(b.cx - b.r - 1); x <= Math.ceil(b.cx + b.r + 1); x++) {
      if (Math.hypot(x - b.cx, y - b.cy) <= b.r) data[y * NW + x] = b.v;
    }
  }
  return { data, w: NW, h: NH };
}

describe('recorte nativo (F5.3)', () => {
  const analysis = { w: 640, h: 360 };

  it('una bola de 3 px se detecta en el recorte nativo y NO a 640 px de ancho', () => {
    const a = native(90, []);
    const b = native(90, [{ cx: 1203, cy: 640, r: 1.5, v: 250 }]);
    // A 640 px la bola (3 px nativos) ocupa ~1 px: por debajo del área mínima del tracker.
    const small = detectBlobs(downscaleGray(a, 640, 360), downscaleGray(b, 640, 360));
    expect(small).toEqual([]);
    // Recorte nativo alrededor de la ROI: la bola conserva sus píxeles.
    const roi = { x0: 380, y0: 190, x1: 420, y1: 230 };                 // en píxeles de análisis (≈ 1140–1260 × 570–690 nativos)
    const r = nativeCropFor(roi, analysis, { w: NW, h: NH })!;
    const blobs = detectBlobs(cropGray(a, r), cropGray(b, r));
    expect(blobs).toHaveLength(1);
    expect(blobs[0].area).toBeGreaterThanOrEqual(4);
    const full = cropToFull({ x: blobs[0].cx, y: blobs[0].cy }, r, { w: NW, h: NH });
    expect(full.x * NW).toBeCloseTo(1203, 0);
    expect(full.y * NH).toBeCloseTo(640, 0);
  });

  it('el recorte se limita a MAX_CROP_SIDE, queda dentro del cuadro y no inventa área', () => {
    const big = nativeCropFor({ x0: 0, y0: 0, x1: 640, y1: 360 }, analysis, { w: NW, h: NH })!;
    expect(big.w).toBeLessThanOrEqual(MAX_CROP_SIDE);
    expect(big.h).toBeLessThanOrEqual(MAX_CROP_SIDE);
    const edge = nativeCropFor({ x0: 600, y0: 330, x1: 700, y1: 400 }, analysis, { w: NW, h: NH })!;
    expect(edge.x0 + edge.w).toBeLessThanOrEqual(NW);
    expect(edge.y0 + edge.h).toBeLessThanOrEqual(NH);
    expect(nativeCropFor({ x0: 700, y0: 400, x1: 800, y1: 500 }, analysis, { w: NW, h: NH })).toBeNull();
  });

  it('cropToFull y fullToCrop son inversas', () => {
    const r = { x0: 1140, y0: 570, w: 120, h: 120 };
    const p = { x: 61.5, y: 70.25 };
    const back = fullToCrop(cropToFull(p, r, { w: NW, h: NH }), r, { w: NW, h: NH });
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('cropGray copia los píxeles del recorte y no modifica el original', () => {
    const g = native(50, [{ cx: 100, cy: 100, r: 3, v: 200 }]);
    const before = g.data.slice();
    const c = cropGray(g, { x0: 90, y0: 90, w: 20, h: 20 });
    expect(c.data[10 * 20 + 10]).toBe(200);
    expect(g.data).toEqual(before);
  });
});

describe('normalización local de contraste en una copia (F5.3)', () => {
  it('no modifica el original y deja una bola tenue sobre un fondo con degradado por encima del umbral', () => {
    // Bola de 3 px apenas 20 niveles más clara que el fondo, sobre un degradado fuerte.
    const a = native(80, [], 90), b = native(80, [{ cx: 600, cy: 500, r: 1.6, v: 80 + (600 / NW) * 90 + 20 }], 90);
    const r = { x0: 540, y0: 440, w: 120, h: 120 };
    const ca = cropGray(a, r), cb = cropGray(b, r);
    const origB = cb.data.slice();
    expect(detectBlobs(ca, cb, { diff: 28 })).toEqual([]);                 // sin normalizar: 20 < 28
    const na = normalizeLocalContrast(ca), nb = normalizeLocalContrast(cb);
    expect(cb.data).toEqual(origB);                                          // la copia, no el original
    const blobs = detectBlobs(na, nb, { diff: 28 });
    expect(blobs.length).toBeGreaterThanOrEqual(1);
    expect(blobs.some((x) => Math.abs(x.cx - 60) < 2 && Math.abs(x.cy - 60) < 2)).toBe(true);
  });

  it('con un fondo plano no inventa diferencias entre dos cuadros iguales', () => {
    const g = cropGray(native(120, []), { x0: 0, y0: 0, w: 64, h: 64 });
    const n = normalizeLocalContrast(g);
    expect(detectBlobs(n, n)).toEqual([]);
    expect(new Set(n.data).size).toBe(1);
  });
});
