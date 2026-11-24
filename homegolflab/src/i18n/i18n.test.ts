import { describe, expect, it } from 'vitest';
import { chain, interpolate, isLocale, LOCALES, matchLocale, pickInitial, placeholders, translate, type Locale } from './core';
import { DICTS, getLocale, setLocale, t, td } from './index';
import { BADGES, LEVELS } from '@/lib/badges';
import { badgeKey, levelKey } from './locales/dynamic';

const esKeys = Object.keys(DICTS.es);

describe('elección del idioma', () => {
  it('reconoce códigos de dispositivo', () => {
    expect(matchLocale('es-MX')).toBe('es');
    expect(matchLocale('es-CR')).toBe('es');
    expect(matchLocale('es-ES')).toBe('es-ES');
    expect(matchLocale('en-US')).toBe('en');
    expect(matchLocale('en-CA')).toBe('en');
    expect(matchLocale('en-GB')).toBe('en-GB');
    expect(matchLocale('en-AU')).toBe('en-GB');
    expect(matchLocale('de-AT')).toBe('de');
    expect(matchLocale('fr-CA')).toBe('fr');
    expect(matchLocale('pt-BR')).toBe('pt');
    expect(matchLocale('ja')).toBe('ja');
    expect(matchLocale('ko-KR')).toBe('ko');
    expect(matchLocale('zh-Hans-CN')).toBeNull();
    expect(matchLocale('xx')).toBeNull();
  });
  it('usa el guardado, luego el dispositivo, luego inglés; sin ventana se queda en español', () => {
    expect(pickInitial('de', ['fr'])).toBe('de');
    expect(pickInitial('klingon', ['it-IT'])).toBe('it');
    expect(pickInitial(null, ['zh-CN', 'sv-SE'])).toBe('sv');
    expect(pickInitial(null, ['zh-CN'])).toBe('en');
    expect(pickInitial(null, null)).toBe('es');
  });
  it('lista: cada idioma tiene nombre propio y código válido', () => {
    expect(LOCALES.length).toBeGreaterThanOrEqual(10);
    for (const l of LOCALES) { expect(isLocale(l.code)).toBe(true); expect(l.name.length).toBeGreaterThan(1); }
    expect(new Set(LOCALES.map((l) => l.code)).size).toBe(LOCALES.length);
  });
});

describe('traducción', () => {
  it('cadena de respaldo: idioma → respaldo → español', () => {
    expect(chain('de')).toEqual(['de', 'en', 'es']);
    expect(chain('en-GB')).toEqual(['en-GB', 'en', 'es']);
    expect(chain('es-ES')).toEqual(['es-ES', 'es']);
    expect(chain('es')).toEqual(['es']);
  });
  it('un texto sin traducir cae en inglés, no en español (salvo es y es-ES)', () => {
    const dicts = { es: { a: 'hola' }, en: { a: 'hello' }, de: {} } as const;
    expect(translate(dicts, 'de', 'a')).toBe('hello');
    expect(translate({ es: { a: 'hola' }, 'es-ES': {} }, 'es-ES', 'a')).toBe('hola');
    expect(translate(dicts, 'de', 'falta')).toBe('falta');
  });
  it('interpola y deja visible un marcador sin valor', () => {
    expect(interpolate('Hola, {name}', { name: 'Ana' })).toBe('Hola, Ana');
    expect(interpolate('{n} de {total}', { n: 1 })).toBe('1 de {total}');
  });
  it('cambiar de idioma cambia t() y se guarda', () => {
    expect(getLocale()).toBe('es');
    expect(t('nav.home')).toBe('Inicio');
    setLocale('de'); expect(t('nav.home')).toBe('Start'); expect(td('level.1')).toBe('Anfänger');
    setLocale('en-GB'); expect(t('unit.m')).toBe('metres'); expect(t('nav.home')).toBe('Home');
    setLocale('es');
    expect(getLocale()).toBe('es');
  });
});

describe('diccionarios', () => {
  it('es tiene las claves de medallas y niveles que salen de badges.ts', () => {
    for (const b of BADGES) { expect(DICTS.es[badgeKey(b.id, 'label')]).toBe(b.label); expect(DICTS.es[badgeKey(b.id, 'desc')]).toBe(b.description); }
    for (const l of LEVELS) expect(DICTS.es[levelKey(l.level)]).toBe(l.label);
  });
  it('inglés está completo', () => {
    const missing = esKeys.filter((k) => !DICTS.en[k]);
    expect(missing).toEqual([]);
  });
  it('todo idioma completo trae TODAS las claves del español (solo es-ES y en-GB pueden omitir: caen en su respaldo)', () => {
    const OVERRIDE_ONLY = new Set<Locale>(['es-ES', 'en-GB']);
    const faltan: Record<string, string[]> = {};
    for (const l of LOCALES) {
      if (OVERRIDE_ONLY.has(l.code)) continue;
      const m = esKeys.filter((k) => !DICTS[l.code][k]);
      if (m.length) faltan[l.code] = m;
    }
    expect(faltan).toEqual({});
  });
  it('ningún idioma tiene claves que no existan en español (evita errores de escritura)', () => {
    for (const l of LOCALES) {
      const extra = Object.keys(DICTS[l.code]).filter((k) => !(k in DICTS.es));
      expect({ idioma: l.code, extra }).toEqual({ idioma: l.code, extra: [] });
    }
  });
  it('ninguna traducción pierde ni inventa un marcador {x}, ni está vacía', () => {
    for (const l of LOCALES) {
      for (const [k, v] of Object.entries(DICTS[l.code])) {
        expect({ l: l.code, k, vacio: v.trim() === '' }).toEqual({ l: l.code, k, vacio: false });
        expect({ l: l.code, k, p: placeholders(v) }).toEqual({ l: l.code, k, p: placeholders(DICTS.es[k]) });
      }
    }
  });
  it('cobertura por idioma (informativa; el inglés es la única exigencia de completitud)', () => {
    const cov = Object.fromEntries((LOCALES.map((l) => l.code) as Locale[]).map((c) => [c, `${Object.keys(DICTS[c]).length}/${esKeys.length}`]));
    console.log('cobertura i18n', cov);
    expect(Object.keys(DICTS.en).length).toBe(esKeys.length);
  });
  it('R8: ningún texto de ningún idioma menciona la IA, salvo las claves de R8_PENDING (ya lo hacían en español; decide Ryan)', () => {
    // Textos que ya nombraban la IA ANTES de traducir. Se traducen fieles; quitarlos o no es decisión de Ryan (plan-idiomas.md, «R8 pendiente»).
    // Esta lista solo puede achicarse: una clave nueva que nombre la IA hace fallar la prueba.
    const R8_PENDING = new Set<string>(['hl.scanMeasures', 'hl.scan.errNotConfigured']);
    // Siglas en MAYÚSCULAS (sin /i: «ai» es una palabra normal en francés e italiano) y frases completas sin importar mayúsculas.
    const sigla = /(^|[^A-Za-zÁ-ÿ])(IA|AI|KI)(?![A-Za-zÁ-ÿ])/;
    const frase = /inteligencia artificial|artificial intelligence|intelligence artificielle|intelligenza artificiale|人工知能|인공지능|artificiell intelligens|inteligência artificial|kunstmatige intelligentie|claude/i;
    const re = { test: (v: string) => sigla.test(v) || frase.test(v) };
    const hits: string[] = [];
    for (const l of LOCALES) for (const [k, v] of Object.entries(DICTS[l.code])) if (!R8_PENDING.has(k) && re.test(v)) hits.push(`${l.code}:${k}`);
    expect(hits).toEqual([]);
    // Y la lista no debe quedarse con claves que ya no mencionan la IA.
    for (const k of R8_PENDING) expect({ k, aun: re.test(DICTS.es[k]) }).toEqual({ k, aun: true });
  });
});
