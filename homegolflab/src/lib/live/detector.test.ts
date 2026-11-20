import { describe, expect, it } from 'vitest';
import { framingCheck, LM, type Frame } from '../swing';
import { LIVE, LiveSwingDetector, type LiveStep } from './detector';

/** Persona de pie de cuerpo entero; `hands` = altura (y) de las muñecas; `cx` y `s` desplazan y escalan (otra persona). */
function person(t: number, hands: number, cx = 0.5, s = 1): Frame {
  const v = 0.95;
  const lm = Array.from({ length: 33 }, () => ({ x: cx, y: 0.5, z: 0, v }));
  const P = (i: number, x: number, y: number) => { lm[i] = { x: cx + x * s, y: 0.1 + (y - 0.1) * s, z: 0, v }; };
  P(LM.NOSE, 0, 0.21); P(LM.L_EAR, -0.02, 0.2); P(LM.R_EAR, 0.02, 0.2);
  P(LM.L_SHOULDER, -0.07, 0.34); P(LM.R_SHOULDER, 0.07, 0.34);
  P(LM.L_HIP, -0.05, 0.58); P(LM.R_HIP, 0.05, 0.58);
  P(LM.L_KNEE, -0.05, 0.76); P(LM.R_KNEE, 0.05, 0.76);
  P(LM.L_ANKLE, -0.06, 0.93); P(LM.R_ANKLE, 0.06, 0.93);
  lm[LM.L_WRIST] = { x: cx - 0.03 * s, y: 0.1 + (hands - 0.1) * s, z: 0, v };
  lm[LM.R_WRIST] = { x: cx + 0.03 * s, y: 0.1 + (hands - 0.1) * s, z: 0, v };
  return { t, lm };
}
const LOW = 0.62, HIGH = 0.2;                        // hombros en 0,34 y caderas en 0,58

const DT = 33;
class Run {
  det = new LiveSwingDetector({ lefty: false, view: () => 'frente', aspect: () => 9 / 16 });
  t = 0;
  swings: Frame[][] = [];
  steps: LiveStep[] = [];
  /** Envía cuadros durante `ms` con las manos a `hands(t0)` (función del tiempo relativo). */
  feed(ms: number, hands: number | ((rel: number) => number), cx = 0.5, s = 1) {
    const t0 = this.t;
    for (; this.t < t0 + ms; this.t += DT) {
      const h = typeof hands === 'number' ? hands : hands(this.t - t0);
      const r = this.det.step(person(this.t, h, cx, s), this.t);
      this.steps.push(r);
      if (r.swing) this.swings.push(r.swing);
    }
  }
  /** Un swing: sube en `up` ms, se queda `hold` ms, baja en `down` ms, y se mantiene abajo `after` ms. */
  swing(o: { up?: number; hold?: number; down?: number; after?: number } = {}) {
    const { up = 700, hold = 100, down = 330, after = 1500 } = o;
    this.feed(up, (r) => LOW + (HIGH - LOW) * (r / up));
    this.feed(hold, HIGH);
    this.feed(down, (r) => HIGH + (LOW - HIGH) * (r / down));
    this.feed(after, LOW);
  }
  status() { return this.steps.map((s) => s.status).filter(Boolean) as string[]; }
}

describe('la persona sintética está bien encuadrada (precondición de las pruebas)', () => {
  it('framingCheck da ok', () => { expect(framingCheck(person(0, LOW).lm).ok).toBe(true); });
});

describe('detector de swings en vivo (F10.2)', () => {
  it('un swing normal da UN swing con los cuadros de tope−2,5 s a impacto+0,5 s', () => {
    const r = new Run();
    r.feed(1500, LOW);
    r.swing();
    expect(r.swings).toHaveLength(1);
    const seg = r.swings[0];
    expect(seg.length).toBeGreaterThan(30);
    expect(seg[seg.length - 1].t - seg[0].t).toBeLessThanOrEqual(LIVE.preMs + LIVE.postMs + 3000);
    expect(r.det.phase).toBe('ready');                   // 1,5 s quieto abajo después: ya rearmó
  });

  it('histéresis: un cuadro suelto con las manos altas no arma el tope', () => {
    const r = new Run();
    r.feed(1000, LOW);
    r.feed(DT, HIGH);                                   // un solo cuadro
    r.feed(1000, LOW);
    expect(r.det.phase).toBe('ready');
    expect(r.steps.some((s) => s.phase === 'top')).toBe(false);     // ni siquiera entró en el tope
    expect(r.swings).toHaveLength(0);
  });

  it('una bajada demasiado rápida (< 0,15 s) no es un swing, y avisa', () => {
    const r = new Run();
    r.feed(1500, LOW);
    r.swing({ down: 66 });
    expect(r.swings).toHaveLength(0);
    expect(r.status().some((s) => /demasiado rápido/.test(s))).toBe(true);
  });

  it('una bajada demasiado lenta (> 0,6 s) no es un swing, y avisa', () => {
    const r = new Run();
    r.feed(1500, LOW);
    r.swing({ down: 1100 });
    expect(r.swings).toHaveLength(0);
    expect(r.status().some((s) => /muy lento/.test(s))).toBe(true);
  });

  it('separación mínima de 3 s: un segundo gesto pegado al primero no cuenta; uno a más de 3 s sí', () => {
    const r = new Run();
    r.feed(1500, LOW);
    r.swing({ after: 1300 });                           // rearma (0,5 s quieto), pero solo han pasado ~1,2 s desde el primero
    r.swing({ after: 1500 });
    expect(r.swings).toHaveLength(1);
    r.feed(3500, LOW);
    r.swing();
    expect(r.swings).toHaveLength(2);
  });

  it('rearma solo tras 0,5 s con las manos quietas abajo', () => {
    const r = new Run();
    r.feed(1500, LOW);
    r.swing({ after: 700 });                            // pasa la espera de 0,6 s tras el impacto y entra en rearme
    expect(r.det.phase).toBe('rearm');
    r.feed(300, LOW);
    expect(r.det.phase).toBe('rearm');
    r.feed(500, LOW);
    expect(r.det.phase).toBe('ready');
  });

  it('manos arriba más de 2,5 s sin bajar (se quedó posando) se descarta y rearma', () => {
    const r = new Run();
    r.feed(1500, LOW);
    r.feed(700, (rel) => LOW + (HIGH - LOW) * (rel / 700));
    r.feed(3000, HIGH);
    expect(r.swings).toHaveLength(0);
    r.feed(1200, LOW);
    expect(r.det.phase).toBe('ready');
  });

  it('bloqueo de identidad: otra persona (otro tamaño y sitio) pausa con aviso y NO genera swings', () => {
    const r = new Run();
    r.feed(1500, LOW);
    r.feed(500, LOW, 0.8, 0.55);                        // aparece otra persona más chica y a un lado
    expect(r.det.phase).toBe('paused');
    expect(r.status().some((s) => /Otra persona/.test(s))).toBe(true);
    // la otra persona hace un swing completo: no cuenta
    const before = r.swings.length;
    r.t += 0;
    r.feed(700, (rel) => LOW + (HIGH - LOW) * (rel / 700), 0.8, 0.55);
    r.feed(400, (rel) => HIGH + (LOW - HIGH) * (rel / 330), 0.8, 0.55);
    r.feed(1500, LOW, 0.8, 0.55);
    expect(r.swings.length).toBe(before);
  });

  it('al volver la persona bloqueada se reanuda y detecta su swing', () => {
    const r = new Run();
    r.feed(1500, LOW);
    r.feed(300, LOW, 0.8, 0.55);
    expect(r.det.phase).toBe('paused');
    r.feed(800, LOW);                                   // vuelve la persona original
    expect(r.det.phase).toBe('ready');
    r.feed(500, LOW);
    r.swing();
    expect(r.swings).toHaveLength(1);
  });

  it('un salto de una sola vez del seguimiento (misma talla pero otro sitio) también pausa', () => {
    const r = new Run();
    r.feed(1500, LOW);
    r.feed(DT, LOW, 0.5 + 0.4);
    expect(r.det.phase).toBe('paused');
  });

  it('un cuadro sin persona en espera avisa; mientras se hace el swing no interrumpe', () => {
    const d = new LiveSwingDetector({ lefty: false, view: () => 'frente', aspect: () => 9 / 16 });
    expect(d.noPerson().status).toMatch(/No te veo/);
    const r = new Run();
    r.feed(1500, LOW);
    r.feed(500, (rel) => LOW + (HIGH - LOW) * (rel / 500));
    expect(r.det.noPerson().status).toBeUndefined();
  });

  it('reset() conserva la identidad: tras reanudar la cámara sigue siguiendo a la misma persona', () => {
    const r = new Run();
    r.feed(1500, LOW);
    r.det.reset();
    r.feed(300, LOW, 0.8, 0.55);
    expect(r.det.phase).toBe('paused');
  });
});
