/**
 * Ganchos de depuración para el harness de QA (skill `homegolflab-swing-qa-harness`). SOLO EXISTEN EN DESARROLLO:
 * con `import.meta.env.DEV` falso (build de producción) las funciones devuelven null y las cadenas `__hgl…` no entran
 * en el paquete (se comprueba con `grep -r __hgl dist/`). Quien llama debe protegerse con
 * `import.meta.env.DEV ? debugSwing(...) : null` para que tampoco entren los datos que arma.
 *
 * - `window.__hglDebug`: análisis de swing (cuadros gruesos y finos, ventana, resultado, encuadre, fotos, palo).
 * - `window.__hglBall`: seguimiento de bola (cuadros, puntos, resumen).
 */
export type DebugBag = Record<string, unknown>;

function publish(name: '__hglDebug' | '__hglBall', init: DebugBag): DebugBag {
  const bag: DebugBag = { ...init };
  (window as unknown as Record<string, unknown>)[name] = bag;
  return bag;
}

export function debugSwing(init: DebugBag): DebugBag | null {
  if (!import.meta.env.DEV) return null;
  return publish('__hglDebug', init);
}

export function debugBall(init: DebugBag): DebugBag | null {
  if (!import.meta.env.DEV) return null;
  return publish('__hglBall', init);
}
