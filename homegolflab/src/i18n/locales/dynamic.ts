import { RECORDING_TIPS } from '@/lib/recordingTips';
import { HOMELAB_NOTICE_DRAFT, HOMELAB_NOTICE_ITEMS, HOMELAB_NOTICE_TITLE, HOMELAB_QUICK_ITEMS, HOMELAB_QUICK_TITLE } from '@/lib/homelabNotice';
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

/** Consejos de grabación y aviso de seguridad del HomeLAB: el español sigue viviendo en sus archivos de `lib/`. */
export function noticeDictEs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const area of Object.keys(RECORDING_TIPS) as (keyof typeof RECORDING_TIPS)[]) {
    const c = RECORDING_TIPS[area];
    out[`tips.${area}.title`] = c.title;
    c.items.forEach((s, i) => { out[`tips.${area}.item.${i}`] = s; });
    out[`tips.${area}.note`] = c.note;
  }
  out['notice.draft'] = HOMELAB_NOTICE_DRAFT;
  out['notice.title'] = HOMELAB_NOTICE_TITLE;
  HOMELAB_NOTICE_ITEMS.forEach((s, i) => { out[`notice.item.${i}`] = s; });
  out['notice.quick.title'] = HOMELAB_QUICK_TITLE;
  HOMELAB_QUICK_ITEMS.forEach((s, i) => { out[`notice.quick.item.${i}`] = s; });
  return out;
}
