import { describe, expect, it } from 'vitest';
import { uploadQuota } from './quota';

describe('uploadQuota (#17: la cuota no se salta reanalizando)', () => {
  const base = { premium: false, limit: 1 };

  it('gratis, sin uso y archivo nuevo: puede analizar', () => {
    expect(uploadQuota({ ...base, used: 0, analyzedThisFile: false })).toEqual({ showGate: false, canAnalyze: true });
  });

  it('gratis, límite alcanzado y archivo nuevo: puerta Premium', () => {
    expect(uploadQuota({ ...base, used: 1, analyzedThisFile: false })).toEqual({ showGate: true, canAnalyze: false });
  });

  it('gratis, ya analizado ese archivo: se ve el resultado pero el botón queda deshabilitado', () => {
    expect(uploadQuota({ ...base, used: 1, analyzedThisFile: true })).toEqual({ showGate: false, canAnalyze: false });
  });

  it('cuenta por archivo, no por clic: con un límite mayor, el mismo archivo tampoco se reanaliza', () => {
    expect(uploadQuota({ premium: false, limit: 3, used: 1, analyzedThisFile: true }).canAnalyze).toBe(false);
    expect(uploadQuota({ premium: false, limit: 3, used: 1, analyzedThisFile: false }).canAnalyze).toBe(true);
  });

  it('Premium: siempre puede analizar y nunca ve la puerta', () => {
    expect(uploadQuota({ premium: true, limit: 1, used: 9, analyzedThisFile: true })).toEqual({ showGate: false, canAnalyze: true });
  });
});
