---
name: homegolflab-video-production
description: Montar y revisar videos de HomeGolfLab a partir de un guion aprobado, incluyendo plan de tomas, grabación de pantalla de la app, voz, subtítulos, exportación y revisión del archivo final. Usar después del guion; para escribirlo usar homegolflab-video-playbook.
---

# Producción de video de HomeGolfLab

Lee el [perfil de HomeGolfLab](../../../marketing/BRAND.md), el guion aprobado y el inventario de material. El guion sale de [homegolflab-video-playbook](../homegolflab-video-playbook/SKILL.md); esta skill lo convierte en un archivo.

## Preparar

Separa lo que tiene que ser real de lo que puede ser gráfico:

- **Real:** el clip de práctica en casa y toda pantalla de la app. La grabación de pantalla se hace con la versión vigente y mostrando una acción que ocurrió de verdad; anota versión y fecha. Si aparece una persona, hace falta su autorización.
- **Gráfico:** titulares, tablas, figuras de palitos, diagramas y transiciones, con la identidad del perfil.

Arma el plan de tomas con lo que existe. Si falta una toma, pide esa toma concreta; no la sustituyas por una escena generada que simule la app o a un usuario.

Comprueba qué herramientas de edición, voz y subtítulos hay en la sesión y si tienen saldo. Si falta una, entrega el plan de montaje y el paso pendiente. No actives planes de pago.

## Montar

El inicio entrega el gancho del guion sin introducción. Una idea por pantalla y ningún plano de más de unos 6 segundos sin cambio visual. La voz es en español latino neutro, cálida y sin tono de anuncio; si es sintética, revisa pronunciación de nombres y cifras. Música ausente o muy baja.

Subtítulos siempre activos. Los automáticos son un borrador: revisa cifras, negaciones, nombres de funciones y términos de golf. Deja libres las zonas que tapa la interfaz de cada canal. El cierre lleva el logo oficial y el lema.

## Revisar el archivo exportado

Revisa el archivo final completo, no la línea de tiempo:

| Pase | Comprobar | Si falla |
|---|---|---|
| Solo audio | Se entiende la idea, la regla y el cierre | Corregir voz o montaje |
| Sin sonido | Subtítulos y gráficos permiten seguirlo | Rehacer jerarquía o tiempos de lectura |
| Datos y funciones | Cada dato coincide en voz, pantalla y caption, y tiene su ficha; cada función mostrada está en el perfil | Retirar o corregir antes de la versión final |
| Móvil | Texto y caras fuera de las zonas tapadas | Ajustar composición |
| Archivo | Inicio y fin limpios, vertical 9:16, duración del guion, audio completo | Volver a exportar y revisar el archivo nuevo |

Como punto de partida: 1080 × 1920, 30 fps, H.264 con audio AAC. Son valores iniciales; los límites de cada plataforma se consultan en [las fuentes vigentes](../../../marketing/platform-sources.md).

## Entregar

Rutas reales del master y sus variantes, versión, duración y resolución medidas, archivo de subtítulos, origen y derechos de cada recurso y observaciones pendientes, según los [contratos](../../../marketing/contracts.md). Un render terminado es `produced`; pasa a `qa_passed` solo después de la revisión de arriba, y no acredita publicación. Los medios originales no se suben al repositorio.

## Motion graphics del playbook

Para el formato mito → dato → regla, carga [el contrato de escenas y render](references/reference-explainers.md). Usa la plantilla del playbook, material real para la app y la identidad vigente. Entrega el MP4 y subtítulos cuando haya herramientas disponibles; si falta material o renderizador, informa el paso exacto pendiente.
