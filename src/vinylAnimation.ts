import type { Object3D } from "three";
import { Vector3 } from "three";
import { clampValue } from "./utils";

export const MAX_DRAG_RADIUS = 100;
const SWING_DAMPING = 0.18;
const SWING_MAX_TILT = 0.35;
const SWING_VELOCITY_FACTOR = 16;
const STRING_RELAX_RATE = 0.08;
const POSITION_LERP = 0.22;
export const RETURN_CLEARANCE = 0.05;
const RETURN_HORIZONTAL_EPS = 0.01;
const RETURN_VERTICAL_EPS = 0.0005;
const RETURN_DROP_RATE = 0.05;
const RETURN_APPROACH_RATE = 0.15;
const VINYL_WOBBLE_AMPLITUDE = 0.005;
const VINYL_WOBBLE_PHASE_MULT = 1;
export const VINYL_RETURN_FINAL_TWIST = (75 * Math.PI) / 180;
const VINYL_RETURN_TWIST_LERP = 0.14;

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
  if (dragActive) {
    state.pointerAttachmentOffset.lerp(state.hangOffset, STRING_RELAX_RATE);
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
    // Clamp Y position to not go below the vinyl anchor position
    state.vinylTargetPosition.y = Math.max(
      state.vinylTargetPosition.y,
      state.vinylAnchorPosition.y + 8,
    );
    state.vinylTargetPosition.z = state.vinylAnchorPosition.z;

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
    const horizontalDelta =
      state.vinylAnchorPosition.x - state.vinylTargetPosition.x;
    state.vinylTargetPosition.x += horizontalDelta * RETURN_APPROACH_RATE;
    state.vinylTargetPosition.z = state.vinylAnchorPosition.z;

    if (isReturningVinyl) {
      if (!hasClearedNub) {
        const targetLift =
          nubClearanceY || state.vinylAnchorPosition.y + RETURN_CLEARANCE;
        state.vinylTargetPosition.y +=
          (targetLift - state.vinylTargetPosition.y) * RETURN_APPROACH_RATE;
        if (Math.abs(horizontalDelta) < RETURN_HORIZONTAL_EPS) {
          hasClearedNub = true;
        }
      } else {
        state.vinylTargetPosition.y +=
          (state.vinylAnchorPosition.y - state.vinylTargetPosition.y) *
          RETURN_DROP_RATE;
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
    } else {
      state.vinylTargetPosition.y +=
        (state.vinylAnchorPosition.y - state.vinylTargetPosition.y) *
        RETURN_DROP_RATE;
      vinylReturnTwistTarget = 0;
    }

    state.lastTargetPosition.copy(state.vinylTargetPosition);
    state.swingState.targetX = 0;
    state.swingState.targetZ = 0;
  }

  vinylModel.position.lerp(state.vinylTargetPosition, POSITION_LERP);
  state.swingState.currentX +=
    (state.swingState.targetX - state.swingState.currentX) * SWING_DAMPING;
  state.swingState.currentZ +=
    (state.swingState.targetZ - state.swingState.currentZ) * SWING_DAMPING;
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
    (vinylReturnTwistTarget - vinylReturnTwist) * VINYL_RETURN_TWIST_LERP;
  vinylModel.rotation.y =
    vinylUserRotation +
    vinylSpinAngle +
    vinylReturnBaseTwist +
    vinylReturnTwist;

  return {
    isReturningVinyl,
    hasClearedNub,
    vinylReturnBaseTwist,
    vinylReturnTwist,
    vinylReturnTwistTarget,
    returnedToPlatter,
  };
}
