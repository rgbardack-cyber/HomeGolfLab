# HomeGolfLab — datos para pegar en el Brand Kit

Cada bloque corresponde a un tipo de elemento del Brand Kit de ElevenLabs.

## Nombre y descripción del kit

- **Nombre:** HomeGolfLab
- **Descripción:** App móvil que convierte el teléfono en un laboratorio de práctica de golf, en casa y en la cancha, para golfistas amateur de Latinoamérica. Marca clara, cercana y sobria: verde golf, acentos dorados, títulos serif. Lema: "Practica en casa. Mejora en la cancha."

## Paleta de color

| Nombre | Hex | Rol |
|---|---|---|
| Verde golf | `#276749` | dominante |
| Verde niebla (fondo) | `#F6F9F7` | dominante |
| Tinta (texto) | `#0E1B14` | dominante |
| Blanco | `#FFFFFF` | dominante |
| Dorado | `#D4A735` | acento |
| Verde claro (degradado) | `#428A68` | acento |
| Verde trazo (esqueleto, trayectorias) | `#6DCF8E` | acento |
| Dorado brillo (puntos, línea al objetivo) | `#E8C04A` | acento |
| Gris verdoso (texto secundario) | `#5E6E66` | acento |
| Verde suave (bloques) | `#EAF0EC` | acento |
| Borde | `#DCE5DF` | acento |
| Rojo aviso (solo errores) | `#CE2727` | acento |

## Fuentes

| Familia | Pesos | Uso |
|---|---|---|
| Playfair Display | 600, 700 | Títulos, cifras grandes y nombre de la marca |
| Inter | 400, 500, 600, 700 | Textos, botones, etiquetas y subtítulos |

Ambas son de Google Fonts. Si el kit pide el archivo de la fuente, se descargan gratis desde fonts.google.com.

## Logos

| Archivo | Rol en el kit |
|---|---|
| `logos/logo-horizontal.png` | primary / horizontal |
| `logos/logo-apilado.png` | stacked |
| `logos/logo-icono.png` | icon |
| `logos/logo-horizontal-blanco-transparente.png` | dark |
| `logos/logo-icono-invertido.png` | icon (para fondos verdes u oscuros) |
| `logos/logo-horizontal-fondo-oscuro.png` | dark (con el fondo verde incluido) |

## Imágenes de referencia

| Archivo | Descripción |
|---|---|
| `capturas/01-inicio.jpg` | Pantalla de inicio: saludo, racha, nivel y herramientas |
| `capturas/02-analisis-de-swing.jpg` | Resultado de un swing: anillo de nota, seis medidas y ejercicio |
| `capturas/03-homelab-plan-del-dia.jpg` | HomeLAB: sesión del día con ejercicios |
| `capturas/04-tracking-mapa-de-dispersion.jpg` | Ball tracking: estadísticas y mapa de dispersión |
| `capturas/05-logros-medallas.jpg` | Logros: nivel y medallas |

Las cifras de las capturas son datos de ejemplo.

## Documento

- **Archivo:** `HomeGolfLab-Brand-File.pdf`
- **Resumen:** Guía de marca completa de HomeGolfLab: identidad, logo, color, tipografía, estilo de interfaz, fotografía, video, voz, tono, mensajes aprobados y afirmaciones permitidas y prohibidas.

## Reglas — hacer (dos)

- Usar el verde #276749 como color dominante y el dorado #D4A735 solo como acento.
- Títulos en Playfair Display; textos en Inter.
- Todo el texto y la voz en español latino neutro, con tuteo.
- Mostrar la app dentro de un teléfono, basada en las capturas reales.
- Mostrar golfistas amateur reales en salas, patios, jardines o un driving range, con luz natural y equipo sencillo.
- Frases de menos de 8 palabras en pantalla, con un beneficio concreto.
- Animación limpia y fluida: una idea por escena, de 4 a 8 segundos.
- Cerrar cada pieza con el logo oficial y el lema "Practica en casa. Mejora en la cancha."
- Usar los archivos de logo tal cual, con espacio libre alrededor.
- Escribir el nombre siempre como "HomeGolfLab", en una sola palabra.

## Reglas — no hacer (donts)

- No inventar cifras de usuarios, descargas, ventas, valoraciones, testimonios ni premios.
- No prometer resultados: bajar el handicap, plazos o porcentajes de mejora.
- No afirmar que mide el palo, la cara del palo o el vuelo de un swing completo, ni que tiene precisión de launch monitor.
- No mostrar jugadores profesionales reconocibles, marcas de equipo ni logos de otras apps.
- No mostrar insignias de App Store o Google Play mientras la app no esté publicada.
- No mencionar retos con premios en dinero: esa función aún no existe.
- No usar estética de lujo, neón, futurista o de videojuego.
- No redibujar, recolorear, estirar ni girar el logo.
- No poner texto en inglés, ilegible o deformado en pantalla.
- No usar rojo fuera de avisos de error.

## Voz de marca

Español latino neutro, sin acento marcado de un país. Cálida, segura y cercana; ritmo ágil sin correr. Suena a un coach que habla de tú, no a un locutor de anuncio.

## Bloque de estilo para prompts

```text
Marca: HomeGolfLab, app móvil de práctica de golf en casa y en la cancha, para golfistas amateur de Latinoamérica.
Estilo: motion graphics moderno y limpio; un teléfono como protagonista con la interfaz de la app en pantalla; tarjetas blancas de esquinas redondeadas, mucho aire, íconos de línea.
Colores: verde golf #276749 dominante, dorado #D4A735 solo como acento, fondo claro #F6F9F7, texto #0E1B14. Degradado de marca de #276749 a #428A68.
Tipografía: títulos en Playfair Display Bold; textos en Inter.
Personas: golfistas amateur reales en salas, patios o un driving range, con luz natural y equipo sencillo. Sin lujo ni profesionales reconocibles.
Texto en pantalla: español latino neutro, frases de menos de 8 palabras.
Voz: española latina neutra, cálida y segura, de coach cercano.
Cierre: logo oficial de HomeGolfLab sobre el degradado verde y el lema "Practica en casa. Mejora en la cancha."
No incluir: cifras de usuarios o ventas, marcas ajenas, insignias de tiendas, texto en inglés, estética de neón o de videojuego.
```
