import { Object3D, Quaternion, Vector3 } from "three";
import { directionFromAngles } from "./pageNavigation";
import type { ScenePage } from "./pageNavigation";
import {
  BUSINESS_CARD_PAGE,
  BUSINESS_CARD_CAMERA_PITCH,
  BUSINESS_CARD_CAMERA_YAW,
  BUSINESS_CARD_FOCUS_TARGET,
} from "./sceneObjects";

type MeshGetter = () => Object3D | null;

export type BusinessCardAnimationOptions = {
  getBusinessCardMesh: MeshGetter;
};

export type BusinessCardAnimationController = {
  handlePageSelection: (page: ScenePage) => void;
  resetToHome: () => void;
};

export const createBusinessCardAnimation = ({
  getBusinessCardMesh,
}: BusinessCardAnimationOptions): BusinessCardAnimationController => {
  const FOCUS_ANIMATION_DURATION = 720;
  const RESET_ANIMATION_DURATION = 520;
  const UP_VECTOR = new Vector3(0, 1, 0);
  const focusDirection = directionFromAngles(
    BUSINESS_CARD_CAMERA_YAW,
    BUSINESS_CARD_CAMERA_PITCH,
  ).clone();
  const focusQuaternion = new Quaternion().setFromUnitVectors(
    UP_VECTOR,
    focusDirection,
  );
  let animationFrame: number | null = null;
  let homePosition: Vector3 | null = null;
  let homeQuaternion: Quaternion | null = null;

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

  const animateToFocus = (mesh: Object3D) => {
    captureHomeTransform(mesh);
    const focusPosition = BUSINESS_CARD_FOCUS_TARGET.clone();
    animateMeshTransform(
      mesh,
      focusPosition,
      focusQuaternion.clone(),
      FOCUS_ANIMATION_DURATION,
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

  const handlePageSelection = (page: ScenePage) => {
    if (page !== BUSINESS_CARD_PAGE) {
      return;
    }
    const mesh = getBusinessCardMesh();
    if (!mesh) {
      return;
    }
    animateToFocus(mesh);
  };

  const resetToHome = () => {
    const mesh = getBusinessCardMesh();
    if (!mesh) {
      return;
    }
    animateToHome(mesh);
  };

  return {
    handlePageSelection,
    resetToHome,
  };
};
