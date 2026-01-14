import { Vector3 } from "three";
import type { Intersection, Object3D, Raycaster } from "three";
import type {
  FocusVinylState,
  TurntableVinylState,
  VinylSource,
} from "../vinyl/vinylInteractions";

type TurntablePointerUtilsDeps = {
  raycaster: Raycaster;
  getFocusVinylState: () => FocusVinylState | null;
  getTurntableVinylState: () => TurntableVinylState | null;
  getFocusVisualOffset: () => number;
  cameraRig: {
    setPolarAngle: (angle: number, animate: boolean) => void;
    setLookTarget: (target: Vector3, animate: boolean) => void;
  };
  lightingAnimator: { setTargetState: (target: any, animate: boolean) => void };
  cameraTargets: Record<string, Vector3>;
  turntableFocusTarget: Vector3;
  fullscreenLighting: any;
  fullscreenHoverLighting: any;
};

type VinylPick = {
  source: VinylSource;
  model: Object3D;
  hit: Intersection<Object3D>;
};

export const createTurntablePointerUtils = (
  deps: TurntablePointerUtilsDeps,
) => {
  const pickVinylUnderPointer = (): VinylPick | null => {
    const focusVisualOffset = deps.getFocusVisualOffset();
    const focusModel = deps.getFocusVinylState()?.model ?? null;
    const shouldOffsetFocus = !!focusModel?.visible && focusVisualOffset !== 0;
    if (shouldOffsetFocus && focusModel) {
      focusModel.position.x += focusVisualOffset;
    }
    const hits: VinylPick[] = [];
    if (focusModel?.visible) {
      const focusHit = deps.raycaster.intersectObject(focusModel, true);
      if (focusHit.length) {
        hits.push({
          source: "focus",
          model: focusModel,
          hit: focusHit[0],
        });
      }
    }
    const turntableVinylState = deps.getTurntableVinylState();
    if (turntableVinylState) {
      const tableHit = deps.raycaster.intersectObject(
        turntableVinylState.model,
        true,
      );
      if (tableHit.length) {
        hits.push({
          source: "turntable",
          model: turntableVinylState.model,
          hit: tableHit[0],
        });
      }
    }
    if (shouldOffsetFocus && focusModel) {
      focusModel.position.x -= focusVisualOffset;
    }
    if (!hits.length) {
      return null;
    }
    hits.sort((a, b) => a.hit.distance - b.hit.distance);
    return hits[0];
  };

  const handleFullscreenTurntableHoverChange = (hovered: boolean) => {
    if (hovered) {
      deps.cameraRig.setPolarAngle(88, true);
      const hoveredTarget = new Vector3(
        deps.cameraTargets["fullscreen"].x,
        deps.cameraTargets["fullscreen"].y - 18,
        deps.turntableFocusTarget.z - 23.4,
      );
      deps.cameraRig.setLookTarget(hoveredTarget, true);
      deps.lightingAnimator.setTargetState(deps.fullscreenHoverLighting, true);
    } else {
      deps.cameraRig.setPolarAngle(2, true);
      deps.cameraRig.setLookTarget(deps.cameraTargets["fullscreen"], true);
      deps.lightingAnimator.setTargetState(deps.fullscreenLighting, true);
    }
  };

  return {
    pickVinylUnderPointer,
    handleFullscreenTurntableHoverChange,
  };
};
