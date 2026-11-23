import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPlan, DRILLS, LIMITS, NO_HOME_DRILL, zones, type Gear, type Space } from './homelab';
import { HOMELAB_NOTICE_DRAFT, HOMELAB_NOTICE_ITEMS, HOMELAB_NOTICE_VERSION, HOMELAB_QUICK_ITEMS, noticeAccepted, quickNoticeVisible } from './homelabNotice';
import { useStore } from '@/store';

/** Claves de feedback que el análisis REALMENTE emite: se leen del código de swing.ts y club.ts. */
const emittedKeys = (): string[] => {
  const keys = new Set<string>();
  for (const f of ['swing.ts', 'club.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/key: '([A-Za-z-]+)', severity/g)) keys.add(m[1]);
  }
  return [...keys].sort();
};

const ALL: Gear[] = ['putter', 'wedge', 'hierros', 'red', 'matPutt', 'matGolpeo', 'foam', 'varillas', 'vaso', 'espejo'];
const full: Space = { lengthM: 5, widthM: 4, ceilingM: 3.2, floor: 'alfombra', gear: ALL };
const fixesOf = (key: string) => DRILLS.filter((d) => d.fixes?.includes(key)).map((d) => d.id);

describe('HomeLAB: feedback del análisis → ejercicio', () => {
  it('lee las claves reales del análisis (guardia contra una lectura vacía)', () => {
    expect(emittedKeys().length).toBeGreaterThanOrEqual(18);
    expect(emittedKeys()).toContain('slide');
  });

  it('cada clave que emite el análisis tiene ejercicio, o está declarada sin ejercicio en casa', () => {
    const sinEjercicio = emittedKeys().filter((k) => fixesOf(k).length === 0 && !NO_HOME_DRILL.includes(k));
    expect(sinEjercicio).toEqual([]);
  });

  it('ninguna clave de `fixes` ni de NO_HOME_DRILL es inventada (no existe en el análisis)', () => {
    const emitted = new Set(emittedKeys());
    const used = [...DRILLS.flatMap((d) => d.fixes ?? []), ...NO_HOME_DRILL];
    expect(used.filter((k) => !emitted.has(k))).toEqual([]);
  });

  it('una clave sin ejercicio no se mezcla con una que sí lo tiene', () => {
    for (const k of NO_HOME_DRILL) expect(fixesOf(k)).toEqual([]);
  });

  it('con espacio y equipo completos, el plan incluye un ejercicio que trabaja cada clave pedida', () => {
    for (const key of emittedKeys().filter((k) => !NO_HOME_DRILL.includes(k))) {
      const plan = buildPlan(full, '2026-11-24', [key]);
      expect(plan.drills.some((d) => d.fixes?.includes(key)), `clave ${key}`).toBe(true);
    }
  });

  it('el deslizamiento de caderas NO manda al «Paso al frente» (empeoraría el problema); el peso atrás sí', () => {
    expect(fixesOf('slide')).not.toContain('paso');
    expect(fixesOf('slide')).toContain('silla');
    expect(fixesOf('shift')).toContain('paso');
    expect(buildPlan(full, '2026-11-24', ['slide']).drills.map((d) => d.id)).toContain('silla');
    expect(buildPlan(full, '2026-11-24', ['shift']).drills.map((d) => d.id)).toContain('paso');
  });

  it('el aviso de postura y de agarre lleva al calentamiento «Postura y grip»', () => {
    for (const k of ['setup', 'hands', 'knees', 'club-address']) expect(buildPlan(full, '2026-11-24', [k]).drills[0].id).toBe('setup');
  });

  it('sin ejercicio para la clave, el plan se arma igual (sin error)', () => {
    const plan = buildPlan(full, '2026-11-24', ['hips']);
    expect(plan.drills.length).toBeGreaterThanOrEqual(3);
    expect(buildPlan(full, '2026-11-24', ['clave-desconocida']).drills.length).toBeGreaterThanOrEqual(3);
    expect(buildPlan(full, '2026-11-24', []).drills.length).toBeGreaterThanOrEqual(3);
  });

  it('un ejercicio que pide equipo que el usuario no tiene no se ofrece, aunque el feedback lo pida', () => {
    const sinEspejo = { ...full, gear: ALL.filter((g) => g !== 'espejo') };
    expect(buildPlan(sinEspejo, '2026-11-24', ['top']).drills.some((d) => d.id === 'espejo')).toBe(false);
  });
});

describe('HomeLAB: umbrales conservadores (R13)', () => {
  const base: Space = { lengthM: 5, widthM: 4, ceilingM: 3, floor: 'alfombra', gear: ALL };
  const swingOk = (o: Partial<Space>) => zones({ ...base, ...o })[2].ok;

  it('techo: 2,75 m es el mínimo para el swing completo', () => {
    expect(LIMITS.swingCeilingM).toBe(2.75);
    expect(swingOk({ ceilingM: 2.74 })).toBe(false);
    expect(swingOk({ ceilingM: 2.75 })).toBe(true);
    expect(swingOk({ ceilingM: 2.7 })).toBe(false); // el valor anterior ya no alcanza
  });

  it('espacio del swing, putting y chip', () => {
    expect(swingOk({ widthM: 2.9 })).toBe(false);
    expect(swingOk({ lengthM: 2.9 })).toBe(false);
    expect(zones({ ...base, lengthM: 1.9 })[0].ok).toBe(false);
    expect(zones({ ...base, lengthM: 2 })[0].ok).toBe(true);
    expect(zones({ ...base, lengthM: 2.9 })[1].ok).toBe(false);
    expect(zones({ ...base, lengthM: 3 })[1].ok).toBe(true);
  });

  it('chip: sin foam ni red no hay chip, aunque el espacio alcance', () => {
    expect(zones({ ...base, gear: ['wedge'] })[1].ok).toBe(false);
    expect(zones({ ...base, gear: ['wedge', 'foam'] })[1].ok).toBe(true);
    expect(zones({ ...base, gear: ['wedge', 'red'] })[1].ok).toBe(true);
  });

  it('los ejercicios con swing solo se ofrecen si la zona de swing es viable (techo bajo = sin swings)', () => {
    const bajo: Space = { ...base, ceilingM: 2.4 };
    expect(zones(bajo)[2].ok).toBe(false);
    for (const k of ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']) {
      const ids = buildPlan(bajo, k, ['tempo', 'spine', 'shift', 'top']).drills.map((d) => d.id);
      for (const swingy of ['tempo', 'silla', 'paso', 'espejo', 'medio', 'red']) expect(ids, `${k} ${swingy}`).not.toContain(swingy);
    }
  });

  it('la «Escalera de distancia» (1, 2 y 3 m) no se ofrece en un carril de menos de 3 m', () => {
    const putt = (lengthM: number): Space => ({ lengthM, widthM: 1, ceilingM: 2.4, floor: 'alfombra', gear: ['putter'] });
    for (const k of ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']) {
      expect(buildPlan(putt(2.5), k).drills.map((d) => d.id)).not.toContain('escalera');
    }
    const largo = ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'].some((k) => buildPlan(putt(3), k).drills.some((d) => d.id === 'escalera'));
    expect(largo).toBe(true);
  });
});

describe('HomeLAB: aviso de seguridad (R13)', () => {
  it('el texto es un borrador con revisión legal y cubre lo que pide R13', () => {
    expect(HOMELAB_NOTICE_DRAFT).toBe('BORRADOR: requiere revisión de un abogado en Costa Rica antes de publicarse.');
    const t = HOMELAB_NOTICE_ITEMS.join(' ').toLowerCase();
    expect(t).toContain('medir');
    expect(t).toContain('despeja');
    expect(t).toMatch(/foam|red/);
  });

  it('una aceptación solo vale para la versión vigente del texto', () => {
    expect(noticeAccepted(null)).toBe(false);
    expect(noticeAccepted(undefined)).toBe(false);
    expect(noticeAccepted({ acceptedAt: '2026-11-24T10:00:00.000Z', version: HOMELAB_NOTICE_VERSION })).toBe(true);
    expect(noticeAccepted({ acceptedAt: '2026-11-24T10:00:00.000Z', version: HOMELAB_NOTICE_VERSION - 1 })).toBe(false);
  });

  it('el estado guarda cuándo se aceptó y con qué versión, y «borrar mis datos» lo olvida', () => {
    useStore.getState().reset();
    expect(useStore.getState().homelabNotice).toBeNull();
    const antes = Date.now();
    useStore.getState().acceptHomelabNotice();
    const a = useStore.getState().homelabNotice!;
    expect(a.version).toBe(HOMELAB_NOTICE_VERSION);
    expect(Date.parse(a.acceptedAt)).toBeGreaterThanOrEqual(antes);
    expect(noticeAccepted(a)).toBe(true);
    useStore.getState().reset();
    expect(useStore.getState().homelabNotice).toBeNull();
  });
});

describe('HomeLAB: los mínimos se escriben sin contradecir al usuario', () => {
  it('en yardas, el mínimo del techo se redondea hacia arriba (2,75 m = 3,0 yd → «3,1 yd»)', () => {
    const bajo: Space = { lengthM: 4, widthM: 3, ceilingM: 2.7432, floor: 'alfombra', gear: ['hierros'] }; // 3,0 yd exactas: no alcanza
    expect(zones(bajo, 'yd')[2].note).toContain('mínimo 3,1 yd');
    expect(zones(bajo, 'm')[2].note).toContain('mínimo 2,75 m');
  });
});

describe('HomeLAB: recordatorio corto al analizar un espacio nuevo', () => {
  const base = { analyzingSpace: true, accepted: true, quickDismissed: false, fullOpen: false };
  it('sale cada vez que se empieza a analizar un espacio, una vez por vuelta', () => {
    expect(quickNoticeVisible(base)).toBe(true);
    expect(quickNoticeVisible({ ...base, quickDismissed: true })).toBe(false);           // ya lo cerró en esta vuelta
    expect(quickNoticeVisible({ ...base, analyzingSpace: false })).toBe(false);          // viendo el plan: no molesta
  });
  it('no se junta con el aviso completo: ni antes de aceptarlo ni mientras está abierto', () => {
    expect(quickNoticeVisible({ ...base, accepted: false })).toBe(false);
    expect(quickNoticeVisible({ ...base, fullOpen: true })).toBe(false);
  });
  it('es corto (3 líneas) y cubre medir, despejar y foam o red', () => {
    expect(HOMELAB_QUICK_ITEMS).toHaveLength(3);
    const t = HOMELAB_QUICK_ITEMS.join(' ').toLowerCase();
    expect(t).toContain('mide'); expect(t).toContain('despeja'); expect(t).toMatch(/foam|red/);
    expect(HOMELAB_QUICK_ITEMS.join(' ').length).toBeLessThan(100);
  });
});
