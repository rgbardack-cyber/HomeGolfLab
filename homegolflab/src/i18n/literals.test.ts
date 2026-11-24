/**
 * Guardas del bloque de idiomas:
 * 1. Toda clave escrita en el código con `t('…')` / `td('…')` existe en español.
 * 2. Ningún archivo de `src/pages` o `src/components` trae texto visible escrito directo (sin pasar por i18n),
 *    salvo los archivos de `PENDING_FILES` (deuda visible: cada archivo que se migra sale de esa lista) y las excepciones justificadas.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICTS } from './index';

const SRC = join(process.cwd(), 'src');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const norm = (p: string) => p.slice(SRC.length + 1).replace(/\\/g, '/');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Archivos que todavía tienen texto escrito directo. Se quitan de aquí cuando se migran; la lista solo puede achicarse. */
const PENDING_FILES = new Set<string>([
  'pages/Swing.tsx', 'pages/Tracking.tsx',
  'components/VideoFlight.tsx', 'components/VideoReview.tsx', 'components/CompareView.tsx', 'components/ExportSheet.tsx',
  'components/FlightPlayer.tsx', 'components/ConsentCard.tsx', 'components/FlagsPanel.tsx',
]);

/**
 * Excepciones justificadas (texto que NO se traduce):
 * - nombres de marca y de producto: HomeGolfLab, HomeLAB;
 * - `FlagsPanel` y `ConsentCard`: panel interno de pruebas (solo en desarrollo) y consentimiento (texto legal pendiente del abogado; ver plan-idiomas.md).
 */
const ALLOWED = new Set(['HomeGolfLab', 'HomeLAB', 'Swing', 'Ball tracking', 'H', 'XP']);

function visibleLiterals(src: string): string[] {
  const s = stripComments(src);
  const out: string[] = [];
  // Texto entre etiquetas JSX: sin llaves, sin punto y coma ni igual (eso es código genérico de TypeScript, no texto).
  for (const m of s.matchAll(/>([^<>{}=;()]*)</g)) {
    const txt = m[1].replace(/\s+/g, ' ').trim();
    // Se descartan comparaciones y accesos a propiedades (`info.cap && <Notice`), que no son texto.
    if (/[A-Za-zÁ-ÿ]{3,}/.test(txt) && !/&&|\|\||=>|\w\.\w/.test(txt)) out.push(txt);
  }
  for (const m of s.matchAll(/\b(?:title|placeholder|aria-label|alt|label|subtitle)="([^"{}]*)"/g)) {
    if (/[A-Za-zÁ-ÿ]{3,}/.test(m[1])) out.push(m[1]);
  }
  for (const m of s.matchAll(/\bset(?:Error|Notice|Msg|Message)\('([^']*)'\)/g)) out.push(m[1]);
  return out.filter((x) => !ALLOWED.has(x));
}

describe('i18n: claves usadas en el código', () => {
  it('toda t(\'clave\') y td(\'clave\') escrita en el código existe en español', () => {
    const missing: string[] = [];
    for (const f of walk(SRC)) {
      const n = norm(f);
      if (!/\.(ts|tsx)$/.test(n) || /\.test\./.test(n) || n.startsWith('i18n/')) continue;
      const s = stripComments(readFileSync(f, 'utf8'));
      for (const m of s.matchAll(/\b(?:t|td|tr)\('([a-z][A-Za-z0-9_.]*)'/g)) if (!(m[1] in DICTS.es)) missing.push(`${n}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('i18n: sin texto visible escrito directo', () => {
  const files = [...walk(join(SRC, 'pages')), ...walk(join(SRC, 'components')), join(SRC, 'App.tsx')].filter((f) => f.endsWith('.tsx'));
  it('los archivos migrados no traen texto directo', () => {
    const found: Record<string, string[]> = {};
    for (const f of files) {
      const n = norm(f);
      if (PENDING_FILES.has(n)) continue;
      const lits = visibleLiterals(readFileSync(f, 'utf8'));
      if (lits.length) found[n] = lits;
    }
    expect(found).toEqual({});
  });
  it('PENDING_FILES solo lista archivos que existen y que de verdad siguen con texto directo', () => {
    const names = new Set(files.map(norm));
    for (const p of PENDING_FILES) {
      expect({ p, existe: names.has(p) }).toEqual({ p, existe: true });
      const lits = visibleLiterals(readFileSync(join(SRC, p), 'utf8'));
      expect({ p, pendiente: lits.length > 0 }).toEqual({ p, pendiente: true });
    }
  });
});
