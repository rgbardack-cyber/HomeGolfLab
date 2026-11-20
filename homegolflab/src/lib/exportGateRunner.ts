/**
 * Orquestador de la compuerta de descarga (F9): conecta `gateStep` (puro) con el anuncio y la interfaz mediante dependencias
 * inyectadas, para poder probar el recorrido completo sin pantalla ni dispositivo.
 *
 * Recorrido: pide el pase → si hace falta ver un anuncio, muestra el aviso previo (qué se intercambia, sin prometer duración) →
 * muestra el anuncio → solo con la recompensa se emite el pase → devuelve `ok`. Un anuncio que no carga se reintenta una vez tras
 * una espera; después, 1 exportación gratis al día sin anuncio (D5).
 */
import type { AdOutcome } from './ads';
import { gateStep, INITIAL_GATE, needsAdNotice, type GateContext, type GateEffects, type GateEvent, type GateState, type GateStatus } from './exportGate';

export type NoticeChoice = 'watch' | 'premium' | 'decline' | 'cancel';

export interface RunnerDeps {
  getCtx(): GateContext;
  /** Aplica los efectos (guardar el pase, marcar el día gratis, contar el uso) y registra el estado. */
  apply(effects: GateEffects, state: GateState): void;
  setConsent(c: 'granted' | 'declined'): void;
  /** Aviso previo al anuncio. Debe resolver con la decisión del usuario. */
  askNotice(): Promise<NoticeChoice>;
  /** Muestra el anuncio (real o de prueba) y dice cómo terminó. */
  playAd(): Promise<AdOutcome>;
  wait(ms: number): Promise<void>;
  /** ¿Esta build puede mostrar anuncios? (web de producción: no; entonces se pasa directo a la exportación gratis del día, D5). */
  adsAvailable?(): boolean;
  /** Para mostrar el estado en la interfaz (mensajes). */
  onState?(s: GateState): void;
}

export interface RunnerResult { ok: boolean; state: GateState; wantsPremium?: boolean }
/** Espera entre el primer intento de carga y el segundo (plan 9.1: reintentar con espera). */
export const RETRY_WAIT_MS = 1500;

export async function obtainExportPass(analysisId: string, deps: RunnerDeps, specHash = ''): Promise<RunnerResult> {
  let s: GateState = INITIAL_GATE;
  const step = (e: GateEvent): GateState => {
    const r = gateStep(s, e, deps.getCtx());
    s = r.state;
    deps.apply(r.effects, s);
    deps.onState?.(s);
    return s;
  };
  /** Estado actual (la variable `s` cambia dentro de `step`; esto evita que TypeScript fije su tipo tras una comparación). */
  const status = (): GateStatus => s.status;
  const done = (ok: boolean, extra: Partial<RunnerResult> = {}): RunnerResult => ({ ok, state: s, ...extra });

  step({ type: 'request', analysisId, specHash });
  if (status() === 'exporting') return done(true);                         // pase vigente, Premium o gratis diaria
  if (status() !== 'requesting_ad') return done(false);                    // ad_unavailable (rechazó anuncios y ya usó la gratis)

  if (deps.adsAvailable && !deps.adsAvailable()) {
    // Sin anuncios en esta build: no se muestra aviso ni se promete nada; cuenta como anuncio no disponible.
    step({ type: 'ad_load_failed' });
    step({ type: 'ad_load_failed' });
    return done(status() === 'exporting');
  }

  if (needsAdNotice(analysisId, deps.getCtx())) {
    const choice = await deps.askNotice();
    if (choice === 'cancel') { step({ type: 'cancel' }); return done(false); }
    if (choice === 'premium') { step({ type: 'cancel' }); return done(false, { wantsPremium: true }); }
    if (choice === 'decline') {
      deps.setConsent('declined');
      step({ type: 'reset' });
      step({ type: 'request', analysisId, specHash });
      return status() === 'exporting' ? done(true) : done(false);
    }
    deps.setConsent('granted');
  }

  for (let guard = 0; guard < 4; guard++) {
    const out = await deps.playAd();
    switch (out.kind) {
      case 'busy': return done(false);
      case 'dismissed': step({ type: 'ad_dismissed' }); return done(false);
      case 'show_failed': step({ type: 'ad_show_failed' }); return done(status() === 'exporting');
      case 'rewarded': step({ type: 'ad_rewarded', rewardEventId: out.rewardEventId }); return done(status() === 'rewarded');
      case 'load_failed': {
        step({ type: 'ad_load_failed' });
        if (status() === 'requesting_ad') { await deps.wait(RETRY_WAIT_MS); continue; }
        return done(status() === 'exporting');
      }
    }
  }
  step({ type: 'cancel' });
  return done(false);
}
