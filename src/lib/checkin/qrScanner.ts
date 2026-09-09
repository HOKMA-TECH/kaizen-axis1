export const QR_SCAN_TIMEOUT_MS = 45_000;
export const VIDEO_READY_TIMEOUT_MS = 2_000;
export const SCAN_MAX_DIMENSION = 960;
export const NATIVE_DETECT_TIMEOUT_MS = 250;
export const CAMERA_IDEAL_SIZE = 1280;
export const SCAN_ROI_INSET_RATIO = 0.08;
export const CHECKIN_DISPLAY_QR_SIZE = 512;

export type VideoFrameSource = {
  videoWidth: number;
  videoHeight: number;
};

export function extractCheckinToken(rawValue: string): string | null {
  const raw = rawValue.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const token = (url.searchParams.get('token') || '').trim();
    return token || null;
  } catch {
    return raw;
  }
}

export function shouldFallbackToJsQR(
  hasNativeDetector: boolean,
  nativeRawValue: string,
): boolean {
  if (!hasNativeDetector) return true;
  return nativeRawValue.trim().length === 0;
}

export function getScanCanvasSize(
  videoWidth: number,
  videoHeight: number,
  maxDimension = SCAN_MAX_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(videoWidth, videoHeight);
  if (!longest || longest <= maxDimension) {
    return { width: videoWidth, height: videoHeight };
  }

  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  };
}

export function getScanRoi(
  videoWidth: number,
  videoHeight: number,
  insetRatio = SCAN_ROI_INSET_RATIO,
): { sx: number; sy: number; sw: number; sh: number } {
  const insetX = Math.round(videoWidth * insetRatio);
  const insetY = Math.round(videoHeight * insetRatio);
  return {
    sx: insetX,
    sy: insetY,
    sw: Math.max(1, videoWidth - insetX * 2),
    sh: Math.max(1, videoHeight - insetY * 2),
  };
}

export type CameraTrackConstraints = {
  facingMode?: string | { ideal?: string };
  width?: { ideal?: number };
  height?: { ideal?: number };
  advanced?: Array<{ focusMode?: string }>;
};

export function getCameraConstraintFallbacks(): CameraTrackConstraints[] {
  return [
    {
      facingMode: { ideal: 'environment' },
      width: { ideal: CAMERA_IDEAL_SIZE },
      height: { ideal: CAMERA_IDEAL_SIZE },
      advanced: [{ focusMode: 'continuous' }],
    },
    {
      facingMode: { ideal: 'environment' },
      width: { ideal: CAMERA_IDEAL_SIZE },
      height: { ideal: CAMERA_IDEAL_SIZE },
    },
    { facingMode: 'environment' },
  ];
}

export function createScanMutex() {
  let scanning = false;
  return {
    tryEnter(): boolean {
      if (scanning) return false;
      scanning = true;
      return true;
    },
    leave() {
      scanning = false;
    },
  };
}

export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then((value) => value),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function waitForVideoElement(
  getVideo: () => VideoFrameSource | null,
  timeoutMs = VIDEO_READY_TIMEOUT_MS,
): Promise<VideoFrameSource> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const video = getVideo();
    if (video) return video;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Não foi possível iniciar a câmera. Tente novamente.');
}

export async function waitForVideoReady(
  video: VideoFrameSource,
  timeoutMs = VIDEO_READY_TIMEOUT_MS,
): Promise<VideoFrameSource> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return video;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (video.videoWidth > 0 && video.videoHeight > 0) return video;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Não foi possível iniciar a câmera. Tente novamente.');
}
