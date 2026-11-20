/**
 * Decodifica la pista de audio de un video con Web Audio (plan 4.8, F8.3) y la mezcla a mono para `detectImpact`.
 * Solo corre en el navegador/WebView. Devuelve `null` si el archivo no tiene audio o el navegador no lo decodifica
 * (la exportación sale entonces en silencio, con aviso).
 *
 * Límite: se decodifica el archivo entero en memoria; para videos largos (cientos de MB) se pasa solo el tramo útil
 * (`slice` del Blob) y se suma el desfase al resultado. `decodeAudioData` necesita un contenedor completo, así que el
 * llamador debe cortar con un demultiplexor (mediabunny) y no con `Blob.slice` si el archivo es largo.
 */
export interface DecodedAudio { pcm: Float32Array; sampleRate: number; durationMs: number }

export async function decodeMonoAudio(file: Blob): Promise<DecodedAudio | null> {
  const Ctx = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
    }
    return { pcm: mono, sampleRate: buf.sampleRate, durationMs: buf.duration * 1000 };
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => undefined);
  }
}
