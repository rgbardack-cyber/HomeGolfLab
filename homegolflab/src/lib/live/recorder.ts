/**
 * Grabación de la sesión en vivo (plan F10.4). Envuelve `MediaRecorder` sobre el stream de la cámara (y el micrófono si el usuario lo
 * permitió) con trozos de 1 s, marcas de cada golpe en milisegundos de la grabación y un tope de 15 minutos [PROPUESTA] con aviso a los 12.
 * Todo lo del navegador entra por parámetros para probarlo sin cámara.
 *
 * Los trozos se guardan EN MEMORIA (no en almacenamiento temporal como pedía el plan): con 15 min a ~2,5 Mbps son ≈ 280 MB; por eso el tope.
 * La grabación completa nunca se conserva: al terminar se cortan los swings y se descarta.
 */
export const REC = { maxMs: 15 * 60_000, warnMs: 12 * 60_000, sliceMs: 1000 } as const;

/** Elige el tipo de grabación: prefiere MP4 (se puede compartir tal cual) y cae a WebM. */
export function pickRecorderMime(isSupported: (t: string) => boolean): string | null {
  const prefer = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return prefer.find((t) => isSupported(t)) ?? null;
}

export interface RecorderLike {
  state: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onstop: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}
export interface RecorderDeps {
  create(stream: MediaStream, mime: string): RecorderLike;
  isSupported(t: string): boolean;
  now(): number;
}

export type RecEvent = 'warn' | 'limit';

export class LiveRecorder {
  private rec: RecorderLike | null = null;
  private chunks: Blob[] = [];
  private t0 = 0;
  private bytes = 0;
  mime: string | null = null;
  private warned = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private finished: Promise<Blob | null> | null = null;

  constructor(private readonly deps: RecorderDeps, private readonly onEvent: (e: RecEvent) => void = () => undefined) {}

  get recording(): boolean { return !!this.rec && this.rec.state === 'recording'; }
  get sizeBytes(): number { return this.bytes; }
  /** Milisegundos transcurridos desde que empezó la grabación. */
  elapsedMs(): number { return this.t0 ? this.deps.now() - this.t0 : 0; }

  /** Empieza a grabar. Devuelve false si el navegador no sabe grabar ningún tipo. */
  start(stream: MediaStream): boolean {
    const mime = pickRecorderMime((t) => this.deps.isSupported(t));
    if (!mime) return false;
    this.mime = mime;
    this.chunks = []; this.bytes = 0; this.warned = false;
    this.rec = this.deps.create(stream, mime);
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) { this.chunks.push(e.data); this.bytes += e.data.size; } };
    this.t0 = this.deps.now();
    this.rec.start(REC.sliceMs);
    this.timer = setInterval(() => this.tick(), 1000);
    return true;
  }

  private tick(): void {
    const el = this.elapsedMs();
    if (!this.warned && el >= REC.warnMs) { this.warned = true; this.onEvent('warn'); }
    if (el >= REC.maxMs) { this.onEvent('limit'); void this.stop(); }
  }

  /** Marca un instante (ms de `deps.now()`) en milisegundos DE LA GRABACIÓN. Antes de empezar o con un instante anterior da 0. */
  markAt(nowMs: number): number { return Math.max(0, nowMs - this.t0); }

  /** Detiene y devuelve la grabación completa (o null si no se grabó nada). Se puede llamar más de una vez. */
  stop(): Promise<Blob | null> {
    if (this.finished) return this.finished;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const rec = this.rec;
    this.finished = new Promise<Blob | null>((resolve) => {
      if (!rec || rec.state === 'inactive') { resolve(this.build()); return; }
      rec.onstop = () => resolve(this.build());
      rec.onerror = () => resolve(this.build());
      try { rec.stop(); } catch { resolve(this.build()); }
    });
    return this.finished;
  }

  private build(): Blob | null {
    if (!this.chunks.length) return null;
    return new Blob(this.chunks, { type: (this.mime ?? 'video/webm').split(';')[0] });
  }

  /** Libera los trozos (la grabación completa no se conserva). */
  discard(): void { this.chunks = []; this.bytes = 0; this.rec = null; this.finished = null; }
}

/** Ventana de recorte de un swing en la grabación: de 2 s antes del primer cuadro del swing a 2 s después del último (plan 10.4: ±2 s). */
export function clipWindow(swingFirstMs: number, swingLastMs: number, recordingMs: number): { fromMs: number; toMs: number } | null {
  const from = Math.max(0, swingFirstMs - 2000), to = Math.min(recordingMs, swingLastMs + 2000);
  return to - from >= 1000 ? { fromMs: from, toMs: to } : null;
}
