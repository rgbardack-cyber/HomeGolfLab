/**
 * Idioma actual de la app + `t()`. El idioma se guarda aparte del resto de los datos (`homegolflab-lang`): «Borrar todos mis datos»
 * no lo cambia, y no hay que migrar el almacén principal. Sin ventana (pruebas) arranca en español.
 */
import { useSyncExternalStore } from 'react';
import { DEFAULT_LOCALE, isLocale, LOCALES, pickInitial, translate, type Dict, type Locale } from './core';
import { es } from './locales/es';
import { en } from './locales/en';
import { esES } from './locales/es-ES';
import { enGB } from './locales/en-GB';
import { de } from './locales/de';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { sv } from './locales/sv';
import { pt } from './locales/pt';
import { nl } from './locales/nl';
import { badgeDictEs, noticeDictEs } from './locales/dynamic';
import { AREAS } from './areas';

export type { Locale } from './core';
export { LOCALES } from './core';
/** Claves del diccionario base. `t()` acepta cualquier clave (las pruebas revisan que toda clave escrita en el código exista). */
export type Key = keyof typeof es;

const BASE: Readonly<Record<Locale, Dict>> = {
  es: { ...es, ...badgeDictEs(), ...noticeDictEs() },
  'es-ES': esES,
  en, 'en-GB': enGB, de, fr, it, ja, ko, sv, pt, nl,
};
/** Base + todas las áreas. */
export const DICTS: Readonly<Record<Locale, Dict>> = Object.fromEntries(
  (Object.keys(BASE) as Locale[]).map((l) => [l, Object.assign({}, BASE[l], ...AREAS.map((a) => a[l] ?? {}))]),
) as Record<Locale, Dict>;

const STORAGE_KEY = 'homegolflab-lang';
const readStored = (): string | null => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } };

let current: Locale = (() => {
  const nav = typeof navigator !== 'undefined' && typeof window !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : null;
  return pickInitial(readStored(), nav);
})();
const listeners = new Set<() => void>();

function applyDocument(l: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = LOCALES.find((x) => x.code === l)?.bcp47 ?? l;
}
applyDocument(current);

export const getLocale = (): Locale => current;
export const bcp47 = (): string => LOCALES.find((l) => l.code === current)?.bcp47 ?? 'es';

export function setLocale(l: Locale | string): void {
  const next = isLocale(l) ? l : DEFAULT_LOCALE;
  if (next === current) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* sin almacenamiento: vale solo hasta cerrar la app */ }
  applyDocument(next);
  listeners.forEach((f) => f());
}

/** Texto con clave conocida (el compilador revisa que la clave exista). */
export function t(key: Key | (string & {}), params?: Record<string, string | number>): string {
  return translate(DICTS, current, key, params);
}
/** Texto con clave armada al vuelo (`badge.${id}.label`); si falta, devuelve la clave. Las pruebas revisan las claves dinámicas. */
export function td(key: string, params?: Record<string, string | number>): string {
  return translate(DICTS, current, key, params);
}

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

/** En un componente: devuelve `t` y vuelve a pintar cuando cambia el idioma. */
export function useT() {
  const locale = useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE);
  return { t, td, locale };
}

/** Número con la coma o el punto decimal del idioma actual (para unidades). */
export function fmtNumber(n: number, decimals: number): string {
  try { return new Intl.NumberFormat(bcp47(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n); } catch { return n.toFixed(decimals); }
}

/** Fecha en el idioma actual. */
export function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  try { return d.toLocaleDateString(bcp47(), opts); } catch { return d.toLocaleDateString('es', opts); }
}
