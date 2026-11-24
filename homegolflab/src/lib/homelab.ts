/**
 * HomeLAB: a partir del espacio y el equipo que el jugador tiene en casa, define
 * qué zonas de práctica son viables y arma una sesión diaria de 10–15 minutos.
 */

export type Floor = 'alfombra' | 'cesped' | 'duro';
export type Gear = 'putter' | 'wedge' | 'hierros' | 'red' | 'matPutt' | 'matGolpeo' | 'foam' | 'varillas' | 'vaso' | 'espejo';

export const GEAR_LABEL: Record<Gear, string> = {
  putter: 'Putter', wedge: 'Wedge', hierros: 'Hierros', red: 'Red de práctica', matPutt: 'Mat de putting',
  matGolpeo: 'Mat de golpeo', foam: 'Bolas de foam', varillas: 'Varillas de alineación', vaso: 'Vaso u hoyo de práctica', espejo: 'Espejo',
};

import { fmtDist, fromMeters, toMeters, type DistUnit } from './units';
import { t } from '@/i18n';

export interface Space { lengthM: number; widthM: number; ceilingM: number; floor: Floor; gear: Gear[] }

/**
 * Umbrales de seguridad y espacio (R13: conservadores). Justificación de cada uno en `docs/homelab-umbrales.md`.
 * El techo se sube a 2,75 m (≈ 9 pies, el mínimo que citan varias guías para un swing completo).
 */
export const LIMITS = { puttLengthM: 2, chipLengthM: 3, swingCeilingM: 2.75, swingWidthM: 3, swingLengthM: 3 } as const;

export type ZoneType = 'putt' | 'chip' | 'swing';
export interface Zone { type: ZoneType; label: string; ok: boolean; note: string }

/** `unit`: unidad con la que se ESCRIBEN las medidas en los avisos (las comparaciones siguen en metros; por defecto metros para no alterar lo ya probado). */
export function zones(s: Space, unit: DistUnit = 'm'): Zone[] {
  const d = (m: number) => fmtDist(m, unit);
  /** Un mínimo exigido se escribe redondeado hacia ARRIBA: así «mínimo 3,0 yd» nunca contradice a un techo de 3,0 yd que no alcanza. */
  const dMin = (m: number) => (unit === 'm' ? fmtDist(m, 'm', Number.isInteger(m * 10) ? 1 : 2) : fmtDist(toMeters(Math.ceil(fromMeters(m, unit) * 10 - 1e-9) / 10, unit), unit));
  const has = (g: Gear) => s.gear.includes(g);
  const puttSurface = s.floor !== 'duro' || has('matPutt');
  const putt: Zone = !has('putter')
    ? { type: 'putt', label: t('zone.putt'), ok: false, note: t('zone.putt.needPutter') }
    : s.lengthM < LIMITS.puttLengthM
      ? { type: 'putt', label: t('zone.putt'), ok: false, note: t('zone.putt.minLen', { d: dMin(LIMITS.puttLengthM) }) }
      : !puttSurface
        ? { type: 'putt', label: t('zone.putt'), ok: false, note: t('zone.putt.hardFloor') }
        : { type: 'putt', label: t('zone.putt'), ok: true, note: t('zone.putt.ok', { d: d(Math.min(s.lengthM, 6)) }) };

  const chip: Zone = !has('wedge')
    ? { type: 'chip', label: t('zone.chip'), ok: false, note: t('zone.chip.needWedge') }
    : s.lengthM < LIMITS.chipLengthM
      ? { type: 'chip', label: t('zone.chip'), ok: false, note: t('zone.chip.minLen', { d: dMin(LIMITS.chipLengthM) }) }
      : s.floor === 'duro' && !has('matGolpeo')
          ? { type: 'chip', label: t('zone.chip'), ok: false, note: t('zone.chip.hardFloor') }
          : { type: 'chip', label: t('zone.chip'), ok: true, note: has('red') ? t('zone.chip.okNet') : has('foam') ? t('zone.chip.okFoam') : t('zone.chip.okRec') };

  const clubs = has('hierros') || has('wedge');
  const swing: Zone = !clubs
    ? { type: 'swing', label: t('zone.swing'), ok: false, note: t('zone.swing.needClubs') }
    : s.ceilingM < LIMITS.swingCeilingM
      ? { type: 'swing', label: t('zone.swing'), ok: false, note: t('zone.swing.lowCeiling', { d: d(s.ceilingM), min: dMin(LIMITS.swingCeilingM) }) }
      : s.widthM < LIMITS.swingWidthM || s.lengthM < LIMITS.swingLengthM
        ? { type: 'swing', label: t('zone.swing'), ok: false, note: t('zone.swing.minArea', { w: dMin(LIMITS.swingWidthM), l: dMin(LIMITS.swingLengthM) }) }
        : { type: 'swing', label: t('zone.swing'), ok: true, note: has('red') ? t('zone.swing.okNet') : t('zone.swing.okNoBall') };
  return [putt, chip, swing];
}

export interface Drill {
  id: string; name: string; description: string; minutes: number; target: string; cue: string;
  zone: ZoneType | 'libre'; needs: Gear[]; kind: 'calentamiento' | 'principal' | 'cierre';
  fixes?: string[]; // claves de feedback del análisis de swing que este ejercicio trabaja
  minLengthM?: number; // largo libre mínimo que pide el ejercicio (si no se indica, basta el de la zona)
}

export const DRILLS: Drill[] = [
  { id: 'setup', kind: 'calentamiento', zone: 'libre', needs: [], minutes: 2, name: 'Postura y grip', target: '3 repeticiones de 10 segundos', cue: 'Presión de grip 4 de 10.', description: 'Colócate en posición de inicio, revisa grip, ancho de pies y posición de bola. Mantén 10 segundos.', fixes: ['setup', 'hands', 'knees', 'club-address'] },
  { id: 'rotacion', kind: 'calentamiento', zone: 'libre', needs: [], minutes: 2, name: 'Rotaciones de tronco', target: '10 por lado', cue: 'Gira desde el pecho, no desde los brazos.', description: 'Cruza los brazos sobre el pecho en postura de golf y gira a cada lado de forma controlada.', fixes: ['shoulders'] },
  { id: 'espejo', kind: 'principal', zone: 'swing', needs: ['espejo'], minutes: 3, name: 'Subida frente al espejo', target: '12 subidas lentas', cue: 'Brazo guía largo, cabeza quieta.', description: 'Frente al espejo, sube lento hasta el tope y revisa giro de hombros y posición de la cabeza.', fixes: ['head', 'arm', 'shoulders', 'top', 'depth', 'height'] },
  { id: 'tempo', kind: 'principal', zone: 'swing', needs: [], minutes: 3, name: 'Tempo 3 a 1', target: '15 swings sin bola', cue: '"Uno-dos-tres… ya".', description: 'Swings de práctica contando tres tiempos en la subida y uno en la bajada. Sin bola.', fixes: ['tempo'] },
  { id: 'silla', kind: 'principal', zone: 'swing', needs: [], minutes: 3, name: 'Cadera a la silla', target: '10 swings a media velocidad', cue: 'No pierdas el contacto con la silla.', description: 'Coloca una silla tocando tu cadera por detrás y haz swings lentos sin separarte de ella.', fixes: ['spine', 'extension', 'hipsTop', 'sway', 'slide'] },
  { id: 'paso', kind: 'principal', zone: 'swing', needs: [], minutes: 3, name: 'Paso al frente', target: '10 repeticiones', cue: 'El peso llega antes que las manos.', description: 'Inicia la bajada dando un pequeño paso con el pie guía hacia el objetivo.', fixes: ['shift'] },
  { id: 'gate', kind: 'principal', zone: 'putt', needs: ['putter'], minutes: 4, name: 'Puerta de putting', target: '3 series de 10 putts', cue: 'Ojos sobre la bola.', description: 'Coloca dos objetos formando una puerta apenas más ancha que la cabeza del putter y pasa sin tocarlos.' },
  { id: 'escalera', kind: 'principal', zone: 'putt', needs: ['putter'], minutes: 4, minLengthM: 3, name: 'Escalera de distancia', target: '3 vueltas', cue: 'Mismo ritmo, distinta amplitud.', description: 'Putts a 1, 2 y 3 metros de forma consecutiva. Si fallas la distancia por más de un palmo, reinicia la vuelta.' },
  { id: 'reloj', kind: 'principal', zone: 'putt', needs: ['putter', 'vaso'], minutes: 4, name: 'Reloj de 1 metro', target: '8 seguidos', cue: 'Acelera a través de la bola.', description: 'Putts de 1 metro al vaso desde 4 posiciones alrededor. Objetivo: 8 embocados seguidos.' },
  { id: 'unamano', kind: 'principal', zone: 'putt', needs: ['putter'], minutes: 3, name: 'Putt a una mano', target: '10 por mano', cue: 'Los hombros mueven el putter.', description: 'Putts cortos solo con la mano guía y luego solo con la otra, para sentir la cara del putter.' },
  { id: 'chipTarget', kind: 'principal', zone: 'chip', needs: ['wedge'], minutes: 4, name: 'Chip al objetivo', target: '3 rondas de 10', cue: 'Peso adelante, manos por delante.', description: 'Chips a un objetivo a 2–3 metros (toalla o vaso). Cuenta cuántos caen a menos de un palmo.' },
  { id: 'chipLanding', kind: 'principal', zone: 'chip', needs: ['wedge'], minutes: 4, name: 'Punto de aterrizaje', target: '15 chips', cue: 'Mira dónde cae, no dónde termina.', description: 'Marca un punto de caída a 1.5 m y aterriza la bola sobre él. Varía la altura con la posición de bola.' },
  { id: 'medio', kind: 'principal', zone: 'swing', needs: [], minutes: 4, name: 'Medio swing controlado', target: '15 swings', cue: 'Termina equilibrado 3 segundos.', description: 'Swings de 9 a 3 (brazos paralelos al suelo a cada lado) manteniendo el equilibrio en el final.', fixes: ['spine', 'shift', 'club-top'] },
  { id: 'red', kind: 'principal', zone: 'swing', needs: ['red'], minutes: 4, name: 'Contacto a la red', target: '15 bolas', cue: 'Bola primero, suelo después.', description: 'Golpes al 70 % hacia la red concentrándote solo en la calidad del contacto.' },
  { id: 'cierre', kind: 'cierre', zone: 'libre', needs: [], minutes: 1, name: 'Estiramiento final', target: '10 rotaciones por lado', cue: 'Exhala en cada giro.', description: 'De pie, brazos cruzados, rota lento a cada lado y suelta hombros y cadera.' },
];

/** Claves de feedback que hoy NO tienen ejercicio en casa (se explica en `docs/homelab-umbrales.md`). Una prueba exige que toda clave nueva del análisis esté aquí o en algún `fixes`. */
export const NO_HOME_DRILL: readonly string[] = ['hips'];

export interface PlanDrill extends Drill { done: boolean }
/** `themeKey` (planes nuevos) permite mostrar el tema en el idioma elegido; los planes viejos guardados solo traen `theme`. */
export interface Plan { date: string; theme: string; themeKey?: ZoneType | 'libre'; minutes: number; drills: PlanDrill[]; note: string }

const THEMES: Record<ZoneType | 'libre', string> = { putt: 'Día de putting', chip: 'Día de juego corto', swing: 'Día de swing', libre: 'Fundamentos y sensaciones' };

/**
 * Genera la sesión del día. Es determinista para una fecha dada: el mismo día devuelve el
 * mismo plan, y cada día rota el enfoque entre las zonas disponibles.
 */
export function buildPlan(space: Space, dateISO: string, focusKeys: string[] = [], unit: DistUnit = 'm'): Plan {
  const zs = zones(space, unit);
  const okZones = zs.filter((z) => z.ok).map((z) => z.type);
  const day = Math.floor(new Date(dateISO + 'T12:00:00').getTime() / 86400000);
  const focusZone: ZoneType | 'libre' = okZones.length ? okZones[day % okZones.length] : 'libre';
  const usable = (d: Drill) => d.needs.every((g) => space.gear.includes(g)) && (d.zone === 'libre' || okZones.includes(d.zone)) && space.lengthM >= (d.minLengthM ?? 0);

  const rot = <T,>(arr: T[], k: number) => (arr.length ? arr.map((_, i) => arr[(i + k) % arr.length]) : arr);
  const warms = rot(DRILLS.filter((d) => d.kind === 'calentamiento' && usable(d)), day);
  const warm = warms.find((d) => focusKeys.some((k) => d.fixes?.includes(k))) ?? warms[0];
  const cool = DRILLS.find((d) => d.kind === 'cierre')!;
  const main = DRILLS.filter((d) => d.kind === 'principal' && usable(d));

  const picked: Drill[] = [];
  const take = (d?: Drill) => { if (d && !picked.includes(d)) picked.push(d); };
  // 1) lo que el último análisis de swing pidió trabajar
  for (const k of focusKeys) { take(main.find((d) => d.fixes?.includes(k) && !picked.includes(d))); if (picked.length >= 1) break; }
  // 2) ejercicios de la zona del día
  for (const d of rot(main.filter((m) => m.zone === focusZone), day)) { if (picked.length < 3) take(d); }
  // 3) completar con otras zonas
  for (const d of rot(main, day)) { if (picked.length < 3) take(d); }

  const drills = [warm, ...picked, cool].filter(Boolean).map((d) => ({ ...d, done: false }));
  const minutes = drills.reduce((s, d) => s + d.minutes, 0);
  return { date: dateISO, theme: THEMES[focusZone], themeKey: focusZone, minutes, drills, note: planNote(space, unit) };
}

/** Nota del plan (tamaño del espacio y lo que no se puede hacer hoy), escrita en el idioma actual. Se calcula al mostrar, no se guarda. */
export function planNote(space: Space, unit: DistUnit = 'm'): string {
  const blocked = zones(space, unit).filter((z) => !z.ok);
  return t('plan.space', { l: fmtDist(space.lengthM, unit), w: fmtDist(space.widthM, unit) }) + (blocked.length ? t('plan.blocked', { list: blocked.map((b) => b.label.toLowerCase()).join(', ') }) : '.');
}
