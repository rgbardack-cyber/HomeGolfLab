/**
 * Compositor del overlay (plan 4.8, F1.2): `buildDrawList` es PURO (mismo modelo + mismo instante + misma vista ⇒ misma
 * lista de operaciones, probado en Node) y `paint` solo ejecuta esa lista en un canvas. La vista previa y la
 * exportación llaman a las mismas funciones con el mismo `t` y el mismo `Viewport`.
 *
 * Reglas: nada se dibuja con confianza < CONF.hide; entre CONF.hide y CONF.solid se dibuja atenuado y punteado.
 * Todo se recorta al rectángulo de destino (no se pinta fuera del panel).
 */
import type { MediaMs } from '@/lib/media/clock';
import {
  BONES, CONF, ESTIMATED_ALPHA, FLIGHT_OUTLINE, FLIGHT_STYLES, GUIDE_STYLE, JOINTS, LABEL_STYLE, lostLabel, SKELETON_STYLE,
  type FlightSegment, type GuideItem, type OverlayModel, type SkeletonSample,
} from './model';
import { project, screenUnit, type Viewport } from './viewport';

export type DrawOp =
  | { op: 'clip'; x: number; y: number; w: number; h: number }
  | { op: 'endClip' }
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash: number[]; alpha: number }
  | { op: 'circle'; x: number; y: number; r: number; fill?: string; stroke?: string; lineWidth: number; dash: number[]; alpha: number }
  | { op: 'text'; x: number; y: number; text: string; color: string; size: number; align: 'left' | 'center' | 'right'; bg?: string; alpha: number };

/** Muestra de postura más cercana a `t` (ordenadas por t); null si la más cercana queda a más de `tolMs`. */
export function pickSample(samples: readonly SkeletonSample[], t: MediaMs, tolMs = 100): SkeletonSample | null {
  if (!samples.length) return null;
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid].t < t) lo = mid + 1; else hi = mid; }
  let best = samples[lo];
  if (lo > 0 && Math.abs(samples[lo - 1].t - t) <= Math.abs(best.t - t)) best = samples[lo - 1];
  return Math.abs(best.t - t) <= tolMs ? best : null;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** En cuántos trozos se parte un segmento estimado para desvanecerlo a lo largo de su longitud. */
const ESTIMATED_PIECES = 4;

export function buildDrawList(model: OverlayModel, t: MediaMs, vp: Viewport): DrawOp[] {
  const u = screenUnit(vp);
  const d = vp.dstRect;
  const ops: DrawOp[] = [{ op: 'clip', x: d.x, y: d.y, w: d.w, h: d.h }];
  // `??` y no un spread: un `undefined` explícito debe quedar en el valor por defecto (visible), no apagar la capa.
  const show = { skeleton: model.show?.skeleton ?? true, guides: model.show?.guides ?? true, flight: model.show?.flight ?? true, labels: model.show?.labels ?? true };
  const P = (p: { x: number; y: number }) => project(p, vp);

  /* Esqueleto */
  if (show.skeleton && model.skeleton) {
    const s = pickSample(model.skeleton, t);
    if (s) {
      for (const [i, j] of BONES) {
        const a = s.pts[i], b = s.pts[j];
        if (!a || !b || a.conf < CONF.hide || b.conf < CONF.hide) continue;
        const pa = P(a), pb = P(b);
        const faded = Math.min(a.conf, b.conf) < CONF.solid;
        // Entre CONF.hide y CONF.solid: hueso punteado y atenuado (las articulaciones, que son puntos rellenos, solo se atenúan).
        ops.push({ op: 'line', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, color: SKELETON_STYLE.bone, width: SKELETON_STYLE.boneWidth * u, dash: faded ? GUIDE_STYLE.faded.dash.map((x) => x * u) : [], alpha: faded ? GUIDE_STYLE.faded.alpha : 1 });
      }
      for (const i of JOINTS) {
        const a = s.pts[i];
        if (!a || a.conf < CONF.hide) continue;
        const p = P(a);
        ops.push({ op: 'circle', x: p.x, y: p.y, r: SKELETON_STYLE.jointRadius * u, fill: SKELETON_STYLE.joint, lineWidth: 0, dash: [], alpha: a.conf < CONF.solid ? GUIDE_STYLE.faded.alpha : 1 });
      }
    }
  }

  /* Guías */
  if (show.guides && model.guides) {
    for (const g of model.guides) {
      if (t < g.fromMs || t > g.toMs || g.conf < CONF.hide) continue;
      pushGuide(ops, g, P, u);
    }
  }

  /* Trazo de la bola */
  const fl = model.flight;
  if (show.flight && fl) {
    // Continuación estimada: el desvanecido (0,9 → 0,4) va por el RECORRIDO acumulado de los segmentos estimados visibles,
    // en orden cronológico (no por su posición en el arreglo), y cada segmento se parte en trozos para que también se
    // desvanezca dentro de sí mismo (un único segmento largo no queda a opacidad fija).
    const visible = fl.segments.filter((sg) => !(sg.conf !== undefined && sg.conf < CONF.hide));
    const estSegs = visible.filter((sg) => sg.kind === 'estimated').sort((a, b) => a.tA - b.tA || a.tB - b.tB);
    const estStart = new Map<FlightSegment, number>();
    let estTotal = 0;
    for (const sg of estSegs) { estStart.set(sg, estTotal); estTotal += Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y); }
    const alphaAt = (cum: number) => (estTotal > 0 ? lerp(ESTIMATED_ALPHA.from, ESTIMATED_ALPHA.to, Math.min(1, cum / estTotal)) : ESTIMATED_ALPHA.from);
    for (const sg of fl.segments) {
      if ((sg.conf !== undefined && sg.conf < CONF.hide) || t < sg.tA) continue;
      const k = sg.tB > sg.tA ? Math.min(1, (t - sg.tA) / (sg.tB - sg.tA)) : 1;
      const st = FLIGHT_STYLES[sg.kind];
      const dash = st.dash.map((x) => x * u);
      const piece = (f0: number, f1: number, alpha: number) => {
        const pa = P({ x: lerp(sg.a.x, sg.b.x, f0), y: lerp(sg.a.y, sg.b.y, f0) });
        const pb = P({ x: lerp(sg.a.x, sg.b.x, f1), y: lerp(sg.a.y, sg.b.y, f1) });
        ops.push({ op: 'line', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, color: FLIGHT_OUTLINE.color, width: (st.width + FLIGHT_OUTLINE.extra) * u, dash, alpha });
        ops.push({ op: 'line', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, color: st.color, width: st.width * u, dash, alpha });
      };
      if (sg.kind !== 'estimated') { piece(0, k, 1); continue; }
      const len = Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y), c0 = estStart.get(sg) ?? 0;
      for (let j = 0; j < ESTIMATED_PIECES; j++) {
        const f0 = j / ESTIMATED_PIECES, f1 = Math.min(k, (j + 1) / ESTIMATED_PIECES);
        if (f0 >= k) break;
        piece(f0, f1, alphaAt(c0 + len * ((j + 0.5) / ESTIMATED_PIECES)));
      }
    }
    for (const dot of fl.dots ?? []) {
      if (t < dot.t || (dot.conf !== undefined && dot.conf < CONF.hide)) continue;
      const p = P(dot);
      if (dot.kind === 'detected') ops.push({ op: 'circle', x: p.x, y: p.y, r: 2.6 * u, fill: FLIGHT_STYLES.observed.color, stroke: 'rgba(0,0,0,0.7)', lineWidth: 0.8 * u, dash: [], alpha: 1 });
      else ops.push({ op: 'circle', x: p.x, y: p.y, r: 2.6 * u, stroke: FLIGHT_STYLES.estimated.color, lineWidth: 1.2 * u, dash: [], alpha: 1 });
    }
    if (fl.tap) {
      const p = P(fl.tap);
      ops.push({ op: 'circle', x: p.x, y: p.y, r: 7 * u, stroke: 'rgba(0,0,0,0.6)', lineWidth: 3.2 * u, dash: [], alpha: 1 });
      ops.push({ op: 'circle', x: p.x, y: p.y, r: 7 * u, stroke: '#FFFFFF', lineWidth: 1.6 * u, dash: [], alpha: 1 });
    }
    if (fl.lost && t >= fl.lost.t) {
      const p = P(fl.lost);
      ops.push({ op: 'circle', x: p.x, y: p.y, r: 4.5 * u, stroke: 'rgba(0,0,0,0.6)', lineWidth: 2.8 * u, dash: [], alpha: 1 });
      ops.push({ op: 'circle', x: p.x, y: p.y, r: 4.5 * u, stroke: '#FFFFFF', lineWidth: 1.4 * u, dash: [], alpha: 1 });
      ops.push({ op: 'text', x: p.x, y: p.y + 10 * u, text: lostLabel(), color: LABEL_STYLE.color, size: LABEL_STYLE.size * u, align: 'center', bg: LABEL_STYLE.bg, alpha: 1 });
    }
  }

  /* Etiquetas */
  if (show.labels && model.labels) {
    for (const l of model.labels) {
      if (t < l.fromMs || t > l.toMs) continue;
      const p = P(l.at);
      ops.push({ op: 'text', x: p.x, y: p.y, text: l.text, color: LABEL_STYLE.color, size: LABEL_STYLE.size * u, align: l.align ?? 'center', bg: LABEL_STYLE.bg, alpha: 1 });
    }
  }

  ops.push({ op: 'endClip' });
  return ops;
}

function pushGuide(ops: DrawOp[], g: GuideItem, P: (p: { x: number; y: number }) => { x: number; y: number }, u: number) {
  const base = GUIDE_STYLE[g.role];
  const faded = g.conf < CONF.solid;
  const dash = (faded ? GUIDE_STYLE.faded.dash : base.dash).map((x) => x * u);
  const alpha = faded ? GUIDE_STYLE.faded.alpha : 1;
  if (g.shape === 'line' && g.a && g.b) {
    const a = P(g.a), b = P(g.b);
    ops.push({ op: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: GUIDE_STYLE.outline, width: (base.width + GUIDE_STYLE.outlineExtra) * u, dash, alpha });
    ops.push({ op: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: base.color, width: base.width * u, dash, alpha });
  } else if (g.shape === 'circle' && g.center && g.r !== undefined) {
    const c = P(g.center);
    ops.push({ op: 'circle', x: c.x, y: c.y, r: g.r * u, stroke: GUIDE_STYLE.outline, lineWidth: (base.width + GUIDE_STYLE.outlineExtra) * u, dash, alpha });
    ops.push({ op: 'circle', x: c.x, y: c.y, r: g.r * u, stroke: base.color, lineWidth: base.width * u, dash, alpha });
  }
}

/** Ejecuta la lista en un canvas 2D. No decide nada: solo pinta lo que `buildDrawList` entregó. */
export function paint(ctx: CanvasRenderingContext2D, ops: readonly DrawOp[]): void {
  let depth = 0;
  try {
    for (const o of ops) {
      switch (o.op) {
        case 'clip':
          ctx.save(); depth++;
          ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
          break;
        case 'endClip':
          if (depth > 0) { ctx.restore(); depth--; }
          break;
        case 'line':
          ctx.globalAlpha = o.alpha; ctx.setLineDash(o.dash);
          ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
          break;
        case 'circle':
          ctx.globalAlpha = o.alpha; ctx.setLineDash(o.dash);
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
          if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
          if (o.stroke && o.lineWidth > 0) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lineWidth; ctx.stroke(); }
          break;
        case 'text': {
          ctx.globalAlpha = o.alpha; ctx.setLineDash([]);
          ctx.font = `600 ${o.size}px system-ui, sans-serif`; ctx.textAlign = o.align; ctx.textBaseline = 'middle';
          if (o.bg) {
            const w = ctx.measureText(o.text).width, pad = o.size * 0.4;
            const x0 = o.align === 'center' ? o.x - w / 2 : o.align === 'right' ? o.x - w : o.x;
            ctx.fillStyle = o.bg; ctx.fillRect(x0 - pad, o.y - o.size * 0.75, w + pad * 2, o.size * 1.5);
          }
          ctx.fillStyle = o.color; ctx.fillText(o.text, o.x, o.y);
          break;
        }
      }
    }
  } finally {
    while (depth-- > 0) ctx.restore();
    ctx.globalAlpha = 1; ctx.setLineDash([]);
  }
}
