// Configuración común de los scripts. Todo sale de variables de entorno para no fijar rutas de un equipo.
//   HGL_PRUEBAS  carpeta de pruebas (con resultados/, ground_truth/, controles/, harness/)   [obligatoria]
//   HGL_TOOLS    carpeta con package.json que tenga puppeteer-core y ffmpeg-static           [obligatoria si se usa Chrome o ffmpeg]
//   HGL_CHROME   ruta de chrome.exe (por defecto la instalación estándar de Windows)
//   HGL_VIDEOS   carpeta de videos (la que contiene indice_clips.csv)                        [para inventario y controles]
//   HGL_REPO     carpeta homegolflab/ del repo                                               [para preparar copias y laboratorio]
const clean = (v) => (v ? v.replace(/\\/g, '/').replace(/\/$/, '') : v)
const need = (k) => {
  const v = clean(process.env[k])
  if (!v) { console.error('Falta la variable de entorno ' + k + ' (ver scripts/_cfg.mjs)'); process.exit(2) }
  return v
}
export const ROOT = need('HGL_PRUEBAS')
export const TOOLS = clean(process.env.HGL_TOOLS || process.env.HGL_VIDEO_TOOLS)
export const CHROME = clean(process.env.HGL_CHROME) || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
export const VIDEOS = clean(process.env.HGL_VIDEOS)
export const REPO = clean(process.env.HGL_REPO)
export const needTools = () => { if (!TOOLS) { console.error('Falta HGL_TOOLS'); process.exit(2) } return TOOLS }
