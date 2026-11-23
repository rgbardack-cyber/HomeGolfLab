import { beforeEach, describe, expect, it } from 'vitest';
import { markTipsShown, RECORDING_TIPS, resetTipsSession, tipsPending, type TipsArea } from './recordingTips';

const AREAS: TipsArea[] = ['swing', 'tracking'];

describe('consejos de grabación: cuándo salen', () => {
  beforeEach(() => resetTipsSession());

  it('salen la primera vez que se abre cada sección', () => {
    for (const a of AREAS) expect(tipsPending(a)).toBe(true);
  });

  it('tras cerrarlos no vuelven (salir y volver a la sección, o mandar la app al fondo y regresar)', () => {
    markTipsShown('swing');
    expect(tipsPending('swing')).toBe(false);
    expect(tipsPending('swing')).toBe(false);
  });

  it('cada sección lleva su propia cuenta: cerrar los de Swing no apaga los de Tracking', () => {
    markTipsShown('swing');
    expect(tipsPending('tracking')).toBe(true);
    markTipsShown('tracking');
    expect(tipsPending('tracking')).toBe(false);
  });

  it('al cerrar la app por completo (memoria nueva) vuelven a salir', () => {
    for (const a of AREAS) markTipsShown(a);
    resetTipsSession();
    for (const a of AREAS) expect(tipsPending(a)).toBe(true);
  });

  it('no se guardan en localStorage: reiniciar el proceso es lo único que los repite', () => {
    const src = String(markTipsShown) + String(tipsPending);
    expect(src).not.toMatch(/localStorage|sessionStorage/);
  });
});

describe('consejos de grabación: cada sección mide algo distinto', () => {
  it('son cortos: título, 3 o 4 líneas y una nota', () => {
    for (const a of AREAS) {
      const t = RECORDING_TIPS[a];
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.items.length).toBeGreaterThanOrEqual(3);
      expect(t.items.length).toBeLessThanOrEqual(4);
      expect(t.note.length).toBeGreaterThan(0);
      for (const i of [...t.items, t.note]) expect(i.length).toBeLessThanOrEqual(80);
    }
  });

  it('no comparten ninguna línea', () => {
    const s = new Set<string>([...RECORDING_TIPS.swing.items, RECORDING_TIPS.swing.note]);
    for (const i of [...RECORDING_TIPS.tracking.items, RECORDING_TIPS.tracking.note]) expect(s.has(i), i).toBe(false);
  });

  it('Swing habla de postura y cuerpo entero; Tracking de la bola y los 60 fps', () => {
    const sw = [...RECORDING_TIPS.swing.items, RECORDING_TIPS.swing.note].join(' ').toLowerCase();
    const tr = [...RECORDING_TIPS.tracking.items, RECORDING_TIPS.tracking.note].join(' ').toLowerCase();
    expect(sw).toContain('cuerpo entero'); expect(sw).toContain('postura');
    expect(tr).toContain('bola'); expect(tr).toContain('60 fps');
    expect(sw).not.toContain('bola');
  });

  it('no prometen lo que la app no mide hoy ni mencionan la IA (R8)', () => {
    const all = AREAS.flatMap((a) => [...RECORDING_TIPS[a].items, RECORDING_TIPS[a].note, RECORDING_TIPS[a].title]).join(' ').toLowerCase();
    expect(all).not.toMatch(/\bia\b|inteligencia|coach/);
    expect(RECORDING_TIPS.tracking.note.toLowerCase()).toContain('no mide distancia');
  });
});
