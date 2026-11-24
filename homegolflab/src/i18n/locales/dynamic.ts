import { RECORDING_TIPS } from '@/lib/recordingTips';
import { HOMELAB_NOTICE_ITEMS, HOMELAB_NOTICE_TITLE, HOMELAB_QUICK_ITEMS, HOMELAB_QUICK_TITLE } from '@/lib/homelabNotice';
import { BADGES, LEVELS } from '@/lib/badges';
import { DRILLS, GEAR_LABEL } from '@/lib/homelab';
import { CONSENT_CHECKBOX_TEXT, CONSENT_DRAFT, CONSENT_NOTE, CONSENT_TITLE } from '@/lib/consent';

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
  out['notice.title'] = HOMELAB_NOTICE_TITLE;
  HOMELAB_NOTICE_ITEMS.forEach((s, i) => { out[`notice.item.${i}`] = s; });
  out['notice.quick.title'] = HOMELAB_QUICK_TITLE;
  HOMELAB_QUICK_ITEMS.forEach((s, i) => { out[`notice.quick.item.${i}`] = s; });
  return out;
}

/** Equipo y ejercicios del HomeLAB: el español sigue en `lib/homelab.ts`. */
export function homelabDictEs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [g, label] of Object.entries(GEAR_LABEL)) out[`gear.${g}`] = label;
  for (const d of DRILLS) {
    out[`drill.${d.id}.name`] = d.name; out[`drill.${d.id}.desc`] = d.description;
    out[`drill.${d.id}.target`] = d.target; out[`drill.${d.id}.cue`] = d.cue;
  }
  return out;
}

/** Consentimiento de datos (R9): el español sigue en lib/consent.ts. Es la traducción de un BORRADOR pendiente del abogado. */
export function consentDictEs(): Record<string, string> {
  return { 'consent.draft': CONSENT_DRAFT, 'consent.title': CONSENT_TITLE, 'consent.checkbox': CONSENT_CHECKBOX_TEXT, 'consent.note': CONSENT_NOTE };
}
