/**
 * Anuncios con recompensa.
 *
 * Reglas de negocio (D1, 20 nov 2026): el ball tracking es gratis por bloques de 15 minutos; para abrir otro bloque, el usuario
 * gratuito ve UN anuncio con recompensa. Exportar un video también se desbloquea con UN anuncio por análisis (ver
 * `lib/exportGate.ts`). Premium no ve anuncios. NO se promete ninguna duración: la decide el anuncio.
 *
 * En las apps de tienda (Capacitor) se muestran anuncios reales de AdMob. En el navegador no hay red de anuncios: se muestra un
 * espacio publicitario de prueba con cuenta atrás, solo en desarrollo o con `VITE_INTERNAL=1`.
 */
import { Capacitor } from '@capacitor/core';

export const AD_RULES = { freeSeconds: 15 * 60, adsToUnlock: 1 } as const;
/** Duración de la cuenta atrás del anuncio de PRUEBA del navegador (no es la de un anuncio real). */
export const PLACEHOLDER_SECONDS = 5;

export const isLocked = (usedSec: number, premium: boolean) => !premium && usedSec >= AD_RULES.freeSeconds;
export const remainingSec = (usedSec: number) => Math.max(0, AD_RULES.freeSeconds - usedSec);
export const fmtClock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

// Identificadores de PRUEBA publicados por Google. Antes de publicar se reemplazan por los
// reales con VITE_ADMOB_REWARDED_ANDROID / VITE_ADMOB_REWARDED_IOS.
const TEST_IDS = { android: 'ca-app-pub-3940256099942544/5224354917', ios: 'ca-app-pub-3940256099942544/1712485313' };

function adUnit() {
  const env = import.meta.env ?? {};
  const real = Capacitor.getPlatform() === 'ios' ? env.VITE_ADMOB_REWARDED_IOS : env.VITE_ADMOB_REWARDED_ANDROID;
  const test = Capacitor.getPlatform() === 'ios' ? TEST_IDS.ios : TEST_IDS.android;
  return { adId: real || test, isTesting: !real };
}

export const nativeAds = () => Capacitor.isNativePlatform();
/** ¿Hay anuncios (reales o de prueba) en esta build? En la web de producción no: allí manda la exportación gratis diaria (D5). */
export const adsAvailable = () => nativeAds() || !!(import.meta.env?.DEV || import.meta.env?.VITE_INTERNAL === '1');

/* ───────────────────────── Controlador de anuncios con recompensa (F9.2) ───────────────────────── */

export type AdEvent = 'Loaded' | 'FailedToLoad' | 'Showed' | 'FailedToShow' | 'Rewarded' | 'Dismissed';
export type AdOutcome =
  | { kind: 'rewarded'; rewardEventId: string }
  | { kind: 'dismissed' }
  | { kind: 'load_failed'; message?: string }
  | { kind: 'show_failed'; message?: string }
  | { kind: 'busy' };

/** Lo mínimo que se necesita del plugin; permite probar el controlador sin dispositivo. */
export interface RewardedPlugin {
  initialize(): Promise<void>;
  prepare(): Promise<void>;
  show(): Promise<unknown>;
  on(event: AdEvent, cb: (info?: unknown) => void): Promise<{ remove: () => Promise<void> }>;
}

/** Un anuncio cargado caduca a la hora (Google). */
export const AD_TTL_MS = 60 * 60 * 1000;
/** Si el anuncio no termina (ni Dismissed ni FailedToShow) en este tiempo, se da por fallido y se libera el bloqueo (revisión F9). */
export const AD_SHOW_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Carga y muestra anuncios con recompensa escuchando TODOS los eventos del plugin. Reglas: precarga idempotente; descarta lo
 * cargado tras 1 h; bloquea la reentrada (un segundo `show` mientras hay uno en curso devuelve `busy`); la recompensa se entrega
 * una sola vez por `show` con un `rewardEventId` propio (no hay servidor que valide aún: el SSV llega con F11.6).
 */
export class RewardedAds {
  private loadedAt: number | null = null;
  private loading: Promise<boolean> | null = null;
  private showing = false;
  private initialised: Promise<void> | null = null;
  private seq = 0;

  constructor(private readonly plugin: RewardedPlugin, private readonly now: () => number = () => Date.now()) {}

  get fresh(): boolean { return this.loadedAt !== null && this.now() - this.loadedAt < AD_TTL_MS; }
  get busy(): boolean { return this.showing; }

  /** Carga un anuncio si no hay uno fresco. Devuelve si quedó listo. */
  preload(): Promise<boolean> {
    if (this.fresh) return Promise.resolve(true);
    if (this.loading) return this.loading;
    this.loadedAt = null;
    this.loading = (async () => {
      try {
        this.initialised ??= this.plugin.initialize();
        await this.initialised;
        await this.plugin.prepare();
        this.loadedAt = this.now();
        return true;
      } catch {
        this.initialised = null;
        return false;
      } finally { this.loading = null; }
    })();
    return this.loading;
  }

  async show(): Promise<AdOutcome> {
    if (this.showing) return { kind: 'busy' };
    this.showing = true;
    const handles: { remove: () => Promise<void> }[] = [];
    try {
      if (!(await this.preload())) return { kind: 'load_failed' };
      const id = `reward-${this.now().toString(36)}-${++this.seq}`;
      let rewarded = false, failed = false;
      let closed!: () => void;
      const dismissed = new Promise<void>((res) => { closed = res; });
      handles.push(
        await this.plugin.on('Rewarded', () => { rewarded = true; }),
        await this.plugin.on('FailedToShow', () => { failed = true; closed(); }),
        await this.plugin.on('Dismissed', () => closed()),
      );
      this.loadedAt = null;                                  // un anuncio se muestra una sola vez
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>((res) => { timer = setTimeout(() => res('timeout'), AD_SHOW_TIMEOUT_MS); });
      try { await this.plugin.show(); } catch { clearTimeout(timer); return { kind: 'show_failed' }; }
      const ended = await Promise.race([dismissed.then(() => 'closed' as const), timeout]);
      clearTimeout(timer);
      if (ended === 'timeout') return rewarded ? { kind: 'rewarded', rewardEventId: id } : { kind: 'show_failed', message: 'timeout' };
      if (rewarded) return { kind: 'rewarded', rewardEventId: id };
      return failed ? { kind: 'show_failed' } : { kind: 'dismissed' };
    } finally {
      await Promise.all(handles.map((h) => h.remove().catch(() => undefined)));
      this.showing = false;
    }
  }
}

/** Adaptador del plugin real de AdMob (solo en la app nativa). */
function admobPlugin(): RewardedPlugin {
  const mod = () => import('@capacitor-community/admob');
  return {
    initialize: async () => { const { AdMob } = await mod(); await AdMob.initialize(); },
    prepare: async () => { const { AdMob } = await mod(); await AdMob.prepareRewardVideoAd(adUnit()); },
    show: async () => { const { AdMob } = await mod(); return AdMob.showRewardVideoAd(); },
    on: async (event, cb) => {
      const { AdMob, RewardAdPluginEvents } = await mod();
      // El plugin tipa `addListener` por evento; aquí se escucha uno cualquiera de la lista fija y se entrega al controlador.
      const add = AdMob.addListener.bind(AdMob) as unknown as (e: unknown, cb: (info?: unknown) => void) => Promise<{ remove: () => Promise<void> }>;
      return add(RewardAdPluginEvents[event], cb);
    },
  };
}

let shared: RewardedAds | null = null;
/** El controlador compartido de la app (uno solo: así el bloqueo de reentrada es global). */
export const rewardedAds = (): RewardedAds => (shared ??= new RewardedAds(admobPlugin()));

/** Para el ball tracking: true solo si el usuario vio el anuncio completo y ganó la recompensa. */
export async function showNativeRewarded(): Promise<boolean> {
  const r = await rewardedAds().show();
  if (r.kind === 'load_failed' || r.kind === 'show_failed') throw new Error(r.kind);
  return r.kind === 'rewarded';
}
