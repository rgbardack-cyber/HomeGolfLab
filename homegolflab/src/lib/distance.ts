/**
 * Distancia de un tiro (plan 4.7, F7; decisiones D2 y D6). Reglas de honestidad:
 * - Con un solo teléfono NO se mide la distancia de un tiro completo: el estado por defecto es «no disponible».
 * - La distancia que escribe el usuario se rotula «Medida por ti» y distingue carry (hasta donde cae) de total (hasta donde se detiene).
 * - Una estimación a partir de referencias de distancia conocida (banderas o carteles del range con su yardaje) es un PROTOTIPO interno
 *   (`flags.distanceEstimate`), con intervalo y supuestos a la vista, y se abstiene si el intervalo es demasiado ancho. Sin clips de
 *   validación (D9) no se muestra a nadie.
 * - Launch monitor: fuera de alcance (D6).
 * Todo se guarda en METROS (D2); la conversión a yardas es solo al mostrar (`lib/units.ts`).
 */
import { fmtDist, type DistUnit } from './units';
import { t } from '@/i18n';

export type DistanceKind = 'carry' | 'total';
export interface DistanceResult {
  kind: DistanceKind;
  state: 'measured_manual' | 'estimated' | 'unavailable';
  meters?: number;
  /** Intervalo de ~90 % (m) solo para estimaciones. */
  interval90Meters?: [number, number];
  method?: 'manual' | 'landing_reference' | 'launch_monitor_import';
  assumptions: string[];
}

export const KIND_LABEL: Record<DistanceKind, string> = { carry: 'Carry', total: 'Total' };
export const kindLabel = (k: DistanceKind): string => t(`dist.kind.${k}`);

export const unavailableDistance = (kind: DistanceKind = 'carry'): DistanceResult => ({ kind, state: 'unavailable', assumptions: [] });

/** Distancia escrita por el usuario (en metros ya convertidos). Devuelve null si no es un número positivo y razonable (< 600 m). */
export function manualDistance(meters: number, kind: DistanceKind): DistanceResult | null {
  if (!Number.isFinite(meters) || meters <= 0 || meters > 600) return null;
  return { kind, state: 'measured_manual', meters, method: 'manual', assumptions: [] };
}

export interface DistanceView { title: string; text: string; badge: string | null; canRegister: boolean }

/** Cómo se presenta una distancia en la interfaz. Lo manual siempre dice «Medida por ti»; lo estimado, que no está validado. */
export function distanceView(d: DistanceResult | null, unit: DistUnit): DistanceView {
  if (!d || d.state === 'unavailable') {
    return {
      title: t('dist.unavailable.title'), canRegister: true, badge: null,
      text: t('dist.unavailable.text'),
    };
  }
  const which = kindLabel(d.kind).toLowerCase();
  if (d.state === 'measured_manual') return { title: `${kindLabel(d.kind)}: ${fmtDist(d.meters!, unit)}`, text: t('dist.manualText', { kind: which }), badge: t('dist.badge.manual'), canRegister: true };
  const [lo, hi] = d.interval90Meters ?? [d.meters!, d.meters!];
  return {
    title: `${kindLabel(d.kind)}: ~${fmtDist(d.meters!, unit, 0)}`,
    text: t('dist.estimateText', { lo: fmtDist(lo, unit, 0), hi: fmtDist(hi, unit, 0), assumptions: d.assumptions.join('; ') }),
    badge: 'Estimada, no validada', canRegister: true,
  };
}

/* ───────────────────────── Estimación con referencias (prototipo F7.3) ───────────────────────── */

/** Una referencia: su altura en la imagen (y normalizada, crece hacia abajo) y su distancia conocida a la cámara/bola (m). */
export interface DistanceRef { y: number; meters: number }

export interface LandingInput {
  /** ≥ 2 referencias sobre la línea de tiro, a distintas distancias. */
  refs: DistanceRef[];
  /** y normalizada del punto de caída marcado. */
  landingY: number;
  /** Error de marcado en la imagen, en fracción del alto (p. ej. 0,006 ≈ 6 px en 1000). */
  markSigma: number;
  /** y del horizonte si el usuario lo marcó (con una sola referencia se necesita). */
  horizonY?: number | null;
  kind?: DistanceKind;
}

export interface LandingOutput { result: DistanceResult; reason?: string }

/**
 * Modelo de perspectiva 1D sobre suelo plano, con la cámara detrás de la bola mirando a lo largo de la línea de tiro (sin inclinar
 * de lado): un punto del suelo a distancia d aparece `y − yh = K / d` por debajo del horizonte, o sea d = K / (y − yh). Con ≥ 2
 * referencias se resuelven K y el horizonte yh (si hay horizonte marcado se usa); con 1 referencia hace falta el horizonte.
 *
 * El intervalo propaga el error de marcado de TODAS las marcas probando las combinaciones ±1,645·σ (cotas conservadoras, no una
 * distribución). Se ABSTIENE (`unavailable`) si: faltan datos, las referencias no separan distancias, el punto de caída queda en o sobre
 * el horizonte, el resultado sale negativo o el intervalo mide más de la mitad del valor.
 */
export function estimateFromReferences(inp: LandingInput): LandingOutput {
  const kind = inp.kind ?? 'carry';
  const fail = (reason: string): LandingOutput => ({ result: unavailableDistance(kind), reason });
  const refs = inp.refs.filter((r) => Number.isFinite(r.y) && r.meters > 0);
  if (refs.length < 1 || (refs.length < 2 && (inp.horizonY === null || inp.horizonY === undefined))) return fail('faltan referencias (≥ 2, o 1 con el horizonte marcado)');
  const solve = (ys: number[], yl: number, yhFixed: number | null): number | null => {
    let yh: number, K: number;
    if (yhFixed !== null) {
      yh = yhFixed;
      // K promedio de las referencias (mínimos cuadrados de K con yh fijo).
      const ks = refs.map((r, i) => (ys[i] - yh) * r.meters);
      K = ks.reduce((a, b) => a + b, 0) / ks.length;
    } else {
      // Con 2 referencias: d1 (y1 − yh) = d2 (y2 − yh). Con más, se usan la más cercana y la más lejana.
      const idx = refs.map((_, i) => i).sort((a, b) => refs[a].meters - refs[b].meters);
      const a = idx[0], b = idx[idx.length - 1];
      if (Math.abs(refs[a].meters - refs[b].meters) < 1e-6) return null;
      yh = (refs[a].meters * ys[a] - refs[b].meters * ys[b]) / (refs[a].meters - refs[b].meters);
      K = (ys[a] - yh) * refs[a].meters;
    }
    const dy = yl - yh;
    if (!(dy > 1e-6) || !(K > 0)) return null;
    return K / dy;
  };
  const yh0 = inp.horizonY ?? null;
  const base = solve(refs.map((r) => r.y), inp.landingY, yh0);
  if (base === null || !(base > 0) || !Number.isFinite(base)) return fail('las marcas no dan una distancia válida (¿el punto de caída está sobre el horizonte?)');
  // Propagación: ±1,645 σ en cada marca (referencias, caída y horizonte), todas las combinaciones de signo.
  const s = 1.645 * inp.markSigma;
  let lo = base, hi = base;
  const n = refs.length + 1;
  for (let mask = 0; mask < 1 << n; mask++) {
    const ys = refs.map((r, i) => r.y + ((mask >> i) & 1 ? s : -s));
    const yl = inp.landingY + ((mask >> refs.length) & 1 ? s : -s);
    for (const hs of yh0 === null ? [0] : [-s, s]) {
      const d = solve(ys, yl, yh0 === null ? null : yh0 + hs);
      if (d === null || !Number.isFinite(d)) return fail('con el error de marcado la distancia deja de estar definida: las marcas están demasiado cerca del horizonte');
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
  }
  if (hi - lo > 0.5 * base) return fail('el intervalo es demasiado ancho para mostrar una estimación');
  return {
    result: {
      kind, state: 'estimated', meters: base, interval90Meters: [lo, hi], method: 'landing_reference',
      assumptions: ['suelo plano', 'cámara detrás de la bola mirando a lo largo de la línea de tiro', 'cámara fija sin inclinación lateral', 'referencias sobre la línea de tiro'],
    },
  };
}
