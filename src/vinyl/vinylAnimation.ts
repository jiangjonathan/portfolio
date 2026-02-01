import type { Object3D } from "three";
import { Matrix4, Quaternion, Vector3 } from "three";
import { clampValue } from "../utils/utils";

export const MAX_DRAG_RADIUS = 100;
// Base lerp factors (calibrated for 60 FPS)
const SWING_DAMPING_BASE = 0.25;
const SWING_MAX_TILT = 0.35;
const SWING_VELOCITY_FACTOR = 16;
const STRING_RELAX_RATE_BASE = 0.14;
const POSITION_LERP_BASE = 0.32;
export const RETURN_CLEARANCE = 2.5;
const RETURN_HORIZONTAL_EPS = 0.01;
const RETURN_VERTICAL_EPS = 0.0005;
const RETURN_DROP_RATE_BASE = 0.16;
const RETURN_APPROACH_RATE_BASE = 0.3;
const VINYL_WOBBLE_AMPLITUDE = 0.005;
const VINYL_WOBBLE_PHASE_MULT = 1;
export const VINYL_RETURN_FINAL_TWIST = (75 * Math.PI) / 180;
const VINYL_RETURN_TWIST_LERP_BASE = 0.22;

// Convert frame-based lerp factor to delta-time-based factor
// This ensures consistent animation speed regardless of frame rate
const dtLerp = (baseFactor: number, delta: number): number => {
  return 1 - Math.pow(1 - baseFactor, delta * 60);
};
const WORLD_UP = new Vector3(0, 1, 0);
const TO_CAMERA = new Vector3();
const BILLBOARD_X_AXIS = new Vector3();
const BILLBOARD_Z_AXIS = new Vector3();
const BILLBOARD_MATRIX = new Matrix4();
const BILLBOARD_QUATERNION = new Quaternion();
const CAMERA_OFFSET = new Vector3();
const CAMERA_WORLD_OFFSET = new Vector3();
const CAMERA_RIGHT_VECTOR = new Vector3();
const CAMERA_UP_VECTOR = new Vector3();
const CAMERA_FORWARD_VECTOR = new Vector3();

function captureCameraRelativeOffset(
  out: Vector3,
  cameraPosition: Vector3,
  cameraRight: Vector3,
  cameraUp: Vector3,
  cameraForward: Vector3,
  worldPosition: Vector3,
) {
  CAMERA_OFFSET.copy(worldPosition).sub(cameraPosition);
  out.set(
    CAMERA_OFFSET.dot(cameraRight),
    CAMERA_OFFSET.dot(cameraUp),
    CAMERA_OFFSET.dot(cameraForward),
  );
}

function applyCameraRelativeOffset(
  out: Vector3,
  cameraPosition: Vector3,
  cameraRight: Vector3,
  cameraUp: Vector3,
  cameraForward: Vector3,
  relative: Vector3,
) {
  CAMERA_RIGHT_VECTOR.copy(cameraRight).multiplyScalar(relative.x);
  CAMERA_UP_VECTOR.copy(cameraUp).multiplyScalar(relative.y);
  CAMERA_FORWARD_VECTOR.copy(cameraForward).multiplyScalar(relative.z);
  CAMERA_WORLD_OFFSET.copy(CAMERA_RIGHT_VECTOR);
  CAMERA_WORLD_OFFSET.add(CAMERA_UP_VECTOR);
  CAMERA_WORLD_OFFSET.add(CAMERA_FORWARD_VECTOR);
  out.copy(cameraPosition).add(CAMERA_WORLD_OFFSET);
}

export type SwingState = {
  targetX: number;
  targetZ: number;
  currentX: number;
  currentZ: number;
};

export interface VinylAnimationState {
  vinylAnchorPosition: Vector3;
  vinylTargetPosition: Vector3;
  lastTargetPosition: Vector3;
  currentPointerWorld: Vector3;
  pointerAttachmentOffset: Vector3;
  hangOffset: Vector3;
  relativeOffset: Vector3;
  desiredPosition: Vector3;
  swingState: SwingState;
  tempVelocity: Vector3;
  cameraRelativeOffset: Vector3;
  cameraRelativeOffsetValid: boolean;
}

export function createVinylAnimationState(): VinylAnimationState {
  return {
    vinylAnchorPosition: new Vector3(),
    vinylTargetPosition: new Vector3(),
    lastTargetPosition: new Vector3(),
    currentPointerWorld: new Vector3(),
    pointerAttachmentOffset: new Vector3(),
    hangOffset: new Vector3(0, -0.08, 0),
    relativeOffset: new Vector3(),
    desiredPosition: new Vector3(),
    swingState: { targetX: 0, targetZ: 0, currentX: 0, currentZ: 0 },
    tempVelocity: new Vector3(),
    cameraRelativeOffset: new Vector3(),
    cameraRelativeOffsetValid: false,
  };
}

export interface VinylAnimationInput {
  vinylModel: Object3D | null;
  dragActive: boolean;
  isReturningVinyl: boolean;
  hasClearedNub: boolean;
  nubClearanceY: number;
  vinylReturnBaseTwist: number;
  vinylReturnTwist: number;
  vinylReturnTwistTarget: number;
  vinylSpinAngle: number;
  vinylUserRotation: number;
  onTurntable: boolean;
  cameraPosition: Vector3;
  cameraForward: Vector3;
  cameraRight: Vector3;
  cameraUp: Vector3;
  vinylDragThreshold: number;
  cameraTrackingEnabled: boolean;
  turntableAnchorY: number;
  anchorType: "turntable" | "focus";
  delta: number;
}

export interface VinylAnimationOutput {
  isReturningVinyl: boolean;
  hasClearedNub: boolean;
  vinylReturnBaseTwist: number;
  vinylReturnTwist: number;
  vinylReturnTwistTarget: number;
  returnedToPlatter: boolean;
}

export function updateVinylAnimation(
  state: VinylAnimationState,
  {
    vinylModel,
    dragActive,
    isReturningVinyl,
    hasClearedNub,
    nubClearanceY,
    vinylReturnBaseTwist,
    vinylReturnTwist,
    vinylReturnTwistTarget,
    vinylSpinAngle,
    vinylUserRotation,
    onTurntable,
    cameraPosition,
    cameraForward,
    cameraRight,
    cameraUp,
    vinylDragThreshold,
    cameraTrackingEnabled,
    turntableAnchorY,
    anchorType: _anchorType,
    delta,
  }: VinylAnimationInput,
): VinylAnimationOutput {
  if (!vinylModel) {
    return {
      isReturningVinyl,
      hasClearedNub,
      vinylReturnBaseTwist,
      vinylReturnTwist,
      vinylReturnTwistTarget,
      returnedToPlatter: false,
    };
  }

  let returnedToPlatter = false;
  if (!cameraTrackingEnabled) {
    state.cameraRelativeOffsetValid = false;
  }
  if (dragActive) {
    state.pointerAttachmentOffset.lerp(
      state.hangOffset,
      dtLerp(STRING_RELAX_RATE_BASE, delta),
    );
    state.desiredPosition
      .copy(state.currentPointerWorld)
      .add(state.pointerAttachmentOffset);

    state.relativeOffset
      .copy(state.desiredPosition)
      .sub(state.vinylAnchorPosition);
    const planarDistance = Math.hypot(
      state.relativeOffset.x,
      state.relativeOffset.y,
    );
    if (planarDistance > MAX_DRAG_RADIUS) {
      const clampScale = MAX_DRAG_RADIUS / planarDistance;
      state.relativeOffset.x *= clampScale;
      state.relativeOffset.y *= clampScale;
    }

    state.vinylTargetPosition
      .copy(state.vinylAnchorPosition)
      .add(state.relativeOffset);

    state.vinylTargetPosition.z = state.vinylAnchorPosition.z;

    // Prevent dragging below turntable surface (applies to all vinyl sources)
    const MIN_Y_OFFSET = 8;
    const minY = turntableAnchorY + MIN_Y_OFFSET;
    if (state.vinylTargetPosition.y < minY) {
      state.vinylTargetPosition.y = minY;
    }

    if (
      cameraTrackingEnabled &&
      state.vinylTargetPosition.y >= vinylDragThreshold
    ) {
      captureCameraRelativeOffset(
        state.cameraRelativeOffset,
        cameraPosition,
        cameraRight,
        cameraUp,
        cameraForward,
        state.vinylTargetPosition,
      );
      state.cameraRelativeOffsetValid = true;
    } else {
      state.cameraRelativeOffsetValid = false;
    }

    state.tempVelocity
      .copy(state.vinylTargetPosition)
      .sub(state.lastTargetPosition);
    state.lastTargetPosition.copy(state.vinylTargetPosition);

    state.swingState.targetX = clampValue(
      state.tempVelocity.y * SWING_VELOCITY_FACTOR,
      -SWING_MAX_TILT,
      SWING_MAX_TILT,
    );
    state.swingState.targetZ = clampValue(
      -state.tempVelocity.x * SWING_VELOCITY_FACTOR,
      -SWING_MAX_TILT,
      SWING_MAX_TILT,
    );
  } else {
    if (isReturningVinyl) {
      const horizontalDelta =
        state.vinylAnchorPosition.x - state.vinylTargetPosition.x;
      state.vinylTargetPosition.x +=
        horizontalDelta * dtLerp(RETURN_APPROACH_RATE_BASE, delta);

      state.vinylTargetPosition.z = state.vinylAnchorPosition.z;

      state.cameraRelativeOffsetValid = false;

      if (!hasClearedNub) {
        const targetLift =
          nubClearanceY || state.vinylAnchorPosition.y + RETURN_CLEARANCE;
        state.vinylTargetPosition.y +=
          (targetLift - state.vinylTargetPosition.y) *
          dtLerp(RETURN_APPROACH_RATE_BASE, delta);
        if (Math.abs(horizontalDelta) < RETURN_HORIZONTAL_EPS) {
          hasClearedNub = true;
        }
      } else {
        state.vinylTargetPosition.y +=
          (state.vinylAnchorPosition.y - state.vinylTargetPosition.y) *
          dtLerp(RETURN_DROP_RATE_BASE, delta);
        const closeHorizontally =
          Math.abs(horizontalDelta) < RETURN_HORIZONTAL_EPS;
        vinylReturnTwistTarget = 0;
        if (
          closeHorizontally &&
          Math.abs(state.vinylTargetPosition.y - state.vinylAnchorPosition.y) <
            RETURN_VERTICAL_EPS
        ) {
          isReturningVinyl = false;
          hasClearedNub = false;
          state.vinylTargetPosition.copy(state.vinylAnchorPosition);
          vinylReturnTwist = 0;
          vinylReturnTwistTarget = 0;
          returnedToPlatter = true;
        }
      }
    }
    // When not returning and not dragging, vinyl stays at its current position
    // (no movement applied to vinylTargetPosition)

    state.lastTargetPosition.copy(state.vinylTargetPosition);
    state.swingState.targetX = 0;
    state.swingState.targetZ = 0;
  }

  if (
    cameraTrackingEnabled &&
    !state.cameraRelativeOffsetValid &&
    !isReturningVinyl &&
    state.vinylTargetPosition.y >= vinylDragThreshold
  ) {
    captureCameraRelativeOffset(
      state.cameraRelativeOffset,
      cameraPosition,
      cameraRight,
      cameraUp,
      cameraForward,
      state.vinylTargetPosition,
    );
    state.cameraRelativeOffsetValid = true;
  }

  const followCamera =
    cameraTrackingEnabled &&
    state.cameraRelativeOffsetValid &&
    !isReturningVinyl;

  if (followCamera) {
    applyCameraRelativeOffset(
      state.vinylTargetPosition,
      cameraPosition,
      cameraRight,
      cameraUp,
      cameraForward,
      state.cameraRelativeOffset,
    );
    state.lastTargetPosition.copy(state.vinylTargetPosition);
    vinylModel.position.copy(state.vinylTargetPosition);
  } else {
    vinylModel.position.lerp(
      state.vinylTargetPosition,
      dtLerp(POSITION_LERP_BASE, delta),
    );
  }

  const orientToCamera =
    cameraTrackingEnabled &&
    (followCamera || vinylModel.position.y >= vinylDragThreshold) &&
    !isReturningVinyl;

  if (orientToCamera) {
    // Make vinyl face the camera (appear flat from camera perspective)
    TO_CAMERA.copy(cameraPosition).sub(vinylModel.position);
    if (TO_CAMERA.lengthSq() > 1e-8) {
      TO_CAMERA.normalize();

      BILLBOARD_X_AXIS.copy(WORLD_UP).cross(TO_CAMERA);
      if (BILLBOARD_X_AXIS.lengthSq() < 1e-8) {
        BILLBOARD_X_AXIS.set(1, 0, 0);
      } else {
        BILLBOARD_X_AXIS.normalize();
      }

      BILLBOARD_Z_AXIS.copy(BILLBOARD_X_AXIS).cross(TO_CAMERA).normalize();
      BILLBOARD_MATRIX.makeBasis(BILLBOARD_X_AXIS, TO_CAMERA, BILLBOARD_Z_AXIS);
      BILLBOARD_QUATERNION.setFromRotationMatrix(BILLBOARD_MATRIX);
      vinylModel.quaternion.copy(BILLBOARD_QUATERNION);
    }
  } else {
    // Normal rotation behavior
    state.swingState.currentX +=
      (state.swingState.targetX - state.swingState.currentX) *
      dtLerp(SWING_DAMPING_BASE, delta);
    state.swingState.currentZ +=
      (state.swingState.targetZ - state.swingState.currentZ) *
      dtLerp(SWING_DAMPING_BASE, delta);
    const wobblePhase = vinylSpinAngle * VINYL_WOBBLE_PHASE_MULT;
    const wobbleX = onTurntable
      ? Math.sin(wobblePhase) * VINYL_WOBBLE_AMPLITUDE
      : 0;
    const wobbleZ = onTurntable
      ? Math.cos(wobblePhase) * VINYL_WOBBLE_AMPLITUDE
      : 0;
    vinylModel.rotation.x = state.swingState.currentX + wobbleX;
    vinylModel.rotation.z = state.swingState.currentZ + wobbleZ;
    vinylReturnTwist +=
      (vinylReturnTwistTarget - vinylReturnTwist) *
      dtLerp(VINYL_RETURN_TWIST_LERP_BASE, delta);
    vinylModel.rotation.y =
      vinylUserRotation +
      vinylSpinAngle +
      vinylReturnBaseTwist +
      vinylReturnTwist;
  }

  return {
    isReturningVinyl,
    hasClearedNub,
    vinylReturnBaseTwist,
    vinylReturnTwist,
    vinylReturnTwistTarget,
    returnedToPlatter,
  };
}
