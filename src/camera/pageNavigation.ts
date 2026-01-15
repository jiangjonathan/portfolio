import { Vector3 } from "three";
import type { Object3D } from "three";
import type { CameraRig } from "./cameraRig";
import type { mx_hash_int_3 } from "three/src/nodes/materialx/lib/mx_noise.js";

export type ScenePage =
  | "home"
  | "turntable"
  | "portfolio"
  | "business_card"
  | "placeholder_A"
  | "placeholder_B";

export type PageCameraSettings = {
  target: Vector3;
  yaw: number;
  pitch: number;
  zoom: number;
};

export type TurntablePosition =
  | "default"
  | "bottom-center"
  | "bottom-left"
  | "fullscreen";

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export const HOME_CAMERA_YAW = 7;
export const HOME_CAMERA_PITCH = 28;
export const HOME_CAMERA_ZOOM = 1.9;
export const PORTFOLIO_CAMERA_YAW = -56;
export const PORTFOLIO_CAMERA_PITCH = 30;
export const PORTFOLIO_CAMERA_ZOOM = 4.7;
export const PORTFOLIO_TOP_CAMERA_PITCH = 89.88;
export const PLACEHOLDER_CAMERA_YAW = 0;
export const PLACEHOLDER_CAMERA_PITCH = 25;
export const PLACEHOLDER_CAMERA_ZOOM = 1.3;
export const TURNTABLE_CAMERA_YAW = 0;
export const TURNTABLE_CAMERA_PITCH = 45;
export const TURNTABLE_CAMERA_ZOOM = 1.6;
export const HOME_FRAME_OFFSET = 2;

export const calculateYawToFacePosition = (position: Vector3): number => {
  // Calculate yaw angle from center to position to face it from orbit
  return Math.atan2(position.x, position.z) * RAD2DEG;
};

export const directionFromAngles = (
  yawDeg: number,
  pitchDeg: number,
  out: Vector3 = new Vector3(),
) => {
  const yawRad = yawDeg * DEG2RAD;
  const pitchRad = pitchDeg * DEG2RAD;
  const cosPitch = Math.cos(pitchRad);
  return out
    .set(
      Math.sin(yawRad) * cosPitch,
      Math.sin(pitchRad),
      Math.cos(yawRad) * cosPitch,
    )
    .normalize();
};

export const lerpAngleDegrees = (start: number, end: number, t: number) => {
  let diff = ((end - start + 180) % 360) - 180;
  if (diff < -180) diff += 360;
  return start + diff * t;
};

export const cloneCameraSettings = (
  settings: PageCameraSettings,
): PageCameraSettings => ({
  target: settings.target.clone(),
  yaw: settings.yaw,
  pitch: settings.pitch,
  zoom: settings.zoom,
});

export const applyPageCameraSettings = (
  settings: PageCameraSettings,
  cameraRig: CameraRig,
) => {
  cameraRig.setLookTarget(settings.target, false);
  cameraRig.setViewDirection(
    directionFromAngles(settings.yaw, settings.pitch),
    false,
  );
  cameraRig.setZoomFactor(settings.zoom);
};

export const captureCameraState = (
  cameraRig: CameraRig,
): PageCameraSettings => {
  const orbitAngles = cameraRig.getOrbitAngles();
  return {
    target: cameraRig.getTarget().clone(),
    yaw: orbitAngles.azimuth * RAD2DEG,
    pitch: orbitAngles.polar * RAD2DEG,
    zoom: cameraRig.getZoomFactor(),
  };
};

export interface PageTransitionState {
  startTime: number;
  fromSettings: PageCameraSettings;
  toSettings: PageCameraSettings;
  active: boolean;
}

export interface HomePageTarget {
  model: Object3D;
  page: ScenePage;
}

export const findPageForObject = (
  object: Object3D | null,
  homePageTargets: HomePageTarget[],
): ScenePage | null => {
  let current: Object3D | null = object;
  while (current) {
    const entry = homePageTargets.find((target) => target.model === current);
    if (entry) {
      return entry.page;
    }
    current = current.parent as Object3D | null;
  }
  return null;
};
