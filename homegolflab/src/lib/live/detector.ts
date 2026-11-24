/**
 * Detector de swings en vivo (plan F10.2). Máquina de estados PURA que recibe un cuadro de postura por vez y avisa cuándo hay un
 * swing completo para analizar. Antes vivía dentro de `LiveAnalyzer`; sacarlo permite probarlo con cuadros sintéticos.
 *
 * Mejoras sobre la versión anterior (mismas constantes de tiempo que `analyzeSwing`, en tiempo REAL):
 * - Histéresis: las manos deben estar sobre los hombros ≥ 3 cuadros seguidos para armar el tope (un cuadro suelto no cuenta).
 * - Bajada en tiempo real de 0,15–0,6 s (`MIN/MAX_DOWNSWING_SEC`): más rápido es un salto del seguimiento; más lento no es un swing.
 * - Separación mínima de 3 s entre swings: un segundo gesto pegado al primero (final, colocarse) no cuenta.
 * - Rearme solo tras 0,5 s con las manos quietas abajo (posición de inicio).
 * - Bloqueo de identidad: se sigue a la persona del encuadre inicial (centro y tamaño del torso); si el seguimiento salta a otra
 *   persona o la principal se va, se PAUSA con un aviso y se reanuda cuando vuelve la persona bloqueada.
 *   (Con un solo modelo de una persona — `numPoses: 1` — esto detecta el salto; elegir entre dos personas a la vez exigiría `numPoses: 2`,
 *   que cambia el análisis de video y queda pendiente.)
 */
import { MAX_DOWNSWING_SEC, MIN_DOWNSWING_SEC, framingCheck, LM, viewOfFrame, type Frame, type SwingView } from '../swing';
import { t } from '@/i18n';
import { viewLabel } from '../swing';

export type LivePhase = 'ready' | 'top' | 'settle' | 'rearm' | 'paused';

export const LIVE = {
  /** Cuadros seguidos con las manos altas para armar el tope. */
  highFrames: 3,
  /** Separación mínima entre dos swings detectados (ms). */
  minGapMs: 3000,
  /** Quietud en la posición de inicio para volver a armar (ms). */
  rearmMs: 500,
  /** Tiempo máximo con las manos arriba antes de descartar (ms). */
  topTimeoutMs: 2500,
  /** Espera tras el impacto para tener los cuadros del final (ms). */
  settleMs: 600,
  /** Cuánto se guarda antes del tope y después del impacto para analizar (ms). */
  preMs: 2500, postMs: 500,
  /** Memoria de cuadros (ms). */
  bufferMs: 8000,
  /** Identidad: la persona bloqueada no puede cambiar de tamaño ni de sitio más que esto en un cuadro. */
  torsoRatio: [0.6, 1.6] as const, jump: 0.25,
  /** Cuadros seguidos con la persona bloqueada para reanudar tras una pausa. */
  resumeFrames: 15,
} as const;

export interface LiveStep {
  /** Mensaje para el jugador (si cambió o hay uno nuevo). */
  status?: string;
  /** Silueta guía: vista, encuadre bueno y si toca mostrarla. */
  guide?: { view: SwingView; ok: boolean; show: boolean };
  /** Hay un swing completo: cuadros para `analyzeSwing` (de tope−2,5 s a impacto+0,5 s). */
  swing?: Frame[];
  /** La detección está en pausa (otra persona en el encuadre). */
  paused?: boolean;
  /** Fase actual (para pruebas y depuración). */
  phase: LivePhase;
}

interface Ident { cx: number; cy: number; torso: number }

const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function identOf(f: Frame): Ident | null {
  const sh = mid(f.lm[LM.L_SHOULDER], f.lm[LM.R_SHOULDER]), hp = mid(f.lm[LM.L_HIP], f.lm[LM.R_HIP]);
  const torso = Math.hypot(sh.x - hp.x, sh.y - hp.y);
  return torso > 0.03 ? { cx: (sh.x + hp.x) / 2, cy: (sh.y + hp.y) / 2, torso } : null;
}

export class LiveSwingDetector {
  phase: LivePhase = 'ready';
  private buf: Frame[] = [];
  private tTop = 0;          // instante en que se armó el tope
  private peakT = 0; private peakY = Infinity;   // instante y altura (mínimo) de las manos en el tope
  private tImp = 0;
  private highCount = 0;
  private lowSince = 0;
  private lastSwingAt = -Infinity;
  private lock: Ident | null = null;
  private lastIdent: Ident | null = null;
  private sameCount = 0;

  constructor(private readonly opts: { lefty: boolean; view: () => SwingView | 'auto'; aspect: () => number }) {}

  /** Reinicia la espera (p. ej. al reanudar la cámara tras una interrupción); conserva la identidad bloqueada. */
  reset(): void { this.phase = 'ready'; this.highCount = 0; this.lowSince = 0; this.buf.length = 0; this.sameCount = 0; }
  /** Olvida a la persona bloqueada (otra sesión). */
  clearLock(): void { this.lock = null; this.lastIdent = null; }

  /** Un cuadro sin persona (el seguimiento no la ve). */
  noPerson(): LiveStep {
    if (this.phase === 'ready') return { status: t('live.noPerson'), guide: { view: 'frente', ok: false, show: true }, phase: this.phase };
    return { phase: this.phase };
  }

  step(f: Frame, now: number): LiveStep {
    const id = identOf(f);
    // ── Identidad ──
    if (id) {
      if (!this.lock && this.phase === 'ready') {
        const fr = framingCheck(f.lm);
        if (fr.ok) this.lock = id;                       // se bloquea a la persona bien encuadrada
      }
      if (this.lock) {
        const near = Math.hypot(id.cx - this.lock.cx, id.cy - this.lock.cy) <= LIVE.jump * 2 && id.torso / this.lock.torso >= LIVE.torsoRatio[0] && id.torso / this.lock.torso <= LIVE.torsoRatio[1];
        const jumped = this.lastIdent ? Math.hypot(id.cx - this.lastIdent.cx, id.cy - this.lastIdent.cy) > LIVE.jump : false;
        if (this.phase !== 'paused' && (!near || jumped)) {
          this.phase = 'paused'; this.sameCount = 0; this.highCount = 0; this.lastIdent = id;
          return { paused: true, status: t('live.otherPerson'), phase: 'paused' };
        }
        if (this.phase === 'paused') {
          this.sameCount = near && !jumped ? this.sameCount + 1 : 0;
          this.lastIdent = id;
          if (this.sameCount >= LIVE.resumeFrames) { this.reset(); return { paused: false, status: 'Listo de nuevo. Haz tu swing cuando quieras', phase: this.phase }; }
          return { paused: true, phase: 'paused' };
        }
      }
      this.lastIdent = id;
    }
    if (this.phase === 'paused') return { paused: true, phase: 'paused' };

    this.buf.push(f);
    while (this.buf.length && now - this.buf[0].t > LIVE.bufferMs) this.buf.shift();

    const wy = (f.lm[LM.L_WRIST].y + f.lm[LM.R_WRIST].y) / 2;
    const shY = (f.lm[LM.L_SHOULDER].y + f.lm[LM.R_SHOULDER].y) / 2;
    const hipY = (f.lm[LM.L_HIP].y + f.lm[LM.R_HIP].y) / 2;
    const handsHigh = wy < shY - 0.02;
    const handsLow = wy > hipY - 0.04;
    const out: LiveStep = { phase: this.phase };

    if (this.phase === 'ready') {
      const aspect = this.opts.aspect();
      const v = this.opts.view();
      const seen: SwingView = v === 'auto' ? viewOfFrame(f, aspect) : v;
      const fr = framingCheck(f.lm);
      out.guide = { view: seen, ok: fr.ok, show: true };
      out.status = fr.ok ? t('live.ready', { view: viewLabel(seen === 'atras' ? 'atras' : 'frente').toLowerCase() }) : fr.hint;
      this.highCount = handsHigh ? this.highCount + 1 : 0;
      if (this.highCount >= LIVE.highFrames) {
        if (now - this.lastSwingAt < LIVE.minGapMs) { this.phase = 'rearm'; this.lowSince = 0; }     // pegado al anterior: no cuenta
        else { this.phase = 'top'; this.tTop = now; this.peakT = now; this.peakY = wy; out.guide = { ...out.guide, show: false }; }
      }
    } else if (this.phase === 'top') {
      // El tope es el último instante cerca del punto más alto (1 %): si las manos se detienen arriba, la bajada empieza al soltarlas.
      if (wy <= this.peakY + 0.01) this.peakT = now;
      if (wy < this.peakY) this.peakY = wy;
      if (handsLow) {
        const down = (now - this.peakT) / 1000;
        if (down >= MIN_DOWNSWING_SEC && down <= MAX_DOWNSWING_SEC) { this.phase = 'settle'; this.tImp = now; }
        else { this.phase = 'rearm'; this.lowSince = 0; out.status = down < MIN_DOWNSWING_SEC ? t('live.tooFast') : t('live.tooSlow'); }
      } else if (now - this.tTop > LIVE.topTimeoutMs) { this.phase = 'rearm'; this.lowSince = 0; }
    } else if (this.phase === 'settle') {
      if (now - this.tImp > LIVE.settleMs) {
        out.swing = this.buf.filter((b) => b.t >= this.tTop - LIVE.preMs && b.t <= this.tImp + LIVE.postMs);
        this.lastSwingAt = now;
        this.phase = 'rearm'; this.lowSince = 0;
      }
    } else if (this.phase === 'rearm') {
      // vuelve a armar cuando las manos llevan medio segundo abajo (posición de inicio)
      if (handsLow) { if (!this.lowSince) this.lowSince = now; if (now - this.lowSince > LIVE.rearmMs) { this.phase = 'ready'; this.highCount = 0; } }
      else this.lowSince = 0;
    }
    out.phase = this.phase;
    return out;
  }
}
