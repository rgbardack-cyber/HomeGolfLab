import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Frame, Pt } from './swing';

// Modelo y motor incluidos en la app (carpeta public/), para que funcione sin depender de servidores externos.
const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe`;
const MODEL_PATH = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;

let loader: Promise<PoseLandmarker> | null = null;
let lastTs = 0;

/** `cpuOnly`: rehace el modelo en CPU (cuando el GPU falló al detectar, no solo al crear el modelo). */
export function loadPose(cpuOnly = false): Promise<PoseLandmarker> {
  if (!loader || cpuOnly) {
    loader = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      const make = (delegate: 'GPU' | 'CPU') =>
        PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL_PATH, delegate }, runningMode: 'VIDEO', numPoses: 1 });
      if (cpuOnly) return await make('CPU');
      try { return await make('GPU'); } catch { return await make('CPU'); }
    })();
    loader.catch(() => { loader = null; });
  }
  return loader;
}

const toPts = (a: { x: number; y: number; z: number; visibility?: number }[]): Pt[] => a.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 0 }));

/**
 * Detecta la postura en el cuadro actual del video. `t` es el tiempo que se guarda en el
 * resultado (ms); internamente MediaPipe exige marcas de tiempo siempre crecientes.
 */
export function detect(pose: PoseLandmarker, video: HTMLVideoElement, t: number): Frame | null {
  lastTs = Math.max(lastTs + 1, Math.round(performance.now()));
  const r = pose.detectForVideo(video, lastTs);
  if (!r.landmarks?.length) return null;
  return { t, lm: toPts(r.landmarks[0]), world: r.worldLandmarks?.[0] ? toPts(r.worldLandmarks[0]) : undefined };
}

/**
 * Como `detect`, pero si el GPU aborta al detectar (pasa con el equipo cargado) rehace el modelo en CPU y reintenta ese cuadro
 * una vez. Devuelve el modelo vigente: quien llama debe seguir usando ese.
 */
export async function detectResilient(
  pose: PoseLandmarker, video: HTMLVideoElement, t: number, reload: () => Promise<PoseLandmarker> = () => loadPose(true),
): Promise<{ frame: Frame | null; pose: PoseLandmarker }> {
  try {
    return { frame: detect(pose, video, t), pose };
  } catch {
    try { pose.close?.(); } catch { /* ya estaba caído */ } // suelta GPU y memoria del modelo que falló
    const cpu = await reload();
    return { frame: detect(cpu, video, t), pose: cpu };
  }
}

const BONES: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [15, 17], [15, 19], [16, 18], [16, 20]];

export function drawSkeleton(ctx: CanvasRenderingContext2D, lm: Pt[], w: number, h: number) {
  ctx.lineWidth = Math.max(2, w / 220);
  ctx.strokeStyle = 'rgba(109,207,142,0.95)';
  ctx.fillStyle = '#e8c04a';
  for (const [a, b] of BONES) {
    if (lm[a].v < 0.4 || lm[b].v < 0.4) continue;
    ctx.beginPath(); ctx.moveTo(lm[a].x * w, lm[a].y * h); ctx.lineTo(lm[b].x * w, lm[b].y * h); ctx.stroke();
  }
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (lm[i].v < 0.4) continue;
    ctx.beginPath(); ctx.arc(lm[i].x * w, lm[i].y * h, Math.max(3, w / 160), 0, Math.PI * 2); ctx.fill();
  }
}
