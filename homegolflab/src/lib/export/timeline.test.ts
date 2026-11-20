import { describe, expect, it } from 'vitest';
import {
  buildTimeline, chooseFps, exportMsOfFrame, exportTimeOfSource, fitsLimit, flightSegments, frameCount, impactAudioCue, segmentDurationMs, sourceAt, swingSegments,
  type Segment,
} from './timeline';

const marks = { address: 7000, top: 7600, impact: 8000, finish: 9200 };

describe('línea de tiempo de exportación (F8.2)', () => {
  it('la plantilla swing dura lo esperado: 1 + 1,2 + 1 + 1,6 + 1 + 1,2 s', () => {
    const tl = buildTimeline(swingSegments(marks, ['A']));
    // pausa 1000 + subida 600/0,5 + pausa 1000 + bajada 400/0,25 + pausa 1000 + final 1200
    expect(tl.totalMs).toBeCloseTo(1000 + 1200 + 1000 + 1600 + 1000 + 1200, 6);
    expect(tl.segments.map((s) => s.seg.kind)).toEqual(['hold', 'play', 'hold', 'play', 'hold', 'play']);
    expect(fitsLimit(tl)).toBe(true);
  });

  it('sin fase final usa 1,5 s de cola tras el impacto', () => {
    const tl = buildTimeline(swingSegments({ address: 7000, top: 7600, impact: 8000 }, ['A']));
    expect(segmentDurationMs(tl.segments[5].seg)).toBe(1500);
  });

  it('el impacto de la fuente se muestra al llegar (fin de la bajada lenta) y ahí empieza el audio', () => {
    const tl = buildTimeline(swingSegments(marks, ['A']));
    const at = exportTimeOfSource(tl, marks.impact)!;
    expect(at).toBeCloseTo(1000 + 1200 + 1000 + 1600, 6);          // al terminar la bajada, antes de la pausa del impacto
    const cue = impactAudioCue(tl, 'A', marks.impact)!;
    expect(cue.srcFromMs).toBe(marks.impact - 150);
    expect(cue.srcToMs).toBe(marks.impact + 800);
    expect(cue.atExportMs + 150).toBeCloseTo(at, 6);               // el inicio del impacto cae en el instante exacto
    expect(cue.fadeMs).toBe(30);
    // El instante exportado de ese impacto muestra el cuadro del impacto.
    expect(sourceAt(tl, at + 1)!.srcMs).toBe(marks.impact);
  });

  it('con el sonido adelantado respecto de la imagen, el audio se alinea con el sonido, no con la imagen', () => {
    const tl = buildTimeline(swingSegments(marks, ['A']));
    const cue = impactAudioCue(tl, 'A', marks.impact - 30, marks.impact)!;
    expect(cue.srcFromMs).toBe(marks.impact - 30 - 150);
    expect(cue.atExportMs + 150).toBeCloseTo(exportTimeOfSource(tl, marks.impact)!, 6);
  });

  it('si el impacto cae en los primeros 150 ms de la salida, el audio se recorta al inicio y no queda en negativo', () => {
    const tl = buildTimeline([{ kind: 'play', sources: ['A'], fromMs: 8000, toMs: 9000, speed: 1 }]);
    const cue = impactAudioCue(tl, 'A', 8000)!;
    expect(cue.atExportMs).toBe(0);
    expect(cue.srcFromMs).toBe(8000);
  });

  it('sourceAt avanza monótono y respeta las velocidades y las pausas', () => {
    const tl = buildTimeline(swingSegments(marks, ['A']));
    let prev = -Infinity;
    for (let t = 0; t < tl.totalMs; t += 17) {
      const s = sourceAt(tl, t)!;
      expect(s.srcMs).toBeGreaterThanOrEqual(prev);
      prev = s.srcMs;
    }
    expect(sourceAt(tl, 500)).toMatchObject({ srcMs: 7000, held: true });
    expect(sourceAt(tl, 1000 + 600)!.srcMs).toBeCloseTo(7000 + 300, 6);       // subida a 0,5×: 600 ms exportados = 300 de fuente
    expect(sourceAt(tl, 1000 + 1200 + 1000 + 800)!.srcMs).toBeCloseTo(7600 + 200, 6);   // bajada a 0,25×
    expect(sourceAt(tl, tl.totalMs)).toBeNull();
    expect(sourceAt(tl, -1)).toBeNull();
  });

  it('el número de cuadros sale de la duración y el fps', () => {
    const tl = buildTimeline(swingSegments(marks, ['A']));
    expect(frameCount(tl, 30)).toBe(Math.round((tl.totalMs * 30) / 1000));
    expect(exportMsOfFrame(30, 30)).toBe(1000);
  });

  it('la plantilla de comparación lleva los dos clips en cada segmento', () => {
    const segs = swingSegments(marks, ['A', 'B']);
    expect(segs.every((s) => s.sources.join() === 'A,B')).toBe(true);
  });

  it('la plantilla vuelo: 1× y luego 0,5× desde 0,2 s antes del impacto hasta el fin del trazo', () => {
    const segs = flightSegments({ source: 'A', startMs: 6800, impactMs: 8000, traceEndMs: 9800 });
    expect(segs[0]).toMatchObject({ speed: 1, fromMs: 6800, toMs: 7800 });
    expect(segs[1]).toMatchObject({ speed: 0.5, fromMs: 7800, toMs: 9800 });
    expect(buildTimeline(segs).totalMs).toBeCloseTo(1000 + 4000, 6);
  });

  it('rechaza fases fuera de orden, segmentos vacíos y excesos de 60 s', () => {
    expect(() => swingSegments({ address: 8000, top: 7600, impact: 9000 }, ['A'])).toThrow(RangeError);
    expect(() => buildTimeline([{ kind: 'hold', sources: ['A'], atMs: 1, durMs: 0 }])).toThrow(RangeError);
    expect(() => buildTimeline([{ kind: 'play', sources: ['A'], fromMs: 5, toMs: 1, speed: 1 }])).toThrow(RangeError);
    expect(() => flightSegments({ source: 'A', startMs: 9000, impactMs: 8000, traceEndMs: 9800 })).toThrow(RangeError);
    const long: Segment[] = [{ kind: 'play', sources: ['A'], fromMs: 0, toMs: 20_000, speed: 0.25 }];   // 80 s
    expect(fitsLimit(buildTimeline(long))).toBe(false);
  });

  it('60 fps solo con fuente de 60 y sin cámara lenta', () => {
    expect(chooseFps(60, [{ kind: 'play', sources: ['A'], fromMs: 0, toMs: 1000, speed: 1 }])).toBe(60);
    expect(chooseFps(60, swingSegments(marks, ['A']))).toBe(30);
    expect(chooseFps(30, [{ kind: 'play', sources: ['A'], fromMs: 0, toMs: 1000, speed: 1 }])).toBe(30);
  });

  it('un instante que la línea no muestra no tiene tiempo de exportación ni audio', () => {
    const tl = buildTimeline(swingSegments(marks, ['A']));
    expect(exportTimeOfSource(tl, 5000)).toBeNull();
    expect(impactAudioCue(tl, 'A', 5000)).toBeNull();
  });
});
