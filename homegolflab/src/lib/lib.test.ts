import { describe, expect, it } from 'vitest';
import { analyzeSwing, angleAt, coach, coachDtl, viewOfFrame, type Frame, type Pt } from './swing';
import { analyzeShot, detectMovingBright, dispersion, type Shot } from './tracking';
import { buildPlan, zones, type Space } from './homelab';
import { BADGES, computeStats, levelFor, newBadges, totalXp, type SessionLite } from './badges';

const pt = (x: number, y: number): Pt => ({ x, y, z: 0, v: 0.95 });

/** Swing sintético visto de frente: manos suben al tope y bajan al impacto. */
function synthSwing({ back = 0.9, down = 0.3, turn = 0.25, hipShift = 0.03, fps = 30 } = {}): Frame[] {
  const frames: Frame[] = [];
  const total = 0.5 + back + down + 0.5;
  for (let i = 0; i < total * fps; i++) {
    const t = i / fps;
    let wy = 0.6, w = 1, shift = 0;
    if (t >= 0.5 && t < 0.5 + back) { const k = (t - 0.5) / back; wy = 0.6 - 0.42 * k; w = 1 - (1 - turn) * k; }
    else if (t >= 0.5 + back && t < 0.5 + back + down) { const k = (t - 0.5 - back) / down; wy = 0.18 + 0.44 * k; w = turn + (1 - turn) * k; shift = hipShift * k; }
    else if (t >= 0.5 + back + down) { const k = Math.min(1, (t - 0.5 - back - down) / 0.4); wy = 0.62 - 0.4 * k; shift = hipShift; }
    const lm: Pt[] = Array.from({ length: 33 }, () => pt(0.5, 0.5));
    const half = 0.08 * w;
    lm[0] = pt(0.5, 0.2);
    lm[11] = pt(0.5 + half, 0.3); lm[12] = pt(0.5 - half, 0.3);
    lm[13] = pt(0.5 + half, (0.3 + wy) / 2); lm[14] = pt(0.5 - half, (0.3 + wy) / 2);
    lm[15] = pt(0.51, wy); lm[16] = pt(0.49, wy);
    lm[23] = pt(0.5 + 0.06 + shift, 0.55); lm[24] = pt(0.5 - 0.06 + shift, 0.55);
    lm[25] = pt(0.56, 0.75); lm[26] = pt(0.44, 0.75);
    frames.push({ t: t * 1000, lm });
  }
  return frames;
}

/**
 * Swing sintético visto desde atrás (línea de tiro): el jugador se ve de perfil mirando a +x,
 * con los dos hombros y las dos caderas casi superpuestos.
 * `rise` = cuánto se endereza en el impacto; `hipAdvance` = cuánto se acercan las caderas a la bola.
 */
function synthDtl({ back = 0.9, down = 0.3, rise = 0, hipAdvance = 0, fps = 30 } = {}): Frame[] {
  const frames: Frame[] = [];
  const total = 0.5 + back + down + 0.5;
  for (let i = 0; i < total * fps; i++) {
    const t = i / fps;
    let wy = 0.6, k = 0; // k: avance de la bajada (0 → 1)
    if (t >= 0.5 && t < 0.5 + back) wy = 0.6 - 0.42 * ((t - 0.5) / back);
    else if (t >= 0.5 + back && t < 0.5 + back + down) { k = (t - 0.5 - back) / down; wy = 0.18 + 0.44 * k; }
    else if (t >= 0.5 + back + down) { k = 1; wy = 0.62 - 0.4 * Math.min(1, (t - 0.5 - back - down) / 0.4); }
    const hipX = 0.45 + hipAdvance * k;
    const lean = 0.154 - rise * k; // desplazamiento horizontal de los hombros sobre la cadera
    const lm: Pt[] = Array.from({ length: 33 }, () => pt(0.5, 0.5));
    lm[0] = pt(hipX + lean + 0.07, 0.22 - rise * k * 0.3);
    lm[11] = pt(hipX + lean + 0.01, 0.33); lm[12] = pt(hipX + lean - 0.01, 0.33);
    lm[13] = pt(hipX + lean + 0.03, (0.33 + wy) / 2); lm[14] = pt(hipX + lean + 0.02, (0.33 + wy) / 2);
    lm[15] = pt(0.61, wy); lm[16] = pt(0.6, wy);
    lm[23] = pt(hipX + 0.01, 0.55); lm[24] = pt(hipX - 0.01, 0.55);
    lm[25] = pt(0.5, 0.75); lm[26] = pt(0.5, 0.75);
    lm[27] = pt(0.46, 0.95); lm[28] = pt(0.46, 0.95);
    frames.push({ t: t * 1000, lm });
  }
  return frames;
}

describe('swing desde atrás', () => {
  it('reconoce la vista sola', () => {
    const front = analyzeSwing(synthSwing());
    const back = analyzeSwing(synthDtl());
    if (typeof front === 'string' || typeof back === 'string') throw new Error('sin resultado');
    expect(front.view).toBe('frente');
    expect(back.view).toBe('atras');
    expect(viewOfFrame(synthSwing()[0])).toBe('frente');
    expect(viewOfFrame(synthDtl()[0])).toBe('atras');
  });
  it('con puntos 3D, la profundidad de los hombros desempata un ancho dudoso', () => {
    // Ancho aparente 0,38: de frente real (un jugador angosto) o de perfil con el hombro lejano asomando.
    const lm: Pt[] = Array.from({ length: 33 }, () => pt(0.5, 0.5));
    lm[11] = pt(0.55, 0.3); lm[12] = pt(0.45, 0.3); lm[23] = pt(0.545, 0.55); lm[24] = pt(0.455, 0.55);
    const world = (dx: number, dz: number): Pt[] => lm.map((p, i) => (i === 11 ? { ...p, x: dx, z: dz } : i === 12 ? { ...p, x: -dx, z: -dz } : p));
    expect(viewOfFrame({ lm, world: world(0.2, 0.03) })).toBe('frente'); // hombros casi paralelos a la cámara
    expect(viewOfFrame({ lm, world: world(0.06, 0.19) })).toBe('atras');  // hombros apuntando a la cámara
  });
  it('respeta la vista elegida a mano', () => {
    const r = analyzeSwing(synthSwing(), { view: 'atras' });
    if (typeof r === 'string') throw new Error(r);
    expect(r.view).toBe('atras');
  });
  it('mide la postura al inicio y la da por buena', () => {
    const r = analyzeSwing(synthDtl());
    if (typeof r === 'string' || r.view !== 'atras') throw new Error('se esperaba vista desde atrás');
    expect(r.metrics.spineAddressDeg).toBeGreaterThan(30); // atan(0.154 / 0.22) ≈ 35°
    expect(r.metrics.spineAddressDeg).toBeLessThan(40);
    expect(r.metrics.kneeFlexDeg).toBeGreaterThan(20);     // ≈ 25°
    expect(r.metrics.kneeFlexDeg).toBeLessThan(30);
    expect(r.metrics.tempoRatio).toBeGreaterThan(2.5);
    expect(r.metrics.tempoRatio).toBeLessThan(3.6);
    expect(Math.abs(r.metrics.hipAdvancePct)).toBeLessThanOrEqual(2);
    for (const key of ['setup', 'knees', 'spine', 'extension', 'head', 'tempo']) {
      expect(r.feedback.find((f) => f.key === key)?.severity, key).toBe('good');
    }
  });
  it('detecta extensión temprana y que te levantas', () => {
    const r = analyzeSwing(synthDtl({ rise: 0.1, hipAdvance: 0.05 }));
    if (typeof r === 'string' || r.view !== 'atras') throw new Error('se esperaba vista desde atrás');
    expect(r.metrics.hipAdvancePct).toBeGreaterThan(14);
    expect(r.metrics.spineImpactChangeDeg).toBeLessThan(-14);
    expect(r.feedback.find((f) => f.key === 'extension')?.severity).toBe('fix');
    expect(r.feedback.find((f) => f.key === 'spine')?.title).toBe('Te levantas en el impacto');
    const clean = analyzeSwing(synthDtl());
    if (typeof clean === 'string') throw new Error(clean);
    expect(r.score).toBeLessThan(clean.score);
  });
  it('omite las rodillas si no se ven los tobillos', () => {
    const frames = synthDtl().map((f) => ({ ...f, lm: f.lm.map((p, i) => (i === 27 || i === 28 ? { ...p, v: 0.1 } : p)) }));
    const r = analyzeSwing(frames);
    if (typeof r === 'string' || r.view !== 'atras') throw new Error('se esperaba vista desde atrás');
    expect(r.metrics.kneeFlexDeg).toBeNull();
    expect(r.feedback.find((f) => f.key === 'knees')).toBeUndefined();
  });
  it('corrige la proporción del video antes de medir ángulos', () => {
    // El mismo swing grabado en vertical (3:4) llega con las x estiradas; con `aspect` da lo mismo.
    const tall = synthDtl().map((f) => ({ ...f, lm: f.lm.map((p) => ({ ...p, x: p.x / 0.75 })) }));
    const a = analyzeSwing(synthDtl()), b = analyzeSwing(tall, { aspect: 0.75 });
    if (typeof a === 'string' || typeof b === 'string' || a.view !== 'atras' || b.view !== 'atras') throw new Error('sin resultado');
    expect(b.metrics.spineAddressDeg).toBeCloseTo(a.metrics.spineAddressDeg, 0);
  });
  it('la nota baja con más errores', () => {
    const base = { tempoRatio: 3, backswingSec: 0.9, downswingSec: 0.3, framesUsed: 60, spineAddressDeg: 35, kneeFlexDeg: 20, spineTopChangeDeg: 2, spineImpactChangeDeg: -2, hipAdvancePct: 2, headVerticalPct: 3, headForwardPct: 2 };
    expect(coachDtl(base).score).toBeGreaterThan(coachDtl({ ...base, spineAddressDeg: 10, hipAdvancePct: 20, headVerticalPct: 25 }).score);
  });
});

describe('swing', () => {
  it('mide ángulos', () => {
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(angleAt({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(180);
  });
  it('detecta tempo 3:1 y giro de hombros', () => {
    const r = analyzeSwing(synthSwing());
    if (typeof r === 'string') throw new Error(r);
    if (r.view === 'atras') throw new Error('se esperaba vista de frente');
    expect(r.metrics.tempoRatio).toBeGreaterThan(2.5);
    expect(r.metrics.tempoRatio).toBeLessThan(3.6);
    expect(r.metrics.shoulderTurnDeg).toBeGreaterThan(65); // acos(0.25) ≈ 75°
    expect(r.metrics.hipShiftPct).toBeGreaterThan(8);
    expect(r.score).toBeGreaterThanOrEqual(35);
    expect(r.score).toBeLessThanOrEqual(98);
    expect(r.feedback.find((f) => f.key === 'tempo')?.severity).toBe('good');
  });
  it('marca tempo apresurado', () => {
    const r = analyzeSwing(synthSwing({ back: 0.45, down: 0.3 }));
    if (typeof r === 'string') throw new Error(r);
    expect(r.metrics.tempoRatio).toBeLessThan(2.2);
    expect(r.feedback.find((f) => f.key === 'tempo')?.severity).not.toBe('good');
  });
  it('rechaza clips sin swing', () => {
    const first = synthSwing()[0].lm;
    const still = synthSwing().map((f) => ({ ...f, lm: first }));
    expect(analyzeSwing(still)).toBe('no_swing');
    expect(analyzeSwing(synthSwing().slice(0, 5))).toBe('too_short');
  });
  it('la nota baja con más errores', () => {
    const base = { tempoRatio: 3, backswingSec: 0.9, downswingSec: 0.3, shoulderTurnDeg: 90, hipTurnDeg: 45, xFactorDeg: 45, spineAddressDeg: 5, spineChangeDeg: 2, headSwayPct: 10, hipShiftPct: 15, leadArmDeg: 170, framesUsed: 60 };
    expect(coach(base).score).toBeGreaterThan(coach({ ...base, tempoRatio: 1.5, headSwayPct: 60, spineChangeDeg: 15 }).score);
  });
});

describe('tracking', () => {
  const frame = (w: number, h: number, bx?: number, by?: number) => {
    const d = new Uint8ClampedArray(w * h * 4).fill(40);
    if (bx != null && by != null) {
      for (let y = by - 2; y <= by + 2; y++) for (let x = bx - 2; x <= bx + 2; x++) { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 240; }
    }
    return d;
  };
  it('detecta la bola que aparece', () => {
    const det = detectMovingBright(frame(100, 60, 20, 30), frame(100, 60, 50, 30), 100, 60);
    expect(det).not.toBeNull();
    expect(det!.x).toBeCloseTo(0.5, 1);
    expect(det!.y).toBeCloseTo(0.5, 1);
  });
  it('no detecta nada sin movimiento', () => {
    expect(detectMovingBright(frame(100, 60, 20, 30), frame(100, 60, 20, 30), 100, 60)).toBeNull();
  });
  it('putt recto hacia arriba de la pantalla: 0 grados y en línea', () => {
    const start = { x: 0.5, y: 0.9 }, target = { x: 0.5, y: 0.1 };
    const points = [1, 2, 3, 4, 5].map((k) => ({ x: 0.5, y: 0.9 - k * 0.1, t: k * 100 }));
    const r = analyzeShot({ points, start, target, distanceM: 2, aspect: 1 })!;
    expect(r.directionDeg).toBeCloseTo(0, 5);
    expect(r.onLine).toBe(true);
    expect(r.speedMps).toBeCloseTo(2.5, 1); // 0.1 de 0.8 = 0.25 m cada 0.1 s
  });
  it('desvío a la derecha es positivo', () => {
    const start = { x: 0.5, y: 0.9 }, target = { x: 0.5, y: 0.1 };
    const points = [1, 2, 3, 4].map((k) => ({ x: 0.5 + k * 0.02, y: 0.9 - k * 0.1, t: k * 100 }));
    const r = analyzeShot({ points, start, target, distanceM: 2, aspect: 1 })!;
    expect(r.directionDeg).toBeCloseTo(11.3, 0);
    expect(r.missCm).toBeGreaterThan(30);
    expect(r.onLine).toBe(false);
  });
  it('ignora puntos que retroceden y exige al menos 3', () => {
    const start = { x: 0.5, y: 0.9 }, target = { x: 0.5, y: 0.1 };
    expect(analyzeShot({ points: [{ x: 0.5, y: 0.95, t: 0 }, { x: 0.5, y: 0.8, t: 50 }], start, target, distanceM: 2, aspect: 1 })).toBeNull();
  });
  it('dispersión', () => {
    const s = (lateralM: number, carryM: number): Shot => ({ id: String(Math.random()), source: 'manual', club: 'PW', lateralM, carryM, at: '' });
    const tight = dispersion([s(0.5, 100), s(-0.5, 101), s(0, 99)])!;
    const wide = dispersion([s(15, 80), s(-20, 120), s(5, 100)])!;
    expect(tight.consistency).toBeGreaterThan(wide.consistency);
    expect(dispersion([])).toBeNull();
  });
});

describe('homelab', () => {
  const small: Space = { lengthM: 2.5, widthM: 2, ceilingM: 2.4, floor: 'alfombra', gear: ['putter'] };
  const full: Space = { lengthM: 5, widthM: 4, ceilingM: 3, floor: 'duro', gear: ['putter', 'wedge', 'hierros', 'red', 'matPutt', 'matGolpeo'] };
  it('decide zonas según espacio y equipo', () => {
    expect(zones(small).map((z) => z.ok)).toEqual([true, false, false]);
    expect(zones(full).map((z) => z.ok)).toEqual([true, true, true]);
    expect(zones({ ...full, ceilingM: 2.4 })[2].ok).toBe(false);
    expect(zones({ ...small, floor: 'duro' })[0].ok).toBe(false);
  });
  it('arma un plan corto solo con ejercicios posibles', () => {
    for (const sp of [small, full]) {
      const p = buildPlan(sp, '2026-11-10');
      expect(p.minutes).toBeGreaterThanOrEqual(9);
      expect(p.minutes).toBeLessThanOrEqual(16);
      expect(p.drills[0].kind).toBe('calentamiento');
      expect(p.drills[p.drills.length - 1].kind).toBe('cierre');
      for (const d of p.drills) expect(d.needs.every((g) => sp.gear.includes(g))).toBe(true);
    }
    expect(buildPlan(small, '2026-11-10').drills.every((d) => d.zone === 'libre' || d.zone === 'putt')).toBe(true);
  });
  it('es estable en el día y prioriza lo que pidió el análisis', () => {
    expect(buildPlan(full, '2026-11-10')).toEqual(buildPlan(full, '2026-11-10'));
    expect(buildPlan(full, '2026-11-10', ['tempo']).drills.some((d) => d.id === 'tempo')).toBe(true);
  });
});

describe('medallas', () => {
  const s = (date: string, o: Partial<SessionLite> = {}): SessionLite => ({ type: 'swing', mode: 'casa', date, ...o });
  it('calcula rachas', () => {
    const st = computeStats([s('2026-11-07'), s('2026-11-08'), s('2026-11-09'), s('2026-11-01')], '2026-11-10');
    expect(st.bestStreak).toBe(3);
    expect(st.streak).toBe(3); // terminó ayer: sigue vigente
    expect(computeStats([s('2026-11-07')], '2026-11-10').streak).toBe(0);
  });
  it('otorga cada medalla una sola vez', () => {
    const st = computeStats([s('2026-11-10', { score: 85 })], '2026-11-10');
    const first = newBadges(st, []);
    expect(first).toContain('first_session');
    expect(first).toContain('score_80');
    expect(first).not.toContain('score_90');
    expect(newBadges(st, first)).toEqual([]);
  });
  it('XP no se duplica y define el nivel', () => {
    expect(totalXp(['first_session', 'first_session'])).toBe(50);
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(650).level).toBe(3);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
});

import { AD_RULES, fmtClock, isLocked, remainingSec } from './ads';
import { scanToSpace, type ScanResult } from './scan';

describe('anuncios del tracking', () => {
  it('gratis: 15 minutos y luego bloqueo; premium nunca', () => {
    expect(AD_RULES).toMatchObject({ freeSeconds: 900, adsToUnlock: 2, adSeconds: 30 });
    expect(isLocked(899, false)).toBe(false);
    expect(isLocked(900, false)).toBe(true);
    expect(isLocked(5000, true)).toBe(false);
    expect(remainingSec(840)).toBe(60);
    expect(remainingSec(2000)).toBe(0);
    expect(fmtClock(754)).toBe('12:34');
  });
});

describe('escaneo de HomeLAB', () => {
  const base: ScanResult = { usable: true, summary: 's', lengthM: 4.26, widthM: 3, ceilingM: 2.4, floor: 'alfombra', gear: ['putter'], confidence: 'media', observations: [], safety: [], setup: [] };
  it('convierte el resultado en un espacio', () => {
    expect(scanToSpace(base)).toEqual({ lengthM: 4.3, widthM: 3, ceilingM: 2.4, floor: 'alfombra', gear: ['putter'] });
    expect(scanToSpace(base, ['wedge', 'putter']).gear).toEqual(['putter', 'wedge']);
  });
  it('no confía en valores fuera de rango o inválidos', () => {
    const bad = { ...base, lengthM: 900, widthM: -2, ceilingM: Number.NaN, floor: 'lava', gear: ['putter', 'bazuca'] } as unknown as ScanResult;
    const s = scanToSpace(bad);
    expect(s.lengthM).toBe(30);
    expect(s.widthM).toBe(1);
    expect(s.ceilingM).toBe(2.4);
    expect(s.floor).toBe('duro');
    expect(s.gear).toEqual(['putter']);
  });
});
