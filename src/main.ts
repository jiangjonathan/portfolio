import "./style.css";
import {
  Color,
  Group,
  Material,
  Mesh,
  Object3D,
  Quaternion,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import type { Intersection } from "three";
import { loadVinylModel } from "./vinyl";
import {
  applyLabelTextures,
  createLabelTextures,
  createDefaultLabelVisuals,
  type LabelVisualOptions,
  type LabelApplicationOptions,
  type LabelTextures,
} from "./labels";
import { loadTurntableModel, TurntableController } from "./turntable";
import {
  createScene,
  createLights,
  createRenderer,
  createCameraRig,
  loadTextures,
} from "./scene";
import {} from // createTonearmRotationDisplay,
// createCameraInfoDisplay,
"./ui";
import { initializeYouTubePlayer } from "./youtube";
import { createMetadataController } from "./metadata";
import { clampValue, updatePointer } from "./utils";
import {
  MIN_ZOOM,
  MAX_ZOOM,
  CAMERA_ORBIT_SENSITIVITY,
  PAN_SENSITIVITY,
  UI_MAX_WIDTH,
  UI_Z_INDEX,
  VIEWER_MAX_WIDTH,
  HIDE_BUTTON_Z_INDEX,
  LINK_COLOR,
  LINK_HOVER_COLOR,
  FALLBACK_BACKGROUND_COLOR,
} from "./config";
import {
  createVinylAnimationState,
  RETURN_CLEARANCE,
  updateVinylAnimation,
} from "./vinylAnimation";
import { VinylLibraryManager } from "./vinylLibraryManager";
import { VinylLibraryViewer } from "./vinylLibraryViewer";
import { extractDominantColor } from "./colorUtils";
import { initializeCache } from "./albumCoverCache";
import type { VideoMetadata } from "./youtube";

declare global {
  interface Window {
    PLAYING_SOUND: boolean;
  }
}

const root = document.getElementById("app");

if (!root) {
  throw new Error("Missing #app container.");
}

root.innerHTML = "";

// Initialize IndexedDB cache for album covers
initializeCache().catch((error) => {
  console.error("Failed to initialize album cover cache:", error);
  // Continue even if cache initialization fails
});

// Create container for vinyl library widget (form) - moved to bottom left
const vinylLibraryContainer = document.createElement("div");
vinylLibraryContainer.id = "vinyl-library-widget";
vinylLibraryContainer.style.cssText = `
  position: fixed;
  bottom: 20px;
  left: 20px;
  max-width: ${UI_MAX_WIDTH};
  z-index: ${UI_Z_INDEX};
  max-height: auto;
  overflow-y: auto;
`;
root.appendChild(vinylLibraryContainer);

// Create container for vinyl library viewer (grid)
const vinylViewerContainer = document.createElement("div");
vinylViewerContainer.id = "vinyl-library-viewer";
vinylViewerContainer.style.cssText = `
  position: fixed;
  top: 0;
  right: -20px;
  bottom: 0;
  max-width: ${VIEWER_MAX_WIDTH};
  z-index: ${UI_Z_INDEX};
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  transition: opacity 0.3s ease;
  opacity: 1;
  padding: 20px 40px 20px 20px;
`;

// Create hide/show library button (positioned outside the viewer container)
const hideLibraryBtn = document.createElement("button");
hideLibraryBtn.id = "vinyl-hide-library-btn";
hideLibraryBtn.className = "vinyl-hyperlink";
hideLibraryBtn.textContent = "hide library";
hideLibraryBtn.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: ${HIDE_BUTTON_Z_INDEX};
  transition: opacity 0.3s ease, transform 0.3s ease;
  opacity: 1;
`;
hideLibraryBtn.addEventListener("click", () => {
  const libraryGrid = document.getElementById("vinyl-viewer-grid");
  const filterControls = document.querySelector(".filter-controls");

  if (!libraryGrid) return;

  const isHidden = libraryGrid.style.opacity === "0";
  if (isHidden) {
    // Fade in
    libraryGrid.style.display = "";
    if (filterControls) (filterControls as HTMLElement).style.display = "";

    requestAnimationFrame(() => {
      libraryGrid.style.transition = "opacity 0.3s ease";
      libraryGrid.style.opacity = "1";
      if (filterControls) {
        (filterControls as HTMLElement).style.transition = "opacity 0.3s ease";
        (filterControls as HTMLElement).style.opacity = "1";
      }
    });

    hideLibraryBtn.textContent = "hide library";
  } else {
    // Fade out
    libraryGrid.style.transition = "opacity 0.3s ease";
    libraryGrid.style.opacity = "0";
    if (filterControls) {
      (filterControls as HTMLElement).style.transition = "opacity 0.3s ease";
      (filterControls as HTMLElement).style.opacity = "0";
    }

    setTimeout(() => {
      libraryGrid.style.display = "none";
      if (filterControls)
        (filterControls as HTMLElement).style.display = "none";
    }, 300);

    hideLibraryBtn.textContent = "show library";
  }
});
root.appendChild(hideLibraryBtn);

// Create focus card container (outside vinyl-library-viewer to avoid overflow clipping in Safari)
const focusCardCoverContainer = document.createElement("div");
focusCardCoverContainer.id = "vinyl-focus-card-cover-root";
focusCardCoverContainer.className =
  "focus-card-container focus-card-cover-container";
root.appendChild(focusCardCoverContainer);

const focusCardInfoContainer = document.createElement("div");
focusCardInfoContainer.id = "vinyl-focus-card-info-root";
focusCardInfoContainer.className =
  "focus-card-container focus-card-info-container";
root.appendChild(focusCardInfoContainer);

const focusCardContainers = [focusCardCoverContainer, focusCardInfoContainer];

// Create show focus button (positioned next to hide library button)
const showFocusBtn = document.createElement("button");
showFocusBtn.id = "vinyl-show-focus-btn";
showFocusBtn.className = "vinyl-hyperlink";
showFocusBtn.textContent = "show focus";
showFocusBtn.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 110px;
  z-index: ${HIDE_BUTTON_Z_INDEX};
  transition: opacity 0.3s ease, transform 0.3s ease;
  opacity: 1;
  display: none;
`;
showFocusBtn.addEventListener("click", () => {
  const viewer = (window as any).vinylLibraryViewer;
  if (viewer) {
    viewer.showFocusCard();
  }
});
root.appendChild(showFocusBtn);

// Hide scrollbar for webkit browsers and add global hyperlink button styles
const style = document.createElement("style");
style.textContent = `
  #vinyl-library-viewer::-webkit-scrollbar {
    display: none;
  }

  /* Centralized hyperlink button styling */
  :root {
    --vinyl-link-color: ${LINK_COLOR};
    --vinyl-link-hover-color: ${LINK_HOVER_COLOR};
    --vinyl-link-font-size: 0.85rem;
    --vinyl-link-text-shadow: 0.2px 0 0 rgba(255, 0, 0, 0.5), -0.2px 0 0 rgba(0, 100, 200, 0.5);
  }

  .vinyl-hyperlink {
    padding: 0;
    background: transparent;
    color: var(--vinyl-link-color);
    border: none;
    border-radius: 0;
    font-weight: normal;
    cursor: pointer;
    font-size: var(--vinyl-link-font-size);
    transition: color 0.15s;
    letter-spacing: 0;
    text-transform: none;
    text-decoration: underline;
    font-family: inherit;
    -webkit-font-smoothing: none;
    -moz-osx-font-smoothing: grayscale;
    text-shadow: var(--vinyl-link-text-shadow);
  }

  .vinyl-hyperlink:hover {
    background: transparent;
    color: var(--vinyl-link-hover-color);
  }

  .vinyl-hyperlink:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  #bottom-center-controls {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 12px;
    z-index: 100;
  }

  #bottom-center-controls button {
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    border: 1px solid #666;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    transition: background 0.15s;
    -webkit-font-smoothing: none;
    -moz-osx-font-smoothing: grayscale;
  }

  #bottom-center-controls button:hover {
    background: rgba(0, 0, 0, 0.9);
  }

  #vinyl-position-controls {
    position: fixed;
    right: 50%;
    top: 50%;
    transform: translate(50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    padding: 20px;
    border: 1px solid #666;
    border-radius: 8px;
    z-index: 1000;
    color: #fff;
    font-family: monospace;
    font-size: 14px;
    min-width: 250px;
  }

  #vinyl-position-controls h3 {
    margin: 0 0 15px 0;
    font-size: 16px;
    text-align: center;
    border-bottom: 1px solid #666;
    padding-bottom: 10px;
    cursor: move;
    user-select: none;
  }

  #vinyl-position-controls .control-row {
    margin-bottom: 15px;
  }

  #vinyl-position-controls label {
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
    color: #aaa;
  }

  #vinyl-position-controls input[type="number"] {
    width: 100%;
    padding: 6px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid #666;
    border-radius: 4px;
    color: #0f0;
    font-family: monospace;
    font-size: 13px;
  }

  #vinyl-position-controls input[type="number"]:focus {
    outline: none;
    border-color: #0f0;
    background: rgba(255, 255, 255, 0.15);
  }

  #vinyl-position-controls button {
    width: 100%;
    padding: 8px;
    margin-top: 10px;
    background: rgba(255, 0, 0, 0.7);
    color: #fff;
    border: 1px solid #f00;
    border-radius: 4px;
    cursor: pointer;
    font-family: monospace;
    transition: background 0.15s;
  }

  #vinyl-position-controls button:hover {
    background: rgba(255, 0, 0, 0.9);
  }
`;
document.head.appendChild(style);
root.appendChild(vinylViewerContainer);

// Create vinyl position controls (temporary)
// const vinylPositionControls = document.createElement("div");
// vinylPositionControls.id = "vinyl-position-controls";
// vinylPositionControls.innerHTML = `
//   <h3>Vinyl Position Controls</h3>
//   <div class="control-row">
//     <label>X Position</label>
//     <input type="number" id="vinyl-x" value="0" step="0.1">
//   </div>
//   <div class="control-row">
//     <label>Y Position</label>
//     <input type="number" id="vinyl-y" value="0" step="0.1">
//   </div>
//   <div class="control-row">
//     <label>Z Position</label>
//     <input type="number" id="vinyl-z" value="0" step="0.1">
//   </div>
//   <div class="control-row">
//     <label>Scale</label>
//     <input type="number" id="vinyl-scale" value="1" step="0.01" min="0.01">
//   </div>
//   <div class="control-row">
//     <label>Camera Azimuth (degrees)</label>
//     <input type="number" id="camera-azimuth" value="0" step="1">
//   </div>
//   <div class="control-row">
//     <label>Camera Polar (degrees)</label>
//     <input type="number" id="camera-polar" value="45" step="1" min="0" max="90">
//   </div>
//   <button id="vinyl-reset-position">Reset All</button>
// `;
// root.appendChild(vinylPositionControls);

// Vinyl position offset (added to the calculated position)
const vinylPositionOffset = new Vector3(0, 0, 0);
let vinylScaleFactor = 1.0;

// Add event listeners for position controls
// const vinylXInput = document.getElementById("vinyl-x") as HTMLInputElement;
// const vinylYInput = document.getElementById("vinyl-y") as HTMLInputElement;
// const vinylZInput = document.getElementById("vinyl-z") as HTMLInputElement;
// const vinylScaleInput = document.getElementById(
//   "vinyl-scale",
// ) as HTMLInputElement;
// const cameraAzimuthInput = document.getElementById(
//   "camera-azimuth",
// ) as HTMLInputElement;
// const cameraPolarInput = document.getElementById(
//   "camera-polar",
// ) as HTMLInputElement;
// const vinylResetBtn = document.getElementById("vinyl-reset-position");

// vinylXInput.addEventListener("input", () => {
//   vinylPositionOffset.x = parseFloat(vinylXInput.value) || 0;
// });

// vinylYInput.addEventListener("input", () => {
//   vinylPositionOffset.y = parseFloat(vinylYInput.value) || 0;
// });

// vinylZInput.addEventListener("input", () => {
//   vinylPositionOffset.z = parseFloat(vinylZInput.value) || 0;
// });

// vinylScaleInput.addEventListener("input", () => {
//   vinylScaleFactor = parseFloat(vinylScaleInput.value) || 1;
// });

// cameraAzimuthInput.addEventListener("input", () => {
//   const azimuthDeg = parseFloat(cameraAzimuthInput.value) || 0;
//   const polarDeg = parseFloat(cameraPolarInput.value) || 45;
//   const azimuthRad = (azimuthDeg * Math.PI) / 180;
//   const polarRad = (polarDeg * Math.PI) / 180;

//   const direction = new Vector3(
//     Math.sin(azimuthRad) * Math.cos(polarRad),
//     Math.sin(polarRad),
//     Math.cos(azimuthRad) * Math.cos(polarRad),
//   );
//   cameraRig.setViewDirection(direction);
// });

// cameraPolarInput.addEventListener("input", () => {
//   const azimuthDeg = parseFloat(cameraAzimuthInput.value) || 0;
//   const polarDeg = parseFloat(cameraPolarInput.value) || 45;
//   const azimuthRad = (azimuthDeg * Math.PI) / 180;
//   const polarRad = (polarDeg * Math.PI) / 180;

//   const direction = new Vector3(
//     Math.sin(azimuthRad) * Math.cos(polarRad),
//     Math.sin(polarRad),
//     Math.cos(azimuthRad) * Math.cos(polarRad),
//   );
//   cameraRig.setViewDirection(direction);
// });

// vinylResetBtn?.addEventListener("click", () => {
//   vinylPositionOffset.set(0, 0, 0);
//   vinylScaleFactor = 1.0;
//   vinylXInput.value = "0";
//   vinylYInput.value = "0";
//   vinylZInput.value = "0";
//   vinylScaleInput.value = "1";
//   cameraAzimuthInput.value = "0";
//   cameraPolarInput.value = "45";

//   // Reset camera to default view
//   const direction = new Vector3(
//     0,
//     Math.sin((45 * Math.PI) / 180),
//     Math.cos((45 * Math.PI) / 180),
//   );
//   cameraRig.setViewDirection(direction);
// });

// Make vinyl position controls draggable
// const vinylControlsHeader = vinylPositionControls.querySelector("h3");
// let isDraggingControls = false;
// let controlsDragOffsetX = 0;
// let controlsDragOffsetY = 0;

// vinylControlsHeader?.addEventListener("mousedown", (e) => {
//   isDraggingControls = true;
//   const rect = vinylPositionControls.getBoundingClientRect();
//   controlsDragOffsetX = e.clientX - rect.left;
//   controlsDragOffsetY = e.clientY - rect.top;
//   vinylPositionControls.style.transition = "none";
// });

// document.addEventListener("mousemove", (e) => {
//   if (!isDraggingControls) return;

//   const x = e.clientX - controlsDragOffsetX;
//   const y = e.clientY - controlsDragOffsetY;

//   vinylPositionControls.style.right = "auto";
//   vinylPositionControls.style.top = "auto";
//   vinylPositionControls.style.left = `${x}px`;
//   vinylPositionControls.style.top = `${y}px`;
//   vinylPositionControls.style.transform = "none";
// });

// document.addEventListener("mouseup", () => {
//   isDraggingControls = false;
// });

// Turntable position cycling (camera view)
type TurntablePosition =
  | "default"
  | "bottom-center"
  | "bottom-left"
  | "fullscreen";
let turntablePositionState: TurntablePosition = "default";
let vinylCameraTrackingEnabled = true;

// Camera target positions (pan/translation only, no angle change)
// Will be initialized after heroGroup is loaded based on bounding box center
let defaultCameraTarget = new Vector3(0, 0.15, 0);
const CAMERA_TARGETS: Record<TurntablePosition, Vector3> = {
  default: defaultCameraTarget,
  "bottom-center": new Vector3(), // Will be set after heroGroup loads
  "bottom-left": new Vector3(), // Will be set after heroGroup loads
  fullscreen: new Vector3(), // Will be set after heroGroup loads
};

const bottomCenterControls = document.createElement("div");
bottomCenterControls.id = "bottom-center-controls";
root.appendChild(bottomCenterControls);

// Create position cycling button
const positionButton = document.createElement("button");
positionButton.id = "turntable-position-button";
positionButton.textContent = "Position: Default";
positionButton.addEventListener("click", () => {
  const positions: TurntablePosition[] = [
    "default",
    "bottom-center",
    "bottom-left",
  ];
  const currentIndex = positions.indexOf(turntablePositionState);
  const nextIndex = (currentIndex + 1) % positions.length;
  turntablePositionState = positions[nextIndex];

  // Pan camera to new position with animation (no angle change)
  cameraRig.setLookTarget(CAMERA_TARGETS[turntablePositionState], true);

  const labels: Record<TurntablePosition, string> = {
    default: "Position: Default",
    "bottom-center": "Position: Bottom Center",
    "bottom-left": "Position: Bottom Left",
    fullscreen: "Position: Fullscreen",
  };
  positionButton.textContent = labels[turntablePositionState];
});
bottomCenterControls.appendChild(positionButton);

const billboardToggleButton = document.createElement("button");
billboardToggleButton.id = "vinyl-billboard-toggle";

const updateBillboardToggleLabel = () => {
  billboardToggleButton.textContent = vinylCameraTrackingEnabled
    ? "Camera Tracking: On"
    : "Camera Tracking: Off";
  billboardToggleButton.title = vinylCameraTrackingEnabled
    ? "Disable camera-relative position and quaternion billboard tracking"
    : "Enable camera-relative position and quaternion billboard tracking";
};

billboardToggleButton.addEventListener("click", () => {
  vinylCameraTrackingEnabled = !vinylCameraTrackingEnabled;
  updateBillboardToggleLabel();
});

updateBillboardToggleLabel();
bottomCenterControls.appendChild(billboardToggleButton);

const canvas = document.createElement("canvas");
canvas.id = "vinyl-viewer";
root.appendChild(canvas);

const renderer = createRenderer(canvas);
const scene = createScene();
const { ambientLight, keyLight, fillLight, rimLight } = createLights();
scene.add(ambientLight, keyLight, fillLight, rimLight);

const cameraRig = createCameraRig();
const { camera } = cameraRig;

const { vinylNormalTexture } = loadTextures(renderer);

const FOCUS_VINYL_BASE_SCALE = 0.88;

let labelVisuals: LabelVisualOptions = createDefaultLabelVisuals();

const applyLabelTextureQuality = (textures: LabelTextures) => {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  textures.sideA.anisotropy = anisotropy;
  textures.sideB.anisotropy = anisotropy;
};

const getFocusVinylScale = () =>
  FOCUS_VINYL_BASE_SCALE / cameraRig.getZoomFactor();

const applyFocusVinylScale = () => {
  if (focusVinylState) {
    focusVinylState.model.scale.setScalar(getFocusVinylScale());
  }
};

let focusLabelTextures: LabelTextures = createLabelTextures(labelVisuals);
applyLabelTextureQuality(focusLabelTextures);

let labelOptions: LabelApplicationOptions = {
  scale: 1,
  padding: 0,
  offsetX: 0,
  offsetY: 0,
};

// const RAD2DEG = 180 / Math.PI;

const heroGroup = new Group();
scene.add(heroGroup);

let zoomFactor = 1.6;
cameraRig.setZoomFactor(zoomFactor);

// const cameraInfoDisplay = createCameraInfoDisplay();
// root.appendChild(cameraInfoDisplay.container);

// Create vinyl debug display
// const vinylDebugDisplay = document.createElement("div");
// vinylDebugDisplay.id = "vinyl-debug-display";
// vinylDebugDisplay.style.cssText = `
//   position: fixed;
//   top: 20px;
//   left: 20px;
//   background: rgba(0, 0, 0, 0.8);
//   color: #0f0;
//   padding: 10px;
//   font-family: monospace;
//   font-size: 12px;
//   line-height: 1.5;
//   z-index: 1000;
//   border: 1px solid #0f0;
//   pointer-events: none;
// `;
// root.appendChild(vinylDebugDisplay);

// Create camera debug display
// const cameraDebugDisplay = document.createElement("div");
// cameraDebugDisplay.id = "camera-debug-display";
// cameraDebugDisplay.style.cssText = `
//   position: fixed;
//   top: 340px;
//   left: 20px;
//   background: rgba(0, 0, 0, 0.8);
//   color: #0ff;
//   padding: 10px;
//   font-family: monospace;
//   font-size: 12px;
//   line-height: 1.5;
//   z-index: 1000;
//   border: 1px solid #0ff;
//   pointer-events: none;
// `;
// root.appendChild(cameraDebugDisplay);

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.08 : -0.08;
    zoomFactor = clampValue(zoomFactor + delta, MIN_ZOOM, MAX_ZOOM);
    cameraRig.setZoomFactor(zoomFactor);
    applyFocusVinylScale();
  },
  { passive: false },
);

let vinylModel: Object3D | null = null;
type FocusVinylState = {
  model: Object3D;
  selection: VinylSelectionDetail;
};

type TurntableVinylState = {
  model: Object3D;
  selection: VinylSelectionDetail;
  labelTextures: LabelTextures;
  labelVisuals: LabelVisualOptions;
};

let focusVinylState: FocusVinylState | null = null;
let turntableVinylState: TurntableVinylState | null = null;
let focusVinylLoadToken = 0;
type VinylSource = "focus" | "turntable";
let activeVinylSource: VinylSource | null = null;
let currentDragSource: VinylSource | null = null;
let pendingPromotionSource: VinylSource | null = null;

const syncAnimationStateToModel = (model: Object3D) => {
  vinylAnchorPosition.copy(model.position);
  vinylTargetPosition.copy(model.position);
  lastTargetPosition.copy(model.position);
  currentPointerWorld.copy(model.position);
  pointerAttachmentOffset.copy(hangOffset);
  vinylAnimationState.desiredPosition.copy(model.position);
  vinylAnimationState.relativeOffset.set(0, 0, 0);
  vinylAnimationState.cameraRelativeOffsetValid = false;
};

const setActiveVinylSource = (
  source: VinylSource | null,
  { syncState = true }: { syncState?: boolean } = {},
) => {
  if (activeVinylSource === source) {
    return;
  }
  activeVinylSource = source;
  if (source === "focus") {
    vinylModel = focusVinylState?.model ?? null;
    if (vinylModel && syncState) {
      syncAnimationStateToModel(vinylModel);
    }
    applyFocusVinylScale();
  } else if (source === "turntable") {
    vinylModel = turntableVinylState?.model ?? null;
    if (vinylModel && syncState) {
      syncAnimationStateToModel(vinylModel);
    }
  } else {
    vinylModel = null;
  }
};

const cloneLabelVisuals = (visuals: LabelVisualOptions): LabelVisualOptions =>
  JSON.parse(JSON.stringify(visuals));

const disposeFocusVinyl = () => {
  if (!focusVinylState) {
    return;
  }
  heroGroup.remove(focusVinylState.model);
  focusVinylState = null;
  shouldTrackFocusCard = false;
  if (activeVinylSource === "focus") {
    setActiveVinylSource(turntableVinylState ? "turntable" : null);
  }
};

const disposeTurntableVinyl = () => {
  if (!turntableVinylState) {
    return;
  }
  heroGroup.remove(turntableVinylState.model);
  turntableVinylState.labelTextures.sideA.dispose();
  turntableVinylState.labelTextures.sideB.dispose();
  turntableVinylState = null;
  if (activeVinylSource === "turntable") {
    setActiveVinylSource(focusVinylState ? "focus" : null);
  }
};

const detachFocusTexturesForTurntable = (): LabelTextures => {
  const textures = focusLabelTextures;
  focusLabelTextures = createLabelTextures(labelVisuals);
  applyLabelTextureQuality(focusLabelTextures);
  return textures;
};

const updateTurntableVinylVisuals = (visuals: LabelVisualOptions) => {
  if (!turntableVinylState) {
    return;
  }
  turntableVinylState.labelTextures.sideA.dispose();
  turntableVinylState.labelTextures.sideB.dispose();
  const snapshot = cloneLabelVisuals(visuals);
  const textures = createLabelTextures(snapshot);
  applyLabelTextureQuality(textures);
  turntableVinylState.labelTextures = textures;
  turntableVinylState.labelVisuals = snapshot;
  applyLabelTextures(
    turntableVinylState.model,
    textures,
    labelOptions,
    snapshot,
  );
};
let shouldTrackFocusCard = false; // Flag to enable focus card tracking
let focusCardAnchorPosition = new Vector3(); // Saved position for focus card anchor
const turntableAnchorPosition = new Vector3(0, 6.41, 0); // Fixed turntable anchor position (read-only)
const cameraOrbitState = {
  isOrbiting: false,
  pointerId: -1,
  lastX: 0,
  lastY: 0,
};

const cameraPanState = {
  isPanning: false,
  pointerId: -1,
  lastX: 0,
  lastY: 0,
};

const raycaster = new Raycaster();
const pointerNDC = new Vector2();
const dragPlane = new Plane(new Vector3(0, 0, 1), 0); // Plane perpendicular to Z axis (allows X and Y movement)
const dragIntersectPoint = new Vector3();
const vinylAnimationState = createVinylAnimationState();
const cameraForward = new Vector3();
const cameraRight = new Vector3();
const cameraUpVector = new Vector3();
const {
  vinylAnchorPosition,
  vinylTargetPosition,
  lastTargetPosition,
  currentPointerWorld,
  pointerAttachmentOffset,
  hangOffset,
  swingState,
} = vinylAnimationState;
const placementRaycaster = new Raycaster();
const placementRayOrigin = new Vector3();
const placementRayDirection = new Vector3(0, -1, 0);
const centerSampleOffset = new Vector3();
const platterSampleWorld = new Vector3();
const turntableWorldPos = new Vector3();
const turntableWorldQuat = new Quaternion();
let turntableController: TurntableController | null = null;
function rebuildLabelTextures() {
  focusLabelTextures.sideA.dispose();
  focusLabelTextures.sideB.dispose();
  focusLabelTextures = createLabelTextures(labelVisuals);
  applyLabelTextureQuality(focusLabelTextures);
  if (focusVinylState) {
    applyLabelTextures(
      focusVinylState.model,
      focusLabelTextures,
      labelOptions,
      labelVisuals,
    );
  }
}

const metadataController = createMetadataController({
  labelVisuals,
  onVisualsUpdated: rebuildLabelTextures,
});
const { applyMetadata: applyMetadataToLabels, loadSupplementalLabelMetadata } =
  metadataController;
loadSupplementalLabelMetadata();

// YouTube player (top-left), wired to the turntable
// No default video - user must provide URL via input
const youtubePlayer = initializeYouTubePlayer(root);
const {
  bridge: yt,
  controls: videoControls,
  updateProgress: updateVideoProgress,
  ready: youtubeReady,
} = youtubePlayer;

type VinylSelectionDetail = {
  entryId?: string | null;
  videoId: string;
  artistName: string;
  songName: string;
  aspectRatio?: number;
  imageUrl?: string;
};

let pendingVinylSelection: VinylSelectionDetail | null = null;
let loadedSelectionVideoId: string | null = null;
let selectionVisualUpdateId = 0;
let currentVideoLoad: Promise<void> | null = null;

const getSelectionCoverUrl = (selection: VinylSelectionDetail) =>
  selection.imageUrl ||
  `https://img.youtube.com/vi/${selection.videoId}/maxresdefault.jpg`;

const applySelectionVisualsToVinyl = async (
  selection: VinylSelectionDetail,
) => {
  applyMetadataToLabels(
    {
      artist: selection.artistName,
      song: selection.songName,
      album: "",
    },
    true,
  );
  rebuildLabelTextures();

  const updateId = ++selectionVisualUpdateId;
  try {
    const dominantColor = await extractDominantColor(
      getSelectionCoverUrl(selection),
    );
    if (updateId !== selectionVisualUpdateId) {
      return;
    }
    labelVisuals.background = dominantColor;
  } catch (error) {
    if (updateId !== selectionVisualUpdateId) {
      return;
    }
    console.warn("Failed to extract dominant color, using fallback", error);
    labelVisuals.background = FALLBACK_BACKGROUND_COLOR;
  }
  if (updateId === selectionVisualUpdateId) {
    rebuildLabelTextures();
  }
};

const loadVideoForCurrentSelection = async () => {
  if (!pendingVinylSelection || !ON_TURNTABLE) {
    return;
  }

  if (currentVideoLoad) {
    try {
      await currentVideoLoad;
    } catch {
      // ignore prior failure and attempt again
    }
    if (
      !pendingVinylSelection ||
      !ON_TURNTABLE ||
      (loadedSelectionVideoId &&
        pendingVinylSelection.videoId === loadedSelectionVideoId)
    ) {
      return;
    }
  }

  const selection = pendingVinylSelection;
  const loadPromise = (async () => {
    hasStartedFadeOut = false;
    turntableController?.returnTonearmHome();
    turntableController?.pausePlayback();
    loadedSelectionVideoId = null;

    if (vinylModel) {
      const randomRotation = Math.random() * Math.PI * 2;
      vinylReturnBaseTwist = randomRotation;
    }

    if (selection.aspectRatio !== undefined) {
      yt.setAspectRatio(selection.aspectRatio);
      console.log(`[main] Applied aspect ratio: ${selection.aspectRatio}`);
    } else {
      yt.setAspectRatio(null as any);
    }

    await youtubePlayer.loadVideo(selection.videoId, (videoMetadata) => {
      const correctedMetadata: VideoMetadata = {
        artist: selection.artistName,
        song: selection.songName,
        album: videoMetadata?.album || "",
      };
      applyMetadataToLabels(correctedMetadata, true);
      if (turntableVinylState) {
        updateTurntableVinylVisuals(labelVisuals);
      }

      const duration = youtubePlayer.getDuration();
      if (duration > 0 && turntableController) {
        turntableController.setMediaDuration(duration);
      }
      if (duration > 0) {
        console.log(`[main] Video duration loaded: ${duration} seconds`);
        window.dispatchEvent(
          new CustomEvent("video-duration-loaded", {
            detail: {
              videoId: selection.videoId,
              duration: Math.floor(duration),
            },
          }),
        );
      }
    });

    const duration = youtubePlayer.getDuration();
    if (duration > 1 && turntableController) {
      turntableController.setMediaDuration(duration);
    }
    videoControls.setProgress(0, duration);

    yt.setVolume(0);
    yt.play();
    setTimeout(() => {
      yt.pause();
      yt.seek(0);
      yt.setVolume(100);
    }, 300);

    if (ON_TURNTABLE) {
      loadedSelectionVideoId = selection.videoId;
      console.log(
        `Loaded for turntable: ${selection.artistName} - ${selection.songName}`,
      );
    } else {
      loadedSelectionVideoId = null;
    }
  })();

  currentVideoLoad = loadPromise;
  try {
    await loadPromise;
  } finally {
    if (currentVideoLoad === loadPromise) {
      currentVideoLoad = null;
    }
  }

  if (
    pendingVinylSelection &&
    pendingVinylSelection.videoId !== selection.videoId
  ) {
    void loadVideoForCurrentSelection();
  }
};

// Listen for song clicks from the viewer
window.addEventListener("load-vinyl-song", (event) => {
  const detail = (event as CustomEvent<VinylSelectionDetail>).detail;
  if (!detail || !detail.videoId) {
    return;
  }

  pendingVinylSelection = detail;
  void handleFocusSelection(detail);
});

async function handleFocusSelection(selection: VinylSelectionDetail) {
  const loadToken = ++focusVinylLoadToken;
  vinylDragPointerId = null;
  isReturningVinyl = false;
  isReturningToFocusCard = false;
  shouldTrackFocusCard = true;

  await applySelectionVisualsToVinyl(selection);

  // Always dispose old focus vinyl
  disposeFocusVinyl();

  // Only dispose turntable vinyl if it's not currently playing
  if (turntableVinylState && !turntableController?.isPlaying()) {
    setVinylOnTurntable(false);
  }

  // Duration will be shown when the vinyl is placed on the turntable

  try {
    const model = await loadVinylModel(vinylNormalTexture);
    if (loadToken !== focusVinylLoadToken) {
      heroGroup.remove(model);
      return;
    }
    focusVinylState = { model, selection };
    model.visible = false;
    heroGroup.add(model);
    applyLabelTextures(model, focusLabelTextures, labelOptions, labelVisuals);
    applyFocusVinylScale();
    setActiveVinylSource("focus");
    prepareFocusVinylPresentation(model, loadToken);
  } catch (error) {
    console.error("Failed to load focus vinyl", error);
  }
}

function prepareFocusVinylPresentation(model: Object3D, token: number) {
  setActiveVinylSource("focus");
  vinylScaleFactor = getFocusVinylScale();
  vinylAnimationState.cameraRelativeOffsetValid = false;
  updateFocusCardPosition();
  resetVinylAnimationState(focusCardAnchorPosition);

  // Enable billboard effect immediately
  vinylCameraTrackingEnabled = true;

  // Fade in once positioned
  setTimeout(() => {
    if (token === focusVinylLoadToken && focusVinylState?.model === model) {
      model.visible = true;
    }
  }, 300);

  setTimeout(() => {
    if (token === focusVinylLoadToken && focusVinylState?.model === model) {
      updateFocusCardPosition();
      console.log(
        "[load-vinyl-song] Updated focus card position after camera animation",
      );
    }
  }, 700);
}

// Listen for aspect ratio updates from the focus card
window.addEventListener("update-aspect-ratio", (event: any) => {
  const { aspectRatio } = event.detail;
  console.log(`[main] Updating aspect ratio live to: ${aspectRatio}`);
  yt.setAspectRatio(aspectRatio);
});

// Listen for focus card album cover hover to shift vinyl (with animation)
const FOCUS_VINYL_HOVER_DISTANCE = 5;
const FOCUS_VINYL_HOVER_ANIMATION_SPEED = 0.25;
let focusVinylHoverOffset = 0;
let focusVinylHoverOffsetTarget = 0;
window.addEventListener("focus-cover-hover", (event: any) => {
  const { hovered } = event.detail;
  focusVinylHoverOffsetTarget = hovered ? FOCUS_VINYL_HOVER_DISTANCE : 0;
  console.log(
    `[main] Focus cover hover: ${hovered}, target offset: ${focusVinylHoverOffsetTarget}`,
  );
});

const FOCUS_VINYL_CLICK_DISTANCE = 20;
const FOCUS_VINYL_CLICK_ANIMATION_SPEED = 0.25;
let focusVinylClickOffset = 0;
let focusVinylClickOffsetTarget = 0;
window.addEventListener("focus-cover-click", (event: any) => {
  const { active } = event.detail;
  focusVinylClickOffsetTarget = active ? FOCUS_VINYL_CLICK_DISTANCE : 0;
  document.body?.classList.toggle("focus-cover-click-active", active);
});

// Listen for focus card show events to change camera position and angle
window.addEventListener("focus-card-shown", (event: any) => {
  const { position, polarAngle } = event.detail;
  console.log(
    `[main] Focus card shown, changing camera position to: ${position}, polar angle to: ${polarAngle}°`,
  );

  // Change camera position to bottom-center
  if (position === "bottom-center") {
    turntablePositionState = "bottom-center";
    cameraRig.setLookTarget(CAMERA_TARGETS[turntablePositionState], true);

    // Invalidate camera relative offset when camera moves so vinyl stays at set position
    vinylAnimationState.cameraRelativeOffsetValid = false;
  }

  // Change polar angle with smooth animation
  if (polarAngle !== undefined) {
    cameraRig.setPolarAngle(polarAngle, true);
  }
});

// Initially hide the player controls (only show when tonearm is in play area)
yt.setControlsVisible(false);

// Register callback to query tonearm state when exiting fullscreen
yt.setIsTonearmInPlayAreaQuery(() => isTonearmInPlayArea);

// Auto-hide library and button in fullscreen player mode
yt.onFullscreenChange((isFullscreen: boolean) => {
  if (isFullscreen) {
    vinylViewerContainer.style.opacity = "0";
    vinylViewerContainer.style.pointerEvents = "none";
    hideLibraryBtn.style.opacity = "0";
    hideLibraryBtn.style.pointerEvents = "none";
    focusCardContainers.forEach((container) => {
      container.style.opacity = "0";
      container.style.pointerEvents = "none";
    });
    showFocusBtn.style.opacity = "0";
    showFocusBtn.style.pointerEvents = "none";

    // Switch to fullscreen camera position
    turntablePositionState = "fullscreen";
    cameraRig.setLookTarget(CAMERA_TARGETS["fullscreen"], true);
    cameraRig.setPolarAngle(2, true);
  } else {
    vinylViewerContainer.style.opacity = "1";
    vinylViewerContainer.style.pointerEvents = "auto";
    hideLibraryBtn.style.opacity = "1";
    hideLibraryBtn.style.pointerEvents = "auto";
    focusCardContainers.forEach((container) => {
      if (container.childElementCount > 0) {
        container.style.opacity = "1";
      }
      container.style.pointerEvents = "auto";
    });
    showFocusBtn.style.opacity = "1";
    showFocusBtn.style.pointerEvents = "auto";

    // Return to bottom-center when exiting fullscreen
    turntablePositionState = "bottom-center";
    cameraRig.setLookTarget(CAMERA_TARGETS["bottom-center"], true);
    // Restore bottom-center polar angle (22 degrees)
    cameraRig.setPolarAngle(22, true);
  }
});

// Track when video reaches the last 2 seconds to animate out
let hasStartedFadeOut = false;
let isTonearmInPlayArea = false;
yt.onPlaybackProgress(() => {
  const currentTime = yt.getCurrentTime();
  const duration = youtubePlayer.getDuration();
  const timeRemaining = duration - currentTime;

  // When video has 2 seconds or less remaining, animate controls and viewport out (only in small mode)
  if (!yt.isFullscreen()) {
    if (timeRemaining <= 2 && !hasStartedFadeOut) {
      hasStartedFadeOut = true;
      // Fade out the controls
      yt.setControlsVisible(false);
      // Animate viewport height to 0
      const viewport = root.querySelector(".yt-player-viewport") as HTMLElement;
      if (viewport) {
        viewport.style.height = "0px";
      }
    } else if (timeRemaining > 2) {
      // Reset the flag if we seek back
      hasStartedFadeOut = false;
    }
  }
});

let vinylDragPointerId: number | null = null;
let isReturningVinyl = false;
let hasClearedNub = false;
let nubClearanceY = 0;
let vinylDragExceededThreshold = false;
// tonearm drag handled by controller
let ON_TURNTABLE = false;
const VINYL_DRAG_THRESHOLD = 30; // Y position threshold - vinyl only returns if below this value
let isReturningToFocusCard = false; // Separate state for returning to focus card
function setVinylOnTurntable(onTurntable: boolean) {
  if (onTurntable) {
    const promotingFocus = pendingPromotionSource === "focus";
    pendingPromotionSource = null;
    if (promotingFocus && focusVinylState) {
      if (turntableVinylState) {
        disposeTurntableVinyl();
      }
      const textures = detachFocusTexturesForTurntable();
      const snapshotVisuals = cloneLabelVisuals(labelVisuals);
      turntableVinylState = {
        model: focusVinylState.model,
        selection: focusVinylState.selection,
        labelTextures: textures,
        labelVisuals: snapshotVisuals,
      };
      focusVinylState = null;
      shouldTrackFocusCard = false;
      setActiveVinylSource("turntable");
    }
    if (!turntableVinylState) {
      return;
    }
    ON_TURNTABLE = true;
    turntableController?.setVinylPresence(true);
    // Only return tonearm home and load video if promoting from focus
    if (promotingFocus) {
      turntableController?.returnTonearmHome();
      pendingVinylSelection = turntableVinylState.selection;
      void loadVideoForCurrentSelection();
    }
    return;
  }

  pendingPromotionSource = null;
  if (!ON_TURNTABLE) {
    return;
  }

  ON_TURNTABLE = false;
  turntableController?.setVinylPresence(false);
  loadedSelectionVideoId = null;
  isTonearmInPlayArea = false;
  yt.setControlsVisible(false);
  const viewport = root?.querySelector(
    ".yt-player-viewport",
  ) as HTMLElement | null;
  if (viewport) {
    viewport.style.height = "0px";
  }
  turntableController?.liftNeedle();
  disposeTurntableVinyl();
  setActiveVinylSource(focusVinylState ? "focus" : null);
}
let vinylSpinAngle = 0;
let vinylUserRotation = 0;
let lastTime = performance.now();
let tonearmPlayTime = 0;
// Vinyl twist that plays during the return-drop animation
let vinylReturnTwist = 0;
let vinylReturnTwistTarget = 0;
let vinylReturnBaseTwist = 0;
// spin handled by controller

// Match the default orientation in CameraRig (yaw=0°, pitch=45°).
cameraRig.setViewDirection(
  new Vector3(
    0,
    Math.sin((45 * Math.PI) / 180),
    Math.cos((45 * Math.PI) / 180),
  ),
);

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

// Spacebar to toggle start/stop (only when not typing in input fields)
let isSpacePressed = false;

document.addEventListener("keydown", (event) => {
  // Check if user is typing in an input, textarea, or contenteditable element
  const target = event.target as HTMLElement;
  const isTyping =
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable;

  // Ignore keyboard shortcuts when typing
  if (isTyping) {
    return;
  }

  if ((event.code === "Space" || event.key === " ") && !isSpacePressed) {
    isSpacePressed = true;
    event.preventDefault();
    turntableController?.toggleStartStop();
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code === "Space" || event.key === " ") {
    isSpacePressed = false;
  }
});

const pickVinylUnderPointer = () => {
  const hits: {
    source: VinylSource;
    model: Object3D;
    hit: Intersection<Object3D>;
  }[] = [];
  if (focusVinylState?.model.visible) {
    const focusHit = raycaster.intersectObject(focusVinylState.model, true);
    if (focusHit.length) {
      hits.push({
        source: "focus",
        model: focusVinylState.model,
        hit: focusHit[0],
      });
    }
  }
  if (turntableVinylState) {
    const tableHit = raycaster.intersectObject(turntableVinylState.model, true);
    if (tableHit.length) {
      hits.push({
        source: "turntable",
        model: turntableVinylState.model,
        hit: tableHit[0],
      });
    }
  }
  if (!hits.length) {
    return null;
  }
  hits.sort((a, b) => a.hit.distance - b.hit.distance);
  return hits[0];
};

canvas.addEventListener("pointerdown", (event) => {
  if (event.button === 1) {
    startCameraPan(event);
    return;
  }
  if (event.button === 2) {
    startCameraOrbit(event);
    return;
  }
  if (event.button !== 0) {
    return;
  }
  if (turntableController && turntableController.handlePointerDown(event)) {
    return;
  }
  // Disable vinyl dragging in fullscreen mode
  if (yt.isFullscreen()) {
    return;
  }
  if (!updatePointer(event, pointerNDC, canvas)) {
    return;
  }
  raycaster.setFromCamera(pointerNDC, camera);
  const vinylSelection = pickVinylUnderPointer();
  if (!vinylSelection) {
    return;
  }
  const previousSource = activeVinylSource;
  setActiveVinylSource(vinylSelection.source);
  if (!vinylModel) {
    return;
  }
  if (
    vinylSelection.source === "focus" &&
    focusVinylState &&
    previousSource !== "focus"
  ) {
    resetVinylAnimationState(focusCardAnchorPosition);
  } else if (
    vinylSelection.source === "turntable" &&
    turntableVinylState &&
    previousSource !== "turntable"
  ) {
    resetVinylAnimationState(turntableAnchorPosition);
  }
  // Set drag plane perpendicular to camera forward direction for unrestricted dragging
  camera.getWorldDirection(cameraForward);
  dragPlane.setFromNormalAndCoplanarPoint(cameraForward, vinylModel.position);

  const hit = raycaster.ray.intersectPlane(dragPlane, dragIntersectPoint);
  if (!hit) {
    return;
  }

  vinylDragPointerId = event.pointerId;
  currentDragSource = vinylSelection.source;
  isReturningVinyl = false;
  hasClearedNub = false;
  vinylDragExceededThreshold = false;
  if (vinylSelection.source === "turntable") {
    turntableController?.liftNeedle();
    turntableController?.setVinylPresence(false);
  }
  currentPointerWorld.copy(hit);
  pointerAttachmentOffset.copy(vinylModel.position).sub(hit);
  vinylTargetPosition.copy(vinylModel.position);
  lastTargetPosition.copy(vinylModel.position);
  swingState.targetX = 0;
  swingState.targetZ = 0;
  canvas.setPointerCapture(event.pointerId);
});

let isTurntableHovered = false;

canvas.addEventListener("pointermove", (event) => {
  if (handleCameraPanMove(event)) {
    return;
  }
  if (handleCameraOrbitMove(event)) {
    return;
  }
  if (turntableController && turntableController.handlePointerMove(event)) {
    return;
  }

  // Check if hovering over turntable in fullscreen mode
  if (yt.isFullscreen() && turntablePositionState === "fullscreen") {
    if (!updatePointer(event, pointerNDC, canvas)) {
      return;
    }
    raycaster.setFromCamera(pointerNDC, camera);

    // Check if hovering over turntable (heroGroup contains turntable and vinyl)
    const turntableHits = raycaster.intersectObject(heroGroup, true);
    const wasHovered = isTurntableHovered;
    isTurntableHovered = turntableHits.length > 0;

    // Only change polar angle and Z position if hover state changed
    if (isTurntableHovered && !wasHovered) {
      cameraRig.setPolarAngle(88, true);
      // Set Z to 0 (reset to default) when hovered
      const hoveredTarget = new Vector3(
        CAMERA_TARGETS["fullscreen"].x,
        CAMERA_TARGETS["fullscreen"].y - 18,
        defaultCameraTarget.z - 23.4,
      );
      cameraRig.setLookTarget(hoveredTarget, true);
    } else if (!isTurntableHovered && wasHovered) {
      cameraRig.setPolarAngle(2, true);
      // Restore fullscreen Z position when unhovered
      cameraRig.setLookTarget(CAMERA_TARGETS["fullscreen"], true);
    }
  }

  if (
    vinylDragPointerId === null ||
    event.pointerId !== vinylDragPointerId ||
    !vinylModel
  ) {
    return;
  }
  const hit = pickPointOnPlane(event);
  if (!hit) {
    return;
  }
  currentPointerWorld.copy(hit);
});

const endDrag = (event: PointerEvent) => {
  if (vinylDragPointerId === null || event.pointerId !== vinylDragPointerId) {
    return;
  }

  const dragSource = currentDragSource;
  vinylDragPointerId = null;
  currentDragSource = null;
  pointerAttachmentOffset.copy(hangOffset);
  currentPointerWorld.copy(vinylAnchorPosition);
  if (vinylModel) {
    vinylTargetPosition.copy(vinylModel.position);
    lastTargetPosition.copy(vinylModel.position);
  } else {
    vinylTargetPosition.copy(vinylAnchorPosition);
    lastTargetPosition.copy(vinylAnchorPosition);
  }

  // Determine which anchor to return to based on Y position threshold
  if (vinylModel && vinylModel.position.y < VINYL_DRAG_THRESHOLD) {
    // Below threshold: return to turntable with full animation (nub clearance, etc.)
    if (!isReturningVinyl && !isReturningToFocusCard) {
      isReturningVinyl = true;
      isReturningToFocusCard = false;
      hasClearedNub = false;
      // Only set pendingPromotionSource if dragging from focus (not if already on turntable)
      pendingPromotionSource = dragSource === "turntable" ? null : dragSource;
      // Switch anchor to turntable when starting return (but keep shouldTrackFocusCard - only disable when actually on turntable)
      vinylAnchorPosition.copy(turntableAnchorPosition);
    }
  } else if (
    vinylModel &&
    vinylModel.position.y >= VINYL_DRAG_THRESHOLD &&
    shouldTrackFocusCard
  ) {
    // Above threshold with focus card tracking: return to focus card with simple animation
    if (!isReturningVinyl && !isReturningToFocusCard) {
      isReturningVinyl = false;
      isReturningToFocusCard = true;
      pendingPromotionSource = null;
      // Switch anchor to focus card when starting return
      vinylAnchorPosition.copy(focusCardAnchorPosition);
    }
  }

  if (
    !vinylDragExceededThreshold &&
    vinylModel &&
    vinylModel.position.y < VINYL_DRAG_THRESHOLD &&
    dragSource === "turntable"
  ) {
    turntableController?.setVinylPresence(true);
  }
  vinylDragExceededThreshold = false;

  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // ignore if pointer was already released
  }

  swingState.targetX = 0;
  swingState.targetZ = 0;
  // Only switch back to focus if we're not returning to turntable and not returning to focus card
  if (
    focusVinylState &&
    activeVinylSource !== "focus" &&
    !isReturningVinyl &&
    !isReturningToFocusCard
  ) {
    setActiveVinylSource("focus");
  }
};

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", endDrag);

const endTonearmDrag = (event: PointerEvent) => {
  turntableController?.handlePointerUp(event);
};

canvas.addEventListener("pointerup", endTonearmDrag);
canvas.addEventListener("pointercancel", endTonearmDrag);
canvas.addEventListener("pointerleave", endTonearmDrag);
// hover state handled by controller
canvas.addEventListener("pointerup", endCameraOrbit);
canvas.addEventListener("pointercancel", endCameraOrbit);
canvas.addEventListener("pointerleave", endCameraOrbit);
canvas.addEventListener("pointerup", endCameraPan);
canvas.addEventListener("pointercancel", endCameraPan);
canvas.addEventListener("pointerleave", endCameraPan);

loadTurntableModel()
  .then((turntable) => {
    const cartridge = findObjectByName(
      turntable.getObjectByName("Mount") ?? null,
      "Cartridge",
    );
    if (cartridge) {
      applyCartridgeColor(cartridge);
    }
    turntableController = new TurntableController(turntable, {
      camera,
      canvas,
      getZoomFactor: () => cameraRig.getZoomFactor(),
      onScrub: (seconds) => {
        // Only scrub if video is loaded
        if (loadedSelectionVideoId) {
          yt.seek(seconds);
          videoControls.setProgress(
            seconds,
            youtubePlayer.getDuration() || yt.getDuration(),
          );
        }
      },
      onPlay: () => {
        // Only play if video is loaded
        if (loadedSelectionVideoId) {
          yt.play();
        }
      },
      onPause: () => {
        // Only pause if video is loaded
        if (loadedSelectionVideoId) {
          yt.pause();
        }
      },
      onRateChange: (rate) => {
        // Only change rate if video is loaded
        if (loadedSelectionVideoId) {
          yt.setRate(rate);
        }
      },
    });
    turntableController.setVinylPresence(ON_TURNTABLE);
    const applyDuration = () => {
      const duration = youtubePlayer.getDuration();
      if (duration > 1 && turntableController) {
        turntableController.setMediaDuration(duration);
      }
    };
    applyDuration();
    youtubeReady.then(applyDuration).catch(() => {});
    logMaterialNames(turntable);

    heroGroup.add(turntable);

    cameraRig.frameObject(heroGroup, 2.6);

    // Store the actual default camera target (bounding box center)
    defaultCameraTarget.copy(cameraRig.getTarget());

    // Initialize camera positions (will be set by updateCameraTargetsForWindowSize)
    updateCameraTargetsForWindowSize();

    vinylAnchorPosition.copy(turntableAnchorPosition);
    vinylTargetPosition.copy(turntableAnchorPosition);
    lastTargetPosition.copy(turntableAnchorPosition);
    currentPointerWorld.copy(turntableAnchorPosition);
    pointerAttachmentOffset.copy(hangOffset);
    swingState.currentX = 0;
    swingState.currentZ = 0;
    swingState.targetX = 0;
    swingState.targetZ = 0;
    updateDragPlaneDepth(turntableAnchorPosition.z);
    updateTurntableNubClearance(turntable);

    vinylUserRotation = 0;
  })
  .catch((error) => {
    console.error("Failed to load hero models", error);
  });

const updateFocusCardPosition = () => {
  if (!shouldTrackFocusCard || !focusVinylState) {
    return;
  }

  const focusCardElement = document.querySelector(
    ".focus-card-cover-container .album-cover",
  ) as HTMLElement;
  if (!focusCardElement) {
    return;
  }

  const rect = focusCardElement.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const ndcX = (centerX / window.innerWidth) * 2 - 1;
  const ndcY = -(centerY / window.innerHeight) * 2 + 1;

  const trackingRaycaster = new Raycaster();
  trackingRaycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);

  const distanceFromCamera = 100;
  const vinylPosition = trackingRaycaster.ray.origin
    .clone()
    .add(
      trackingRaycaster.ray.direction
        .clone()
        .multiplyScalar(distanceFromCamera),
    );

  focusCardAnchorPosition.copy(vinylPosition);

  if (vinylDragPointerId !== null && activeVinylSource === "focus") {
    return;
  }

  const model = focusVinylState.model;
  model.position.copy(vinylPosition);
  if (activeVinylSource === "focus") {
    vinylTargetPosition.copy(vinylPosition);
    lastTargetPosition.copy(vinylPosition);
    vinylAnchorPosition.copy(focusCardAnchorPosition);
    updateDragPlaneDepth(vinylPosition.z);
    applyFocusVinylScale();
  }
};

const updateCameraTargetsForWindowSize = () => {
  const canvas = document.querySelector("canvas");
  const canvasWidth = canvas ? canvas.clientWidth : window.innerWidth;

  const MIN_PAN_WIDTH = 900;
  const MAX_PAN_WIDTH = 1440; // lower so fullscreen doesn't always max out
  const MAX_LEFT_PAN = 30; // slightly smaller max

  const t = Math.max(
    0,
    Math.min(
      1,
      (canvasWidth - MIN_PAN_WIDTH) / (MAX_PAN_WIDTH - MIN_PAN_WIDTH),
    ),
  );

  const verticalPan = 20;
  const leftwardPan = MAX_LEFT_PAN * t;

  CAMERA_TARGETS["bottom-center"].set(
    defaultCameraTarget.x,
    defaultCameraTarget.y + verticalPan,
    defaultCameraTarget.z,
  );

  CAMERA_TARGETS["bottom-left"].set(
    defaultCameraTarget.x + leftwardPan,
    defaultCameraTarget.y + verticalPan,
    defaultCameraTarget.z,
  );

  // Fullscreen position: same as bottom-center but with 5 units higher pan and 5 units forward on Z
  CAMERA_TARGETS["fullscreen"].set(
    defaultCameraTarget.x,
    defaultCameraTarget.y + verticalPan + 20,
    defaultCameraTarget.z + 40,
  );

  // Update focus card position on window resize
  updateFocusCardPosition();
};

const setSize = () => {
  const width = root.clientWidth || window.innerWidth;
  const height = root.clientHeight || window.innerHeight;

  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  cameraRig.handleResize(width, height);

  // Update camera positions for new window size
  updateCameraTargetsForWindowSize();
};

window.addEventListener("resize", setSize);
setSize();

const animate = (time: number) => {
  requestAnimationFrame(animate);
  const delta = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  tonearmPlayTime += delta;

  // Update camera animation
  cameraRig.updateAnimation(delta);
  // const isTonearmPlaying = turntableController?.isPlaying() ?? false;

  if (vinylModel) {
    camera.getWorldDirection(cameraForward);
    if (cameraForward.lengthSq() === 0) {
      cameraForward.set(0, 0, -1);
    }
    cameraRight.crossVectors(cameraForward, camera.up);
    if (cameraRight.lengthSq() < 1e-8) {
      cameraRight.set(1, 0, 0);
    } else {
      cameraRight.normalize();
    }
    cameraUpVector.crossVectors(cameraRight, cameraForward);
    if (cameraUpVector.lengthSq() < 1e-8) {
      cameraUpVector.set(0, 1, 0);
    } else {
      cameraUpVector.normalize();
    }

    // Handle focus card return animation (simple smooth lerp) - skip vinyl animation system
    if (isReturningToFocusCard) {
      const FOCUS_RETURN_RATE = 0.15; // Smooth lerp rate
      vinylModel.position.lerp(focusCardAnchorPosition, FOCUS_RETURN_RATE);
      vinylTargetPosition.copy(vinylModel.position);
      lastTargetPosition.copy(vinylModel.position);

      // Check if close enough to stop animation
      const distance = vinylModel.position.distanceTo(focusCardAnchorPosition);
      if (distance < 0.1) {
        isReturningToFocusCard = false;
        vinylModel.position.copy(focusCardAnchorPosition);
        vinylTargetPosition.copy(focusCardAnchorPosition);
        lastTargetPosition.copy(focusCardAnchorPosition);
        // Reset ALL vinyl animation state to prevent teleporting to cursor
        vinylAnimationState.vinylTargetPosition.copy(focusCardAnchorPosition);
        vinylAnimationState.lastTargetPosition.copy(focusCardAnchorPosition);
        vinylAnimationState.currentPointerWorld.copy(focusCardAnchorPosition);
        vinylAnimationState.pointerAttachmentOffset.copy(hangOffset);
        vinylAnimationState.desiredPosition.copy(focusCardAnchorPosition);
        vinylAnimationState.relativeOffset.set(0, 0, 0);
        vinylAnimationState.cameraRelativeOffsetValid = false;
        currentPointerWorld.copy(focusCardAnchorPosition);
        pointerAttachmentOffset.copy(hangOffset);
        swingState.targetX = 0;
        swingState.targetZ = 0;
        swingState.currentX = 0;
        swingState.currentZ = 0;
      }
    } else {
      // Only run vinyl animation system when NOT returning to focus card
      const activeVinylOnTurntable = activeVinylSource === "turntable";
      const vinylAnimationResult = updateVinylAnimation(vinylAnimationState, {
        vinylModel,
        dragActive: vinylDragPointerId !== null,
        isReturningVinyl,
        hasClearedNub,
        nubClearanceY,
        vinylReturnBaseTwist,
        vinylReturnTwist,
        vinylReturnTwistTarget,
        vinylSpinAngle,
        vinylUserRotation,
        onTurntable: activeVinylOnTurntable,
        cameraPosition: camera.position,
        cameraForward,
        cameraRight,
        cameraUp: cameraUpVector,
        vinylDragThreshold: VINYL_DRAG_THRESHOLD,
        cameraTrackingEnabled: vinylCameraTrackingEnabled,
        turntableAnchorY: turntableAnchorPosition.y,
      });
      isReturningVinyl = vinylAnimationResult.isReturningVinyl;
      hasClearedNub = vinylAnimationResult.hasClearedNub;
      vinylReturnBaseTwist = vinylAnimationResult.vinylReturnBaseTwist;
      vinylReturnTwist = vinylAnimationResult.vinylReturnTwist;
      vinylReturnTwistTarget = vinylAnimationResult.vinylReturnTwistTarget;
      if (vinylAnimationResult.returnedToPlatter) {
        setVinylOnTurntable(true);
        shouldTrackFocusCard = false;
        // Switch anchor back to turntable position
        vinylAnchorPosition.copy(turntableAnchorPosition);
      }
    }

    // Apply position offset and scale from controls
    vinylModel.position.add(vinylPositionOffset);

    // Smoothly animate hover offset for focus vinyl
    if (Math.abs(focusVinylHoverOffsetTarget - focusVinylHoverOffset) > 0.001) {
      focusVinylHoverOffset +=
        (focusVinylHoverOffsetTarget - focusVinylHoverOffset) *
        FOCUS_VINYL_HOVER_ANIMATION_SPEED;
    } else {
      focusVinylHoverOffset = focusVinylHoverOffsetTarget;
    }

    // Smoothly animate click offset for focus vinyl
    if (Math.abs(focusVinylClickOffsetTarget - focusVinylClickOffset) > 0.001) {
      focusVinylClickOffset +=
        (focusVinylClickOffsetTarget - focusVinylClickOffset) *
        FOCUS_VINYL_CLICK_ANIMATION_SPEED;
    } else {
      focusVinylClickOffset = focusVinylClickOffsetTarget;
    }

    if (activeVinylSource === "focus") {
      const totalFocusOffset = focusVinylHoverOffset + focusVinylClickOffset;
      if (totalFocusOffset !== 0) {
        vinylModel.position.x += totalFocusOffset;
      }
    }

    // Scale based on distance to TURNTABLE (not current anchor) - reaches 1.0 before threshold
    const distanceToTurntable =
      vinylModel.position.y - turntableAnchorPosition.y;
    const scaleTransitionStart = VINYL_DRAG_THRESHOLD * 0.8; // Start transitioning at 80% of threshold

    let finalScale = vinylScaleFactor;
    if (distanceToTurntable < scaleTransitionStart) {
      // Interpolate from vinylScaleFactor to 1.0 as we approach the turntable
      const t = Math.max(0, distanceToTurntable / scaleTransitionStart);
      finalScale = 1.0 + (vinylScaleFactor - 1.0) * t;
    }

    vinylModel.scale.setScalar(finalScale);
  }

  // Controller updates tonearm + platter/pulley
  turntableController?.update(delta);
  // const cameraAngles = cameraRig.getOrbitAngles();
  // cameraInfoDisplay.setValue(
  //   cameraAngles.azimuth * RAD2DEG,
  //   cameraAngles.polar * RAD2DEG,
  // );

  // Show/hide player based on tonearm position in play area (only in small mode)
  if (!yt.isFullscreen()) {
    const vinylReadyForPlayback =
      ON_TURNTABLE && loadedSelectionVideoId !== null;
    const shouldForceHidePlayer = !vinylReadyForPlayback;
    const tonearmNowInPlayArea =
      vinylReadyForPlayback &&
      (turntableController?.isTonearmInPlayArea() ?? false);
    if (tonearmNowInPlayArea && !isTonearmInPlayArea) {
      // Tonearm just entered play area - show controls/timeline
      isTonearmInPlayArea = true;
      if (youtubePlayer.getDuration() > 0) {
        yt.setControlsVisible(true);
        // Animate viewport back in only if not manually collapsed
        if (!yt.isPlayerCollapsed()) {
          const targetHeight = 512 / yt.getAspectRatio();
          const viewport = root.querySelector(
            ".yt-player-viewport",
          ) as HTMLElement;
          if (viewport) {
            viewport.style.height = `${targetHeight}px`;
          }
        }
      }
    } else if (!tonearmNowInPlayArea && isTonearmInPlayArea) {
      // Tonearm just left play area - hide player (unless we're in the last 2 seconds)
      const timeRemaining = youtubePlayer.getDuration() - yt.getCurrentTime();
      if (timeRemaining > 2 || shouldForceHidePlayer) {
        isTonearmInPlayArea = false;
        yt.setControlsVisible(false);
        // Only collapse player if it wasn't manually collapsed by user
        if (!yt.isPlayerCollapsed()) {
          const viewport = root.querySelector(
            ".yt-player-viewport",
          ) as HTMLElement;
          if (viewport) {
            viewport.style.height = "0px";
          }
        }
      }
    }
  }

  const angularStep = turntableController?.getAngularStep() ?? 0;
  if (ON_TURNTABLE && vinylDragPointerId === null) {
    vinylSpinAngle += angularStep;
  }
  if (turntableVinylState) {
    turntableVinylState.model.rotation.y += angularStep;
  }

  renderer.render(scene, camera);
  window.PLAYING_SOUND = turntableController?.isPlaying() ?? false;
  updateVideoProgress();

  // Update vinyl debug display
  // if (vinylModel) {
  //   const pos = vinylModel.position;
  //   const rot = vinylModel.rotation;
  //   const rotDeg = {
  //     x: ((rot.x * 180) / Math.PI).toFixed(2),
  //     y: ((rot.y * 180) / Math.PI).toFixed(2),
  //     z: ((rot.z * 180) / Math.PI).toFixed(2),
  //   };
  //   vinylDebugDisplay.innerHTML = `
  //     <strong>VINYL DEBUG</strong><br>
  //     Position:<br>
  //     &nbsp;&nbsp;X: ${pos.x.toFixed(3)}<br>
  //     &nbsp;&nbsp;Y: ${pos.y.toFixed(3)}<br>
  //     &nbsp;&nbsp;Z: ${pos.z.toFixed(3)}<br>
  //     Anchors:<br>
  //     &nbsp;&nbsp;Current: (${vinylAnchorPosition.x.toFixed(2)}, ${vinylAnchorPosition.y.toFixed(2)}, ${vinylAnchorPosition.z.toFixed(2)})<br>
  //     &nbsp;&nbsp;Turntable: (${turntableAnchorPosition.x.toFixed(2)}, ${turntableAnchorPosition.y.toFixed(2)}, ${turntableAnchorPosition.z.toFixed(2)})<br>
  //     &nbsp;&nbsp;Focus Card: (${focusCardAnchorPosition.x.toFixed(2)}, ${focusCardAnchorPosition.y.toFixed(2)}, ${focusCardAnchorPosition.z.toFixed(2)})<br>
  //     State:<br>
  //     &nbsp;&nbsp;Dragging: ${vinylDragPointerId !== null}<br>
  //     &nbsp;&nbsp;Returning: ${isReturningVinyl}<br>
  //     &nbsp;&nbsp;On Turntable: ${ON_TURNTABLE}<br>
  //     &nbsp;&nbsp;Track Focus: ${shouldTrackFocusCard}
  //   `;
  // } else {
  //   vinylDebugDisplay.innerHTML = `
  //     <strong>VINYL DEBUG</strong><br>
  //     Model not loaded
  //   `;
  // }

  // Update camera debug display
  // const camPos = camera.position;
  // const camRot = camera.rotation;
  // const camRotDeg = {
  //   x: ((camRot.x * 180) / Math.PI).toFixed(2),
  //   y: ((camRot.y * 180) / Math.PI).toFixed(2),
  //   z: ((camRot.z * 180) / Math.PI).toFixed(2),
  // };
  // const target = cameraRig.getTarget();
  // const orbitAngles = cameraRig.getOrbitAngles();
  // const orbitDeg = {
  //   azimuth: ((orbitAngles.azimuth * 180) / Math.PI).toFixed(2),
  //   polar: ((orbitAngles.polar * 180) / Math.PI).toFixed(2),
  // };

  // cameraDebugDisplay.innerHTML = `
  //   <strong>CAMERA DEBUG</strong><br>
  //   Position:<br>
  //   &nbsp;&nbsp;X: ${camPos.x.toFixed(3)}<br>
  //   &nbsp;&nbsp;Y: ${camPos.y.toFixed(3)}<br>
  //   &nbsp;&nbsp;Z: ${camPos.z.toFixed(3)}<br>
  //   Rotation (deg):<br>
  //   &nbsp;&nbsp;X: ${camRotDeg.x}°<br>
  //   &nbsp;&nbsp;Y: ${camRotDeg.y}°<br>
  //   &nbsp;&nbsp;Z: ${camRotDeg.z}°<br>
  //   Orbit (deg):<br>
  //   &nbsp;&nbsp;Azimuth: ${orbitDeg.azimuth}°<br>
  //   &nbsp;&nbsp;Polar: ${orbitDeg.polar}°<br>
  //   Target:<br>
  //   &nbsp;&nbsp;X: ${target.x.toFixed(3)}<br>
  //   &nbsp;&nbsp;Y: ${target.y.toFixed(3)}<br>
  //   &nbsp;&nbsp;Z: ${target.z.toFixed(3)}<br>
  //   Zoom: ${zoomFactor.toFixed(3)}
  // `;
};

requestAnimationFrame(animate);

function logMaterialNames(model: Object3D) {
  const names = new Set<string>();
  model.traverse((child) => {
    if (!("isMesh" in child) || !(child as Mesh).isMesh) {
      return;
    }

    const mesh = child as Mesh;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    materials.forEach((material) => {
      if (!material) {
        return;
      }

      names.add(material.name || "(unnamed)");
    });
  });

  console.log("GLB materials:", Array.from(names));
}

function updateTurntableNubClearance(turntable: Object3D) {
  turntable.getWorldPosition(turntableWorldPos);
  turntable.getWorldQuaternion(turntableWorldQuat);

  const sampleHeight = (offset: Vector3) => {
    platterSampleWorld.copy(offset).applyQuaternion(turntableWorldQuat);
    placementRayOrigin.copy(turntableWorldPos).add(platterSampleWorld);
    placementRayOrigin.y += 10;
    placementRaycaster.set(placementRayOrigin, placementRayDirection);
    const intersections = placementRaycaster.intersectObject(turntable, true);
    return intersections.length > 0
      ? intersections[0].point.y
      : turntableWorldPos.y;
  };

  const nubTopY = sampleHeight(centerSampleOffset);
  nubClearanceY = nubTopY + RETURN_CLEARANCE;
}

function resetVinylAnimationState(anchor: Vector3) {
  vinylAnchorPosition.copy(anchor);
  vinylTargetPosition.copy(anchor);
  lastTargetPosition.copy(anchor);
  currentPointerWorld.copy(anchor);
  pointerAttachmentOffset.copy(hangOffset);
  vinylAnimationState.desiredPosition.copy(anchor);
  vinylAnimationState.relativeOffset.set(0, 0, 0);
  if (vinylModel) {
    vinylModel.position.copy(anchor);
  }
}

function pickPointOnPlane(event: PointerEvent) {
  if (!updatePointer(event, pointerNDC, canvas)) {
    return null;
  }

  raycaster.setFromCamera(pointerNDC, camera);
  const hit = raycaster.ray.intersectPlane(dragPlane, dragIntersectPoint);
  if (!hit) {
    return null;
  }
  return dragIntersectPoint;
}

// start/stop + speed slide handled by controller

function findObjectByName(root: Object3D | null, name: string) {
  if (!root) {
    return null;
  }
  let found: Object3D | null = null;
  root.traverse((child) => {
    if (child.name === name) {
      found = child;
    }
  });
  return found;
}

function applyCartridgeColor(object: Object3D) {
  const cartridgeColor = new Color("#c1121f");

  const tintMaterial = (material: Material) => {
    const cloned = material.clone();
    if ("color" in cloned && (cloned as Material & { color: Color }).color) {
      (cloned as Material & { color: Color }).color.set(cartridgeColor);
    }
    cloned.needsUpdate = true;
    return cloned;
  };

  object.traverse((child) => {
    if (!("isMesh" in child) || !(child as Mesh).isMesh) {
      return;
    }
    const mesh = child as Mesh;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) =>
        material ? tintMaterial(material) : material,
      );
    } else if (mesh.material) {
      mesh.material = tintMaterial(mesh.material);
    }
  });
}

// media sync handled by controller

// media time set handled by controller

// no-op placeholder (controller + YouTube handle sync)

// tonearm handlers moved to turntable controller

function updateDragPlaneDepth(z: number) {
  dragPlane.constant = -z;
}

// moved to utils.ts

// rpm helper moved to controller

function startCameraOrbit(event: PointerEvent) {
  cameraOrbitState.isOrbiting = true;
  cameraOrbitState.pointerId = event.pointerId;
  cameraOrbitState.lastX = event.clientX;
  cameraOrbitState.lastY = event.clientY;

  // Save rotation state before user starts rotating
  cameraRig.saveRotationState();

  canvas.setPointerCapture(event.pointerId);
}

function handleCameraOrbitMove(event: PointerEvent) {
  if (
    !cameraOrbitState.isOrbiting ||
    event.pointerId !== cameraOrbitState.pointerId
  ) {
    return false;
  }
  const deltaX = event.clientX - cameraOrbitState.lastX;
  const deltaY = event.clientY - cameraOrbitState.lastY;
  cameraOrbitState.lastX = event.clientX;
  cameraOrbitState.lastY = event.clientY;
  cameraRig.orbit(
    deltaX * CAMERA_ORBIT_SENSITIVITY,
    deltaY * CAMERA_ORBIT_SENSITIVITY,
  );
  return true;
}

function endCameraOrbit(event: PointerEvent) {
  if (
    !cameraOrbitState.isOrbiting ||
    event.pointerId !== cameraOrbitState.pointerId
  ) {
    return;
  }
  cameraOrbitState.isOrbiting = false;
  cameraOrbitState.pointerId = -1;

  // Restore to saved rotation state with animation
  cameraRig.restoreRotationState();

  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // ignore fallback
  }
}

function startCameraPan(event: PointerEvent) {
  cameraPanState.isPanning = true;
  cameraPanState.pointerId = event.pointerId;
  cameraPanState.lastX = event.clientX;
  cameraPanState.lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
}

function handleCameraPanMove(event: PointerEvent) {
  if (
    !cameraPanState.isPanning ||
    event.pointerId !== cameraPanState.pointerId
  ) {
    return false;
  }
  const deltaX = event.clientX - cameraPanState.lastX;
  const deltaY = event.clientY - cameraPanState.lastY;
  cameraPanState.lastX = event.clientX;
  cameraPanState.lastY = event.clientY;

  // Pan sensitivity scaled by zoom for consistent feel
  const zoomScale = 1 / cameraRig.getZoomFactor();
  cameraRig.pan(
    -deltaX * PAN_SENSITIVITY * zoomScale,
    deltaY * PAN_SENSITIVITY * zoomScale,
  );
  return true;
}

function endCameraPan(event: PointerEvent) {
  if (
    !cameraPanState.isPanning ||
    event.pointerId !== cameraPanState.pointerId
  ) {
    return;
  }
  cameraPanState.isPanning = false;
  cameraPanState.pointerId = -1;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // ignore fallback
  }
}

// hover handled by controller

// moved to src/ui.ts
// moved to ui.ts

// moved to src/ui.ts
// moved to ui.ts

// moved to src/ui.ts
// moved to ui.ts

// moved to src/ui.ts
// moved to ui.ts

// Initialize Vinyl Library Widget (Form)
(async () => {
  // Check for admin query parameter
  const params = new URLSearchParams(window.location.search);
  const adminKey = params.get("admin");
  const ADMIN_SECRET = import.meta.env.VITE_ADMIN_KEY || ""; // Read from .env
  const isOwner = adminKey === ADMIN_SECRET && ADMIN_SECRET !== "";
  const ADMIN_API_TOKEN = import.meta.env.VITE_ADMIN_API_TOKEN || ""; // API token for backend

  const WORKER_API_URL =
    import.meta.env.VITE_WORKER_API_URL || "http://localhost:57053";

  const vinylLibraryWidget = new VinylLibraryManager({
    apiUrl: WORKER_API_URL,
    containerId: "vinyl-library-widget",
    compact: true, // Compact mode for fixed sidebar
    isOwner: isOwner, // Show note field if admin parameter is correct
    adminToken: isOwner ? ADMIN_API_TOKEN : undefined, // Only pass token if admin
  });

  try {
    await vinylLibraryWidget.init();
    console.log("✓ Vinyl library widget initialized");
  } catch (error) {
    console.error("✗ Failed to initialize vinyl library widget:", error);
  }
})();

// Initialize Vinyl Library Viewer (Grid)
(async () => {
  // Check for admin query parameter
  const params = new URLSearchParams(window.location.search);
  const adminKey = params.get("admin");
  const ADMIN_SECRET = import.meta.env.VITE_ADMIN_KEY || "";
  const isAdmin = adminKey === ADMIN_SECRET && ADMIN_SECRET !== "";
  const ADMIN_API_TOKEN = import.meta.env.VITE_ADMIN_API_TOKEN || "";
  const WORKER_API_URL =
    import.meta.env.VITE_WORKER_API_URL || "http://localhost:57053";

  const vinylLibraryViewer = new VinylLibraryViewer({
    containerId: "vinyl-library-viewer",
    apiUrl: WORKER_API_URL,
    isAdmin: isAdmin,
    adminToken: isAdmin ? ADMIN_API_TOKEN : undefined,
  });

  try {
    await vinylLibraryViewer.init();
    console.log("✓ Vinyl library viewer initialized");

    // Expose viewer instance to window for show focus button
    (window as any).vinylLibraryViewer = vinylLibraryViewer;
  } catch (error) {
    console.error("✗ Failed to initialize vinyl library viewer:", error);
  }
})();
