/**
 * Idiomas (bloque de idiomas, 24 nov 2026). Parte pura y probable: lista de idiomas, cadena de respaldo, elección inicial
 * e interpolación. El estado (idioma actual, localStorage) vive en `./index.ts`.
 *
 * Reglas:
 * - La fuente de verdad de los textos es `locales/es.ts` (español de Latinoamérica). `locales/en.ts` está completa y es el respaldo de
 *   todos los demás idiomas: un texto que aún no esté traducido aparece en inglés (no en español) salvo en `es` y `es-ES`.
 * - Las traducciones son borradores hechos por IA: hay que pasarlas por una persona nativa antes de publicarlas.
 * - Ningún texto público menciona el análisis con IA (R8); al traducir se conserva eso.
 */

export const LOCALES = [
  { code: 'es', name: 'Español (Latinoamérica)', bcp47: 'es', fallback: [] as string[] },
  { code: 'es-ES', name: 'Español (España)', bcp47: 'es-ES', fallback: ['es'] },
  { code: 'en', name: 'English (US)', bcp47: 'en-US', fallback: [] },
  { code: 'en-GB', name: 'English (UK)', bcp47: 'en-GB', fallback: ['en'] },
  { code: 'de', name: 'Deutsch', bcp47: 'de-DE', fallback: ['en'] },
  { code: 'fr', name: 'Français', bcp47: 'fr-FR', fallback: ['en'] },
  { code: 'it', name: 'Italiano', bcp47: 'it-IT', fallback: ['en'] },
  { code: 'ja', name: '日本語', bcp47: 'ja-JP', fallback: ['en'] },
  { code: 'ko', name: '한국어', bcp47: 'ko-KR', fallback: ['en'] },
  { code: 'sv', name: 'Svenska', bcp47: 'sv-SE', fallback: ['en'] },
  { code: 'pt', name: 'Português (Portugal)', bcp47: 'pt-PT', fallback: ['en'] },
  { code: 'nl', name: 'Nederlands', bcp47: 'nl-NL', fallback: ['en'] },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];
export const LOCALE_CODES: readonly Locale[] = LOCALES.map((l) => l.code);
export const DEFAULT_LOCALE: Locale = 'es';

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALE_CODES as readonly string[]).includes(v);

/** Todos los inglés que no son de EE. UU. usan la ortografía británica (Reino Unido, Irlanda, Australia, Nueva Zelanda, Sudáfrica…). */
const EN_GB_REGIONS = new Set(['GB', 'IE', 'AU', 'NZ', 'ZA', 'IN', 'SG', 'HK', 'MY']);

/** Idioma de un código de navegador (`es-MX`, `en-AU`, `pt-BR`, `zh-Hans-CN`…), o null si la app no lo tiene. */
export function matchLocale(tag: string): Locale | null {
  const parts = tag.replace(/_/g, '-').split('-');
  const lang = parts[0]?.toLowerCase();
  const region = parts.find((p, i) => i > 0 && /^[A-Za-z]{2}$/.test(p))?.toUpperCase();
  if (lang === 'es') return region === 'ES' ? 'es-ES' : 'es';
  if (lang === 'en') return region && EN_GB_REGIONS.has(region) ? 'en-GB' : 'en';
  if (lang === 'nb' || lang === 'nn' || lang === 'no') return null;
  return isLocale(lang) ? lang : null;
}

/**
 * Idioma al abrir por primera vez: el guardado si es válido; si no, el primer idioma del dispositivo que la app tenga; si
 * ninguno, inglés. Sin ventana (pruebas, servidor) se queda en el idioma base de la app (español), que es el de siempre.
 */
export function pickInitial(stored: string | null | undefined, navigatorLanguages: readonly string[] | null): Locale {
  if (isLocale(stored)) return stored;
  if (!navigatorLanguages) return DEFAULT_LOCALE;
  for (const tag of navigatorLanguages) {
    const m = matchLocale(tag);
    if (m) return m;
  }
  return 'en';
}

export type Dict = Readonly<Record<string, string>>;

/** Cadena de búsqueda: el idioma, sus respaldos y, al final, español (que tiene todo). */
export function chain(locale: Locale): Locale[] {
  const info = LOCALES.find((l) => l.code === locale);
  const out: Locale[] = [locale];
  for (const f of info?.fallback ?? []) out.push(f as Locale);
  if (!out.includes('es')) out.push('es');
  return out;
}

/** Reemplaza `{nombre}` por el valor. Un marcador sin valor se deja tal cual (se nota en pantalla y en las pruebas). */
export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Busca la clave en la cadena de respaldo. Si no está en ningún idioma, devuelve la clave (señal visible de un olvido). */
export function translate(dicts: Readonly<Partial<Record<Locale, Dict>>>, locale: Locale, key: string, params?: Record<string, string | number>): string {
  for (const l of chain(locale)) {
    const v = dicts[l]?.[key];
    if (typeof v === 'string' && v !== '') return interpolate(v, params);
  }
  return key;
}

/** Marcadores `{x}` de un texto, ordenados (para comprobar que una traducción no pierde ninguno). */
export const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
