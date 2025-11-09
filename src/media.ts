export function yawToMediaTime(
  yaw: number,
  playYawThreshold: number,
  minYaw: number,
  durationSec: number,
) {
  return yawToMediaProgress(yaw, playYawThreshold, minYaw) * durationSec;
}

export function yawToMediaProgress(
  yaw: number,
  playYawThreshold: number,
  minYaw: number,
) {
  const span = minYaw - playYawThreshold;
  if (span === 0) return 0;
  const progress = (yaw - playYawThreshold) / span;
  return Math.max(0, Math.min(1, progress));
}

export function mediaTimeToYaw(
  time: number,
  playYawThreshold: number,
  minYaw: number,
  durationSec: number,
) {
  const progress = clamp01(time / durationSec);
  return playYawThreshold + progress * (minYaw - playYawThreshold);
}

export function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

