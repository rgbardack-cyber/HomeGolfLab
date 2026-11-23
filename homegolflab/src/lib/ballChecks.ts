/**
 * Comprobaciones puras contra falsos positivos del seguimiento (plan F5.4): ¿la mancha candidata es de verdad una bola en
 * movimiento o algo que ya estaba en el fondo?
 *
 * - `neighborCheck` (lo que Ryan hizo a mano): la mancha está presente en el cuadro t y AUSENTE en la misma posición en
 *   t−1 y t+1. Una bola que vuela salta de sitio; una rama, una mancha del pasto o un cable están en los tres cuadros.
 * - `isBackgroundFeature`: referencia del fondo tomada en el último cuadro ANTES de que la bola saliera; si el mismo
 *   contraste ya estaba ahí, la mancha es del fondo y se rechaza.
 *
 * Sin una referencia de vuelo (F5.1) no se sabe cuántas bolas reales rechazan por error: están SIN conectar al tracker y sus
 * umbrales (`minDelta`, la proporción 0,5) son [PROPUESTA].
 */
import { ballSpot, type Gray, type P2 } from './ballflight';

/** Contraste mínimo (niveles de gris) para considerar que «hay una mancha». */
export const MIN_SPOT_DELTA = 12;
/** Un cuadro vecino «tiene la mancha» si su contraste en el mismo sitio llega a esta fracción del actual. */
export const PRESENT_FRACTION = 0.5;

const spotDelta = (g: Gray, p: P2) => Math.abs(ballSpot(g, p.x, p.y, 1).delta);

/** Hay mancha en `cur` y no en `prev` ni en `next` (los tres a la misma escala; `p` en píxeles). Sin vecino, no se exige ese lado. */
export function neighborCheck(prev: Gray | null, cur: Gray, next: Gray | null, p: P2, minDelta = MIN_SPOT_DELTA): boolean {
  const c = spotDelta(cur, p);
  if (c < minDelta) return false;
  for (const g of [prev, next]) if (g && spotDelta(g, p) >= c * PRESENT_FRACTION) return false;
  return true;
}

/** ¿El contraste de `p` ya estaba en el cuadro de referencia del fondo (anterior a la salida de la bola)? */
export function isBackgroundFeature(ref: Gray, cur: Gray, p: P2, minDelta = MIN_SPOT_DELTA): boolean {
  const c = spotDelta(cur, p);
  return c >= minDelta && spotDelta(ref, p) >= c * PRESENT_FRACTION;
}
