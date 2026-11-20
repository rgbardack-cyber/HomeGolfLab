import { describe, expect, it } from 'vitest';
import { POSE_LANDMARKS, POSE_STRIDE, type PoseTrack } from '../media/poseTrack';
import { buildDrawList } from '../overlay/draw';
import { makeViewport } from '../overlay/viewport';
import { DEFAULT_GUIDES, reviewModelAt } from '../swingReview';
import { exportFileName, flightLegend, frameModelAt, OUT_H, OUT_W, panelsFor, type ExportOptions, type ExportSource } from './render';
import { buildTimeline, exportTimeOfSource, swingSegments } from './timeline';

/** Pista sintética a 30 Hz entre 6,8 y 9,4 s con una persona de pie. */
function track(): PoseTrack {
  const n = 80, lm = new Float32Array(n * POSE_LANDMARKS * POSE_STRIDE);
  for (let i = 0; i < n; i++) for (let k = 0; k < POSE_LANDMARKS; k++) {
    const b = (i * POSE_LANDMARKS + k) * POSE_STRIDE;
    lm[b] = 0.3 + 0.01 * k; lm[b + 1] = 0.2 + 0.02 * k; lm[b + 2] = 0.95; lm[b + 3] = 0.95;
  }
  return { sourceId: 's', hz: 30, t: Float64Array.from({ length: n }, (_, i) => 6800 + (i * 1000) / 30), lm } as unknown as PoseTrack;
}
const times = { address: 7000, top: 7600, impact: 8000, finish: 9200 };
const src = (id: string, t = times): ExportSource => ({ id, w: 1080, h: 1920, track: track(), times: t, lefty: true, view: 'atras' });
const opt: ExportOptions = { template: 'swing', guides: DEFAULT_GUIDES.atras, skeleton: true, watermark: true };

describe('render de la exportación (F8.4)', () => {
  const tl = buildTimeline(swingSegments(times, ['A']));

  it('para el mismo instante la exportación y la vista previa producen la MISMA lista de dibujo', () => {
    const at = exportTimeOfSource(tl, times.top)! + 10;                         // dentro de la pausa del tope
    const fm = frameModelAt(tl, [src('A')], opt, at)!;
    expect(fm.held).toBe(true);
    expect(fm.label).toBe('Tope');
    const p = fm.panels[0];
    const preview = reviewModelAt({ track: track(), lefty: true, view: 'atras', times }, times.top, DEFAULT_GUIDES.atras, { skeleton: true });
    const vp = makeViewport(1080, 1920, { x: 0, y: 0, w: OUT_W, h: OUT_H });
    expect(JSON.stringify(buildDrawList(p.model, p.srcMs, vp))).toBe(JSON.stringify(buildDrawList(preview, times.top, vp)));
  });

  it('el overlay es el mismo a otra escala: las posiciones se proyectan proporcionalmente', () => {
    const fm = frameModelAt(tl, [src('A')], opt, 500)!;
    const big = buildDrawList(fm.panels[0].model, fm.panels[0].srcMs, makeViewport(1080, 1920, { x: 0, y: 0, w: 1080, h: 1920 }));
    const small = buildDrawList(fm.panels[0].model, fm.panels[0].srcMs, makeViewport(1080, 1920, { x: 0, y: 0, w: 270, h: 480 }));
    const firstLine = (ops: typeof big) => ops.find((o) => o.op === 'line') as { x1: number; y1: number };
    expect(firstLine(big).x1 / 4).toBeCloseTo(firstLine(small).x1, 6);
    expect(firstLine(big).y1 / 4).toBeCloseTo(firstLine(small).y1, 6);
  });

  it('fuera de la línea de tiempo no hay cuadro', () => {
    expect(frameModelAt(tl, [src('A')], opt, tl.totalMs)).toBeNull();
    expect(frameModelAt(tl, [src('A')], opt, -5)).toBeNull();
  });

  it('con una fuente sin pista el modelo queda vacío (se exporta solo el video)', () => {
    const fm = frameModelAt(tl, [{ ...src('A'), track: null }], opt, 100)!;
    expect(fm.panels[0].model).toEqual({});
  });

  it('la comparación pone dos paneles de 540×960 y mueve el segundo con el warp (sus fases coinciden)', () => {
    const panels = panelsFor('compare', 2);
    expect(panels).toHaveLength(2);
    expect(panels[0].rect).toMatchObject({ x: 0, w: 540, h: 960 });
    expect(panels[1].rect.x).toBe(540);
    expect(panels[0].rect.y).toBe((OUT_H - 960) / 2);
    const tB = { address: 5000, top: 5900, impact: 6300, finish: 7100 };
    const tlc = buildTimeline(swingSegments(times, ['A', 'B']));
    const at = exportTimeOfSource(tlc, times.impact)! + 5;
    const fm = frameModelAt(tlc, [src('A'), src('B', tB)], { ...opt, template: 'compare' }, at)!;
    expect(fm.panels[0].srcMs).toBe(times.impact);
    expect(fm.panels[1].srcMs).toBeCloseTo(tB.impact, 6);            // el impacto de B se muestra cuando el de A
    const t2 = exportTimeOfSource(tlc, times.top)! + 5;
    expect(frameModelAt(tlc, [src('A'), src('B', tB)], { ...opt, template: 'compare' }, t2)!.panels[1].srcMs).toBeCloseTo(tB.top, 6);
  });

  it('una sola fuente ocupa todo el cuadro de 1080×1920', () => {
    expect(panelsFor('swing', 1)).toEqual([{ rect: { x: 0, y: 0, w: 1080, h: 1920 }, sourceIndex: 0 }]);
    expect(panelsFor('compare', 1)[0].rect.w).toBe(1080);
  });

  it('el nombre del archivo sigue el formato del plan', () => {
    expect(exportFileName('swing', { y: 2026, mo: 11, d: 5, h: 9, mi: 7 })).toBe('HomeGolfLab-Swing-2026-11-05-0907.mp4');
    expect(exportFileName('compare', { y: 2026, mo: 12, d: 25, h: 18, mi: 30 })).toBe('HomeGolfLab-Comparacion-2026-12-25-1830.mp4');
  });

  it('la leyenda de vuelo usa los estilos del compositor y no incluye "Última vez vista"', () => {
    const l = flightLegend();
    expect(l.map((x) => x.text)).toEqual(['Tramo visto', 'Bajada vista en el video', 'Sin ver la bola', 'Trayectoria estimada · no medida']);
    expect(l[2].dash).toBe(true);
    expect(l[0].dash).toBe(false);
  });
});

describe('la base se dibuja con el mismo letterbox que el overlay (revisión F8)', () => {
  it('un video horizontal no se estira al panel vertical', async () => {
    const { renderExportFrame } = await import('./render');
    const calls: number[][] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => (k === 'drawImage' ? (_img: unknown, ...a: number[]) => { if (a.length === 4) calls.push(a); }
        : k === 'measureText' ? () => ({ width: 100 }) : () => undefined),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const wide = { ...src('A'), w: 1920, h: 1080, track: null };
    const tl2 = buildTimeline(swingSegments(times, ['A']));
    const video = { videoWidth: 1920, videoHeight: 1080 } as unknown as CanvasImageSource;
    await renderExportFrame(ctx, OUT_W, OUT_H, tl2, [wide], opt, 100, () => video, { watermark: false, logo: null, legend: [] });
    const [x, y, w, h] = calls[0];
    expect(w / h).toBeCloseTo(1920 / 1080, 3);                    // conserva la proporción
    expect(w).toBeCloseTo(OUT_W, 3);                              // ocupa el ancho del panel
    expect(y).toBeGreaterThan(0);                                 // con bandas arriba y abajo
    expect(x).toBeCloseTo(0, 6);
  });
});
