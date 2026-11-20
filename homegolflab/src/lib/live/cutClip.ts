import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';

/**
 * Recorta [fromMs, toMs] de una grabación (F10.4) con el mismo `mediabunny` de la exportación; sin servidor.
 * La salida es MP4 si la grabación era MP4 y WebM si era WebM. Devuelve null si no se pudo (formato no legible o recorte vacío).
 */
export async function cutClip(src: Blob, fromMs: number, toMs: number): Promise<Blob | null> {
  if (!(toMs > fromMs)) return null;
  const input = new Input({ source: new BlobSource(src), formats: ALL_FORMATS });
  try {
    const mp4 = src.type.includes('mp4');
    const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
    const conv = await Conversion.init({ input, output, trim: { start: fromMs / 1000, end: toMs / 1000 } });
    if (!conv.isValid) return null;
    await conv.execute();
    const buf = (output.target as BufferTarget).buffer;
    return buf ? new Blob([buf], { type: mp4 ? 'video/mp4' : 'video/webm' }) : null;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}
