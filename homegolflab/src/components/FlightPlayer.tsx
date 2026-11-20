import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { debugReview, type DebugBag } from '@/lib/debugHook';
import { flightLayer, type FlightTrack } from '@/lib/flightTrack';
import { frameOf } from '@/lib/media/clock';
import { buildDrawList, paint } from '@/lib/overlay/draw';
import { FLIGHT_LEGEND, FLIGHT_STYLES, LOST_LABEL, type FlightKind } from '@/lib/overlay/model';
import { makeViewport } from '@/lib/overlay/viewport';
import { SPEED_LABEL, SPEEDS, seekTimeForFrame, type Speed } from '@/lib/reviewPlayer';
import { Notice, Segmented } from '@/components/ui';

const chip = 'h-9 px-3 rounded-full text-xs font-semibold border bg-card border-border';

/**
 * Reproductor del tiro (F5.6, detrás de `flags.flightV2`): el video con el trazo creciendo cuadro a cuadro, dibujado con el
 * MISMO compositor que usará la exportación. Leyenda con los cuatro estilos y el anillo de «Última vez vista». Todo lo que se
 * dibuja sale de `FlightTrack`: puntos detectados, huecos, bajada confirmada EN LA IMAGEN y, solo con permiso, la estimación.
 */
export default function FlightPlayer({ url, track, w, h, startMs }: { url: string; track: FlightTrack; w: number; h: number; startMs: number }) {
  const vRef = useRef<HTMLVideoElement>(null);
  const cRef = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const tRef = useRef(0);
  const dbg = useRef<DebugBag | null>(null);
  const [speed, setSpeed] = useState<Speed>(1);
  const [playing, setPlaying] = useState(false);
  const [uiT, setUiT] = useState(startMs);

  const draw = useCallback((tMs: number) => {
    const c = cRef.current, box = wrap.current;
    if (!c || !box) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.round(box.clientWidth * dpr), ch = Math.round(box.clientHeight * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    paint(ctx, buildDrawList({ flight: flightLayer(track) }, tMs, makeViewport(w, h, { x: 0, y: 0, w: cw, h: ch })));
  }, [track, w, h]);

  useEffect(() => {
    const v = vRef.current;
    if (!v) return;
    let stop = false, id = 0;
    if (import.meta.env.DEV) dbg.current = debugReview({ flightPlayer: true });
    const onFrame = (tMs: number, m?: VideoFrameCallbackMetadata) => {
      tRef.current = tMs;
      draw(tMs);
      if (dbg.current) Object.assign(dbg.current, { t: tMs, frame: frameOf(track.clock, tMs), presentedFrames: m?.presentedFrames ?? null });
      setUiT(tMs);
    };
    const cb = (_n: number, m: VideoFrameCallbackMetadata) => { if (stop) return; onFrame(m.mediaTime * 1000, m); id = v.requestVideoFrameCallback(cb); };
    const has = typeof v.requestVideoFrameCallback === 'function';
    const fb = () => onFrame(v.currentTime * 1000);
    if (has) id = v.requestVideoFrameCallback(cb); else { v.addEventListener('timeupdate', fb); v.addEventListener('seeked', fb); }
    return () => { stop = true; if (has) v.cancelVideoFrameCallback(id); else { v.removeEventListener('timeupdate', fb); v.removeEventListener('seeked', fb); } };
  }, [draw, track.clock]);

  useEffect(() => { draw(tRef.current); }, [draw]);
  useEffect(() => {
    const box = wrap.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw(tRef.current));
    ro.observe(box);
    return () => ro.disconnect();
  }, [draw]);

  const last = track.observed[track.observed.length - 1];
  const from = Math.max(0, startMs), to = (last?.t ?? startMs) + 1500;
  const seek = (ms: number) => { const v = vRef.current; if (v) v.currentTime = ms / 1000; };
  const pause = () => { vRef.current?.pause(); setPlaying(false); };
  const toggle = () => {
    const v = vRef.current;
    if (!v) return;
    if (v.paused) { if (v.currentTime * 1000 >= to - 50) seek(from); v.playbackRate = speed; void v.play(); setPlaying(true); } else pause();
  };
  // Se detiene al llegar al final del tramo útil (poco después de la última vista), no al final del clip.
  useEffect(() => { if (playing && uiT >= to) pause(); }, [uiT, to, playing]);
  useEffect(() => { const v = vRef.current; if (v) v.currentTime = Math.max(0, startMs) / 1000; }, [startMs]);

  const d = track.descent;
  return (
    <div className="space-y-2" data-flight-player>
      <div ref={wrap} className="relative w-full mx-auto rounded-xl overflow-hidden bg-black" style={{ aspectRatio: `${w} / ${h}`, maxHeight: '65vh' }}>
        <video ref={vRef} src={url} muted playsInline preload="auto" className="absolute inset-0 w-full h-full object-contain" onEnded={() => setPlaying(false)} />
        <canvas ref={cRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      </div>
      <input type="range" aria-label="Posición del tiro" className="w-full accent-[hsl(var(--primary))]" min={from} max={to} step={1000 / track.clock.fpsNominal}
        value={Math.min(to, Math.max(from, uiT))} onChange={(e) => { pause(); seek(seekTimeForFrame(track.clock, frameOf(track.clock, +e.target.value))); }} />
      <div className="flex flex-wrap items-center gap-2">
        <button className={chip} onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproducir'}>{playing ? <Pause className="w-4 h-4 inline" /> : <Play className="w-4 h-4 inline" />}</button>
        <Segmented<`${Speed}`> value={`${speed}`} onChange={(v) => { setSpeed(+v as Speed); if (vRef.current) vRef.current.playbackRate = +v; }} options={SPEEDS.map((s) => ({ value: `${s}` as `${Speed}`, label: SPEED_LABEL[s] }))} />
      </div>
      <FlightLegend track={track} />
      {d.state === 'not_confirmed' && d.evidence.apexIndex !== null && <p className="text-xs text-muted-foreground" data-descent-chip>Bajada no confirmada: no hay suficientes puntos claros para afirmarlo.</p>}
      {d.state === 'confirmed' && <p className="text-xs text-muted-foreground">La bajada es EN LA IMAGEN{`; `}desde atrás la perspectiva puede adelantarla. No es el ápice real.</p>}
      {track.continuation.state === 'shown' && <Notice>La línea morada es una estimación con un modelo, no una medición. No la uses para juzgar el tiro.</Notice>}
    </div>
  );
}

const STYLE_KIND: FlightKind[] = ['observed', 'descent', 'gap', 'estimated'];

/** Leyenda con los estilos del compositor (misma fuente que el dibujo). Solo muestra los que aparecen en este tiro. */
function FlightLegend({ track }: { track: FlightTrack }) {
  const present = new Set(flightLayer(track).segments.map((s) => s.kind));
  const lost = track.observed.length > 0 && (track.endReason === 'lost' || track.endReason === 'frame_exit');
  const rows = FLIGHT_LEGEND.filter((r) => (r.kind === 'lost' ? lost : present.has(r.kind as FlightKind)));
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground px-1" aria-label="Leyenda" data-flight-legend>
      {rows.map((r) => {
        if (r.kind === 'lost') return <span key="lost" className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>{LOST_LABEL}</span>;
        const st = FLIGHT_STYLES[r.kind as (typeof STYLE_KIND)[number]];
        return (
          <span key={r.kind} className="flex items-center gap-1.5">
            <svg width="30" height="12" aria-hidden className="rounded bg-neutral-800"><line x1="2" y1="6" x2="28" y2="6" stroke={st.color} strokeWidth={Math.max(1.5, st.width * 1.3)} strokeDasharray={st.dash.map((x) => x * 2).join(' ') || undefined} /></svg>
            {st.label}
          </span>
        );
      })}
    </div>
  );
}
