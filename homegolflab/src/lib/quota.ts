/**
 * Cuota gratis de análisis de video (Swing). Se cuenta por ARCHIVO analizado, no por clic:
 * un archivo que ya tiene resultado guardado no se vuelve a analizar en la versión gratuita
 * (antes, tras el primer análisis el botón seguía activo y cada clic guardaba otra sesión).
 */
export interface UploadQuotaInput {
  premium: boolean;
  /** Análisis de video ya guardados hoy. */
  used: number;
  /** Límite diario gratis. */
  limit: number;
  /** Ya hay un resultado guardado para el archivo que está en pantalla. */
  analyzedThisFile: boolean;
}

export interface UploadQuota {
  /** Mostrar la puerta Premium en lugar del selector de video. */
  showGate: boolean;
  /** El botón "Analizar swing" puede usarse ahora. */
  canAnalyze: boolean;
}

export function uploadQuota({ premium, used, limit, analyzedThisFile }: UploadQuotaInput): UploadQuota {
  if (premium) return { showGate: false, canAnalyze: true };
  const atLimit = used >= limit;
  return {
    // La puerta solo aparece si no hay un resultado en pantalla que el usuario quiera seguir viendo.
    showGate: atLimit && !analyzedThisFile,
    // Un archivo ya analizado no se reanaliza gratis, aunque el límite diario fuera mayor que 1.
    canAnalyze: !atLimit && !analyzedThisFile,
  };
}
