import type { Session } from '@/store';
import type { SwingResult, Frame } from '../swing';
import { makeClock } from './clock';
import { framesToPoseTrack } from './poseTrack';
import type { MediaStore } from './store';
import { MEDIA_ERROR_TEXT, MediaStoreError } from './types';

export interface PersistInput {
  file: Blob;
  /** Cuadros de la pasada usada para el análisis y su frecuencia (30 si fue la fina, 10 si se cayó a la gruesa). */
  frames: readonly Frame[];
  hz: number;
  video: { durationMs: number; w: number; h: number };
  sessionId: string;
  result: Pick<SwingResult, 'times'>;
}
export type PersistOutcome =
  | { ok: true; ids: Pick<Session, 'mediaId' | 'poseTrackId'>; persistent: boolean }
  | { ok: false; message: string };

/**
 * Guarda el video fuente y la pista de postura de un análisis exitoso (plan 3.1) sin tocar `analyzeSwing`.
 * Si algo falla, el análisis ya está guardado: se devuelve un mensaje en español y no queda nada a medias.
 * El reloj se guarda como `estimated` (30 fps): el navegador no entrega los fps del archivo; la revisión los afina
 * con los cuadros presentados y el usuario puede corregirlos.
 */
export async function persistReview(store: MediaStore, i: PersistInput): Promise<PersistOutcome> {
  let mediaId: string | undefined;
  try {
    const ref = await store.saveMedia(i.file, {
      kind: 'source', mime: i.file.type || 'video/mp4', durationMs: i.video.durationMs, w: i.video.w, h: i.video.h, rotation: 0,
      clock: makeClock({ fpsNominal: 30, fpsSource: 'estimated' }), sessionId: i.sessionId,
    });
    mediaId = ref.id;
    const poseTrackId = await store.savePoseTrack(framesToPoseTrack(i.frames, ref.id, i.hz));
    return { ok: true, ids: { mediaId, poseTrackId }, persistent: store.persistent };
  } catch (e) {
    if (mediaId) await store.deleteMedia(mediaId).catch(() => undefined);
    return { ok: false, message: e instanceof MediaStoreError ? MEDIA_ERROR_TEXT[e.code] : MEDIA_ERROR_TEXT.unavailable };
  }
}
