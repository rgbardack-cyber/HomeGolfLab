import { describe, expect, it } from 'vitest';
import type { FlightPointV2, FlightTrack } from './flightTrack';
import { makeClock } from './media/clock';
import { classifyShape, MANUAL_SHAPES, SHAPE_LABEL, SHAPE_THRESHOLDS, shapeFeatures, shapeResult, SHAPE_VALIDATED, type ShapeFeatures } from './shotShape';

const clock = makeClock({ fpsNominal: 60 });
const ASPECT = 9 / 16;
const TAP = { x: 0.5, y: 0.8, t: 0 };
const TARGET = { x: 0.5, y: 0.2 };                                   // la línea de tiro sube recto por la imagen
const marks = { target: TARGET, horizonY: 0.4 };

/** Vuelo que sube desde la bola; `bend(s)` es el desvío lateral (en ancho de cuadro) en la fracción s del recorrido. */
function flight(opts: { n?: number; bend?: (s: number) => number; rise?: number; fps?: number } = {}): FlightTrack {
  const n = opts.n ?? 30, rise = opts.rise ?? 0.3, bend = opts.bend ?? (() => 0);
  const observed: FlightPointV2[] = Array.from({ length: n }, (_, i) => {
    const s = i / (n - 1);
    return { t: (i * 1000) / 60, frame: i, x: TAP.x + bend(s), y: TAP.y - rise * s, conf: 0.8, source: 'detected' };
  });
  return { v: 2, sourceId: 'x', clock, tap: TAP, observed, gaps: [], lastDistinguishable: null, descent: { state: 'insufficient', evidence: {} as never, frame: 'image' }, continuation: { state: 'abstained', points: [] }, released: true, endReason: 'lost', engine: 't' };
}

describe('rasgos de la forma del tiro (F6.2)', () => {
  it('un vuelo recto sobre la línea de tiro no tiene curvatura ni desvío inicial', () => {
    const f = shapeFeatures(flight(), marks, ASPECT, 'atras')!;
    expect(Math.abs(f.lateralCurvaturePct!)).toBeLessThan(0.2);
    expect(Math.abs(f.startDirImageDeg!)).toBeLessThan(1);
    expect(f.elevationRelHorizonPct).toBeCloseTo((0.4 - 0.5) * 100, 1);          // el punto más alto (y = 0,5) queda 10 % POR DEBAJO del horizonte
    expect(f.observedRealMs).toBe(483);
    expect(f.view).toBe('atras');
  });

  it('una curva a la derecha de la línea da curvatura positiva; a la izquierda, negativa', () => {
    const right = shapeFeatures(flight({ bend: (s) => 0.12 * Math.sin(Math.PI * s) }), marks, ASPECT, 'atras')!;
    const left = shapeFeatures(flight({ bend: (s) => -0.12 * Math.sin(Math.PI * s) }), marks, ASPECT, 'atras')!;
    expect(right.lateralCurvaturePct!).toBeGreaterThan(5);
    expect(left.lateralCurvaturePct!).toBeLessThan(-5);
    expect(right.lateralCurvaturePct!).toBeCloseTo(-left.lateralCurvaturePct!, 1);
  });

  it('el signo es siempre "derecha de la línea de tiro", también si la línea apunta al revés del recorrido', () => {
    const down = { target: { x: 0.5, y: 0.95 }, horizonY: 0.4 };               // línea hacia abajo de la imagen (cámara de frente al golfista)
    const f = shapeFeatures(flight({ bend: (s) => 0.12 * Math.sin(Math.PI * s) }), down, ASPECT, 'atras')!;
    // mirando hacia abajo de la imagen, la derecha del tiro es la izquierda de la pantalla: una curva hacia +x queda a su izquierda
    expect(f.lateralCurvaturePct!).toBeLessThan(-5);
  });

  it('la dirección inicial es + a la derecha de la línea y − a la izquierda', () => {
    const r = shapeFeatures(flight({ bend: (s) => 0.2 * s }), marks, ASPECT, 'atras')!;
    const l = shapeFeatures(flight({ bend: (s) => -0.2 * s }), marks, ASPECT, 'atras')!;
    expect(r.startDirImageDeg!).toBeGreaterThan(5);
    expect(l.startDirImageDeg!).toBeLessThan(-5);
  });

  it('sin línea de tiro no hay curvatura ni dirección; sin horizonte no hay altura', () => {
    const f = shapeFeatures(flight(), { target: null, horizonY: null }, ASPECT, 'atras')!;
    expect(f).toMatchObject({ lateralCurvaturePct: null, startDirImageDeg: null, elevationRelHorizonPct: null });
  });

  it('con menos de 8 puntos o menos de 0,3 s reales no calcula nada', () => {
    expect(shapeFeatures(flight({ n: 7 }), marks, ASPECT, 'atras')).toBeNull();
    expect(shapeFeatures(flight({ n: 12 }), marks, ASPECT, 'atras')).toBeNull();      // 11 cuadros a 60 fps = 183 ms
  });

  it('la altura sobre el horizonte sube cuando el vuelo sube más', () => {
    const low = shapeFeatures(flight({ rise: 0.2 }), marks, ASPECT, 'atras')!.elevationRelHorizonPct!;
    const high = shapeFeatures(flight({ rise: 0.5 }), marks, ASPECT, 'atras')!.elevationRelHorizonPct!;
    expect(high).toBeGreaterThan(low);
  });
});

const feat = (over: Partial<ShapeFeatures> = {}): ShapeFeatures => ({ lateralCurvaturePct: 0, startDirImageDeg: 0, elevationRelHorizonPct: 20, observedRealMs: 1000, view: 'atras', ...over });

describe('clasificación con abstención (F6.2)', () => {
  it('recto, draw, fade, hook y slice según la curvatura, para un diestro', () => {
    expect(classifyShape(feat(), false).value).toBe('recto');
    expect(classifyShape(feat({ lateralCurvaturePct: -3 }), false).value).toBe('draw');
    expect(classifyShape(feat({ lateralCurvaturePct: 3 }), false).value).toBe('fade');
    expect(classifyShape(feat({ lateralCurvaturePct: -9 }), false).value).toBe('hook');
    expect(classifyShape(feat({ lateralCurvaturePct: 9 }), false).value).toBe('slice');
  });

  it('un zurdo invierte draw/fade y hook/slice', () => {
    expect(classifyShape(feat({ lateralCurvaturePct: -3 }), true).value).toBe('fade');
    expect(classifyShape(feat({ lateralCurvaturePct: 3 }), true).value).toBe('draw');
    expect(classifyShape(feat({ lateralCurvaturePct: -9 }), true).value).toBe('slice');
    expect(classifyShape(feat({ lateralCurvaturePct: 9 }), true).value).toBe('hook');
  });

  it('bajo y stinger según la altura cuando no curva', () => {
    expect(classifyShape(feat({ elevationRelHorizonPct: 2 }), false).value).toBe('stinger');
    expect(classifyShape(feat({ elevationRelHorizonPct: 6 }), false).value).toBe('bajo');
    expect(classifyShape(feat({ elevationRelHorizonPct: 25 }), false).value).toBe('recto');
  });

  it('se abstiene sin curvatura o altura medibles, o con poca confianza (tiempo corto o vista frontal)', () => {
    expect(classifyShape(feat({ lateralCurvaturePct: null }), false).value).toBe('sin_determinar');
    expect(classifyShape(feat({ elevationRelHorizonPct: null }), false).value).toBe('sin_determinar');
    expect(classifyShape(feat({ observedRealMs: 400 }), false).value).toBe('sin_determinar');
    expect(classifyShape(feat({ view: 'frente', observedRealMs: 600 }), false).value).toBe('sin_determinar');   // 0,6 × 0,7 = 0,42 < 0,5
    expect(classifyShape(feat({ view: 'frente', observedRealMs: 1000 }), false).conf).toBeCloseTo(0.7, 6);
    expect(SHAPE_THRESHOLDS.minConf).toBe(0.5);
  });
});

describe('resultado: etiqueta manual vs automática (F6.1, F6.3)', () => {
  const base = { track: flight({ n: 45, bend: (s) => 0.12 * Math.sin(Math.PI * s) }), marks, aspect: ASPECT, view: 'atras' as const, lefty: false };

  it('la clasificación automática NO existe mientras no esté validada: la salida es null aunque los rasgos alcancen', () => {
    expect(SHAPE_VALIDATED).toBe(false);
    const r = shapeResult({ ...base, manual: null });
    expect(r).toEqual({ auto: null, manual: null, source: 'none' });
  });

  it('con la validación forzada (prueba) sí clasifica y lleva los rasgos', () => {
    const r = shapeResult({ ...base, manual: null, validated: true });
    expect(r.source).toBe('auto');
    expect(r.auto!.value).toMatch(/fade|slice/);                      // curva a la derecha de la línea, diestro
    expect(r.auto!.features.observedRealMs).toBeGreaterThan(300);
  });

  it('la etiqueta del usuario manda, no se mezcla con la automática y nunca se presenta como detectada', () => {
    const r = shapeResult({ ...base, manual: 'draw', validated: true });
    expect(r.source).toBe('manual');
    expect(r.manual).toBe('draw');
    expect(r.auto!.value).not.toBe('draw');                           // son campos distintos
    expect(shapeResult({ ...base, manual: 'draw' })).toEqual({ auto: null, manual: 'draw', source: 'manual' });
  });

  it('"sin determinar" no es una etiqueta: equivale a no etiquetar; sin trayectoria tampoco hay automática', () => {
    expect(shapeResult({ ...base, manual: 'sin_determinar' }).source).toBe('none');
    expect(shapeResult({ ...base, track: null, manual: null, validated: true }).auto).toBeNull();
  });

  it('las formas elegibles y sus rótulos en español', () => {
    expect(MANUAL_SHAPES).toEqual(['stinger', 'bajo', 'recto', 'draw', 'fade', 'hook', 'slice']);
    expect(MANUAL_SHAPES.every((s) => SHAPE_LABEL[s].length > 0)).toBe(true);
    expect(SHAPE_LABEL.sin_determinar).toBe('Sin determinar');
  });
});
