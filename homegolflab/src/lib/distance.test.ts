import { describe, expect, it } from 'vitest';
import { distanceView, estimateFromReferences, manualDistance, unavailableDistance } from './distance';

/** Escena sintética: suelo plano, cámara detrás de la bola. y = yh + K / d. */
const YH = 0.4, K = 20;
const yAt = (d: number) => YH + K / d;
const refs = (...ds: number[]) => ds.map((d) => ({ y: yAt(d), meters: d }));

describe('distancia manual y estados (F7.2)', () => {
  it('por defecto la distancia no está disponible y ofrece registrarla a mano', () => {
    const v = distanceView(null, 'yd');
    expect(v.title).toBe('Distancia no disponible');
    expect(v.canRegister).toBe(true);
    expect(v.badge).toBeNull();
    expect(v.text).toMatch(/no se puede medir/);
    expect(distanceView(unavailableDistance(), 'm').title).toBe('Distancia no disponible');
  });

  it('lo que anota el usuario se rotula "Medida por ti", distingue carry y total y respeta la unidad', () => {
    const carry = manualDistance(137.16, 'carry')!, total = manualDistance(150, 'total')!;
    expect(distanceView(carry, 'yd')).toMatchObject({ title: 'Carry: 150 yd', badge: 'Medida por ti' });
    expect(distanceView(total, 'm')).toMatchObject({ title: 'Total: 150 m', badge: 'Medida por ti' });
    expect(carry).toMatchObject({ state: 'measured_manual', method: 'manual', kind: 'carry' });
  });

  it('rechaza distancias que no son un número positivo y razonable', () => {
    for (const bad of [0, -5, Number.NaN, Infinity, 601]) expect(manualDistance(bad, 'carry')).toBeNull();
    expect(manualDistance(600, 'carry')).not.toBeNull();
  });
});

describe('estimación con referencias (F7.3, prototipo)', () => {
  it('con 2 referencias y marcas exactas recupera la distancia y el horizonte', () => {
    const r = estimateFromReferences({ refs: refs(50, 100), landingY: yAt(180), markSigma: 0 });
    expect(r.result.state).toBe('estimated');
    expect(r.result.meters).toBeCloseTo(180, 6);
    expect(r.result.method).toBe('landing_reference');
    expect(r.result.assumptions).toContain('suelo plano');
  });

  it('con 1 referencia necesita el horizonte marcado; sin él se abstiene', () => {
    expect(estimateFromReferences({ refs: refs(100), landingY: yAt(150), markSigma: 0 }).result.state).toBe('unavailable');
    const r = estimateFromReferences({ refs: refs(100), landingY: yAt(150), markSigma: 0, horizonY: YH });
    expect(r.result.meters).toBeCloseTo(150, 6);
  });

  it('el intervalo crece con el error de marcado y contiene el valor verdadero', () => {
    const tight = estimateFromReferences({ refs: refs(50, 100), landingY: yAt(120), markSigma: 0.001 }).result;
    const loose = estimateFromReferences({ refs: refs(50, 100), landingY: yAt(120), markSigma: 0.004 }).result;
    expect(tight.state).toBe('estimated');
    const [tl, th] = tight.interval90Meters!, [ll, lh] = loose.interval90Meters ?? [0, 0];
    expect(tl).toBeLessThanOrEqual(120); expect(th).toBeGreaterThanOrEqual(120);
    if (loose.state === 'estimated') expect(lh - ll).toBeGreaterThan(th - tl);
  });

  it('con una caída muy lejana (cerca del horizonte) el intervalo se dispara y se abstiene en vez de dar un número', () => {
    const r = estimateFromReferences({ refs: refs(50, 100), landingY: yAt(400), markSigma: 0.01 });
    expect(r.result.state).toBe('unavailable');
    expect(r.reason).toMatch(/horizonte|ancho/);
  });

  it('el mismo tiro se estima con marcas finas y se rechaza con marcas toscas: el intervalo manda, no el valor', () => {
    const fine = estimateFromReferences({ refs: refs(50, 100), landingY: yAt(200), markSigma: 0.002 });
    expect(fine.result.state).toBe('estimated');
    const [lo, hi] = fine.result.interval90Meters!;
    expect(lo).toBeLessThan(200); expect(hi).toBeGreaterThan(200);
    expect((hi - lo) / fine.result.meters!).toBeGreaterThan(0.1);                    // incluso con 2 px de error el rango es de ±10 %: nunca un número "exacto"
    const rough = estimateFromReferences({ refs: refs(50, 100), landingY: yAt(200), markSigma: 0.006 });
    expect(rough.result.state).toBe('unavailable');
    expect(rough.reason).toMatch(/demasiado ancho/);
  });

  it('un punto de caída en o sobre el horizonte no da distancia', () => {
    expect(estimateFromReferences({ refs: refs(50, 100), landingY: YH - 0.01, markSigma: 0 }).result.state).toBe('unavailable');
    expect(estimateFromReferences({ refs: refs(50, 100), landingY: YH, markSigma: 0 }).result.state).toBe('unavailable');
  });

  it('referencias a la misma distancia no permiten resolver el horizonte', () => {
    const same = [{ y: 0.7, meters: 80 }, { y: 0.71, meters: 80 }];
    expect(estimateFromReferences({ refs: same, landingY: 0.6, markSigma: 0 }).result.state).toBe('unavailable');
  });

  it('con ruido de marcado realista (±0,3 % del alto) y la caída a 150–200 m el error medio queda bajo el 20 %', () => {
    let worst = 0, n = 0;
    for (const d of [140, 160, 180, 200]) for (const [e1, e2, e3] of [[0.003, -0.003, 0.002], [-0.002, 0.003, -0.003], [0.0, 0.002, 0.003]]) {
      const out = estimateFromReferences({ refs: [{ y: yAt(50) + e1, meters: 50 }, { y: yAt(100) + e2, meters: 100 }], landingY: yAt(d) + e3, markSigma: 0.003 }).result;
      if (out.state === 'estimated') { worst = Math.max(worst, Math.abs(out.meters! - d) / d); n++; }
    }
    expect(n).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.2);
  });

  it('presenta la estimación como "no validada" con su rango y supuestos', () => {
    const out = estimateFromReferences({ refs: refs(50, 100), landingY: yAt(120), markSigma: 0.001 }).result;
    const v = distanceView(out, 'yd');
    expect(v.badge).toBe('Estimada, no validada');
    expect(v.text).toMatch(/Estimación entre .* y .*Supuestos/);
  });
});
