import { Vector3 } from "three";
import type { Object3D } from "three";
import type { CameraRig } from "./cameraRig";
import type { LabelTextures, LabelVisualOptions } from "./labels";
import { createLabelTextures } from "./labels";
import { extractDominantColor } from "./colorUtils";
import { FALLBACK_BACKGROUND_COLOR } from "./config";
import type { VinylSelectionDetail } from "./vinylState";

export const FOCUS_VINYL_BASE_SCALE = 0.88;
export const VINYL_DRAG_THRESHOLD = 38;

export function getFocusVinylScale(cameraRig: CameraRig): number {
  return FOCUS_VINYL_BASE_SCALE / cameraRig.getZoomFactor();
}

export function applyFocusVinylScale(
  vinylModel: Object3D | null,
  cameraRig: CameraRig,
): void {
  if (vinylModel) {
    vinylModel.scale.setScalar(getFocusVinylScale(cameraRig));
  }
}

export function applyLabelTextureQuality(
  textures: LabelTextures,
  maxAnisotropy: number,
): void {
  textures.sideA.anisotropy = maxAnisotropy;
  textures.sideB.anisotropy = maxAnisotropy;
}

export function cloneLabelVisuals(
  visuals: LabelVisualOptions,
): LabelVisualOptions {
  return JSON.parse(JSON.stringify(visuals));
}

export function rebuildLabelTextures(
  labelVisuals: LabelVisualOptions,
  maxAnisotropy: number,
): LabelTextures {
  const textures = createLabelTextures(labelVisuals);
  applyLabelTextureQuality(textures, maxAnisotropy);
  return textures;
}

export function getSelectionCoverUrl(selection: VinylSelectionDetail): string {
  return (
    selection.imageUrl ||
    `https://img.youtube.com/vi/${selection.videoId}/maxresdefault.jpg`
  );
}

export async function applySelectionVisualsToVinyl(
  selection: VinylSelectionDetail,
  labelVisuals: LabelVisualOptions,
  applyMetadata: (metadata: any, overwrite: boolean) => void,
  rebuildTextures: () => void,
  getUpdateId: () => number,
): Promise<void> {
  applyMetadata(
    {
      artist: selection.artistName,
      song: selection.songName,
      album: "",
    },
    true,
  );
  rebuildTextures();

  const updateId = getUpdateId();
  try {
    const dominantColor = await extractDominantColor(
      getSelectionCoverUrl(selection),
    );
    if (updateId !== getUpdateId()) {
      return;
    }
    labelVisuals.background = dominantColor;
  } catch (error) {
    if (updateId !== getUpdateId()) {
      return;
    }
    console.warn("Failed to extract dominant color, using fallback", error);
    labelVisuals.background = FALLBACK_BACKGROUND_COLOR;
  }
  if (updateId === getUpdateId()) {
    rebuildTextures();
  }
}

export function syncAnimationStateToModel(
  model: Object3D,
  vinylAnimationState: any,
  hangOffset: Vector3,
): void {
  vinylAnimationState.vinylAnchorPosition.copy(model.position);
  vinylAnimationState.vinylTargetPosition.copy(model.position);
  vinylAnimationState.lastTargetPosition.copy(model.position);
  vinylAnimationState.currentPointerWorld.copy(model.position);
  vinylAnimationState.pointerAttachmentOffset.copy(hangOffset);
  vinylAnimationState.desiredPosition.copy(model.position);
  vinylAnimationState.relativeOffset.set(0, 0, 0);
  vinylAnimationState.cameraRelativeOffsetValid = false;
}

export function resetVinylAnimationState(
  anchor: Vector3,
  vinylModel: Object3D | null,
  vinylAnimationState: any,
  hangOffset: Vector3,
): void {
  vinylAnimationState.vinylAnchorPosition.copy(anchor);
  vinylAnimationState.vinylTargetPosition.copy(anchor);
  vinylAnimationState.lastTargetPosition.copy(anchor);
  vinylAnimationState.currentPointerWorld.copy(anchor);
  vinylAnimationState.pointerAttachmentOffset.copy(hangOffset);
  vinylAnimationState.desiredPosition.copy(anchor);
  vinylAnimationState.relativeOffset.set(0, 0, 0);
  if (vinylModel) {
    vinylModel.position.copy(anchor);
  }
}

export function updateDragPlaneDepth(plane: any, z: number): void {
  plane.constant = -z;
}
