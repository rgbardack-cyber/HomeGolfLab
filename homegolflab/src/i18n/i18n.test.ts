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
  it('R8: ningún texto de ningún idioma menciona la IA', () => {
    const re = /\b(IA|AI|KI|IAs?|inteligencia artificial|artificial intelligence|intelligence artificielle|intelligenza artificiale|人工知能|인공지능|artificiell intelligens|inteligência artificial|kunstmatige intelligentie|Claude)\b/i;
    for (const l of LOCALES) for (const [k, v] of Object.entries(DICTS[l.code])) expect({ l: l.code, k, hit: re.test(v) }).toEqual({ l: l.code, k, hit: false });
  });
});
