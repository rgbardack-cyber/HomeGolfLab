/**
 * Unidades de distancia (plan 4.7 y F7.1; decisión D2 de Ryan): YARDAS por defecto para distancias de tiro, putts y espacios;
 * el usuario puede cambiar a metros en Perfil. Todo se GUARDA siempre en metros (compatibilidad con `Shot.carryM`,
 * `Space.lengthM`…) y se convierte solo al mostrar o al leer lo que el usuario escribe. 1 yarda = 0,9144 m exacto.
 */
import { fmtNumber, t } from '@/i18n';
export type DistUnit = 'yd' | 'm';
export const DEFAULT_UNIT: DistUnit = 'yd';
export const YD_M = 0.9144;
/** Texto en español (idioma base). En pantalla se usa `unitLabel()`, que respeta el idioma elegido. */
export const UNIT_LABEL: Record<DistUnit, string> = { yd: 'yardas', m: 'metros' };
export const unitLabel = (u: DistUnit): string => t(u === 'yd' ? 'unit.yd' : 'unit.m');
export const UNIT_SHORT: Record<DistUnit, string> = { yd: 'yd', m: 'm' };

export const mToYd = (m: number): number => m / YD_M;
export const ydToM = (yd: number): number => yd * YD_M;

/** Metros guardados → número en la unidad elegida (sin redondear). */
export const fromMeters = (m: number, u: DistUnit): number => (u === 'yd' ? mToYd(m) : m);
/** Lo que escribió el usuario (en su unidad) → metros para guardar. */
export const toMeters = (v: number, u: DistUnit): number => (u === 'yd' ? ydToM(v) : v);

const comma = (n: number, d: number) => fmtNumber(n, d);

/**
 * Texto de una distancia guardada en metros: «12,3 yd» / «11,2 m». Redondeo a 1 decimal (o entero desde 100); con `d` se fuerza.
 * Un valor no finito se muestra como «—» en vez de «NaN».
 */
export function fmtDist(m: number, u: DistUnit, d?: number): string {
  if (!Number.isFinite(m)) return '—';
  const v = fromMeters(m, u);
  const dec = d ?? (Math.abs(v) >= 100 ? 0 : 1);
  return `${comma(v, dec)} ${UNIT_SHORT[u]}`;
}

/** Desvío lateral: «centro» si es casi nulo; si no, en la unidad elegida (2 decimales bajo 1, 1 decimal desde 1) y con el lado. */
export function fmtLateral(m: number, u: DistUnit): string {
  if (!Number.isFinite(m) || Math.abs(m) < 0.005) return t('unit.center');
  const v = Math.abs(fromMeters(m, u));
  return `${comma(v, v < 1 ? 2 : 1)} ${UNIT_SHORT[u]} ${m > 0 ? t('unit.right') : t('unit.left')}`;
}

/** Valor para un campo numérico en la unidad elegida (para mostrar lo guardado): 1 decimal sin ceros sobrantes. */
export function inputValue(m: number, u: DistUnit): string {
  const v = Math.round(fromMeters(m, u) * 10) / 10;
  return String(v);
}

/** Lee lo que escribió el usuario ("12,5" o "12.5") y lo pasa a metros; null si no es un número positivo. */
export function parseToMeters(text: string, u: DistUnit): number | null {
  const n = parseFloat(text.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? toMeters(n, u) : null;
}

/** Interpreta cualquier valor guardado como unidad válida (datos viejos o corruptos → la predeterminada). */
export const asUnit = (v: unknown): DistUnit => (v === 'm' || v === 'yd' ? v : DEFAULT_UNIT);
