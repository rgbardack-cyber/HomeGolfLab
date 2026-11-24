/**
 * Coach con IA: la app envía al servidor tres fotos del swing (inicio, tope e impacto) y las
 * medidas que ya calculó, y el servidor (visión de Claude) devuelve lo que un coach vería en ellas.
 *
 * Es lo que cubre "todo lo que capture la cámara": las reglas de swing.ts solo miden lo que alguien
 * programó; aquí el modelo comenta también el grip, el palo o la alineación. A cambio necesita
 * servidor y cuesta por uso, así que se pide a mano y es de Premium.
 */
import { getLocale } from '@/i18n';
import type { SwingResult } from './swing';

export type Position = 'inicio' | 'tope' | 'impacto';
export const POSITION_LABEL: Record<Position, string> = { inicio: 'Inicio', tope: 'Tope', impacto: 'Impacto' };

export interface CoachImage { position: Position; media_type: 'image/jpeg'; data: string }

export interface CoachResult {
  usable: boolean;
  summary: string;
  strengths: string[];
  priorities: { title: string; why: string; drill: string }[];
  observations: { position: Position; note: string }[];
  disagreements: string[];
  limits: string;
  confidence: 'alta' | 'media' | 'baja';
}

export interface CoachPayload {
  /** Idioma de la app: el servidor escribe la respuesta en él. */
  language?: string;
  images: CoachImage[];
  view: 'frente' | 'atras';
  lefty?: boolean;
  score: number;
  metrics: Record<string, string>;
  findings: string[];
  notes?: string;
}

const API = import.meta.env?.VITE_API_URL ?? '';
const SEVERITY = { fix: 'Corregir', improve: 'Mejorar', good: 'Bien' } as const;

/** Arma lo que se le cuenta al coach: las medidas con nombre legible y lo que la app ya dijo. */
export function coachPayload(r: SwingResult, images: CoachImage[], notes?: string): CoachPayload {
  const metrics: Record<string, string> = {};
  const put = (label: string, value: number | null | undefined, unit = '') => { if (value != null && Number.isFinite(value)) metrics[label] = `${value}${unit}`; };
  if (r.view === 'atras') {
    const m = r.metrics;
    metrics['Tempo (aproximado desde atrás)'] = `${m.tempoRatio}:1`;
    put('Inclinación del tronco al inicio', m.spineAddressDeg, '°');
    put('Flexión de rodillas al inicio', m.kneeFlexDeg, '°');
    put('Cambio de inclinación en el tope', m.spineTopChangeDeg, '°');
    put('Cambio de inclinación en el impacto', m.spineImpactChangeDeg, '°');
    put('Caderas hacia la bola en el impacto', m.hipAdvancePct, '% del torso');
    put('Movimiento vertical de la cabeza', m.headVerticalPct, '% del torso');
    put('Manos por delante de los hombros al inicio', m.handsAddressPct, '% del torso');
    put('Altura de las manos sobre los hombros en el tope', m.handsTopPct, '% del torso');
    put('Manos detrás de los hombros en el tope', m.handsDepthTopPct, '% del torso');
  } else {
    const m = r.metrics;
    metrics['Tempo (subida:bajada)'] = `${m.tempoRatio}:1`;
    put('Giro de hombros en el tope', m.shoulderTurnDeg, '°');
    put('Giro de caderas en el tope', m.hipTurnDeg, '°');
    put('Cambio de postura en el impacto', m.spineChangeDeg, '°');
    put('Movimiento lateral de la cabeza', m.headSwayPct, '% del ancho de hombros');
    put('Avance de la cadera hacia el objetivo', m.hipShiftPct, '% del ancho de hombros');
    put('Codo del brazo guía en el tope', m.leadArmDeg, '° (180 = recto)');
    put('Manos respecto al centro del cuerpo al inicio', m.handsAddressPct, '% del ancho de hombros');
    put('Altura de las manos sobre los hombros en el tope', m.handsTopPct, '% del torso');
  }
  // Muñecas (experimental): ángulo entre antebrazo y mano; el coach las contrasta con las fotos.
  const wr = r.metrics;
  put('Muñeca guía al inicio, 180 = mano alineada con el antebrazo (experimental)', wr.leadWristAddressDeg, '°');
  put('Muñeca guía en el tope (experimental)', wr.leadWristTopDeg, '°');
  put('Muñeca trasera en el tope (experimental)', wr.trailWristTopDeg, '°');
  // La lectura del palo es experimental: se le dice al coach para que la contraste con la foto.
  put('Varilla al inicio, respecto a la vertical (lectura experimental)', r.club?.addressLeanDeg, '°');
  put('Varilla con el suelo al inicio (lectura experimental)', r.club?.addressPlaneDeg, '°');
  put('Palo en el tope, 0 = paralelo al suelo (lectura experimental)', r.club?.topDeg, '°');
  return {
    images,
    view: r.view ?? 'frente',
    lefty: r.lefty,
    score: r.score,
    metrics,
    findings: r.feedback.slice(0, 12).map((f) => `${SEVERITY[f.severity]}: ${f.title}`.slice(0, 120)),
    notes: notes?.trim().slice(0, 300) || undefined,
  };
}

const POSITIONS: Position[] = ['inicio', 'tope', 'impacto'];
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = <T>(v: unknown, max: number, map: (x: unknown) => T | null): T[] =>
  (Array.isArray(v) ? v : []).map(map).filter((x): x is T => x != null).slice(0, max);

/** Limpia la respuesta del servidor; nunca se confía en los valores tal cual llegan. */
export function coachInfo(raw: unknown): CoachResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (max: number) => (x: unknown) => text(x, max) || null;
  return {
    usable: r.usable === true,
    summary: text(r.summary, 700),
    strengths: list(r.strengths, 3, str(300)),
    priorities: list(r.priorities, 3, (x) => {
      const p = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      const title = text(p.title, 120);
      return title ? { title, why: text(p.why, 400), drill: text(p.drill, 400) } : null;
    }),
    observations: list(r.observations, 6, (x) => {
      const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      const note = text(o.note, 400);
      return note && POSITIONS.includes(o.position as Position) ? { position: o.position as Position, note } : null;
    }),
    disagreements: list(r.disagreements, 5, str(300)),
    limits: text(r.limits, 500),
    confidence: r.confidence === 'alta' || r.confidence === 'media' ? r.confidence : 'baja',
  };
}

export class CoachError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

export async function askCoach(payload: CoachPayload): Promise<CoachResult> {
  let res: Response;
  try {
    res = await fetch(`${API}/api/swing/coach`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, language: getLocale() }) });
  } catch {
    throw new CoachError('No hay conexión con el coach con IA. Revisa tu internet.', 'offline');
  }
  const body = await res.json().catch(() => null);
  // Sin servidor (por ejemplo, en la versión de prueba publicada en GitHub Pages) /api responde 404 con una página, no con JSON.
  if (res.status === 404 || res.status === 405 || (!res.ok && !body)) throw new CoachError('Esta versión de prueba no incluye el coach con IA.', 'not_configured');
  if (!res.ok) throw new CoachError(body?.error ?? 'El análisis con IA falló. Inténtalo de nuevo.', body?.code ?? (res.status >= 500 ? 'unavailable' : undefined));
  return coachInfo(body);
}
