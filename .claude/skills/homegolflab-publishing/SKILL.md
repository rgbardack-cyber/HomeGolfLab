---
name: homegolflab-publishing
description: Preparar, programar, publicar y verificar piezas terminadas de HomeGolfLab en las cuentas que el usuario autorizó, con control de versiones y sin duplicar envíos. Usar con un archivo final revisado; no crea cuentas, no paga anuncios y no trata un borrador como permiso para publicar.
---

# Publicación de piezas de HomeGolfLab

Lee el [perfil de HomeGolfLab](../../../marketing/BRAND.md), en especial «Canales» y «Antes de publicar una pieza de la app», y el apartado de estados de los [contratos](../../../marketing/contracts.md).

## Qué hace falta para publicar

Una cuenta real indicada por el usuario para esa pieza, un conector o programador que funcione en la sesión, el archivo final revisado y la autorización para publicarlo. Si falta cualquiera de los cuatro, la pieza no se publica: entrega qué falta y deja todo lo demás listo. No crees cuentas, no cambies bios ni credenciales y no uses una cuenta personal por no existir la del producto.

Una autorización para publicar una pieza no cubre la siguiente. Una publicación rutinaria ya autorizada no necesita una aprobación nueva en cada paso.

## Preparar el envío

Comprueba el archivo real: versión, duración, resolución, reproducción, audio, subtítulos, portada y caption. Pasa la lista «Antes de publicar una pieza de la app» del perfil punto por punto. Si un punto falla, devuelve la pieza a su autor con el motivo; no corrijas el texto en este paso.

Adapta el empaque al canal sin cambiar los hechos: portada, primer texto visible, caption, hashtags y CTA. Los límites de duración, los formatos, las etiquetas de contenido generado con IA y las reglas de contenido promocional se consultan en la interfaz o la documentación actual de cada plataforma, con [estas fuentes](../../../marketing/platform-sources.md) como punto de partida. No los escribas de memoria.

Cuando Ryan muestre su propia app desde una cuenta personal, la pieza deja claro que él la construye.

## Ejecutar sin duplicar

Antes de enviar, busca en el registro la clave contenido + versión + cuenta + plataforma. Conserva la solicitud y la respuesta reales. Un resultado `scheduled` queda programado; solo `published` o una comprobación en la plataforma acredita la publicación. Guarda identificador, enlace, hora con zona horaria y última consulta.

Después de un timeout o una desconexión, consulta si el envío llegó antes de repetirlo. Si no se puede saber, queda como incierto y se investiga; no se marca como fallido para reintentar automáticamente. Una corrección posterior identifica la versión y la publicación afectadas.

## Entregar

Estado por red, enlaces reales y pendientes concretos. No inventes resultados inmediatos; las métricas llegan después y las lee `homegolflab-metrics`. Un archivo listo no es una publicación programada, y una programada no está publicada.
