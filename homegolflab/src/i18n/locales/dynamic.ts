import { BADGES, LEVELS } from '@/lib/badges';

/** Claves de medallas y niveles: el texto en español sigue viviendo en `lib/badges.ts` (una sola fuente) y aquí solo se indexa. */
export const badgeKey = (id: string, part: 'label' | 'desc') => `badge.${id}.${part}`;
export const levelKey = (level: number) => `level.${level}`;

export function badgeDictEs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of BADGES) { out[badgeKey(b.id, 'label')] = b.label; out[badgeKey(b.id, 'desc')] = b.description; }
  for (const l of LEVELS) out[levelKey(l.level)] = l.label;
  return out;
}
