/**
 * Anuncios con recompensa.
 *
 * Regla de negocio: el ball tracking es gratis por bloques de 15 minutos; para abrir otro
 * bloque, el usuario gratuito ve 2 anuncios de 30 segundos. Premium no ve anuncios.
 *
 * En las apps de tienda (Capacitor) se muestran anuncios reales de AdMob. En el navegador
 * no hay red de anuncios, así que se muestra un espacio publicitario de prueba con cuenta atrás.
 */
import { Capacitor } from '@capacitor/core';

export const AD_RULES = { freeSeconds: 15 * 60, adsToUnlock: 2, adSeconds: 30 } as const;

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

let ready: Promise<void> | null = null;

/**
 * Muestra un anuncio real con recompensa (solo en la app nativa).
 * Devuelve true únicamente si el usuario lo vio completo y ganó la recompensa.
 */
export async function showNativeRewarded(): Promise<boolean> {
  const { AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob');
  ready ??= AdMob.initialize();
  await ready;

  let rewarded = false;
  let closed!: () => void;
  const dismissed = new Promise<void>((res) => { closed = res; });
  const handles = [
    await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { rewarded = true; }),
    await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => closed()),
  ];
  try {
    await AdMob.prepareRewardVideoAd(adUnit());
    await AdMob.showRewardVideoAd();
    await dismissed;
    return rewarded;
  } finally {
    await Promise.all(handles.map((h) => h.remove()));
  }
}
