import { describe, expect, it } from 'vitest';
import { computeStats, newBadges } from '../badges';
import { buildFlightTrack, type FlightTrack } from '../flightTrack';
import { makeClock } from './clock';
import { MemoryBackend } from './backends';
import { persistFlight } from './persistFlight';
import { MediaStore } from './store';

const clock = makeClock({ fpsNominal: 60, fpsSource: 'user' });
const pts = Array.from({ length: 20 }, (_, i) => ({ t: 7000 + (i * 1000) / 60, x: 0.3 + 0.01 * i, y: 0.6 - 0.01 * i, source: 'detected' as const }));
const track = (): FlightTrack => buildFlightTrack({ points: pts, lostAtMs: null, endReason: null, released: true }, { sourceId: 'x', clock, tap: { x: 0.3, y: 0.6, t: 6800 }, aspect: 0.5625, analysisH: 1000, clipEndMs: 20000, allowEstimate: false });
const input = () => ({ file: new Blob([new Uint8Array(500)], { type: 'video/mp4' }), video: { durationMs: 20000, w: 1080, h: 1920 }, track: track() });

describe('persistFlight (F5.7)', () => {
  it('guarda video y seguimiento enlazados: el registro vuelve igual y apunta al video', async () => {
    const st = new MediaStore(new MemoryBackend());
    const out = await persistFlight(st, input());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const rec = await st.loadJsonRecord<FlightTrack>(out.ids.flightTrackId);
    expect(rec).toMatchObject({ v: 2, engine: 'ballflight@2', sourceId: out.ids.mediaId });
    expect(rec!.observed).toHaveLength(20);
    expect(rec!.clock).toEqual(clock);
    expect(await st.listRefs()).toHaveLength(1);
  });

  it('si falla guardar el registro, no queda el video a medias y avisa en español', async () => {
    const be = new MemoryBackend(), st = new MediaStore(be);
    be.putJson = async (id: string, v: unknown) => { if (!id.endsWith('.ref')) throw new Error('boom'); return MemoryBackend.prototype.putJson.call(be, id, v); };
    const out = await persistFlight(st, input());
    expect(out.ok).toBe(false);
    expect((await be.list()).filter((e) => e.kind === 'blob')).toEqual([]);
  });

  it('una sesión flightOnly no cuenta como tracking: ni tiros ni medalla "En la mira"', () => {
    const base = { type: 'tracking' as const, mode: 'casa' as const, date: '2026-11-19' };
    const withFlight = computeStats([{ ...base, flightOnly: true }], '2026-11-19');
    expect(withFlight.tracking).toBe(0);
    expect(withFlight.shots).toBe(0);
    expect(newBadges(withFlight, [])).not.toContain('first_tracking');
    const real = computeStats([{ ...base, shots: 6 }], '2026-11-19');
    expect(real.tracking).toBe(1);
    expect(newBadges(real, [])).toContain('first_tracking');
  });
});
