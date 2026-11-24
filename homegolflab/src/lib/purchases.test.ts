import { describe, expect, it } from 'vitest';
import { EARLY_ADOPTER_CAP, EARLY_ADOPTER_PRICE_USD, PURCHASES_ENABLED } from './plans';

describe('compra de Premium (apagada hasta publicar)', () => {
  it('no cobra nada: PURCHASES_ENABLED está apagada', () => {
    expect(PURCHASES_ENABLED).toBe(false);
  });
  it('el precio y el tope siguen las decisiones de Ryan (R8, 24 nov 2026)', () => {
    expect(EARLY_ADOPTER_PRICE_USD).toBe(119.99);
    expect(EARLY_ADOPTER_CAP).toBe(1000);
  });
});
