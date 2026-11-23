import type { Session } from '@/store';
import type { FlightTrack } from '../flightTrack';
import type { MediaStore } from './store';
import { MEDIA_ERROR_TEXT, MediaStoreError } from './types';

export interface PersistFlightInput {
  file: Blob;
  video: { durationMs: number; w: number; h: number };
  track: FlightTrack;
}
export type PersistFlightOutcome =
  | { ok: true; ids: Required<Pick<Session, 'mediaId' | 'flightTrackId'>>; persistent: boolean }
  | { ok: false; message: string };

/**
 * Guarda el video fuente y el `FlightTrack` de un tiro (plan F5.7, opcional, lo pide el usuario). Los puntos viven en un
 * registro JSON fuera de localStorage; la sesión solo guarda los ids. Si algo falla no queda nada a medias.
 * La sesión que lo guarda es `tracking` con `flightOnly`: NO mezcla con la dispersión (tiros, rachas ni medallas de tracking).
 */
export async function persistFlight(store: MediaStore, i: PersistFlightInput): Promise<PersistFlightOutcome> {
  let mediaId: string | undefined, flightTrackId: string | undefined;
  try {
    const ref = await store.saveMedia(i.file, {
      kind: 'source', mime: i.file.type || 'video/mp4', durationMs: i.video.durationMs, w: i.video.w, h: i.video.h, rotation: 0, clock: i.track.clock,
    });
    mediaId = ref.id;
    flightTrackId = await store.saveJsonRecord({ ...i.track, sourceId: ref.id });
    return { ok: true, ids: { mediaId, flightTrackId }, persistent: store.persistent };
  } catch (e) {
    if (mediaId) await store.deleteMedia(mediaId).catch(() => undefined);
    if (flightTrackId) await store.deleteRecord(flightTrackId).catch(() => undefined);
    return { ok: false, message: e instanceof MediaStoreError ? MEDIA_ERROR_TEXT[e.code] : MEDIA_ERROR_TEXT.unavailable };
  }
}
