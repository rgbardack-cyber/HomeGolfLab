import { describe, expect, it } from 'vitest';
import { analyzeSwing, angleAt, coach, coachDtl, findEvents, findSwingWindow, framingCheck, hipLine, stableFrames, viewOfFrame, wristAngle, type Frame, type Pt } from './swing';
import { coachInfo, coachPayload } from './coach';
import { bodyMask, findShaft, pointsDown, readClub, targetSide, type Gray, type Shaft } from './club';
import { analyzeShot, detectMovingBright, dispersion, type Shot } from './tracking';
import { buildPlan, zones, type Space } from './homelab';
import { BADGES, computeStats, levelFor, newBadges, totalXp, type SessionLite } from './badges';

const pt = (x: number, y: number): Pt => ({ x, y, z: 0, v: 0.95 });

/** Swing sintético visto de frente: manos suben al tope y bajan al impacto. */
function synthSwing({ back = 0.9, down = 0.3, turn = 0.25, hipShift = 0.03, sway = 0, fps = 30 } = {}): Frame[] {
  const frames: Frame[] = [];
  const total = 0.5 + back + down + 0.5;
  for (let i = 0; i < total * fps; i++) {
    const t = i / fps;
    let wy = 0.6, w = 1, shift = 0;
    // `sway`: las caderas se van hacia el lado trasero (−x) en la subida y vuelven en la bajada.
    if (t >= 0.5 && t < 0.5 + back) { const k = (t - 0.5) / back; wy = 0.6 - 0.42 * k; w = 1 - (1 - turn) * k; shift = -sway * k; }
    else if (t >= 0.5 + back && t < 0.5 + back + down) { const k = (t - 0.5 - back) / down; wy = 0.18 + 0.44 * k; w = turn + (1 - turn) * k; shift = -sway + (sway + hipShift) * k; }
    else if (t >= 0.5 + back + down) { const k = Math.min(1, (t - 0.5 - back - down) / 0.4); wy = 0.62 - 0.4 * k; shift = hipShift; }
    const lm: Pt[] = Array.from({ length: 33 }, () => pt(0.5, 0.5));
    const half = 0.08 * w;
    lm[0] = pt(0.5, 0.2); lm[7] = pt(0.48, 0.2); lm[8] = pt(0.52, 0.2);
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
function synthDtl({ back = 0.9, down = 0.3, rise = 0, hipAdvance = 0, hipTop = 0, fps = 30 } = {}): Frame[] {
  const frames: Frame[] = [];
  const total = 0.5 + back + down + 0.5;
  for (let i = 0; i < total * fps; i++) {
    const t = i / fps;
    let wy = 0.6, k = 0, b = 0; // k: avance de la bajada (0 → 1); b: avance de la subida (0 → 1)
    if (t >= 0.5 && t < 0.5 + back) { b = (t - 0.5) / back; wy = 0.6 - 0.42 * b; }
    else if (t >= 0.5 + back && t < 0.5 + back + down) { b = 1; k = (t - 0.5 - back) / down; wy = 0.18 + 0.44 * k; }
    else if (t >= 0.5 + back + down) { b = 1; k = 1; wy = 0.62 - 0.4 * Math.min(1, (t - 0.5 - back - down) / 0.4); }
    // `hipTop`: cuánto se acercan las caderas a la bola en la subida; `hipAdvance`: cuánto más en la bajada.
    const hipX = 0.45 + hipTop * b + hipAdvance * k;
    const lean = 0.154 - rise * k; // desplazamiento horizontal de los hombros sobre la cadera
    const lm: Pt[] = Array.from({ length: 33 }, () => pt(0.5, 0.5));
    lm[0] = pt(hipX + lean + 0.07, 0.22 - rise * k * 0.3);
    lm[7] = pt(hipX + lean + 0.05, 0.22 - rise * k * 0.3); lm[8] = pt(hipX + lean + 0.05, 0.22 - rise * k * 0.3);
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
    for (const key of ['setup', 'knees', 'spine', 'extension', 'head']) {
      expect(r.feedback.find((f) => f.key === key)?.severity, key).toBe('good');
    }
    expect(r.feedback.find((f) => f.key === 'tempo')).toBeUndefined(); // desde atrás el tempo no se juzga
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
  it('línea de caderas: dice en qué parte del swing se acercan a la bola', () => {
    const dtl = (o: Parameters<typeof synthDtl>[0]) => {
      const r = analyzeSwing(synthDtl(o));
      if (typeof r === 'string' || r.view !== 'atras') throw new Error('se esperaba vista desde atrás');
      return r;
    };
    // Limpio: sobre la línea en el tope y en el impacto.
    const clean = dtl({});
    expect(Math.abs(clean.metrics.hipTopPct!)).toBeLessThanOrEqual(2);
    expect(clean.feedback.find((f) => f.key === 'hipsTop')).toBeUndefined();
    expect(hipLine(clean)!.rows.map((x) => x.tone)).toEqual(['good', 'good']);
    // Solo en la bajada (el torso sintético mide 0,27: 0,05 ≈ 19 %).
    const down = dtl({ hipAdvance: 0.05 });
    expect(Math.abs(down.metrics.hipTopPct!)).toBeLessThanOrEqual(2);
    expect(down.feedback.find((f) => f.key === 'extension')?.detail).toContain('Ocurre en la bajada');
    expect(hipLine(down)!.rows.map((x) => x.tone)).toEqual(['good', 'bad']);
    // Desde la subida y no regresan.
    const up = dtl({ hipTop: 0.05 });
    expect(up.metrics.hipTopPct).toBeGreaterThan(16);
    expect(up.feedback.find((f) => f.key === 'hipsTop')?.severity).toBe('fix');
    expect(up.feedback.find((f) => f.key === 'extension')?.detail).toContain('Viene de la subida');
    // En las dos partes.
    const both = dtl({ hipTop: 0.03, hipAdvance: 0.03 });
    expect(both.feedback.find((f) => f.key === 'hipsTop')?.severity).toBe('improve');
    expect(both.feedback.find((f) => f.key === 'extension')?.detail).toContain('Empieza en la subida y sigue en la bajada');
    expect(both.score).toBeLessThan(down.score);
    // Se acercan en la subida pero vuelven a la línea en el impacto.
    const back = dtl({ hipTop: 0.04, hipAdvance: -0.04 });
    expect(back.feedback.find((f) => f.key === 'hipsTop')).toBeDefined();
    expect(back.feedback.find((f) => f.key === 'extension')?.severity).toBe('good');
    // Con el pecho levantándose, lo nombra como el patrón completo.
    expect(dtl({ rise: 0.1, hipAdvance: 0.05 }).feedback.find((f) => f.key === 'extension')?.detail).toContain('el pecho se levanta');
    expect(down.feedback.find((f) => f.key === 'extension')?.detail).not.toContain('el pecho se levanta');
  });
  it('los resultados guardados sin la medida del tope se siguen leyendo', () => {
    const old = { tempoRatio: 3, backswingSec: 0.9, downswingSec: 0.3, framesUsed: 60, spineAddressDeg: 35, kneeFlexDeg: 20, spineTopChangeDeg: 2, spineImpactChangeDeg: -2, hipAdvancePct: 20, headVerticalPct: 3, headForwardPct: 2 };
    const ext = coachDtl(old).feedback.find((f) => f.key === 'extension')!;
    expect(ext.severity).toBe('fix');
    expect(ext.detail).not.toMatch(/subida|bajada:/);
    expect(hipLine({ view: 'atras', metrics: old, score: 80, feedback: [], summary: '', focus: [], events: { address: 0, top: 1, impact: 2 } })).toBeNull();
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
  it('caderas de frente: distingue girar de desplazarse', () => {
    const front = (o: Parameters<typeof synthSwing>[0]) => {
      const r = analyzeSwing(synthSwing(o));
      if (typeof r === 'string' || r.view === 'atras') throw new Error('se esperaba vista de frente');
      return r;
    };
    // El ancho de hombros sintético es 0,16.
    const clean = front({});
    expect(clean.metrics.hipSwayPct).toBe(0);
    expect(clean.feedback.find((f) => f.key === 'sway')).toBeUndefined();
    expect(hipLine(clean)!.rows.map((x) => x.tone)).toEqual(['good', 'good']);
    // Balanceo: en el tope las caderas quedan del lado trasero.
    const sway = front({ sway: 0.04 }); // 25 %
    expect(sway.metrics.hipSwayPct).toBeGreaterThan(15);
    expect(sway.feedback.find((f) => f.key === 'sway')?.severity).toBe('improve');
    expect(hipLine(sway)!.rows[0].pct).toBeLessThan(0); // se dibuja hacia el lado trasero
    expect(front({ sway: 0.06 }).feedback.find((f) => f.key === 'sway')?.severity).toBe('fix');
    expect(sway.score).toBeLessThan(clean.score);
    // Deslizamiento: demasiado avance hacia el objetivo en el impacto.
    const slide = front({ hipShift: 0.11 }); // ≈ 69 %
    expect(slide.feedback.find((f) => f.key === 'slide')?.title).toBe('Las caderas se deslizan de más');
    expect(hipLine(slide)!.rows[1].tone).toBe('warn');
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
    expect(AD_RULES).toMatchObject({ freeSeconds: 900, adsToUnlock: 1 });
    expect(JSON.stringify(AD_RULES)).not.toMatch(/Seconds.*30|adSeconds/);          // D1: no se promete ninguna duración de anuncio
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

describe('brazos, manos y encuadre', () => {
  it('de frente: mide codos y manos al inicio y en el tope', () => {
    const r = analyzeSwing(synthSwing());
    if (typeof r === 'string' || r.view === 'atras') throw new Error('se esperaba vista de frente');
    expect(r.metrics.handsTopPct).toBeGreaterThan(30);            // manos por encima de los hombros
    expect(Math.abs(r.metrics.handsAddressPct!)).toBeLessThan(12); // manos al centro
    expect(r.metrics.leadArmAddressDeg).toBeGreaterThan(150);
    expect(r.times!.top).toBeGreaterThan(r.times!.address);
    expect(r.times!.impact).toBeGreaterThan(r.times!.top);
  });
  it('desde atrás: avisa si estiras los brazos hacia la bola', () => {
    const ok = analyzeSwing(synthDtl());
    const far = analyzeSwing(synthDtl().map((f) => ({ ...f, lm: f.lm.map((p, i) => (i === 15 || i === 16 ? { ...p, x: p.x + 0.1 } : p)) })));
    if (typeof ok === 'string' || typeof far === 'string' || ok.view !== 'atras' || far.view !== 'atras') throw new Error('sin resultado');
    expect(ok.feedback.find((f) => f.key === 'hands')?.severity).toBe('good');
    expect(far.metrics.handsAddressPct).toBeGreaterThan(30);
    expect(far.feedback.find((f) => f.key === 'hands')?.title).toBe('Estiras los brazos hacia la bola');
  });
  it('las reglas de brazos bajan la nota', () => {
    const base = { tempoRatio: 3, backswingSec: 0.9, downswingSec: 0.3, shoulderTurnDeg: 90, hipTurnDeg: 45, xFactorDeg: 45, spineAddressDeg: 5, spineChangeDeg: 2, headSwayPct: 10, hipShiftPct: 15, leadArmDeg: 170, framesUsed: 60 };
    const worse = coach({ ...base, handsTopPct: -10, handsAddressPct: -30 });
    expect(coach({ ...base, handsTopPct: 30, handsAddressPct: 5 }).score).toBeGreaterThan(worse.score);
    expect(worse.feedback.map((f) => f.key)).toEqual(expect.arrayContaining(['height', 'hands']));
    // El codo trasero no se juzga: el modelo lo estima mal cuando el brazo queda tapado.
    expect(coach({ ...base, trailElbowTopDeg: 150 }).feedback.find((f) => f.key === 'elbow')).toBeUndefined();
    // Los resultados viejos, sin estas medidas, se siguen pudiendo evaluar.
    expect(coach(base).feedback.find((f) => f.key === 'height')).toBeUndefined();
  });
  it('toma como inicio el último cuadro con las manos quietas', () => {
    // Arranque real: las manos van primero hacia atrás casi sin subir. Ese tramo ya es subida.
    const frames = synthSwing().map((f) => {
      const k = Math.min(1, Math.max(0, (f.t - 300) / 200)); // de 0,3 a 0,5 s las manos se desplazan a un lado
      return { ...f, lm: f.lm.map((p, i) => (i === 15 || i === 16 ? { ...p, x: p.x - 0.05 * k } : p)) };
    });
    const r = analyzeSwing(frames);
    if (typeof r === 'string') throw new Error(r);
    expect(r.times!.address).toBeLessThanOrEqual(334);
    if (r.view === 'atras') throw new Error('se esperaba vista de frente');
    expect(Math.abs(r.metrics.handsAddressPct!)).toBeLessThan(12); // manos todavía al centro
  });
  it('saca la mano dominante del propio swing', () => {
    // Subida hacia la izquierda de la imagen = diestro; hacia la derecha = zurdo. El perfil no manda.
    const shift = (dir: number) => synthSwing().map((f) => {
      const up = Math.max(0, 0.6 - (f.lm[15].y + f.lm[16].y) / 2) / 0.42; // 0 abajo, 1 en el tope
      return { ...f, lm: f.lm.map((p, i) => (i === 15 || i === 16 ? { ...p, x: p.x + dir * 0.12 * up } : p)) };
    });
    const righty = analyzeSwing(shift(-1), { lefty: true }), lefty = analyzeSwing(shift(1), { lefty: false });
    if (typeof righty === 'string' || typeof lefty === 'string') throw new Error('sin resultado');
    expect(righty.lefty).toBe(false);
    expect(lefty.lefty).toBe(true);
    // Sin movimiento lateral claro, vale lo que diga el perfil.
    const flat = analyzeSwing(synthSwing(), { lefty: true });
    if (typeof flat === 'string') throw new Error(flat);
    expect(flat.lefty).toBe(true);
  });
  it('revisa el encuadre', () => {
    const lm: Pt[] = Array.from({ length: 33 }, () => pt(0.5, 0.5));
    lm[0] = pt(0.5, 0.25); lm[27] = pt(0.45, 0.9); lm[28] = pt(0.55, 0.9); lm[23] = pt(0.47, 0.55); lm[24] = pt(0.53, 0.55);
    expect(framingCheck(lm).ok).toBe(true);
    const with_ = (i: number, p: Pt) => lm.map((q, k) => (k === i ? p : q));
    expect(framingCheck(with_(27, pt(0.45, 0.99))).hint).toMatch(/pies/);
    expect(framingCheck(with_(0, pt(0.5, 0.08))).hint).toMatch(/cabeza/);
    expect(framingCheck(with_(0, pt(0.5, 0.6))).hint).toMatch(/Acércate/);
    expect(framingCheck(lm.map((q) => ({ ...q, x: q.x + 0.3 }))).hint).toMatch(/centro/);
  });
  it('de perfil no avisa de los pies si se ve un tobillo (el lejano queda tapado)', () => {
    const lm: Pt[] = Array.from({ length: 33 }, () => pt(0.5, 0.5));
    lm[0] = pt(0.5, 0.25); lm[27] = pt(0.45, 0.9); lm[28] = pt(0.55, 0.9); lm[23] = pt(0.47, 0.55); lm[24] = pt(0.53, 0.55);
    const vis = (l: number, r: number) => lm.map((q, k) => (k === 27 ? { ...q, v: l } : k === 28 ? { ...q, v: r } : q));
    expect(framingCheck(vis(0.2, 0.95)).ok).toBe(true);
    expect(framingCheck(vis(0.95, 0.1)).ok).toBe(true);
    expect(framingCheck(vis(0.2, 0.3)).hint).toMatch(/pies/); // ninguno se ve: sí avisa
  });
});

describe('palo (experimental)', () => {
  /** Imagen gris con algo de textura determinista. */
  const canvas = (w = 480, h = 480): Gray => {
    const data = new Uint8Array(w * h);
    for (let i = 0; i < data.length; i++) data[i] = 118 + ((i * 2654435761) >>> 29);
    return { data, width: w, height: h };
  };
  const line = (g: Gray, x0: number, y0: number, deg: number, from: number, to: number, value: number, thick = 2) => {
    const th = (deg * Math.PI) / 180;
    for (let r = from; r <= to; r += 0.5) for (let k = -thick / 2; k <= thick / 2; k += 0.5) {
      const x = Math.round(x0 + Math.cos(th) * r - Math.sin(th) * k), y = Math.round(y0 + Math.sin(th) * r + Math.cos(th) * k);
      if (x >= 0 && y >= 0 && x < g.width && y < g.height) g.data[y * g.width + x] = value;
    }
  };
  const hands = { x: 200, y: 150 }, unit = 120;
  it('encuentra una varilla fina que sale de las manos', () => {
    for (const [deg, value] of [[70, 235], [110, 20], [350, 235]] as const) {
      const g = canvas();
      line(g, hands.x, hands.y, deg, 10, 230, value);
      const s = findShaft(g, hands, unit)!;
      expect(s, 'ángulo ' + deg).not.toBeNull();
      expect(Math.min(Math.abs(s.angleDeg - deg), 360 - Math.abs(s.angleDeg - deg))).toBeLessThan(2.5);
      expect(s.confidence).toBeGreaterThan(0.5);
      expect(s.lengthPx).toBeGreaterThan(200);
    }
  });
  it('la encuentra aunque no pase justo por las muñecas', () => {
    const g = canvas();
    line(g, hands.x + 18, hands.y - 6, 75, 30, 240, 20, 3); // el grip queda a un lado del punto de las muñecas
    const s = findShaft(g, hands, unit)!;
    expect(s).not.toBeNull();
    expect(Math.abs(s.angleDeg - 75)).toBeLessThan(2.5);
    expect(s.tip.y).toBeGreaterThan(hands.y + 180);
  });
  it('ignora las líneas que están sobre el cuerpo', () => {
    // Una "raya del pantalón" vertical bajo las manos, y la varilla de verdad saliendo hacia un lado.
    const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0 }));
    lm[23] = { x: 190, y: 160 }; lm[25] = { x: 192, y: 290 }; lm[27] = { x: 194, y: 410 }; // una pierna bajo las manos
    lm[24] = { x: 240, y: 160 }; lm[26] = { x: 242, y: 290 }; lm[28] = { x: 244, y: 410 };
    lm[31] = lm[27]; lm[32] = lm[28]; lm[0] = { x: 215, y: -80 };
    for (const i of [11, 12, 13, 14, 15, 16]) lm[i] = { x: 215, y: 130 };
    const crease = canvas(); line(crease, 192, 160, 90, 0, 250, 20, 2);
    const mask = bodyMask(crease.width, crease.height, lm, unit);
    expect(findShaft(crease, hands, unit)).not.toBeNull();          // sin máscara, la raya engaña
    expect(findShaft(crease, hands, unit, { mask })).toBeNull();    // con máscara, no
    const both = canvas(); line(both, 192, 160, 90, 0, 250, 20, 2); line(both, hands.x, hands.y, 130, 10, 240, 20, 3);
    const s = findShaft(both, hands, unit, { mask: bodyMask(both.width, both.height, lm, unit) })!;
    expect(s).not.toBeNull();
    expect(Math.abs(s.angleDeg - 130)).toBeLessThan(2.5);           // gana la varilla, aunque cruce por delante de la pierna
  });
  it('no toma la textura del pasto por un palo', () => {
    // Fondo con mucho grano (pasto, grava): hay contraste por todas partes, pero ninguna línea.
    const rough = (): Gray => {
      const g = canvas(); let a = 7;
      const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      for (let i = 0; i < g.data.length; i++) g.data[i] = 85 + Math.floor(rnd() * 70);
      return g;
    };
    expect(findShaft(rough(), hands, unit)).toBeNull();
    const withShaft = rough(); line(withShaft, hands.x, hands.y, 110, 10, 235, 250, 3);
    const s = findShaft(withShaft, hands, unit)!;
    expect(s).not.toBeNull();
    expect(Math.abs(s.angleDeg - 110)).toBeLessThan(2.5);
    expect(s.confidence).toBeGreaterThan(0.5);
  });
  it('al inicio descarta lo que no apunta hacia abajo', () => {
    // Una línea larga hacia arriba (un poste, una costura) y la varilla, más corta, hacia el suelo.
    const g = canvas(); line(g, hands.x, hands.y, 270, 10, 140, 235); line(g, hands.x, hands.y, 105, 10, 120, 235);
    expect(Math.abs(findShaft(g, hands, unit)!.angleDeg - 270)).toBeLessThan(2.5);
    const s = findShaft(g, hands, unit, { allow: pointsDown })!;
    expect(Math.abs(s.angleDeg - 105)).toBeLessThan(4); // en tramos cortos el ángulo baila unos 3°
    expect(s.confidence).toBeGreaterThan(0.5);
  });
  it('no inventa un palo', () => {
    expect(findShaft(canvas(), hands, unit)).toBeNull();                 // fondo sin líneas
    const arm = canvas(); line(arm, hands.x, hands.y, 60, 10, 230, 230, 22);
    expect(findShaft(arm, hands, unit)).toBeNull();                      // algo grueso: un brazo o una pierna
    const horizon = canvas(); line(horizon, hands.x, hands.y, 0, -190, 230, 235);
    expect(findShaft(horizon, hands, unit)).toBeNull();                  // línea del fondo que cruza por las manos
    const far = canvas(); line(far, hands.x, hands.y, 70, 130, 260, 235);
    expect(findShaft(far, hands, unit)).toBeNull();                      // línea que no nace en las manos
  });
  it('no confunde el antebrazo con el palo', () => {
    const g = canvas(); line(g, hands.x, hands.y, 250, 10, 230, 235);
    const elbow = { x: hands.x + Math.cos((250 * Math.PI) / 180) * 80, y: hands.y + Math.sin((250 * Math.PI) / 180) * 80 };
    expect(findShaft(g, hands, unit)).not.toBeNull();
    expect(findShaft(g, hands, unit, { avoid: [elbow] })).toBeNull();
  });
  it('traduce la varilla a medidas', () => {
    const shaft = (angleDeg: number, confidence = 0.8): Shaft => ({ angleDeg, lengthPx: 200, tip: { x: 0, y: 0 }, confidence });
    const front = readClub('frente', shaft(100), shaft(0), 1)!;
    expect(front.addressLeanDeg).toBe(10);            // cabeza del palo a la izquierda, objetivo a la derecha: manos por delante
    expect(front.topDeg).toBe(0);
    expect(front.feedback.find((f) => f.key === 'club-top')?.severity).toBe('good');
    expect(readClub('frente', shaft(100), shaft(0), -1)!.addressLeanDeg).toBe(-10);
    expect(readClub('frente', null, shaft(25), 1)!.feedback[0].title).toMatch(/pasa de la paralela/);
    expect(readClub('frente', null, shaft(270), 1)!.topDeg).toBe(90); // varilla vertical: subida a medias, sin juicio
    expect(readClub('atras', shaft(60), null, 1)!.addressPlaneDeg).toBe(60);
    expect(readClub('frente', shaft(100, 0.1), shaft(0, 0.1), 1)).toBeNull(); // lecturas dudosas no se muestran
    expect(readClub('frente', shaft(280), null, 1)).toBeNull();               // "palo" hacia arriba al inicio: lectura falsa
  });
  it('sabe de qué lado está el objetivo', () => {
    const lm: Pt[] = Array.from({ length: 33 }, () => pt(0.5, 0.5));
    lm[11] = pt(0.6, 0.3); lm[12] = pt(0.4, 0.3);
    expect(targetSide(lm, false)).toBe(1);
    expect(targetSide(lm, true)).toBe(-1);
  });
});

describe('coach con IA', () => {
  const img = { position: 'tope' as const, media_type: 'image/jpeg' as const, data: 'x'.repeat(200) };
  it('arma el resumen de medidas de frente y desde atrás, con nombres legibles', () => {
    const f = analyzeSwing(synthSwing());
    const b = analyzeSwing(synthDtl());
    if (typeof f === 'string' || typeof b === 'string') throw new Error('sin resultado');
    const pf = coachPayload(f, [img]);
    expect(pf.view).toBe('frente');
    expect(pf.metrics['Giro de hombros en el tope']).toMatch(/°$/);
    expect(pf.metrics['Tempo (subida:bajada)']).toMatch(/:1$/);
    expect(pf.findings.length).toBeGreaterThan(0);
    const pb = coachPayload(b, [img], '  hoy con driver  ');
    expect(pb.view).toBe('atras');
    expect(pb.metrics['Flexión de rodillas al inicio']).toBeDefined();
    expect(pb.metrics['Tempo (aproximado desde atrás)']).toBeDefined();
    expect(pb.notes).toBe('hoy con driver');
    // nada de valores no numéricos ni vacíos: todo lo que sale son textos cortos
    for (const v of Object.values(pb.metrics)) expect(v).not.toMatch(/NaN|undefined|null/);
    expect(JSON.stringify(pb).length).toBeLessThan(2500 + 200);
  });
  it('le pasa al coach la lectura experimental del palo, marcada como tal', () => {
    const r = analyzeSwing(synthSwing());
    if (typeof r === 'string') throw new Error('sin resultado');
    r.club = { addressLeanDeg: 12, topDeg: 5, feedback: [] };
    const m = coachPayload(r, [img]).metrics;
    expect(Object.keys(m).filter((k) => /lectura experimental/.test(k)).length).toBe(2);
  });
  it('no confía en lo que devuelve el servidor', () => {
    expect(coachInfo(null).usable).toBe(false);
    expect(coachInfo('basura').priorities).toEqual([]);
    const c = coachInfo({
      usable: true, summary: ' Se ve bien ', strengths: ['a', 7, '', 'b', 'c', 'd'], confidence: 'altísima',
      priorities: [{ title: 'Grip', why: 'w', drill: 'd' }, { title: '' }, null, 5, { title: 'T2' }, { title: 'T3' }, { title: 'T4' }],
      observations: [{ position: 'tope', note: 'n' }, { position: 'cielo', note: 'x' }, { position: 'inicio', note: '' }],
      disagreements: 'no es lista', limits: 42,
    });
    expect(c.summary).toBe('Se ve bien');
    expect(c.strengths).toEqual(['a', 'b', 'c']);                // solo textos, máximo 3
    expect(c.priorities.map((x) => x.title)).toEqual(['Grip', 'T2', 'T3']);
    expect(c.priorities[1]).toEqual({ title: 'T2', why: '', drill: '' });
    expect(c.observations).toEqual([{ position: 'tope', note: 'n' }]);
    expect(c.disagreements).toEqual([]);
    expect(c.limits).toBe('');
    expect(c.confidence).toBe('baja');                           // valor desconocido: la opción prudente
  });
});

/** Frames de frente cuya altura de manos sigue una lista de [segundo, y]; el cuerpo queda quieto. */
function synthWrist(keys: [number, number][], fps = 30): Frame[] {
  const end = keys[keys.length - 1][0];
  const at = (t: number) => {
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) { const [t0, y0] = keys[i - 1], [t1, y1] = keys[i]; return y0 + ((y1 - y0) * (t - t0)) / (t1 - t0 || 1); }
    }
    return keys[keys.length - 1][1];
  };
  const frames: Frame[] = [];
  for (let i = 0; i <= end * fps; i++) {
    const t = i / fps, wy = at(t);
    const lm: Pt[] = Array.from({ length: 33 }, () => pt(0.5, 0.5));
    lm[0] = pt(0.5, 0.2); lm[7] = pt(0.48, 0.2); lm[8] = pt(0.52, 0.2);
    lm[11] = pt(0.58, 0.3); lm[12] = pt(0.42, 0.3);
    lm[13] = pt(0.58, (0.3 + wy) / 2); lm[14] = pt(0.42, (0.3 + wy) / 2);
    lm[15] = pt(0.51, wy); lm[16] = pt(0.49, wy);
    lm[23] = pt(0.56, 0.55); lm[24] = pt(0.44, 0.55);
    lm[25] = pt(0.56, 0.75); lm[26] = pt(0.44, 0.75);
    lm[27] = pt(0.55, 0.95); lm[28] = pt(0.45, 0.95);
    frames.push({ t: t * 1000, lm });
  }
  return frames;
}

describe('eventos con varios swings y final alto', () => {
  // Práctica (tope en 1,2 s), pausa, swing real (tope en 3,9 s, golpe en 4,2 s) y un final MÁS ALTO que el tope.
  const real: [number, number][] = [
    [0, 0.6], [0.3, 0.6], [1.2, 0.18], [1.5, 0.62], [2.9, 0.6],
    [3.0, 0.6], [3.9, 0.18], [4.2, 0.62], [4.6, 0.12], [6.5, 0.12], [7.5, 0.6],
  ];
  it('toma como tope el del swing real, no el final alto ni la práctica', () => {
    const f = synthWrist(real);
    const ev = findEvents(f);
    expect(f[ev.top].t).toBeGreaterThan(3600);
    expect(f[ev.top].t).toBeLessThan(4200);
    expect(f[ev.impact].t).toBeGreaterThan(4000);
    expect(f[ev.impact].t).toBeLessThan(4500);
    expect(f[ev.address].t).toBeGreaterThan(2800);
    expect(f[ev.address].t).toBeLessThan(3500);
    const r = analyzeSwing(f);
    if (typeof r === 'string') throw new Error(r);
    expect(r.metrics.tempoRatio).toBeGreaterThan(2.4);
    expect(r.metrics.tempoRatio).toBeLessThan(3.8);
  });
  it('un solo swing con final alto también se lee bien', () => {
    const f = synthWrist([[0, 0.6], [0.6, 0.6], [1.5, 0.18], [1.8, 0.62], [2.2, 0.12], [3.5, 0.12], [4.5, 0.6]]);
    const ev = findEvents(f);
    expect(f[ev.top].t).toBeGreaterThan(1300);
    expect(f[ev.top].t).toBeLessThan(1700);
  });
  // Caso real visto desde atrás a 10 cuadros por segundo (clips de driving range, nov 2026): la subida llega al tope en
  // ~0,3 s, el cuadro del impacto sale borroso (las manos solo recuperan ~55 %) y la finalización queda MÁS ALTA que el
  // tope y se sostiene varios segundos. Antes se descartaba el tope real y salía la finalización como "tope".
  const rapido: [number, number][] = [
    [0, 0.6], [6.3, 0.6], [6.6, 0.18], [6.9, 0.2], [7.0, 0.42], [7.1, 0.6], [7.5, 0.2], [7.8, 0.12], [13, 0.12], [14, 0.5],
  ];
  it('con subida rápida, impacto borroso y final alto sostenido, el tope es el de la subida', () => {
    const f = synthWrist(rapido, 10);
    const ev = findEvents(f);
    expect(f[ev.top].t).toBeGreaterThan(6400);
    expect(f[ev.top].t).toBeLessThan(7000);
    expect(f[ev.impact].t).toBeGreaterThan(6900);
    expect(f[ev.impact].t).toBeLessThan(7400);
    expect(findSwingWindow(f)!.to).toBeLessThan(9000); // la ventana no se va a la finalización ni al final del clip
  });
  // Un salto del seguimiento tras el swing (el jugador se mueve o sale y las manos pasan de 0,10 a 0,50 en 0,3 s) parece
  // la bajada más rápida de todas: no debe ganarle al swing real. Caso real: pw_sr_f01.
  it('no toma un salto del seguimiento por la bajada del swing', () => {
    const f = synthWrist([
      [0, 0.6], [6.3, 0.6], [6.6, 0.18], [6.9, 0.2], [7.2, 0.45], [7.3, 0.6], [7.5, 0.2], [7.8, 0.12], // swing real: bajada de ~0,8/s
      [9, 0.12], [11, 0.25], [12.2, 0.25], [12.6, 0.1], [12.7, 0.5], [16, 0.5], // la finalización baja despacio y luego el seguimiento salta (un solo cuadro, >1,3/s)
    ], 10);
    const ev = findEvents(f);
    expect(f[ev.top].t).toBeGreaterThan(6400);
    expect(f[ev.top].t).toBeLessThan(7000);
  });
  // Un gesto posterior más chico (el jugador levanta un poco el palo y lo baja rápido) no debe ganarle al swing real.
  it('un gesto posterior más chico no le gana al swing real', () => {
    const f = synthWrist([
      [0, 0.6], [3, 0.6], [3.6, 0.15], [4.0, 0.15], [4.3, 0.6], [4.6, 0.12], [8, 0.12], [9.5, 0.55], // swing real: sube 0,45
      [11, 0.55], [11.6, 0.38], [11.9, 0.55], [14, 0.55], // gesto: sube 0,17 y baja rápido
    ], 10);
    const ev = findEvents(f);
    expect(f[ev.top].t).toBeGreaterThan(3400);
    expect(f[ev.top].t).toBeLessThan(4200);
  });
  // Cuando el modelo pierde las manos en el impacto, éste cae en el primer cuadro de recuperación y la bajada sale de ~0,05 s
  // (tempos de 4 a 79:1 en 10 clips reales, nov 2026). Una bajada < 0,15 s no existe a velocidad normal: no se acepta.
  it('rechaza una bajada imposible (< 0,15 s o > 0,6 s) y acepta una normal', () => {
    const swing = (down: number) => synthWrist([[0, 0.6], [1.0, 0.6], [1.7, 0.18], [1.7 + down, 0.62], [2.3, 0.12], [3.5, 0.12], [4.5, 0.6]], 30);
    expect(analyzeSwing(swing(0.07))).toBe('no_swing');
    expect(analyzeSwing(swing(0.8))).toBe('no_swing'); // una cámara lenta 4× midió 0,8 s de bajada
    const ok = analyzeSwing(swing(0.3));
    if (typeof ok === 'string') throw new Error(ok);
    expect(ok.metrics.downswingSec).toBeGreaterThan(0.2);
  });
  // Con varios swings se analiza el último; findSwingWindow cuenta cuántos hay para que la pantalla lo avise (casos reales: i9_sr_t04, i6_ps_t01).
  it('cuenta los swings del video', () => {
    expect(findSwingWindow(synthWrist(real, 10))!.swings).toBe(2);
    expect(findSwingWindow(synthWrist([[0, 0.6], [0.6, 0.6], [1.5, 0.18], [1.8, 0.62], [2.2, 0.12], [3.5, 0.12], [4.5, 0.6]], 10))!.swings).toBe(1);
  });
  it('ubica la ventana del swing en un muestreo grueso y rechaza un video quieto', () => {
    const coarse = synthWrist(real, 10);
    const w = findSwingWindow(coarse)!;
    expect(w).not.toBeNull();
    expect(w.from).toBeGreaterThan(1900);   // arranque ≈ 3,0 s menos 0,9 s
    expect(w.from).toBeLessThan(2400);
    expect(w.to).toBeGreaterThan(4700);     // golpe ≈ 4,2 s más 0,7 s
    expect(w.to).toBeLessThan(5300);
    expect(findSwingWindow(synthWrist([[0, 0.6], [4, 0.6]], 10))).toBeNull();
  });
});

describe('otra persona en el cuadro', () => {
  it('descarta los cuadros donde el seguimiento salta a otra persona', () => {
    const f = synthSwing();
    const shifted = f.map((fr, i) => (i >= 20 && i < 24 ? { ...fr, lm: fr.lm.map((p) => ({ ...p, x: p.x + 0.3 })) } : fr));
    const kept = stableFrames(shifted);
    expect(kept.length).toBe(f.length - 4);
    expect(kept.some((fr) => fr.t === f[21].t)).toBe(false);
    // Si el cambio dura, se acepta (la persona nueva es la que hay que seguir).
    const long = f.map((fr, i) => (i >= 20 ? { ...fr, lm: fr.lm.map((p) => ({ ...p, x: p.x + 0.3 })) } : fr));
    expect(stableFrames(long).length).toBeGreaterThan(f.length - 8);
    // Un swing normal no pierde ningún cuadro.
    expect(stableFrames(f).length).toBe(f.length);
  });
  it('un swing con un intruso de por medio da el mismo resultado', () => {
    const f = synthSwing();
    const base = analyzeSwing(f);
    const dirty = analyzeSwing(f.map((fr, i) => (i === 15 || i === 16 ? { ...fr, lm: fr.lm.map((p) => ({ ...p, x: p.x + 0.35 })) } : fr)));
    if (typeof base === 'string' || typeof dirty === 'string') throw new Error('sin resultado');
    expect(Math.abs(dirty.metrics.tempoRatio - base.metrics.tempoRatio)).toBeLessThan(0.25); // quitar 2 cuadros mueve el evento un cuadro de 33 ms
  });
  // Caso real pw_ps_t01 (el palo tapa la lente): el seguimiento salta de sitio en cuadros alternos y los que quedan parecen
  // un swing. Si saltó en más de 30 % de los cuadros alrededor del swing, no se mide al jugador: no se acepta.
  it('rechaza un video donde el seguimiento salta en muchos cuadros alrededor del swing', () => {
    const f = synthSwing();
    const jumpy = f.map((fr, i) => (i % 2 === 1 && fr.t >= 500 && fr.t <= 2500 ? { ...fr, lm: fr.lm.map((p) => ({ ...p, y: p.y + 0.4 })) } : fr));
    expect(analyzeSwing(jumpy)).toBe('no_swing');
    expect(typeof analyzeSwing(f)).not.toBe('string');
  });
  it('avisa de que se perdió al jugador si el modelo no lo detectó en la mayoría de los cuadros', () => {
    expect(analyzeSwing(synthSwing().slice(0, 40), { sampled: 200 })).toBe('low_visibility');
    expect(analyzeSwing(synthSwing())).not.toBe('low_visibility');
  });
});

describe('cabeza y caderas', () => {
  const nodHead = (f: Frame[], dx: number) => f.map((fr, i) => {
    const k = Math.min(1, i / (f.length * 0.5));
    return { ...fr, lm: fr.lm.map((p, j) => (j === 0 ? { ...p, x: p.x + dx * k } : p)) };
  });
  it('mide la cabeza con las orejas: la nariz que gira no cuenta', () => {
    const r = analyzeSwing(nodHead(synthSwing(), 0.1)); // la nariz se va 0,1 pero las orejas no se mueven
    if (typeof r === 'string' || r.view === 'atras') throw new Error('se esperaba vista de frente');
    expect(r.metrics.headSwayPct).toBeLessThan(5);
  });
  it('sin orejas visibles usa la nariz', () => {
    const f = nodHead(synthSwing(), 0.1).map((fr) => ({ ...fr, lm: fr.lm.map((p, j) => (j === 7 || j === 8 ? { ...p, v: 0.1 } : p)) }));
    const r = analyzeSwing(f);
    if (typeof r === 'string' || r.view === 'atras') throw new Error('se esperaba vista de frente');
    expect(r.metrics.headSwayPct).toBeGreaterThan(30);
  });
  it('quita el desplazamiento rígido del cuerpo (teléfono que se mueve) pero no el de un solo pie', () => {
    const base = synthSwing().map((fr) => ({ ...fr, lm: fr.lm.map((p, j) => (j === 27 ? pt(0.45, 0.95) : j === 28 ? pt(0.55, 0.95) : p)) }));
    const slide = (frames: Frame[], only?: number[]) => frames.map((fr, i) => {
      const dx = 0.08 * Math.min(1, i / (frames.length * 0.6));
      return { ...fr, lm: fr.lm.map((p, j) => (!only || only.includes(j) ? { ...p, x: p.x + dx } : p)) };
    });
    const a = analyzeSwing(base), b = analyzeSwing(slide(base));
    if (typeof a === 'string' || typeof b === 'string' || a.view === 'atras' || b.view === 'atras') throw new Error('sin resultado');
    expect(b.metrics.hipShiftPct).toBeCloseTo(a.metrics.hipShiftPct, -1);   // casi igual aunque todo se corrió 8 %
    expect(b.metrics.headSwayPct).toBeLessThan(a.metrics.headSwayPct + 12); // queda, como mucho, la zona muerta de 1,5 % del cuadro
    // Si solo se mueve el cuerpo y un tobillo se queda, no es un desplazamiento rígido: no se corrige.
    const c = analyzeSwing(slide(base, [0, 7, 8, 23, 24, 11, 12, 13, 14, 15, 16, 27]));
    if (typeof c === 'string' || c.view === 'atras') throw new Error('sin resultado');
    expect(c.metrics.headSwayPct).toBeGreaterThan(a.metrics.headSwayPct + 10);
  });
});

describe('muñecas (experimental)', () => {
  const hand = (idx: number, ix: [number, number], pk: [number, number], v = 0.95): Frame => {
    const lm: Pt[] = Array.from({ length: 33 }, () => pt(0.5, 0.5));
    lm[13] = pt(0.5, 0.4); lm[15] = pt(0.5, 0.5); lm[19] = { x: ix[0], y: ix[1], z: 0, v }; lm[17] = { x: pk[0], y: pk[1], z: 0, v };
    void idx;
    return { t: 0, lm };
  };
  it('mano alineada con el antebrazo = 180°, doblada a un lado = 90°', () => {
    expect(wristAngle(hand(0, [0.5, 0.6], [0.5, 0.6]), 'L')).toBeCloseTo(180, 3);
    expect(wristAngle(hand(0, [0.6, 0.5], [0.6, 0.5]), 'L')).toBeCloseTo(90, 3);
    expect(wristAngle(hand(0, [0.58, 0.58], [0.58, 0.58]), 'L')!).toBeGreaterThan(120);
  });
  it('null si no se ven los puntos de la mano o no hay segmento', () => {
    expect(wristAngle(hand(0, [0.5, 0.6], [0.5, 0.6], 0.1), 'L')).toBeNull();
    expect(wristAngle(hand(0, [0.5, 0.5], [0.5, 0.5]), 'L')).toBeNull(); // la mano mide cero
  });
  it('con puntos 3D no la deforma la perspectiva', () => {
    const f = hand(0, [0.5, 0.6], [0.5, 0.6]);
    const world = f.lm.map((p) => ({ ...p, z: 0 }));
    world[13] = { ...world[13], x: 0, y: -0.2, z: 0 }; world[15] = { ...world[15], x: 0, y: 0, z: 0 };
    world[19] = { ...world[19], x: 0.2, y: 0, z: 0 }; world[17] = { ...world[17], x: 0.2, y: 0, z: 0 };
    expect(wristAngle({ ...f, world }, 'L')).toBeCloseTo(90, 3);
  });
  it('el análisis las guarda al inicio y en el tope sin tocar la nota', () => {
    const f = analyzeSwing(synthSwing());
    if (typeof f === 'string' || f.view === 'atras') throw new Error('se esperaba vista de frente');
    for (const k of ['leadWristAddressDeg', 'leadWristTopDeg', 'trailWristTopDeg', 'wristChangeDeg'] as const) expect(k in f.metrics, k).toBe(true);
    const hidden = analyzeSwing(synthSwing().map((fr) => ({ ...fr, lm: fr.lm.map((p, j) => (j >= 17 && j <= 20 ? { ...p, v: 0.1 } : p)) })));
    if (typeof hidden === 'string' || hidden.view === 'atras') throw new Error('se esperaba vista de frente');
    expect(hidden.metrics.leadWristTopDeg).toBeNull();
    expect(hidden.metrics.wristChangeDeg).toBeNull();
    expect(hidden.score).toBe(f.score);                      // no entran en la nota
    expect(hidden.feedback.map((x) => x.key)).toEqual(f.feedback.map((x) => x.key));
  });
});

describe('vista elegida a mano y bandas de coaching', () => {
  it('avisa si la vista elegida no es la del video', () => {
    const wrong = analyzeSwing(synthSwing(), { view: 'atras' });
    if (typeof wrong === 'string') throw new Error(wrong);
    expect(wrong.view).toBe('atras');
    expect(wrong.viewMismatch).toBe('frente');
    const ok = analyzeSwing(synthSwing(), { view: 'frente' });
    const auto = analyzeSwing(synthSwing(), { view: 'auto' });
    if (typeof ok === 'string' || typeof auto === 'string') throw new Error('sin resultado');
    expect(ok.viewMismatch).toBeUndefined();
    expect(auto.viewMismatch).toBeUndefined();
  });
  it('el tempo tiene una banda buena ancha y la inclinación lateral no castiga lo normal', () => {
    const base = { tempoRatio: 3, backswingSec: 0.9, downswingSec: 0.3, shoulderTurnDeg: 90, hipTurnDeg: 45, xFactorDeg: 45, spineAddressDeg: 5, spineChangeDeg: 2, headSwayPct: 10, hipShiftPct: 15, leadArmDeg: 170, framesUsed: 60 };
    const sev = (m: Partial<typeof base>, key: string) => coach({ ...base, ...m }).feedback.find((x) => x.key === key)?.severity;
    expect(sev({ tempoRatio: 2.4 }, 'tempo')).toBe('good');
    expect(sev({ tempoRatio: 3.6 }, 'tempo')).toBe('good');
    expect(sev({ tempoRatio: 2.1 }, 'tempo')).toBe('improve');
    expect(sev({ tempoRatio: 1.7 }, 'tempo')).toBe('improve');   // dudoso: no se castiga como error
    expect(sev({ tempoRatio: 1.2 }, 'tempo')).toBe('fix');
    expect(sev({ tempoRatio: 3.9 }, 'tempo')).toBe('improve');
    expect(sev({ tempoRatio: 4.8 }, 'tempo')).toBe('improve');
    expect(sev({ tempoRatio: 5.4 }, 'tempo')).toBe('fix');
    expect(sev({ spineChangeDeg: 14 }, 'spine')).toBe('good');
    expect(sev({ spineChangeDeg: -14.7 }, 'spine')).toBe('good');
    expect(sev({ spineChangeDeg: 18 }, 'spine')).toBe('improve');
    expect(sev({ spineChangeDeg: 25 }, 'spine')).toBe('fix');
  });
});
