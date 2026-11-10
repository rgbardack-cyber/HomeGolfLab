import { describe, expect, it } from 'vitest';
import { analyzeSwing, angleAt, coach, type Frame, type Pt } from './swing';
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

describe('swing', () => {
  it('mide ángulos', () => {
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(angleAt({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(180);
  });
  it('detecta tempo 3:1 y giro de hombros', () => {
    const r = analyzeSwing(synthSwing());
    if (typeof r === 'string') throw new Error(r);
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
