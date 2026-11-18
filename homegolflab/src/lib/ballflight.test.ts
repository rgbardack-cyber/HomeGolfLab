import { describe, expect, it } from 'vitest';
import {
  analysisSize, BallTracker, detectBlobs, estimatePolarity, framesIdentical, launchAngleDeg, summarizeFlight, trackFrames, toGray,
  type FlightPoint, type Gray, type TrackerOptions,
} from './ballflight';

const W = 160, H = 90, DT = 1000 / 30;
const OPTS: TrackerOptions = { w: W, h: H, maxAreaFrac: 0.01 }; // bola de radio 3 ≈ 29 px; tope 144 px

interface Disc { x: number; y: number; r: number; v: number }

/** Fondo plano con discos: la imagen sintética más simple que puede probar el seguimiento. */
function frame(bg: number, discs: Disc[] = [], tick = 0): Gray {
  const data = new Uint8Array(W * H).fill(bg);
  data[0] = bg + (tick % 3); // ruido lejano: los cuadros reales casi nunca son idénticos
  for (const d of discs) {
    for (let y = Math.floor(d.y - d.r); y <= Math.ceil(d.y + d.r); y++) {
      for (let x = Math.floor(d.x - d.r); x <= Math.ceil(d.x + d.r); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (Math.hypot(x - d.x, y - d.y) <= d.r) data[y * W + x] = d.v;
      }
    }
  }
  return { data, w: W, h: H };
}

const START = { x: 10, y: 82 };
const STEP = { x: 9, y: -6 }; // 10,8 px por cuadro
const ballAt = (k: number) => ({ x: START.x + STEP.x * k, y: START.y + STEP.y * k });
const norm = (p: { x: number; y: number }) => ({ x: p.x / W, y: p.y / H });

function flight(bg: number, ballV: number, n: number, extra?: (k: number) => Disc[]) {
  return Array.from({ length: n }, (_, k) => {
    const b = ballAt(k);
    return { gray: frame(bg, [{ ...b, r: 3, v: ballV }, ...(extra ? extra(k) : [])], k), t: 1000 + k * DT };
  });
}

describe('detectBlobs', () => {
  it('encuentra lo que se aclara y lo que se oscurece, con su centro, caja y signo', () => {
    const a = frame(100, [{ x: 30, y: 30, r: 3, v: 240 }]);         // disco claro que desaparece: ese lugar se oscurece
    const b = frame(100, [{ x: 100, y: 50, r: 3, v: 240 }]);        // disco claro que aparece: ese lugar se aclara
    const blobs = detectBlobs(a, b);
    const bright = blobs.find((x) => x.sign === 1)!;
    const dark = blobs.find((x) => x.sign === -1)!;
    expect(blobs).toHaveLength(2);
    expect(Math.abs(bright.cx - 100)).toBeLessThan(0.6);
    expect(Math.abs(bright.cy - 50)).toBeLessThan(0.6);
    expect(bright.minX).toBeLessThanOrEqual(98);
    expect(bright.maxX).toBeGreaterThanOrEqual(102);
    expect(bright.area).toBeGreaterThan(20);
    expect(Math.abs(dark.cx - 30)).toBeLessThan(0.6);
    expect(Math.abs(dark.cy - 30)).toBeLessThan(0.6);
  });

  it('el filtro de signo y la región recortan lo que no interesa', () => {
    const a = frame(100, [{ x: 30, y: 30, r: 3, v: 240 }]);
    const b = frame(100, [{ x: 100, y: 50, r: 3, v: 20 }]);
    expect(detectBlobs(a, b, { sign: 1 }).every((x) => x.sign === 1)).toBe(true);
    expect(detectBlobs(a, b, { sign: -1 }).every((x) => x.sign === -1)).toBe(true);
    const roi = detectBlobs(a, b, { roi: { x0: 80, y0: 30, x1: 120, y1: 70 } });
    expect(roi).toHaveLength(1);
    expect(roi[0].sign).toBe(-1);
  });

  it('ignora manchas de menos del área mínima y cuadros iguales', () => {
    const a = frame(100);
    const b = frame(100, [{ x: 50, y: 50, r: 0.4, v: 255 }]); // 1 píxel
    expect(detectBlobs(a, b)).toEqual([]);
    expect(detectBlobs(a, a)).toEqual([]);
  });
});

describe('estimatePolarity', () => {
  it('distingue bola clara, bola oscura y sin contraste', () => {
    expect(estimatePolarity(frame(30, [{ ...START, r: 3, v: 240 }]), START.x, START.y)).toBe('bright');
    expect(estimatePolarity(frame(220, [{ ...START, r: 3, v: 20 }]), START.x, START.y)).toBe('dark');
    expect(estimatePolarity(frame(200), START.x, START.y)).toBe('any');
  });
  it('tolera un toque a unos píxeles de la bola', () => {
    expect(estimatePolarity(frame(30, [{ ...START, r: 3, v: 240 }]), START.x + 3, START.y - 2)).toBe('bright');
  });
});

describe('seguimiento', () => {
  it('sigue una bola clara que se mueve sobre fondo oscuro plano', () => {
    const r = trackFrames(flight(30, 240, 14), norm(START), OPTS);
    expect(r.points).toHaveLength(13);
    expect(r.endReason).toBeNull();
    expect(r.lostAtMs).toBeNull();
    r.points.forEach((p, i) => {
      const truth = ballAt(i + 1);
      expect(Math.abs(p.x * W - truth.x)).toBeLessThan(2);
      expect(Math.abs(p.y * H - truth.y)).toBeLessThan(2);
      expect(p.source).toBe('detected');
    });
  });

  it('sigue una bola oscura sobre fondo claro (oscurecimiento)', () => {
    const r = trackFrames(flight(220, 20, 14), norm(START), OPTS);
    expect(r.points).toHaveLength(13);
    r.points.forEach((p, i) => {
      const truth = ballAt(i + 1);
      expect(Math.abs(p.x * W - truth.x)).toBeLessThan(2);
      expect(Math.abs(p.y * H - truth.y)).toBeLessThan(2);
    });
  });

  it('con polaridad "any" también sigue la bola (acepta los dos signos)', () => {
    const r = trackFrames(flight(30, 240, 14), norm(START), { ...OPTS, polarity: 'any' });
    expect(r.points.length).toBeGreaterThanOrEqual(8);
    // Tras la segunda detección la predicción de velocidad evita el rastro que deja la bola.
    const last = r.points[r.points.length - 1];
    const k = r.points.length;
    expect(Math.abs(last.x * W - ballAt(k).x)).toBeLessThan(3);
  });

  it('ignora a otro objeto brillante que se mueve cerca cuando la bola está más cerca de lo esperado', () => {
    // "Pie": un disco igual de claro que va en paralelo a 8 px de la bola, y un destello puntual en el cuadro 5
    // más cerca de la última posición que de la predicha.
    const foot = (k: number): Disc[] => {
      const b = ballAt(k);
      const d: Disc[] = [{ x: b.x + 6, y: b.y + 6, r: 3, v: 240 }];
      if (k === 5) { const p = ballAt(4); d.push({ x: p.x - 2, y: p.y + 3, r: 3, v: 240 }); }
      return d;
    };
    const r = trackFrames(flight(30, 240, 14, foot), norm(START), OPTS);
    expect(r.points).toHaveLength(13);
    r.points.forEach((p, i) => {
      const truth = ballAt(i + 1);
      expect(Math.hypot(p.x * W - truth.x, p.y * H - truth.y)).toBeLessThan(2.5);
    });
  });

  it('rechaza manchas mucho más grandes que la bola (cuerpo, sombra)', () => {
    const frames = flight(30, 240, 6);
    // Un bloque grande aparece junto al arranque y no hay bola: no debe tomarse como bola.
    const noBall = frames.map((f, k) => ({ gray: frame(30, k > 0 ? [{ x: 18, y: 76, r: 9, v: 240 }] : [], k), t: f.t }));
    const r = trackFrames(noBall, norm(START), OPTS);
    expect(r.points).toEqual([]);
  });

  it('una bola perdida 4 cuadros termina el seguimiento y dice cuándo', () => {
    const all = flight(30, 240, 14);
    const frames = all.map((f, k) => (k >= 8 ? { gray: frame(30, [], k), t: f.t } : f)); // la bola desaparece desde el cuadro 8
    // y reaparece en la posición esperada mucho después: no debe retomarse
    frames[12] = all[12];
    const r = trackFrames(frames, norm(START), OPTS);
    expect(r.endReason).toBe('lost');
    expect(r.points).toHaveLength(7); // transiciones 1..7
    expect(r.lostAtMs).toBeCloseTo(frames[8].t, 5); // primer cuadro sin bola
    const s = summarizeFlight(r, W / H);
    expect(s.detected).toBe(7);
    expect(s.lostAtS).toBeCloseTo((frames[8].t - r.points[0].t) / 1000, 1);
    expect(s.followedS).toBeCloseTo((r.points[6].t - r.points[0].t) / 1000, 1);
  });

  it('deja de seguir al pasar la ventana de seguimiento', () => {
    const tr = new BallTracker(norm(START), { ...OPTS, maxFollowMs: 300 });
    const fr = flight(30, 240, 14);
    for (let k = 1; k < fr.length && !tr.done; k++) tr.feed(fr[k - 1].gray, fr[k].gray, fr[k].t);
    expect(tr.endReason).toBe('window');
    expect(tr.lostAtMs).toBeNull();
    const last = tr.points[tr.points.length - 1];
    expect(last.t - tr.points[0].t).toBeLessThanOrEqual(300);
  });

  it('un arranque falso que se pierde pronto se descarta y se sigue esperando la bola real', () => {
    // La bola está quieta en su marca. En el cuadro 1 aparece un destello cerca; la bola real sale en el cuadro 12.
    const rest = (k: number, extra: Disc[] = []) => frame(30, [{ ...START, r: 3, v: 240 }, ...extra], k);
    const frames = Array.from({ length: 30 }, (_, k) => ({ gray: rest(k), t: 1000 + k * DT }));
    frames[1] = { gray: rest(1, [{ x: 14, y: 79, r: 3, v: 240 }]), t: frames[1].t };
    const real = flight(30, 240, 10);
    for (let k = 0; k < 10; k++) frames[12 + k] = { gray: real[k].gray, t: 1000 + (12 + k) * DT };
    const r = trackFrames(frames, norm(START), OPTS);
    expect(r.points).toHaveLength(9);
    expect(r.points[0].t).toBeGreaterThan(frames[12].t); // nada del destello
    r.points.forEach((p, i) => {
      const truth = ballAt(i + 1);
      expect(Math.hypot(p.x * W - truth.x, p.y * H - truth.y)).toBeLessThan(2.5);
    });
  });

  it('sin detecciones devuelve vacío, sin lanzar', () => {
    const frames = Array.from({ length: 10 }, (_, k) => ({ gray: frame(90, [], k), t: k * DT }));
    const r = trackFrames(frames, norm(START), OPTS);
    expect(r.points).toEqual([]);
    expect(r.endReason).toBeNull();
    expect(r.lostAtMs).toBeNull();
    const s = summarizeFlight(r, W / H);
    expect(s).toMatchObject({ detected: 0, estimated: 0, followedS: 0, lostAtS: null, launchAngleDeg: null });
    expect(() => trackFrames([], norm(START), OPTS)).not.toThrow();
    expect(trackFrames([{ gray: frame(90), t: 0 }], norm(START), OPTS).points).toEqual([]);
  });

  it('nada sale como "estimated": el seguimiento solo crea puntos detectados', () => {
    const r = trackFrames(flight(30, 240, 14), norm(START), OPTS);
    expect(r.points.every((p) => p.source === 'detected')).toBe(true);
    expect(summarizeFlight(r, W / H).estimated).toBe(0);
  });

  it('los cuadros repetidos se saltan y no cuentan como sin bola', () => {
    const fr = flight(30, 240, 14);
    const dup: typeof fr = [];
    for (const f of fr) { dup.push(f); dup.push({ gray: f.gray, t: f.t + DT / 2 }); } // cada cuadro llega dos veces
    const r = trackFrames(dup, norm(START), OPTS);
    expect(r.points).toHaveLength(13);
    expect(r.endReason).toBeNull();
  });
});

describe('ángulo de salida en la imagen', () => {
  const pt = (x: number, y: number, i: number, source: FlightPoint['source'] = 'detected'): FlightPoint => ({ t: i * 500, x, y, source });

  it('mide desde la vertical, + a la derecha, con la proporción del video', () => {
    // aspect 2: un paso de 0.01 en x equivale a 0.02 de alto → 45° con 0.02 hacia arriba
    const diag = [0, 1, 2, 3].map((i) => pt(0.5 + 0.01 * i, 0.8 - 0.02 * i, i));
    expect(launchAngleDeg(diag, 2)).toBeCloseTo(45, 0);
    const up = [0, 1, 2].map((i) => pt(0.5, 0.8 - 0.05 * i, i));
    expect(launchAngleDeg(up, 16 / 9)).toBe(0);
    const left = [0, 1, 2].map((i) => pt(0.5 - 0.03 * i, 0.8 - 0.03 * i, i));
    expect(launchAngleDeg(left, 1)).toBeCloseTo(-45, 0);
  });

  it('con una dirección conocida de punta a punta (9 px a la derecha por 6 arriba) sale ~56°', () => {
    const r = trackFrames(flight(30, 240, 14), norm(START), OPTS);
    const a = launchAngleDeg(r.points, W / H)!;
    expect(Math.abs(a - (Math.atan2(9, 6) * 180) / Math.PI)).toBeLessThan(1.5);
    expect(summarizeFlight(r, W / H).launchAngleDeg).toBe(a);
  });

  it('no inventa un ángulo con menos de 3 puntos detectados ni con puntos estimados', () => {
    expect(launchAngleDeg([pt(0.5, 0.8, 0), pt(0.55, 0.7, 1)], 1)).toBeNull();
    expect(launchAngleDeg([pt(0.5, 0.8, 0), pt(0.55, 0.7, 1), pt(0.6, 0.6, 2, 'estimated')], 1)).toBeNull();
    expect(launchAngleDeg([], 1)).toBeNull();
  });

  it('los puntos estimados se cuentan aparte y no cuentan como detectados', () => {
    const res = {
      points: [pt(0.5, 0.8, 0), pt(0.52, 0.7, 1), pt(0.54, 0.6, 2), pt(0.56, 0.5, 3, 'estimated')],
      lostAtMs: null, endReason: null,
    };
    const s = summarizeFlight(res, 1);
    expect(s.detected).toBe(3);
    expect(s.estimated).toBe(1);
    expect(s.followedS).toBe(1); // solo hasta el último detectado
  });
});

describe('ayudas de imagen', () => {
  it('analysisSize respeta la proporción y no agranda', () => {
    expect(analysisSize(1920, 1080)).toEqual({ w: 640, h: 360 });
    expect(analysisSize(320, 240)).toEqual({ w: 320, h: 240 });
    const v = analysisSize(1080, 1920); // vertical: el lado largo se limita
    expect(v.h).toBeLessThanOrEqual(1000);
    expect(Math.abs(v.w / v.h - 1080 / 1920)).toBeLessThan(0.01);
    expect(analysisSize(0, 0)).toEqual({ w: 0, h: 0 });
  });

  it('framesIdentical y toGray', () => {
    const a = frame(50), b = frame(50), c = frame(50, [{ x: 10, y: 10, r: 2, v: 200 }]);
    expect(framesIdentical(a, b)).toBe(true);
    expect(framesIdentical(a, c)).toBe(false);
    expect(framesIdentical(a, { data: new Uint8Array(4), w: 2, h: 2 })).toBe(false);
    const g = toGray([255, 255, 255, 255, 0, 0, 0, 255], 2, 1);
    expect(g.data[0]).toBe(255);
    expect(g.data[1]).toBe(0);
  });
});
