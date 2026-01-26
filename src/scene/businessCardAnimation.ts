import { Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { directionFromAngles } from "../camera/pageNavigation";
import type { ScenePage } from "../camera/pageNavigation";
import {
  BUSINESS_CARD_PAGE,
  BUSINESS_CARD_CAMERA_PITCH,
  BUSINESS_CARD_CAMERA_YAW,
  BUSINESS_CARD_FOCUS_LIFT,
} from "./sceneObjects";

type MeshGetter = () => Object3D | null;

export type BusinessCardAnimationOptions = {
  getBusinessCardMesh: MeshGetter;
};

export type BusinessCardAnimationController = {
  handlePageSelection: (
    page: ScenePage,
    focusAngles?: { yaw: number; pitch: number },
  ) => void;
  resetToHome: () => void;
  setMouseReactiveRotation: (enabled: boolean) => void;
  updateMousePosition: (x: number, y: number) => void;
  setIsHovered: (hovered: boolean) => void;
};

export const createBusinessCardAnimation = ({
  getBusinessCardMesh,
}: BusinessCardAnimationOptions): BusinessCardAnimationController => {
  const FOCUS_ANIMATION_DURATION = 720;
  const RESET_ANIMATION_DURATION = 520;
  const UP_VECTOR = new Vector3(0, 1, 0);
  const buildFocusQuaternion = (yaw: number, pitch: number) => {
    const desiredNormal = directionFromAngles(yaw, pitch).clone().normalize();
    const desiredUp = UP_VECTOR.clone();
    desiredUp.addScaledVector(desiredNormal, -desiredUp.dot(desiredNormal));
    if (desiredUp.lengthSq() < 1e-6) {
      desiredUp
        .set(0, 0, 1)
        .addScaledVector(desiredNormal, -desiredNormal.dot(desiredUp));
    }
    desiredUp.normalize();
    const desiredRight = new Vector3()
      .crossVectors(desiredNormal, desiredUp)
      .normalize();
    const basis = new Matrix4().makeBasis(
      desiredRight,
      desiredNormal,
      desiredUp,
    );
    return new Quaternion().setFromRotationMatrix(basis);
  };
  let animationFrame: number | null = null;
  let homePosition: Vector3 | null = null;
  let homeQuaternion: Quaternion | null = null;

  // Mouse-reactive rotation
  let mouseReactiveRotationEnabled = false;
  let isHovered = false;
  let mouseX = 0.5;
  let mouseY = 0.5;
  const MAX_ROTATION_X = 0.5; // radians (~57.3 degrees)
  const MAX_ROTATION_Y = 0.5; // radians (~57.3 degrees)
  const MAX_ROTATION_Z = 0.3; // radians (~17.2 degrees)
  let rotationAnimationFrame: number | null = null;
  let baseRotationQuaternion: Quaternion | null = null;

  const captureHomeTransform = (mesh: Object3D) => {
    homePosition = mesh.position.clone();
    homeQuaternion = mesh.quaternion.clone();
  };

  const animateMeshTransform = (
    mesh: Object3D,
    targetPosition: Vector3,
    targetQuaternion: Quaternion,
    duration: number,
    onComplete?: () => void,
  ) => {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    const startPosition = mesh.position.clone();
    const startQuaternion = mesh.quaternion.clone();
    const startTime = performance.now();

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      mesh.position.lerpVectors(startPosition, targetPosition, easedProgress);
      mesh.quaternion.slerpQuaternions(
        startQuaternion,
        targetQuaternion,
        easedProgress,
      );
      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      } else {
        animationFrame = null;
        if (onComplete) {
          onComplete();
        }
      }
    };

    animationFrame = requestAnimationFrame(step);
  };

  const animateToFocus = (
    mesh: Object3D,
    focusAngles?: { yaw: number; pitch: number },
  ) => {
    captureHomeTransform(mesh);
    const focusPosition = homePosition
      ? homePosition.clone()
      : mesh.position.clone();
    focusPosition.y += BUSINESS_CARD_FOCUS_LIFT;
    const focusQuaternion = focusAngles
      ? buildFocusQuaternion(focusAngles.yaw, focusAngles.pitch)
      : buildFocusQuaternion(
          BUSINESS_CARD_CAMERA_YAW,
          BUSINESS_CARD_CAMERA_PITCH,
        );
    animateMeshTransform(
      mesh,
      focusPosition,
      focusQuaternion.clone(),
      FOCUS_ANIMATION_DURATION,
      () => {
        // After animation completes, capture the final rotation for mouse tracking
        if (mouseReactiveRotationEnabled) {
          baseRotationQuaternion = mesh.quaternion.clone();
        }
      },
    );
  };

  const animateToHome = (mesh: Object3D) => {
    const targetPosition = homePosition
      ? homePosition.clone()
      : mesh.position.clone();
    const targetQuaternion = homeQuaternion
      ? homeQuaternion.clone()
      : mesh.quaternion.clone();
    animateMeshTransform(
      mesh,
      targetPosition,
      targetQuaternion,
      RESET_ANIMATION_DURATION,
      () => captureHomeTransform(mesh),
    );
  };

  const handlePageSelection = (
    page: ScenePage,
    focusAngles?: { yaw: number; pitch: number },
  ) => {
    if (page !== BUSINESS_CARD_PAGE) {
      return;
    }
    const mesh = getBusinessCardMesh();
    if (!mesh) {
      return;
    }
    animateToFocus(mesh, focusAngles);
  };

  const resetToHome = () => {
    const mesh = getBusinessCardMesh();
    if (!mesh) {
      return;
    }
    animateToHome(mesh);
  };

  const applyMouseReactiveRotation = () => {
    const mesh = getBusinessCardMesh();
    if (!mesh || !mouseReactiveRotationEnabled || !baseRotationQuaternion) {
      return;
    }

    let targetQuaternion: Quaternion;

    // Only apply rotation if hovered
    if (isHovered) {
      // Convert mouse position (0-1) to rotation angle
      // Invert so card faces towards mouse instead of away
      const rotationX = (mouseY - 0.5) * 2 * MAX_ROTATION_X;
      const rotationY = (mouseX - 0.5) * 2 * MAX_ROTATION_Y;
      const rotationZ = (mouseX - 0.5) * 2 * MAX_ROTATION_Z;

      // Create rotation quaternions from world axes
      const xAxis = new Vector3(1, 0, 0);
      const yAxis = new Vector3(0, 1, 0);
      const zAxis = new Vector3(0, 0, 1);

      const quaternionX = new Quaternion().setFromAxisAngle(xAxis, rotationX);
      const quaternionY = new Quaternion().setFromAxisAngle(yAxis, rotationY);
      const quaternionZ = new Quaternion().setFromAxisAngle(zAxis, rotationZ);

      // Combine all rotations: Z then Y then X
      const combinedQuaternion = new Quaternion().multiplyQuaternions(
        quaternionY,
        quaternionX,
      );
      combinedQuaternion.multiplyQuaternions(quaternionZ, combinedQuaternion);

      // Apply rotations on top of the base rotation (home position)
      targetQuaternion = new Quaternion().multiplyQuaternions(
        baseRotationQuaternion,
        combinedQuaternion,
      );
    } else {
      // When not hovered, smoothly reset to base rotation
      targetQuaternion = baseRotationQuaternion;
    }

    // Smoothly interpolate towards target rotation
    mesh.quaternion.slerp(targetQuaternion, 0.08);

    rotationAnimationFrame = requestAnimationFrame(applyMouseReactiveRotation);
  };

  const setMouseReactiveRotation = (enabled: boolean) => {
    mouseReactiveRotationEnabled = enabled;
    if (enabled) {
      const mesh = getBusinessCardMesh();
      if (mesh) {
        // Wait a bit for animation to complete, then capture the rotation
        setTimeout(() => {
          if (mouseReactiveRotationEnabled && mesh) {
            baseRotationQuaternion = mesh.quaternion.clone();
            applyMouseReactiveRotation();
          }
        }, FOCUS_ANIMATION_DURATION + 50);
      }
    } else if (rotationAnimationFrame !== null) {
      cancelAnimationFrame(rotationAnimationFrame);
      rotationAnimationFrame = null;
      baseRotationQuaternion = null;
    }
  };

  const updateMousePosition = (x: number, y: number) => {
    mouseX = x;
    mouseY = y;
  };

  const setIsHovered = (hovered: boolean) => {
    isHovered = hovered;
  };

  return {
    handlePageSelection,
    resetToHome,
    setMouseReactiveRotation,
    updateMousePosition,
    setIsHovered,
  };
};
