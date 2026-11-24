import type { Dict, Locale } from '../core';
import { shell } from './shell';
import { homelab } from './homelab';
import { drills } from './drills';
import { tracking } from './tracking';
import { swingfb } from './swingfb';
import { swing } from './swing';

/**
 * Textos por área. Cada archivo trae TODOS los idiomas juntos (cada clave con su traducción al lado: más fácil de revisar).
 * `es` es la fuente. Un idioma o `es-ES`/`en-GB` pueden omitir claves (caen en su respaldo); las demás omisiones las atrapa la prueba de cobertura.
 */
export type Area = Partial<Record<Locale, Dict>>;
export const AREAS: readonly Area[] = [shell, homelab, drills, tracking, swingfb, swing];