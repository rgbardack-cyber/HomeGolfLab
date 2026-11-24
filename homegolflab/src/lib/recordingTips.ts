/**
 * Consejos para grabar, uno por sección: cada parte de la app mide algo distinto, así que cada una tiene los suyos.
 *
 * Cuándo salen: la primera vez que se abre la sección DESDE QUE SE ABRIÓ LA APP. La memoria es solo del proceso (una variable del
 * módulo, no localStorage): si la app se manda al fondo y vuelve, no se repite; si se cierra por completo, vuelve a salir.
 */
export type TipsArea = 'swing' | 'tracking';

export interface RecordingTipsContent {
  title: string;
  /** Qué hacer al grabar (3 a 4 líneas cortas). */
  items: readonly string[];
  /** Lo que esta sección NO mide o mide solo de forma aproximada. */
  note: string;
}

export const RECORDING_TIPS: Record<TipsArea, RecordingTipsContent> = {
  // Swing: mide la postura del cuerpo con una sola cámara (pose). Fuente de los consejos: la tarjeta «Cómo grabarte» de Swing.tsx.
  swing: {
    title: 'Antes de grabar tu swing',
    items: [
      'Teléfono fijo, a la altura de la cintura y a unos 3 m.',
      'Cuerpo entero, de frente o desde atrás.',
      'Fondo liso y buena luz.',
      'Un solo swing por video.',
    ],
    note: 'Mide tu postura con una sola cámara: son medidas estimadas.',
  },
  // Ball tracking: sigue la bola en la imagen. Fuente: aviso del modo en vivo (Tracking.tsx) y protocolo de validación (60 fps, sin contraluz).
  tracking: {
    title: 'Antes de grabar tu tiro',
    items: [
      'Teléfono fijo (trípode o apoyado), detrás de ti, mirando al objetivo.',
      'Que se vean la bola quieta y el objetivo.',
      'Graba a 60 fps, con buena luz y sin contraluz.',
    ],
    note: 'Sigue la bola mientras se ve. No mide distancia ni curva.',
  },
};

const shown = new Set<TipsArea>();

/** ¿Falta mostrar los consejos de esta sección en esta apertura de la app? */
export const tipsPending = (area: TipsArea): boolean => !shown.has(area);

/** Se llama cuando el usuario los cierra: no vuelven a salir hasta que la app se cierre por completo. */
export const markTipsShown = (area: TipsArea): void => { shown.add(area); };

/** Solo para pruebas: simula cerrar la app por completo. */
export const resetTipsSession = (): void => { shown.clear(); };
