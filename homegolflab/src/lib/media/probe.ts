import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { Rotation } from 'mediabunny';

/**
 * Lectura de metadatos de un video SIN reproducirlo (plan 4, F8.1): códecs, tamaño, rotación, cuadros por segundo reales del
 * contenedor y audio. Usa `mediabunny` (lee MP4/MOV con H.264/HEVC/AAC; otros códecs se reportan aunque no se puedan decodificar).
 * Corre en el navegador y en el WebView; no necesita servidor.
 *
 * `fps` sale de los paquetes del contenedor (promedio): es el valor que `Clock` usa con `fpsSource: 'container'`.
 * `slowMotionHint` es solo una PISTA (cuadros por segundo muy por encima de 30 con duración de teléfono no la prueba): nunca
 * se usa para decidir nada sin que el usuario lo confirme.
 */
export interface MediaProbe {
  durationS: number;
  firstTimestampS: number;
  mime: string;
  video: { codec: string | null; codecString: string | null; width: number; height: number; rotation: Rotation; fps: number; canDecode: boolean } | null;
  audio: { codec: string | null; channels: number; sampleRate: number; canDecode: boolean } | null;
}

export async function probeMedia(file: Blob): Promise<MediaProbe> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const [v, a] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    const stats = v ? await v.computePacketStats(200) : null;
    return {
      durationS: await input.computeDuration(),
      firstTimestampS: await input.getFirstTimestamp(),
      mime: await input.getMimeType(),
      video: v ? {
        codec: v.codec, codecString: await v.getCodecParameterString(),
        width: await v.getDisplayWidth(), height: await v.getDisplayHeight(), rotation: await v.getRotation(),
        fps: stats ? Math.round(stats.averagePacketRate * 100) / 100 : 0, canDecode: await v.canDecode(),
      } : null,
      audio: a ? { codec: a.codec, channels: a.numberOfChannels, sampleRate: a.sampleRate, canDecode: await a.canDecode() } : null,
    };
  } finally {
    input.dispose();
  }
}
