/**
 * Compuerta de descarga de la exportación (plan 4.8 y F9.1; decisiones D1, D3 y D5 de Ryan). Máquina de estados PURA: no llama
 * al anuncio ni al almacenamiento; recibe eventos y devuelve el nuevo estado y, cuando corresponde, un pase para guardar.
 *
 *  idle → requesting_ad → showing → rewarded → exporting → done      (+ ad_unavailable, ad_failed_to_show, cancelled, export_failed)
 *
 * Reglas:
 * - Premium: pase `via: 'premium'` sin anuncio.
 * - Gratis: UN anuncio con recompensa por análisis (D1). El pase se emite SOLO con el evento de recompensa, una vez por
 *   `rewardEventId` (los duplicados se ignoran).
 * - D3: un pase vale para ese ANÁLISIS durante 24 h. Cambiar las opciones de exportación (formato, esqueleto, guías, marca de agua,
 *   línea de tiro) dentro del mismo análisis y el mismo día NO pide otro anuncio; reintentos y reenvíos incluidos. `specHash` se
 *   guarda como dato, pero no se compara.
 * - D5: si el usuario rechaza el consentimiento de anuncios, o no hay anuncio (no cargó o no pudo mostrarse tras 2 intentos), hay 1
 *   exportación gratis al día sin anuncio, registrada localmente (`freeExportDate`). Si ya se usó, se avisa.
 * - Un anuncio cerrado sin recompensa NO desbloquea: «Cerraste el anuncio antes de terminar».
 * - Si el usuario pasa a Premium a mitad del trámite, se emite el pase premium y se exporta sin anuncio.
 * - Un fallo al codificar después de desbloquear deja el pase vivo (se reintenta sin otro anuncio).
 */
import type { ExportPass } from '@/store';

export const PASS_TTL_MS = 24 * 60 * 60 * 1000;
/** Intentos de cargar el anuncio antes de caer a la exportación gratis diaria (plan 9.1: 2). */
export const MAX_LOAD_ATTEMPTS = 2;

export type GateStatus = 'idle' | 'requesting_ad' | 'showing' | 'rewarded' | 'exporting' | 'done' | 'ad_unavailable' | 'ad_failed_to_show' | 'cancelled' | 'export_failed';

export interface GateState {
  status: GateStatus;
  analysisId: string | null;
  /** Intentos de carga del anuncio ya hechos. */
  loadAttempts: number;
  /** Pase con el que se exporta (existente o recién emitido). */
  passId: string | null;
  /** Mensaje en español para la interfaz. */
  message?: string;
}

export const INITIAL_GATE: GateState = { status: 'idle', analysisId: null, loadAttempts: 0, passId: null };

/** Lo que la compuerta necesita saber del mundo en cada evento. */
export interface GateContext {
  now: number;
  premium: boolean;
  /** 'declined' = el usuario rechazó ver anuncios (consentimiento, D5). */
  consent: 'granted' | 'declined' | 'unknown';
  passes: readonly ExportPass[];
  /** Fecha (AAAA-MM-DD, hora local) de la última exportación gratis diaria sin anuncio; null si nunca. */
  freeExportDate: string | null;
  today: string;
}

export type GateEvent =
  | { type: 'request'; analysisId: string; specHash?: string }
  | { type: 'ad_loaded' }
  | { type: 'ad_load_failed' }
  | { type: 'ad_showed' }
  | { type: 'ad_show_failed' }
  | { type: 'ad_rewarded'; rewardEventId: string }
  | { type: 'ad_dismissed' }
  | { type: 'premium_enabled' }
  | { type: 'export_started' }
  | { type: 'export_done' }
  | { type: 'export_failed' }
  | { type: 'cancel' }
  | { type: 'reset' };

/** Efectos que debe aplicar quien llama (guardar el pase, marcar el día gratis). */
export interface GateEffects {
  grant?: ExportPass;
  useFreeDaily?: boolean;
  /** Pase existente que se vuelve a usar (para contar usos). */
  usePassId?: string;
}
export interface GateResult { state: GateState; effects: GateEffects }

const ok = (state: GateState, effects: GateEffects = {}): GateResult => ({ state, effects });

/** ¿Hay un pase vigente para este análisis? (D3: no depende de las opciones.) */
export function findValidPass(passes: readonly ExportPass[], analysisId: string, now: number): ExportPass | null {
  return passes.find((p) => p.analysisId === analysisId && now < p.expiresAt && now >= p.grantedAt) ?? null;
}

/** Quita de la lista los pases vencidos. */
export const pruneExpired = (passes: readonly ExportPass[], now: number): ExportPass[] => passes.filter((p) => now < p.expiresAt);

/** Un id estable para el análisis; en la comparación se combinan los dos, sin importar el orden. */
export const analysisKey = (...ids: string[]): string => [...ids].sort().join('+');

function newPass(c: GateContext, analysisId: string, via: ExportPass['via'], specHash = '', rewardEventId?: string): ExportPass {
  return {
    id: `pass-${c.now.toString(36)}-${analysisId.length}-${(rewardEventId ?? via).slice(0, 8)}`,
    analysisId, specHash, grantedAt: c.now, expiresAt: c.now + PASS_TTL_MS, via, rewardEventId, uses: 0, consumed: false,
  };
}

export const FREE_DAILY_USED_TEXT = 'Ya usaste tu exportación gratis de hoy. Mañana tendrás otra, o puedes quitar los anuncios con Premium.';
export const AD_UNAVAILABLE_TEXT = 'No hay anuncios disponibles en este momento.';

/** Intenta la exportación gratis diaria (D5); si ya se usó, termina con aviso. */
function freeDailyOrBlock(s: GateState, c: GateContext, why: string): GateResult {
  if (c.freeExportDate !== c.today) {
    const pass = newPass(c, s.analysisId!, 'placeholder', '', `free-${c.today}`);
    pass.via = 'free_daily';
    return ok({ ...s, status: 'exporting', passId: pass.id, message: `${why} Tienes 1 exportación gratis al día sin anuncio: se usó la de hoy.` }, { grant: pass, useFreeDaily: true });
  }
  return ok({ ...s, status: 'ad_unavailable', message: `${why} ${FREE_DAILY_USED_TEXT}` });
}

/**
 * Transición. Los eventos que no corresponden al estado actual se ignoran (devuelven el mismo estado): así un evento tardío o
 * duplicado del anuncio no puede emitir un pase ni reiniciar nada.
 */
export function gateStep(s: GateState, e: GateEvent, c: GateContext): GateResult {
  switch (e.type) {
    case 'reset': return ok(INITIAL_GATE);
    case 'cancel':
      if (s.status === 'idle' || s.status === 'done') return ok(s);
      return ok({ ...s, status: 'cancelled', message: s.status === 'exporting' ? 'Exportación cancelada.' : undefined });
    case 'request': {
      if (s.status === 'requesting_ad' || s.status === 'showing' || s.status === 'rewarded' || s.status === 'exporting') return ok(s);   // reentrada bloqueada
      const base: GateState = { status: 'idle', analysisId: e.analysisId, loadAttempts: 0, passId: null };
      const have = findValidPass(c.passes, e.analysisId, c.now);
      if (have) return ok({ ...base, status: 'exporting', passId: have.id }, { usePassId: have.id });
      if (c.premium) { const p = newPass(c, e.analysisId, 'premium', e.specHash); return ok({ ...base, status: 'exporting', passId: p.id }, { grant: p }); }
      if (c.consent === 'declined') return freeDailyOrBlock(base, c, 'No quieres ver anuncios.');
      return ok({ ...base, status: 'requesting_ad', loadAttempts: 1 });
    }
    case 'ad_loaded':
      return s.status === 'requesting_ad' ? ok({ ...s, status: 'showing' }) : ok(s);
    case 'ad_showed':
      return s.status === 'showing' || s.status === 'requesting_ad' ? ok({ ...s, status: 'showing' }) : ok(s);
    case 'ad_load_failed': {
      if (s.status !== 'requesting_ad') return ok(s);
      if (s.loadAttempts < MAX_LOAD_ATTEMPTS) return ok({ ...s, loadAttempts: s.loadAttempts + 1 });   // quien llama espera y vuelve a cargar
      return freeDailyOrBlock({ ...s, loadAttempts: s.loadAttempts }, c, AD_UNAVAILABLE_TEXT);
    }
    case 'ad_show_failed': {
      if (s.status !== 'showing' && s.status !== 'requesting_ad') return ok(s);
      const r = freeDailyOrBlock(s, c, 'No se pudo mostrar el anuncio.');
      return r.state.status === 'ad_unavailable' ? ok({ ...r.state, status: 'ad_failed_to_show' }) : r;
    }
    case 'ad_rewarded': {
      if (s.status !== 'showing' && s.status !== 'requesting_ad') return ok(s);
      if (!s.analysisId) return ok(s);
      // Un mismo evento de recompensa no emite dos pases.
      if (c.passes.some((p) => p.rewardEventId === e.rewardEventId)) return ok(s);
      const p = newPass(c, s.analysisId, 'reward', '', e.rewardEventId);
      return ok({ ...s, status: 'rewarded', passId: p.id }, { grant: p });
    }
    case 'ad_dismissed':
      if (s.status === 'rewarded' || s.status === 'exporting' || s.status === 'done') return ok(s);       // ya recompensado: cerrar es lo normal
      if (s.status === 'showing' || s.status === 'requesting_ad') return ok({ ...s, status: 'cancelled', message: 'Cerraste el anuncio antes de terminar. Tienes que verlo completo para descargar.' });
      return ok(s);
    case 'premium_enabled': {
      if (!s.analysisId || (s.status !== 'requesting_ad' && s.status !== 'showing')) return ok(s);
      const p = newPass(c, s.analysisId, 'premium');
      return ok({ ...s, status: 'exporting', passId: p.id, message: undefined }, { grant: p });
    }
    case 'export_started':
      return s.status === 'rewarded' || s.status === 'exporting' || s.status === 'export_failed' || s.status === 'cancelled' ? ok({ ...s, status: 'exporting', message: undefined }) : ok(s);
    case 'export_done':
      return s.status === 'exporting' ? ok({ ...s, status: 'done', message: undefined }) : ok(s);
    case 'export_failed':
      // El pase sigue vivo: se puede reintentar sin otro anuncio.
      return s.status === 'exporting' ? ok({ ...s, status: 'export_failed', message: 'No se pudo exportar. Puedes intentarlo de nuevo sin ver otro anuncio.' }) : ok(s);
  }
}

/** ¿La interfaz debe mostrar el aviso previo al anuncio? (gratis, sin pase vigente, con consentimiento y sin haber agotado la gratis diaria). */
export function needsAdNotice(analysisId: string, c: GateContext): boolean {
  return !c.premium && c.consent !== 'declined' && !findValidPass(c.passes, analysisId, c.now);
}
