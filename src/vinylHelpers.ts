import { Vector3 } from "three";
import type { Object3D } from "three";
import type { CameraRig } from "./cameraRig";
import type { LabelTextures, LabelVisualOptions } from "./labels";
import { createLabelTextures } from "./labels";
import { extractDominantColor } from "./colorUtils";
import { FALLBACK_BACKGROUND_COLOR } from "./config";
import type { VinylSelectionDetail } from "./vinylState";
import { getOrCacheAlbumCover } from "./albumCoverCache";

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

export async function getSelectionCoverUrl(
  selection: VinylSelectionDetail,
): Promise<string> {
  console.log(`[getSelectionCoverUrl] Starting for video ${selection.videoId}`);

  // If we have a releaseId and originalImageUrl, try to get cached blob URL
  // This avoids CORS issues when extracting dominant color from Cover Art Archive
  if (selection.releaseId && selection.originalImageUrl) {
    try {
      console.log(
        `[getSelectionCoverUrl] Attempting to get/cache cover for release ${selection.releaseId}`,
      );
      const cachedBlobUrl = await getOrCacheAlbumCover(
        selection.releaseId,
        selection.originalImageUrl,
      );
      if (cachedBlobUrl) {
        console.log(
          `[getSelectionCoverUrl] Got cached blob URL: ${cachedBlobUrl}`,
        );
        return cachedBlobUrl;
      }
    } catch (error) {
      console.warn("Failed to get/cache album cover:", error);
    }
  }

  // If imageUrl is a stale blob URL (starts with "blob:"), fall back to YouTube thumbnail
  // Blob URLs are session-specific and become invalid after page reload
  if (selection.imageUrl && selection.imageUrl.startsWith("blob:")) {
    console.log(
      `[getSelectionCoverUrl] Stale blob URL detected, using YouTube thumbnail`,
    );
    return `https://img.youtube.com/vi/${selection.videoId}/maxresdefault.jpg`;
  }

  // If imageUrl is valid (not a blob URL), use it
  if (selection.imageUrl) {
    console.log(`[getSelectionCoverUrl] Using imageUrl: ${selection.imageUrl}`);
    return selection.imageUrl;
  }

  // Final fallback to YouTube thumbnail
  console.log(`[getSelectionCoverUrl] Using YouTube thumbnail fallback`);
  return `https://img.youtube.com/vi/${selection.videoId}/maxresdefault.jpg`;
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
    const coverUrl = await getSelectionCoverUrl(selection);
    const dominantColor = await extractDominantColor(coverUrl);
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
