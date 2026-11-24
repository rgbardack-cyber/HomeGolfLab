/**
 * Codificación de la exportación (plan 4.8, F8.5): cuadros de `renderExportFrame` → H.264 con WebCodecs, audio AAC si existe el
 * codificador, MP4 con `faststart` (todo con `mediabunny`, sin servidor). Cancelable, con progreso y cediendo el hilo cada pocos
 * cuadros para no bloquear la interfaz.
 *
 * Si el WebView no puede codificar H.264 (`canEncodeVideo` falso) se lanza `ExportError('no_video_encoder')`: según la decisión D7
 * NO se empieza código nativo hasta que esto falle en un dispositivo real; el respaldo `MediaRecorder` queda para quien llame.
 * Sin codificador AAC la exportación sale SIN audio y con aviso (nunca se inventa sonido).
 */
import { ALL_FORMATS, AudioBufferSink, AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output, canEncodeAudio, canEncodeVideo } from 'mediabunny';
import { detectImpact, IMPACT_REJECTION_TEXT } from '../audio/impact';
import { exportMsOfFrame, frameCount, impactAudioCue, type AudioCue, type Timeline } from './timeline';
import { OUT_H, OUT_W, panelsFor, renderExportFrame, type ChromeInput, type ExportOptions, type ExportSource } from './render';
import { t } from '@/i18n';

export type ExportErrorCode = 'no_video_encoder' | 'cancelled' | 'no_video_track' | 'failed';
export class ExportError extends Error {
  constructor(readonly code: ExportErrorCode, message: string) { super(message); }
}

export const VIDEO_BITRATE = 10_000_000;
export const AUDIO_BITRATE = 160_000;
export const AUDIO_RATE = 48000;

export interface ExportCaps { video: boolean; audio: boolean }
/** ¿Se puede codificar H.264 1080×1920 y AAC en este navegador/WebView? */
export async function exportCapabilities(fps: number): Promise<ExportCaps> {
  const video = await canEncodeVideo('avc', { width: OUT_W, height: OUT_H, bitrate: VIDEO_BITRATE, frameRate: fps }).catch(() => false);
  const audio = await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: AUDIO_RATE, bitrate: AUDIO_BITRATE }).catch(() => false);
  return { video, audio };
}

export interface ExportJob {
  timeline: Timeline;
  sources: ExportSource[];
  blobs: Blob[];
  options: ExportOptions;
  fps: 30 | 60;
  audio: 'impact' | 'silence';
  /** Impacto visual de la fuente 0 (para buscar el golpe en el audio). */
  impactMs?: number;
  logo: CanvasImageSource | null;
  legend: ChromeInput['legend'];
  footer?: string;
}
export interface ExportHooks { onProgress?: (fraction: number) => void; signal?: AbortSignal }
export interface ExportResult { blob: Blob; durationMs: number; frames: number; fps: number; audio: 'impact' | 'silence'; audioNote?: string }

/** Cuántos cuadros se codifican antes de ceder el hilo a la interfaz. */
const YIELD_EVERY = 6;

/**
 * Busca el golpe en el audio de la fuente 0 y arma el AudioBuffer de la salida (silencio + el corte colocado, con fundidos de 30 ms).
 * Devuelve null con el motivo si no se puede (se exporta en silencio con aviso).
 */
async function buildAudio(job: ExportJob): Promise<{ buffer: AudioBuffer; cue: AudioCue } | { note: string }> {
  if (job.impactMs === undefined) return { note: 'No hay impacto marcado para buscar el sonido.' };
  const input = new Input({ source: new BlobSource(job.blobs[0]), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return { note: 'El video no tiene audio.' };
    if (!(await track.canDecode())) return { note: 'Este dispositivo no puede leer el audio del video.' };
    const sink = new AudioBufferSink(track);
    const from = Math.max(0, job.impactMs / 1000 - 1.6), to = job.impactMs / 1000 + 1.6;
    const parts: { t: number; buf: AudioBuffer }[] = [];
    for await (const w of sink.buffers(from, to)) parts.push({ t: w.timestamp, buf: w.buffer });
    if (!parts.length) return { note: IMPACT_REJECTION_TEXT.no_audio };
    const sr = parts[0].buf.sampleRate, ch = parts[0].buf.numberOfChannels;
    const total = Math.round((to - from) * sr), mono = new Float32Array(total), chans = Array.from({ length: Math.min(2, ch) }, () => new Float32Array(total));
    for (const p of parts) {
      const off = Math.round((p.t - from) * sr);
      for (let c = 0; c < ch; c++) {
        const d = p.buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const j = off + i;
          if (j < 0 || j >= total) continue;
          mono[j] += d[i] / ch;
          if (c < chans.length) chans[c][j] = d[i];
        }
      }
    }
    const det = detectImpact(mono, sr, job.impactMs - from * 1000, { rawChannels: chans });
    if (!det.ok) return { note: t(`impact.${det.reason}`) };
    const onsetSrc = from * 1000 + det.onsetMs;
    const cue = impactAudioCue(job.timeline, job.sources[0].id, onsetSrc, job.impactMs);
    if (!cue) return { note: t('export.noImpact') };
    // Salida: silencio de la duración total con el corte en su sitio.
    const outLen = Math.ceil((job.timeline.totalMs / 1000) * AUDIO_RATE);
    const out = new AudioBuffer({ length: outLen, numberOfChannels: 2, sampleRate: AUDIO_RATE });
    const o0 = out.getChannelData(0), o1 = out.getChannelData(1);
    const n = Math.round(((cue.srcToMs - cue.srcFromMs) / 1000) * AUDIO_RATE), fade = Math.round((cue.fadeMs / 1000) * AUDIO_RATE), at = Math.round((cue.atExportMs / 1000) * AUDIO_RATE);
    for (let i = 0; i < n; i++) {
      const srcIdx = Math.round((cue.srcFromMs - from * 1000) / 1000 * sr + (i / AUDIO_RATE) * sr);
      if (srcIdx < 0 || srcIdx >= total || at + i >= outLen) continue;
      const g = Math.min(1, i / fade, (n - 1 - i) / fade);
      o0[at + i] = chans[0][srcIdx] * g;
      o1[at + i] = (chans[1] ?? chans[0])[srcIdx] * g;
    }
    return { buffer: out, cue };
  } finally {
    input.dispose();
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Exporta el MP4. Lanza `ExportError` (cancelado, sin codificador, sin pista de video o fallo). */
export async function runExport(job: ExportJob, hooks: ExportHooks = {}): Promise<ExportResult> {
  // La marca de agua no se omite en silencio (revisión F8): si se pidió y el logo no está, se falla antes de gastar tiempo.
  if (job.options.watermark && !job.logo) throw new ExportError('failed', 'No se pudo cargar la marca de agua.');
  const caps = await exportCapabilities(job.fps);
  if (!caps.video) throw new ExportError('no_video_encoder', 'Este dispositivo no puede codificar video H.264 desde la app.');
  const inputs = job.blobs.map((b) => new Input({ source: new BlobSource(b), formats: ALL_FORMATS }));
  const panels = panelsFor(job.options.template, job.sources.length);
  let output: Output | null = null;
  try {
    const sinks: CanvasSink[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const vt = await inputs[i].getPrimaryVideoTrack();
      if (!vt) throw new ExportError('no_video_track', 'El archivo no tiene pista de video.');
      const r = panels[Math.min(i, panels.length - 1)].rect;
      sinks.push(new CanvasSink(vt, { width: Math.round(r.w), height: Math.round(r.h), fit: 'contain' }));
    }
    let audioNote: string | undefined, audio: Awaited<ReturnType<typeof buildAudio>> | null = null;
    if (job.audio === 'impact') {
      if (!caps.audio) audioNote = 'Este dispositivo no puede codificar audio AAC: el video sale sin sonido.';
      else { audio = await buildAudio(job); if ('note' in audio) { audioNote = audio.note; audio = null; } }
    }
    if (hooks.signal?.aborted) throw new ExportError('cancelled', t('ex2.cancelled'));

    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(OUT_W, OUT_H) : Object.assign(document.createElement('canvas'), { width: OUT_W, height: OUT_H });
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) throw new ExportError('failed', t('export.noCanvas'));
    output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const vsrc = new CanvasSource(canvas, { codec: 'avc', bitrate: VIDEO_BITRATE, keyFrameInterval: 2 });
    output.addVideoTrack(vsrc, { frameRate: job.fps });
    let asrc: AudioBufferSource | null = null;
    if (audio && 'buffer' in audio) { asrc = new AudioBufferSource({ codec: 'aac', bitrate: AUDIO_BITRATE }); output.addAudioTrack(asrc); }
    await output.start();
    if (asrc && audio && 'buffer' in audio) await asrc.add(audio.buffer);

    // Los cuadros decodificados se guardan por fuente: en las pausas y en la cámara lenta el mismo cuadro se reusa.
    const cache: ({ key: number; canvas: CanvasImageSource } | null)[] = job.blobs.map(() => null);
    const getBase = async (i: number, srcMs: number) => {
      const key = Math.round(srcMs * 1000);
      const hit = cache[i];
      if (hit && hit.key === key) return hit.canvas;
      const w = await sinks[i].getCanvas(Math.max(0, srcMs / 1000));
      if (w) cache[i] = { key, canvas: w.canvas };
      return w ? w.canvas : hit?.canvas ?? null;
    };

    const n = frameCount(job.timeline, job.fps);
    for (let f = 0; f < n; f++) {
      if (hooks.signal?.aborted) throw new ExportError('cancelled', t('ex2.cancelled'));
      const ms = Math.min(exportMsOfFrame(f, job.fps), job.timeline.totalMs - 1e-6);
      await renderExportFrame(ctx, OUT_W, OUT_H, job.timeline, job.sources, job.options, ms, getBase, { watermark: job.options.watermark, logo: job.logo, legend: job.legend, footer: job.footer });
      await vsrc.add(f / job.fps, 1 / job.fps);
      if (f % 4 === 0) hooks.onProgress?.(f / n);
      if (f % YIELD_EVERY === 0) await tick();
    }
    if (hooks.signal?.aborted) throw new ExportError('cancelled', t('ex2.cancelled'));     // antes de cerrar el archivo
    await output.finalize();
    hooks.onProgress?.(1);
    const buf = (output.target as BufferTarget).buffer;
    if (!buf) throw new ExportError('failed', t('export.noFile'));
    return { blob: new Blob([buf], { type: 'video/mp4' }), durationMs: (n / job.fps) * 1000, frames: n, fps: job.fps, audio: audio && 'buffer' in audio ? 'impact' : 'silence', audioNote };
  } catch (e) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
    if (e instanceof ExportError) throw e;
    throw new ExportError('failed', e instanceof Error ? e.message : t('export.failed'));
  } finally {
    inputs.forEach((i) => i.dispose());
  }
}
