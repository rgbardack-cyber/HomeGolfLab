import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import { detectImpact } from '../audio/impact';

/**
 * «Con bola» o «sin sonido de golpe» (plan F10.3). Un golpe es «con bola» si hay un transitorio de impacto (reglas de `detectImpact`:
 * ≥ 15 dB sobre el fondo, sin segundo golpe, sin saturación) en ±100 ms del impacto visual. Si no, se dice «sin sonido de golpe»:
 * NUNCA se afirma que fue práctica (un micrófono tapado o el viento también dan «sin sonido»).
 */
export type BallSound = 'con_bola' | 'sin_sonido_de_golpe' | 'sin_audio';

export function classifyBallSound(pcm: Float32Array | null, sampleRate: number, visualImpactMs: number, rawChannels?: Float32Array[]): BallSound {
  if (!pcm || !pcm.length) return 'sin_audio';
  const r = detectImpact(pcm, sampleRate, visualImpactMs, { searchMs: 100, rawChannels });
  return r.ok ? 'con_bola' : r.reason === 'no_audio' ? 'sin_audio' : 'sin_sonido_de_golpe';
}

/** Decodifica el audio de un recorte (mediabunny) y lo clasifica; 'sin_audio' si no tiene pista o no se puede decodificar. */
export async function classifyClipSound(clip: Blob, visualImpactMs: number): Promise<BallSound> {
  const input = new Input({ source: new BlobSource(clip), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return 'sin_audio';
    const parts: AudioBuffer[] = [];
    for await (const w of new AudioBufferSink(track).buffers(0)) parts.push(w.buffer);
    if (!parts.length) return 'sin_audio';
    const sr = parts[0].sampleRate, total = parts.reduce((a, b) => a + b.length, 0), mono = new Float32Array(total);
    let off = 0;
    for (const b of parts) { for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) mono[off + i] += d[i] / b.numberOfChannels; } off += b.length; }
    return classifyBallSound(mono, sr, visualImpactMs);
  } catch {
    return 'sin_audio';
  } finally {
    input.dispose();
  }
}

export const BALL_SOUND_LABEL: Record<BallSound, string> = { con_bola: 'Con bola', sin_sonido_de_golpe: 'Sin sonido de golpe', sin_audio: 'Sin audio' };
