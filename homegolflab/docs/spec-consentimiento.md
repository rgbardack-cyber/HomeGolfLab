BORRADOR: requiere revisión de un abogado en Costa Rica antes de publicarse.

# Especificación: flujo de consentimiento de datos (R9)

Fecha: 23 nov 2026. Estado: **implementado detrás de `flags.consentFlow` (apagada)**. Guardar o subir videos **sigue desactivado**.

## Problema
Ryan quiere que los usuarios puedan aceptar que se guarden sus videos y análisis para mejorar la app, con respaldo legal. Hoy la app no guarda nada fuera del dispositivo.

## Qué hace
1. En Perfil, con la bandera encendida, aparece la tarjeta «Ayúdanos a mejorar la app (opcional)» con una casilla **sin marcar**, aparte de los términos.
2. Marcar registra `granted`; desmarcar registra `withdrawn`. Con el permiso retirado aparece «Pedir que se borre lo guardado» (`deletion_requested`, una sola vez).
3. Cada registro lleva `{ id, userId, action, at, version }`. `userId` es un id anónimo local (`consentUserId`), porque no hay cuentas.
4. El registro solo se agrega (`appendEvent`), no repite acciones y no se modifica.
5. Si cambia el texto (`CONSENT_VERSION`), el consentimiento de la versión anterior deja de valer.
6. La app funciona igual sin consentimiento: nada del código lee el consentimiento para habilitar o bloquear funciones.
7. «Borrar todos mis datos» (Perfil) también borra el registro local, porque borra todo el estado.

## Fuera de alcance (a propósito)
- Subir o guardar videos (`VIDEO_STORAGE_ENABLED = false`).
- Servidor, cuentas, sincronización del registro. Cuando existan, el registro debe guardarse también en el servidor para poder demostrarlo y atender el borrado.
- Texto legal final.

## Archivos
`src/lib/consent.ts` (lógica pura y texto), `src/components/ConsentCard.tsx`, `src/store.ts` (`consentLog`, `consentUserId`, `recordConsent`), `src/lib/flags.ts` (`consentFlow`), `src/lib/consent.test.ts` (10 pruebas).

## Criterios de aceptación y cómo se comprobó
| Criterio | Comprobación |
|---|---|
| La casilla nace sin marcar | Prueba `currentConsent([]) = false`; en el navegador (dev local con la bandera): `checked = false` al abrir Perfil |
| Cada decisión guarda usuario, fecha y versión | Prueba `newEvent`; en el navegador, `localStorage` mostró `userId`, `at`, `version: 1` |
| Retirar es posible y se puede pedir el borrado | Pruebas; en el navegador: aceptar, retirar y pedir borrado dejaron `granted, withdrawn, deletion_requested` |
| Texto nuevo ⇒ volver a pedir | Prueba de versión |
| Sin bandera, no se ve | Prueba `resolveFlags({}).consentFlow = false`; `Perfil.tsx` solo la muestra con la bandera |
| Videos siguen sin guardarse | Prueba `VIDEO_STORAGE_ENABLED = false`; no hay código de subida |

## Riesgos (resultado de `operations:risk-assessment` hecho a mano; los skills no se invocaron)
| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| El id local no demuestra quién consintió | Alta | Media | Aceptable mientras no se guarde nada; con servidor, vincular a una cuenta o id firmado. Pregunta al abogado. |
| El usuario borra todos sus datos y se pierde el registro | Media | Baja | Es lo que pidió el usuario. Con servidor, el registro de consentimiento se conserva solo lo que la ley exija. |
| Que el texto de la casilla no sea «informado» según la ley | Media | Alta | No se enciende hasta revisión del abogado. |
| Que alguien active guardar videos sin revisar | Baja | Alta | `VIDEO_STORAGE_ENABLED` es constante, con prueba y comentario que exige texto aprobado. |
| Lesiones o daños en casa por el Home Lab | Media | Alta | Aviso completo una vez, recordatorio corto, umbrales conservadores, aviso también en los términos. No elimina la responsabilidad: el abogado dice el alcance. |
| Choque R8 (no hablar de IA) con el deber de decir qué datos salen | Media | Media | Bloque condicional en la política; decisión pendiente (pregunta 26). |

## Cumplimiento: lista de requisitos (resultado de `operations:compliance-tracking` hecho a mano)
Ver `marco-legal.md`. Pendientes: Ley 8968 y PRODHAB (texto no leído), inscripción de base de datos si se guardan videos, etiqueta de Apple y formulario de Google al activar guardar o al integrar AdMob, UMP y ATT (ver `monetizacion-verificacion.md`).
