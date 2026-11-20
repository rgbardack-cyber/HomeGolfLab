import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clipWindow, LiveRecorder, pickRecorderMime, REC, type RecorderDeps, type RecorderLike } from './recorder';

class FakeRec implements RecorderLike {
  state = 'inactive';
  ondataavailable: RecorderLike['ondataavailable'] = null;
  onerror: RecorderLike['onerror'] = null;
  onstop: RecorderLike['onstop'] = null;
  started: number | undefined;
  start(slice?: number) { this.state = 'recording'; this.started = slice; }
  stop() { this.state = 'inactive'; queueMicrotask(() => this.onstop?.()); }
  emit(n = 1000) { this.ondataavailable?.({ data: new Blob([new Uint8Array(n)]) }); }
}

describe('grabación en vivo (F10.4)', () => {
  let clock = 0;
  let rec: FakeRec;
  const deps = (supported: string[] = ['video/webm']): RecorderDeps => ({ create: () => (rec = new FakeRec()), isSupported: (t) => supported.includes(t), now: () => clock });
  beforeEach(() => { clock = 10_000; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('prefiere MP4 y cae a WebM; sin soporte no graba', () => {
    expect(pickRecorderMime((t) => t === 'video/mp4')).toBe('video/mp4');
    expect(pickRecorderMime((t) => t === 'video/webm')).toBe('video/webm');
    expect(pickRecorderMime(() => false)).toBeNull();
    expect(new LiveRecorder(deps([])).start({} as MediaStream)).toBe(false);
  });

  it('graba en trozos de 1 s, junta lo recibido y devuelve un Blob del tipo elegido', async () => {
    const r = new LiveRecorder(deps(['video/webm']));
    expect(r.start({} as MediaStream)).toBe(true);
    expect(rec.started).toBe(REC.sliceMs);
    rec.emit(500); rec.emit(700);
    expect(r.sizeBytes).toBe(1200);
    const b = await r.stop();
    expect(b!.size).toBe(1200);
    expect(b!.type).toBe('video/webm');
    expect(await r.stop()).toBe(b);                       // se puede llamar de nuevo
  });

  it('marca los golpes en milisegundos DE LA GRABACIÓN', () => {
    const r = new LiveRecorder(deps());
    r.start({} as MediaStream);
    expect(r.markAt(10_000 + 4321)).toBe(4321);
    expect(r.markAt(9_000)).toBe(0);                      // anterior al inicio
  });

  it('avisa a los 12 min y se detiene sola a los 15', async () => {
    const events: string[] = [];
    const r = new LiveRecorder(deps(), (e) => events.push(e));
    r.start({} as MediaStream);
    rec.emit();
    clock += REC.warnMs; await vi.advanceTimersByTimeAsync(1000);
    expect(events).toEqual(['warn']);
    clock += REC.maxMs - REC.warnMs; await vi.advanceTimersByTimeAsync(1000);
    expect(events).toEqual(['warn', 'limit']);
    expect(rec.state).toBe('inactive');
    expect(r.recording).toBe(false);
  });

  it('sin datos devuelve null; discard() libera todo', async () => {
    const r = new LiveRecorder(deps());
    r.start({} as MediaStream);
    expect(await r.stop()).toBeNull();
    const r2 = new LiveRecorder(deps());
    r2.start({} as MediaStream); rec.emit(2000);
    r2.discard();
    expect(r2.sizeBytes).toBe(0);
  });
});

describe('ventana de recorte (F10.4)', () => {
  it('±2 s alrededor del swing, sin salirse de la grabación', () => {
    expect(clipWindow(10_000, 12_500, 60_000)).toEqual({ fromMs: 8000, toMs: 14_500 });
    expect(clipWindow(500, 3000, 60_000)).toEqual({ fromMs: 0, toMs: 5000 });
    expect(clipWindow(58_000, 59_500, 60_000)).toEqual({ fromMs: 56_000, toMs: 60_000 });
  });
  it('un recorte de menos de 1 s no se hace', () => {
    expect(clipWindow(100, 200, 500)).toBeNull();
  });
});
