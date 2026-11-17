---
name: homegolflab-2d-video
description: Crear videos 2D animados e interactivos de HomeGolfLab sin créditos de generación de video, dibujando escenas en canvas y exportándolas a MP4 con ffmpeg. Usar para videos de redes (TikTok, Reels, Shorts), demos animadas de la app, y para generar videos de prueba de un swing (golfista 2D con swing bueno o con un defecto conocido) con los que probar el análisis de la app. No sirve para video fotorrealista; para eso hay generadores de video con créditos.
---

# Video 2D animado con código

Una escena es una **función pura del tiempo** (`draw(ctx, t)`). La misma escena sirve para dos cosas:

1. **Interactiva:** abierta en un navegador se reproduce en bucle, con pausa, barra de tiempo y selectores (por ejemplo, el tipo de swing). Sirve de demo.
2. **Video:** `render.mjs` la recorre cuadro por cuadro y la exporta a MP4 con ffmpeg, con voz y música opcionales.

No hay generación de IA ni créditos: todo es dibujo y matemáticas. Los videos no son fotorrealistas; la fortaleza es que son exactos, repetibles y editables.

## Preparar (una sola vez)

Las herramientas viven **fuera del repo** para que iCloud no sincronice 80 MB de ffmpeg:

```powershell
mkdir C:\Users\Ryan\dev\hgl-video-tools; cd C:\Users\Ryan\dev\hgl-video-tools
npm init -y; npm install puppeteer-core ffmpeg-static
```

`render.mjs` busca Edge o Chrome instalados (no descarga navegador). Se puede cambiar la carpeta con `HGL_VIDEO_TOOLS` y el navegador con `HGL_BROWSER`.

## Comandos

Todos desde `.claude/skills/homegolflab-2d-video/scripts/`:

```powershell
# Ver una escena interactiva
node servir.mjs                       # http://127.0.0.1:5199/ejemplos/golfista/golfista.html

# Exportar a MP4
node render.mjs --scene ..\ejemplos\golfista\golfista.html --out salida.mp4 --query "variante=rapido"
#   opciones: --fps 30  --audio voz.mp3  --music musica.mp3 --music-vol 0.12  --start 0 --end 8  --poster cuadro.png

# Probar el análisis de la app con los puntos del maniquí (sin cámara ni modelo)
node probar-swing.mjs                 # todas las variantes; o: node probar-swing.mjs bueno rapido
```

## Escribir una escena

Partir de `plantillas/escena-base.html` (en blanco) o `plantillas/mito-dato-regla.html` (formato del playbook de videos cortos). El contrato:

```html
<canvas id="stage"></canvas>
<script src="/_hgl/player.js"></script>
<script>
  HGL.scene({
    width: 1080, height: 1920, fps: 30, duration: 12,
    controls: [{ id: 'tono', label: 'Tono', options: { claro: 'Claro', oscuro: 'Oscuro' } }],  // opcional
    draw(ctx, t, W, H, ui) { /* dibujar TODO lo que se ve en el instante t */ },
  });
</script>
```

- `draw` no puede guardar estado entre cuadros: calcula todo desde `t`. Así el video sale igual siempre y se puede saltar a cualquier instante.
- Ayudas de `HGL`: `HGL.keys(t, [[0, 0], [1, 100, 'out']])` (valor animado por claves con suavizado `io`, `in`, `out`, `lin`), `HGL.roundRect`, `HGL.limb`, y `HGL.rendering` (true al exportar: úsalo para ocultar controles o etiquetas de depuración).
- Con `?render` en la URL no se reproduce nada: `render.mjs` llama a `window.renderFrame(t)` y toma una captura.
- Las rutas `"/_hgl/..."` apuntan a `scripts/`; el resto es relativo a la carpeta de la escena. Los módulos ES (`<script type="module">`) funcionan porque la escena se sirve por HTTP local.

## Estilo (de la marca)

Respetar `marketing/BRAND.md` y `brand-kit/`: verde golf `#276749` dominante, dorado `#D4A735` solo como acento, fondo `#F6F9F7`, texto `#0E1B14`; títulos en Playfair Display, textos en Inter; español latino neutro con tuteo; frases cortas en pantalla; sin cifras de usuarios, promesas de resultados, retos con dinero, texto en inglés ni insignias de tiendas. Para videos de redes seguir `homegolflab-video-playbook` (mito → dato → regla → CTA) y su plantilla de guion. Todo dato de golf se verifica antes de usarlo.

## Golfista 2D y videos de prueba del análisis de swing

`ejemplos/golfista/` contiene un maniquí 3D paramétrico de un golfista diestro visto de frente (`golfer-rig.js`) y su versión dibujada (`golfista.html`). Variantes: `bueno`, `rapido` (subida apresurada), `corto` (giro de hombros corto), `cabeza` (cabeza que se mueve), `postura` (pierde la postura), `peso` (peso atrás), `brazo` (brazo guía flexionado). Videos ya exportados en `ejemplos/golfista/videos/` (720x1280, ~4 s).

Dos formas de usarlo para probar la app:

1. **Sin modelo de visión** (`probar-swing.mjs`): el maniquí entrega los 33 puntos de MediaPipe de cada cuadro y se los pasa a `analyzeSwing()`. Comprueba que cada defecto inyectado se detecta y que las reglas dan el texto esperado.
2. **Con el modelo real:** subir un MP4 en *Swing → Subir video*. El modelo de postura lee el dibujo como si fuera una persona, y se prueba todo el recorrido (modelo, métricas, reglas y pantalla).

### Qué demuestra y qué no
- Sí: que el recorrido completo funciona, que cada regla se activa con su defecto y que no hay errores de pantalla.
- No: que los rangos de referencia (tempo 2,6–3,4:1, giro de hombros ≥ 75°, etc.) sean correctos para golfistas reales, ni que el modelo de postura mida bien a una persona real. Es un maniquí hecho a mano. Además el modelo lee un dibujo, no una persona: sus medidas de un mismo swing difieren de las que el maniquí entrega directamente (esa diferencia es en sí un dato sobre la fragilidad de la medición con una sola cámara).
- Si se ajusta el maniquí para que "el swing bueno" pase todas las reglas, el resultado ya no prueba nada sobre las reglas: comprobar siempre que el cambio de un parámetro mueve la métrica esperada.

## Añadir otro personaje o escena

Copiar `ejemplos/golfista/` y cambiar el dibujo. Mantener la separación: el *rig* (matemáticas, sin DOM, importable desde Node) y la escena (canvas). Eso permite reutilizar el rig en pruebas.
