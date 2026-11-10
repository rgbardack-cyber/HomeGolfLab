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

export interface Space { lengthM: number; widthM: number; ceilingM: number; floor: Floor; gear: Gear[] }

export type ZoneType = 'putt' | 'chip' | 'swing';
export interface Zone { type: ZoneType; label: string; ok: boolean; note: string }

export function zones(s: Space): Zone[] {
  const has = (g: Gear) => s.gear.includes(g);
  const puttSurface = s.floor !== 'duro' || has('matPutt');
  const putt: Zone = !has('putter')
    ? { type: 'putt', label: 'Putting', ok: false, note: 'Necesitas un putter.' }
    : s.lengthM < 2
      ? { type: 'putt', label: 'Putting', ok: false, note: 'Hace falta al menos 2 m libres de largo.' }
      : !puttSurface
        ? { type: 'putt', label: 'Putting', ok: false, note: 'En piso duro la bola no rueda bien: usa un mat de putting o una alfombra.' }
        : { type: 'putt', label: 'Putting', ok: true, note: `Carril de ${Math.min(s.lengthM, 6).toFixed(1)} m.` };

  const chipSafe = has('foam') || has('red');
  const chip: Zone = !has('wedge')
    ? { type: 'chip', label: 'Chip', ok: false, note: 'Necesitas un wedge.' }
    : s.lengthM < 3
      ? { type: 'chip', label: 'Chip', ok: false, note: 'Hace falta al menos 3 m de largo.' }
      : !chipSafe
        ? { type: 'chip', label: 'Chip', ok: false, note: 'Por seguridad, usa bolas de foam o una red.' }
        : s.floor === 'duro' && !has('matGolpeo')
          ? { type: 'chip', label: 'Chip', ok: false, note: 'En piso duro necesitas un mat de golpeo.' }
          : { type: 'chip', label: 'Chip', ok: true, note: has('red') ? 'Hacia la red.' : 'Con bolas de foam a un objetivo.' };

  const clubs = has('hierros') || has('wedge');
  const swing: Zone = !clubs
    ? { type: 'swing', label: 'Swing completo', ok: false, note: 'Necesitas hierros o un wedge.' }
    : s.ceilingM < 2.7
      ? { type: 'swing', label: 'Swing completo', ok: false, note: `Techo de ${s.ceilingM} m: muy bajo para un swing completo (mínimo 2.7 m).` }
      : s.widthM < 3 || s.lengthM < 3
        ? { type: 'swing', label: 'Swing completo', ok: false, note: 'Hace falta un espacio libre de 3 × 3 m.' }
        : { type: 'swing', label: 'Swing completo', ok: true, note: has('red') ? 'Con bola hacia la red.' : 'Sin bola (swings de práctica).' };
  return [putt, chip, swing];
}

export interface Drill {
  id: string; name: string; description: string; minutes: number; target: string; cue: string;
  zone: ZoneType | 'libre'; needs: Gear[]; kind: 'calentamiento' | 'principal' | 'cierre';
  fixes?: string[]; // claves de feedback del análisis de swing que este ejercicio trabaja
}

export const DRILLS: Drill[] = [
  { id: 'setup', kind: 'calentamiento', zone: 'libre', needs: [], minutes: 2, name: 'Postura y grip', target: '3 repeticiones de 10 segundos', cue: 'Presión de grip 4 de 10.', description: 'Colócate en posición de inicio, revisa grip, ancho de pies y posición de bola. Mantén 10 segundos.' },
  { id: 'rotacion', kind: 'calentamiento', zone: 'libre', needs: [], minutes: 2, name: 'Rotaciones de tronco', target: '10 por lado', cue: 'Gira desde el pecho, no desde los brazos.', description: 'Cruza los brazos sobre el pecho en postura de golf y gira a cada lado de forma controlada.', fixes: ['shoulders'] },
  { id: 'espejo', kind: 'principal', zone: 'libre', needs: ['espejo'], minutes: 3, name: 'Subida frente al espejo', target: '12 subidas lentas', cue: 'Brazo guía largo, cabeza quieta.', description: 'Frente al espejo, sube lento hasta el tope y revisa giro de hombros y posición de la cabeza.', fixes: ['head', 'arm', 'shoulders'] },
  { id: 'tempo', kind: 'principal', zone: 'libre', needs: [], minutes: 3, name: 'Tempo 3 a 1', target: '15 swings sin bola', cue: '"Uno-dos-tres… ya".', description: 'Swings de práctica contando tres tiempos en la subida y uno en la bajada. Sin bola.', fixes: ['tempo'] },
  { id: 'silla', kind: 'principal', zone: 'libre', needs: [], minutes: 3, name: 'Cadera a la silla', target: '10 swings a media velocidad', cue: 'No pierdas el contacto con la silla.', description: 'Coloca una silla tocando tu cadera por detrás y haz swings lentos sin separarte de ella.', fixes: ['spine'] },
  { id: 'paso', kind: 'principal', zone: 'libre', needs: [], minutes: 3, name: 'Paso al frente', target: '10 repeticiones', cue: 'El peso llega antes que las manos.', description: 'Inicia la bajada dando un pequeño paso con el pie guía hacia el objetivo.', fixes: ['shift'] },
  { id: 'gate', kind: 'principal', zone: 'putt', needs: ['putter'], minutes: 4, name: 'Puerta de putting', target: '3 series de 10 putts', cue: 'Ojos sobre la bola.', description: 'Coloca dos objetos formando una puerta apenas más ancha que la cabeza del putter y pasa sin tocarlos.' },
  { id: 'escalera', kind: 'principal', zone: 'putt', needs: ['putter'], minutes: 4, name: 'Escalera de distancia', target: '3 vueltas', cue: 'Mismo ritmo, distinta amplitud.', description: 'Putts a 1, 2 y 3 metros de forma consecutiva. Si fallas la distancia por más de un palmo, reinicia la vuelta.' },
  { id: 'reloj', kind: 'principal', zone: 'putt', needs: ['putter', 'vaso'], minutes: 4, name: 'Reloj de 1 metro', target: '8 seguidos', cue: 'Acelera a través de la bola.', description: 'Putts de 1 metro al vaso desde 4 posiciones alrededor. Objetivo: 8 embocados seguidos.' },
  { id: 'unamano', kind: 'principal', zone: 'putt', needs: ['putter'], minutes: 3, name: 'Putt a una mano', target: '10 por mano', cue: 'Los hombros mueven el putter.', description: 'Putts cortos solo con la mano guía y luego solo con la otra, para sentir la cara del putter.' },
  { id: 'chipTarget', kind: 'principal', zone: 'chip', needs: ['wedge'], minutes: 4, name: 'Chip al objetivo', target: '3 rondas de 10', cue: 'Peso adelante, manos por delante.', description: 'Chips a un objetivo a 2–3 metros (toalla o vaso). Cuenta cuántos caen a menos de un palmo.' },
  { id: 'chipLanding', kind: 'principal', zone: 'chip', needs: ['wedge'], minutes: 4, name: 'Punto de aterrizaje', target: '15 chips', cue: 'Mira dónde cae, no dónde termina.', description: 'Marca un punto de caída a 1.5 m y aterriza la bola sobre él. Varía la altura con la posición de bola.' },
  { id: 'medio', kind: 'principal', zone: 'swing', needs: [], minutes: 4, name: 'Medio swing controlado', target: '15 swings', cue: 'Termina equilibrado 3 segundos.', description: 'Swings de 9 a 3 (brazos paralelos al suelo a cada lado) manteniendo el equilibrio en el final.', fixes: ['spine', 'shift'] },
  { id: 'red', kind: 'principal', zone: 'swing', needs: ['red'], minutes: 4, name: 'Contacto a la red', target: '15 bolas', cue: 'Bola primero, suelo después.', description: 'Golpes al 70 % hacia la red concentrándote solo en la calidad del contacto.' },
  { id: 'cierre', kind: 'cierre', zone: 'libre', needs: [], minutes: 1, name: 'Estiramiento final', target: '10 rotaciones por lado', cue: 'Exhala en cada giro.', description: 'De pie, brazos cruzados, rota lento a cada lado y suelta hombros y cadera.' },
];

export interface PlanDrill extends Drill { done: boolean }
export interface Plan { date: string; theme: string; minutes: number; drills: PlanDrill[]; note: string }

const THEMES: Record<ZoneType | 'libre', string> = { putt: 'Día de putting', chip: 'Día de juego corto', swing: 'Día de swing', libre: 'Fundamentos y sensaciones' };

/**
 * Genera la sesión del día. Es determinista para una fecha dada: el mismo día devuelve el
 * mismo plan, y cada día rota el enfoque entre las zonas disponibles.
 */
export function buildPlan(space: Space, dateISO: string, focusKeys: string[] = []): Plan {
  const zs = zones(space);
  const okZones = zs.filter((z) => z.ok).map((z) => z.type);
  const day = Math.floor(new Date(dateISO + 'T12:00:00').getTime() / 86400000);
  const focusZone: ZoneType | 'libre' = okZones.length ? okZones[day % okZones.length] : 'libre';
  const usable = (d: Drill) => d.needs.every((g) => space.gear.includes(g)) && (d.zone === 'libre' || okZones.includes(d.zone));

  const rot = <T,>(arr: T[], k: number) => (arr.length ? arr.map((_, i) => arr[(i + k) % arr.length]) : arr);
  const warm = rot(DRILLS.filter((d) => d.kind === 'calentamiento' && usable(d)), day)[0];
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
  const blocked = zs.filter((z) => !z.ok);
  return {
    date: dateISO, theme: THEMES[focusZone], minutes, drills,
    note: `Espacio de ${space.lengthM} × ${space.widthM} m` + (blocked.length ? `. No disponible hoy: ${blocked.map((b) => b.label.toLowerCase()).join(', ')}.` : '.'),
  };
}
