/**
 * Cámara en vivo (plan F10.1 y F10.6): textos de los errores de permiso, comprobación previa del permiso y monitor de rendimiento.
 * Todo puro salvo `queryCameraPermission` (usa `navigator.permissions`, que no existe en todos los navegadores).
 */

export interface CameraProblem { title: string; detail: string; retry: boolean; /** Hay que ir a los ajustes del teléfono/navegador. */ settings: boolean }

/** Traduce el error de `getUserMedia` a un mensaje en español y a lo que puede hacer el usuario. */
export function cameraProblem(e: unknown): CameraProblem {
  const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
  switch (name) {
    case 'NotAllowedError': case 'PermissionDeniedError':
      return { title: 'Necesito permiso para usar la cámara', detail: 'Actívalo en los ajustes del teléfono o del navegador y vuelve a intentarlo. La imagen no sale de tu teléfono.', retry: true, settings: true };
    case 'NotFoundError': case 'DevicesNotFoundError':
      return { title: 'No encuentro una cámara', detail: 'Este dispositivo no tiene cámara disponible. Puedes subir un video en la pestaña "Subir video".', retry: false, settings: false };
    case 'NotReadableError': case 'TrackStartError':
      return { title: 'La cámara está ocupada', detail: 'Otra app la está usando. Ciérrala y vuelve a intentarlo.', retry: true, settings: false };
    case 'OverconstrainedError':
      return { title: 'La cámara no admite esa configuración', detail: 'Prueba con la otra cámara del teléfono.', retry: true, settings: false };
    case 'SecurityError':
      return { title: 'La cámara solo funciona en una conexión segura', detail: 'Abre la app desde una dirección https.', retry: false, settings: false };
    default:
      return { title: 'No se pudo abrir la cámara', detail: e instanceof Error && e.message ? e.message : 'Inténtalo de nuevo.', retry: true, settings: false };
  }
}

export type CameraPermission = 'granted' | 'denied' | 'prompt' | 'unknown';
/** Estado del permiso de cámara si el navegador lo sabe (`navigator.permissions`); si no, 'unknown' (se pide al iniciar). */
export async function queryCameraPermission(nav: { permissions?: { query?: (d: { name: string }) => Promise<{ state: string }> } } = typeof navigator !== 'undefined' ? (navigator as never) : {}): Promise<CameraPermission> {
  try {
    const p = nav.permissions;
    if (!p?.query) return 'unknown';
    const r = await p.query({ name: 'camera' });
    return r.state === 'granted' || r.state === 'denied' || r.state === 'prompt' ? r.state : 'unknown';
  } catch { return 'unknown'; }
}

/* ───────────────────────── Rendimiento (F10.6) ───────────────────────── */

export const PERF = { windowMs: 5000, minFps: 12, targetFps: 15 } as const;

/**
 * Mide los cuadros PROCESADOS por segundo. Si en una ventana de 5 s hay menos de 12, aconseja bajar la resolución de entrada a
 * 640×480 (una sola vez); el objetivo es ≥ 15 procesados por segundo en un teléfono de gama media [PROPUESTA, medir en F11].
 */
export class FpsMonitor {
  private start = 0;
  private count = 0;
  private advised = false;
  /** Último valor medido (cuadros/s). */
  lastFps: number | null = null;
  /** Registra un cuadro procesado en `now` (ms). Devuelve 'lower' cuando hay que bajar la resolución. */
  record(now: number): 'lower' | null {
    if (!this.start) this.start = now;
    this.count++;
    const el = now - this.start;
    if (el < PERF.windowMs) return null;
    this.lastFps = (this.count * 1000) / el;
    this.start = now; this.count = 0;
    if (!this.advised && this.lastFps < PERF.minFps) { this.advised = true; return 'lower'; }
    return null;
  }
  /** Empieza de cero (p. ej. tras reanudar la cámara). */
  reset(): void { this.start = 0; this.count = 0; }
}
