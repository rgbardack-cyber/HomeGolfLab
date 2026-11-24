/**
 * Compositor de cuadros de la exportación (plan 4.8, F8.4). La vista previa y la exportación llaman a ESTAS funciones con el mismo
 * instante y las mismas vistas, y el overlay sale de `buildDrawList` (puro): lo único que cambia entre ambas es de dónde viene el
 * cuadro de video (`getBase`) y la escala del lienzo.
 *
 * Diseño de la salida: 1080×1920. Una fuente ocupa todo el cuadro; la comparación pone dos paneles de 540×960 lado a lado, centrados
 * verticalmente, con el título arriba y la marca de agua y la leyenda abajo. La interfaz exportada («chrome») se dibuja en canvas con
 * colores de marca; no se captura el DOM.
 */
import { flightLayer, type FlightTrack } from '../flightTrack';
import type { MediaMs } from '../media/clock';
import type { PoseTrack } from '../media/poseTrack';
import { buildDrawList, paint } from '../overlay/draw';
import { FLIGHT_LEGEND, FLIGHT_STYLES, type OverlayModel } from '../overlay/model';
import { containRect, makeViewport, type Rect } from '../overlay/viewport';
import type { SwingView } from '../swing';
import { buildWarp, headUsesNose, reviewModelAt, type GuideSet, type PhaseTimes } from '../swingReview';
import { sourceAt, type Timeline } from './timeline';
import { t } from '@/i18n';

export const OUT_W = 1080;
export const OUT_H = 1920;
export const BRAND = { green: '#276749', ink: '#0E1B14', fog: '#F6F9F7', gold: '#D4A735', trace: '#6DCF8E' } as const;
export type Template = 'swing' | 'compare' | 'flight';
export const TEMPLATE_TITLE: Record<Template, string> = { swing: 'Revisión de swing', compare: 'Comparación', flight: 'Ball tracking' };
export const templateTitle = (k: Template): string => t(`export.template.${k}`);

/** Una fuente (un clip) tal como la necesita el render. */
export interface ExportSource {
  id: string;
  /** Tamaño del cuadro MOSTRADO (rotación aplicada) en px. */
  w: number; h: number;
  /** Duración del video fuente en ms: las plantillas no pasan de aquí (revisión F8). */
  durationMs?: number;
  track: PoseTrack | null;
  times?: { address: MediaMs; top: MediaMs; impact: MediaMs; finish?: MediaMs };
  lefty: boolean;
  view: SwingView;
  flight?: FlightTrack;
}

export interface ExportOptions {
  template: Template;
  guides: GuideSet;
  skeleton: boolean;
  /** Marca de agua con el logo (exportaciones gratis; Premium la quita, D10). */
  watermark: boolean;
  /** Fecha para el pie ("19 nov 2026"); la pone quien llama (no se lee el reloj aquí). */
  dateLabel?: string;
}

export interface Panel { rect: Rect; sourceIndex: number }

/** Paneles de la plantilla en la salida (px). */
export function panelsFor(template: Template, n: number): Panel[] {
  if (template === 'compare' && n >= 2) {
    const w = OUT_W / 2, h = (w * 16) / 9, y = (OUT_H - h) / 2;
    return [{ rect: { x: 0, y, w, h }, sourceIndex: 0 }, { rect: { x: w, y, w, h }, sourceIndex: 1 }];
  }
  return [{ rect: { x: 0, y: 0, w: OUT_W, h: OUT_H }, sourceIndex: 0 }];
}

export interface PanelFrame { sourceIndex: number; srcMs: MediaMs; rect: Rect; model: OverlayModel }
export interface FrameModel { exportMs: number; held: boolean; label?: string; panels: PanelFrame[] }

/**
 * Qué se dibuja en `exportMs`: para cada panel, el instante de su fuente y el modelo del overlay. El reloj maestro es la fuente 0;
 * la fuente 1 se mueve con `buildWarp` (sus fases coinciden exactamente con las de la 0). PURA.
 */
export function frameModelAt(tl: Timeline, sources: readonly ExportSource[], opt: ExportOptions, exportMs: number): FrameModel | null {
  const at = sourceAt(tl, exportMs);
  if (!at) return null;
  const seg = tl.segments[at.index].seg;
  const panels = panelsFor(opt.template, sources.length);
  const timesOf = (s: ExportSource): PhaseTimes | undefined => s.times;
  const warp = sources.length >= 2 && sources[0].times && sources[1].times ? buildWarp(timesOf(sources[0])!, timesOf(sources[1])!) : null;
  const out: PanelFrame[] = panels.map((p) => {
    const s = sources[p.sourceIndex];
    const srcMs = p.sourceIndex === 0 ? at.srcMs : warp ? warp.toB(at.srcMs) : at.srcMs;
    let model: OverlayModel;
    if (opt.template === 'flight' && s.flight) model = { flight: flightLayer(s.flight), show: { skeleton: false, guides: false } };
    else if (s.track && s.times) model = reviewModelAt({ track: s.track, lefty: s.lefty, view: s.view, times: s.times }, srcMs, opt.guides, { skeleton: opt.skeleton }, { useNose: headUsesNose(s.track) });
    else model = {};
    return { sourceIndex: p.sourceIndex, srcMs, rect: p.rect, model };
  });
  return { exportMs, held: at.held, label: seg.label, panels: out };
}

/** Fuente del cuadro de video: devuelve algo dibujable (canvas, bitmap, video) para el panel `i` en `srcMs`, o null si no hay. */
export type BaseProvider = (sourceIndex: number, srcMs: MediaMs) => Promise<CanvasImageSource | null> | CanvasImageSource | null;

export interface ChromeInput { title: string; label?: string; watermark: boolean; logo: CanvasImageSource | null; legend: { color: string; text: string; dash: boolean }[]; footer?: string }

/** Leyenda del trazo de bola para el pie (solo los estilos del compositor, misma fuente que la vista previa). */
export function flightLegend(): ChromeInput['legend'] {
  return FLIGHT_LEGEND.filter((r) => r.kind !== 'lost').map((r) => {
    const st = FLIGHT_STYLES[r.kind as keyof typeof FLIGHT_STYLES];
    return { color: st.color, text: st.label, dash: st.dash.length > 0 };
  });
}

/** Dibuja el «chrome» (título, etiqueta de fase, leyenda, marca de agua). `k` = escala respecto de 1080×1920. */
export function paintChrome(ctx: CanvasRenderingContext2D, W: number, H: number, c: ChromeInput): void {
  const k = W / OUT_W;
  ctx.save();
  // Título arriba
  ctx.fillStyle = 'rgba(14,27,20,0.72)';
  ctx.fillRect(0, 0, W, 150 * k);
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${58 * k}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(c.title, 48 * k, 75 * k);
  // Etiqueta de fase (en las pausas)
  if (c.label) {
    const pad = 28 * k, fs = 52 * k;
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    const tw = ctx.measureText(c.label).width, x = (W - tw) / 2 - pad, y = H - 330 * k;
    ctx.fillStyle = BRAND.green;
    ctx.beginPath(); ctx.roundRect(x, y, tw + pad * 2, fs + pad, (fs + pad) / 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(c.label, W / 2, y + (fs + pad) / 2);
  }
  // Leyenda
  if (c.legend.length) {
    ctx.font = `500 ${34 * k}px system-ui, sans-serif`; ctx.textAlign = 'left';
    let y = H - 250 * k;
    ctx.fillStyle = 'rgba(14,27,20,0.6)';
    ctx.fillRect(0, y - 30 * k, W, c.legend.length * 50 * k + 40 * k);
    for (const l of c.legend) {
      ctx.strokeStyle = l.color; ctx.lineWidth = 7 * k; ctx.setLineDash(l.dash ? [14 * k, 10 * k] : []);
      ctx.beginPath(); ctx.moveTo(48 * k, y + 10 * k); ctx.lineTo(130 * k, y + 10 * k); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.fillText(l.text, 152 * k, y + 10 * k);
      y += 50 * k;
    }
  }
  if (c.footer) { ctx.font = `500 ${30 * k}px system-ui, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'left'; ctx.fillText(c.footer, 48 * k, H - 36 * k); }
  // Marca de agua: logo oficial pequeño abajo a la derecha (exportaciones gratis)
  if (c.watermark && c.logo) {
    const w = 250 * k, iw = (c.logo as { width?: number }).width || 1, ih = (c.logo as { height?: number }).height || 1, h = (w * ih) / iw;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(c.logo, W - w - 40 * k, H - h - 36 * k, w, h);
  }
  ctx.restore();
}

/** Pinta el overlay de un panel con el compositor único. */
export function paintPanelOverlay(ctx: CanvasRenderingContext2D, p: PanelFrame, src: ExportSource, scale: number, paintOps: (ctx: CanvasRenderingContext2D, ops: ReturnType<typeof buildDrawList>) => void): void {
  const r = p.rect;
  const vp = makeViewport(src.w, src.h, { x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale });
  paintOps(ctx, buildDrawList(p.model, p.srcMs, vp));
}

/**
 * Dibuja un cuadro completo de la salida en `ctx` (de `W×H`; la escala respecto de 1080×1920 sale de `W`): fondo, el cuadro de
 * video de cada panel (`getBase`), el overlay con el compositor único y el «chrome». Devuelve false si `exportMs` queda fuera
 * de la línea de tiempo.
 */
export async function renderExportFrame(
  ctx: CanvasRenderingContext2D, W: number, H: number, tl: Timeline, sources: readonly ExportSource[], opt: ExportOptions,
  exportMs: number, getBase: BaseProvider, chrome: Omit<ChromeInput, 'label' | 'title'>,
): Promise<boolean> {
  const fm = frameModelAt(tl, sources, opt, exportMs);
  if (!fm) return false;
  const k = W / OUT_W;
  ctx.fillStyle = BRAND.ink;
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  for (const p of fm.panels) {
    const base = await getBase(p.sourceIndex, p.srcMs);
    if (base) {
      // Mismo letterbox que el overlay (`makeViewport`): un <video> crudo de otra proporción no se estira (revisión F8).
      const bw = (base as { videoWidth?: number }).videoWidth || (base as { width?: number }).width || sources[p.sourceIndex].w;
      const bh = (base as { videoHeight?: number }).videoHeight || (base as { height?: number }).height || sources[p.sourceIndex].h;
      const d = containRect(bw, bh, { x: p.rect.x * k, y: p.rect.y * k, w: p.rect.w * k, h: p.rect.h * k });
      ctx.drawImage(base, d.x, d.y, d.w, d.h);
    }
    paintPanelOverlay(ctx, p, sources[p.sourceIndex], k, (c, ops) => paint(c, ops));
  }
  paintChrome(ctx, W, H, { ...chrome, title: templateTitle(opt.template), label: fm.held ? fm.label : undefined });
  return true;
}

/** Nombre del archivo exportado: `HomeGolfLab-<plantilla>-AAAA-MM-DD-HHmm.mp4` (plan 4.8). */
export function exportFileName(template: Template, d: { y: number; mo: number; d: number; h: number; mi: number }): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const name = { swing: 'Swing', compare: 'Comparacion', flight: 'Vuelo' }[template];
  return `HomeGolfLab-${name}-${d.y}-${p2(d.mo)}-${p2(d.d)}-${p2(d.h)}${p2(d.mi)}.mp4`;
}
