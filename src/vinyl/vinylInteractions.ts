import { Object3D } from "three";
import type { LabelTextures, LabelVisualOptions } from "./labels";

// Types
export type VinylSource = "focus" | "turntable" | "dropping";

export type VinylSelectionDetail = {
  entryId?: string | null;
  videoId: string;
  artistName: string;
  songName: string;
  aspectRatio?: number;
  imageUrl?: string;
  originalImageUrl?: string;
  releaseId?: string;
  labelColor?: string;
  vinylColor?: string | null;
};

export type FocusVinylState = {
  model: Object3D;
  selection: VinylSelectionDetail;
};

export type TurntableVinylState = {
  model: Object3D;
  selection: VinylSelectionDetail;
  labelTextures: LabelTextures;
  labelVisuals: LabelVisualOptions;
};

// Constants
export const VINYL_DRAG_THRESHOLD = 38; // Y position threshold - vinyl only returns if below this value
export const FOCUS_VINYL_CLICK_ANIMATION_SPEED = 0.12;
