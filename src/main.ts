import "./style.css";
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  Euler,
  Group,
  Line,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Plane,
  Quaternion,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Intersection } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
import { initializeYouTubePlayer, type YouTubeBridge } from "./youtube";
import { createMetadataController } from "./metadata";
import { updatePointer } from "./utils";
import {
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
import { TutorialManager } from "./tutorialManager";

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
  overflow: visible;
`;
root.appendChild(vinylLibraryContainer);

// Create tutorial container (appears above the + sign)
const tutorialContainer = document.createElement("div");
tutorialContainer.id = "vinyl-tutorial";
tutorialContainer.style.cssText = `
  position: fixed;
  bottom: 250px;
  left: 20px;
  max-width: 350px;
  z-index: ${UI_Z_INDEX};
  background: transparent;
  padding: 0;
  border: none;
  font-size: 0.85rem;
  line-height: 1.6;
  display: none;
  opacity: 0;
  transition: opacity 0.45s ease;
  pointer-events: none;
`;
root.appendChild(tutorialContainer);

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
  transition: opacity 0.45s ease, transform 0.45s ease;
  opacity: 0;
  transform: translateY(8px);
  padding: 20px 40px 20px 20px;
`;
vinylViewerContainer.style.pointerEvents = "none";

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

const vinylUIReadyState = {
  tutorial: false,
  viewer: false,
};
let vinylUIFadeTriggered = false;

const triggerVinylUIFadeIn = () => {
  if (vinylUIFadeTriggered) {
    return;
  }
  vinylUIFadeTriggered = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      vinylViewerContainer.style.transform = "translateY(0)";
      setTurntableUIVisible(activePage === "turntable");
    });
  });
};

const markVinylUIReady = (key: "tutorial" | "viewer") => {
  if (vinylUIReadyState[key]) {
    return;
  }
  vinylUIReadyState[key] = true;
  if (vinylUIReadyState.tutorial && vinylUIReadyState.viewer) {
    triggerVinylUIFadeIn();
  }
};

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

  #global-controls button {
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

  #global-controls button:hover {
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
const vinylDisplayPosition = new Vector3();
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
let vinylCameraTrackingEnabled = false;

// Camera target positions (pan/translation only, no angle change)
// Will be initialized after heroGroup is loaded based on bounding box center
let defaultCameraTarget = new Vector3(0, 0, 0);
const turntableFocusTarget = new Vector3(0, 0.15, 0);
const PORTFOLIO_CAMERA_TARGET_OFFSET = new Vector3(0, 12, 0);
const PORTFOLIO_COVER_ORDER = 250;
const PORTFOLIO_PAPER_ORDER = 200;
const PORTFOLIO_TEXT_ORDER = 300;
const PORTFOLIO_COVER_KEYS = ["cover"];
const PORTFOLIO_PAPER_KEYS = ["whitepaper", "backpaper"];
const PORTFOLIO_TEXT_KEYS = ["text"];
const PORTFOLIO_COVER_OFFSET = -1.5;
const PORTFOLIO_PAPER_OFFSET = -0.9;
const PORTFOLIO_TEXT_OFFSET = -2.2;
const CAMERA_TARGETS: Record<TurntablePosition, Vector3> = {
  default: turntableFocusTarget,
  "bottom-center": new Vector3(), // Will be set after heroGroup loads
  "bottom-left": new Vector3(), // Will be set after heroGroup loads
  fullscreen: new Vector3(), // Will be set after heroGroup loads
};

const canvas = document.createElement("canvas");
canvas.id = "vinyl-viewer";
root.appendChild(canvas);

const renderer = createRenderer(canvas);
const scene = createScene();
const { ambientLight, keyLight, fillLight, rimLight } = createLights();
scene.add(ambientLight, keyLight, fillLight, rimLight);

const cameraRig = createCameraRig();
const { camera } = cameraRig;
const gltfLoader = new GLTFLoader();
const loadPortfolioModel = (): Promise<Object3D> =>
  new Promise((resolve, reject) => {
    gltfLoader.load(
      "/portfolio.glb",
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => reject(error),
    );
  });

const createPlaceholderScenes = () => {
  PLACEHOLDER_SCENES.forEach((config) => {
    const geometry =
      config.geometry === "box"
        ? new BoxGeometry(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)
        : new SphereGeometry(PLACEHOLDER_SIZE / 2, 32, 16);
    const material = new MeshStandardMaterial({ color: config.color });
    const mesh = new Mesh(geometry, material);
    const circlePos = getHeroCirclePosition(config.id);
    mesh.position.copy(circlePos);
    mesh.name = config.id;
    heroGroup.add(mesh);
    placeholderMeshes[config.id] = mesh;
    registerHomePageTarget(mesh, config.id);
    pageSceneRoots[config.id] = mesh;
    pageCameraSettings[config.id].target.copy(circlePos);
  });
};
const baseTurntableCameraPosition = new Vector3();
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

const editingInputs: Set<HTMLInputElement> = new Set();
const registerEditingInput = (input: HTMLInputElement) => {
  input.addEventListener("focus", () => editingInputs.add(input));
  input.addEventListener("blur", () => editingInputs.delete(input));
};

const createNumberInputControl = (
  labelText: string,
  options: {
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
  } = {},
): {
  control: HTMLDivElement;
  input: HTMLInputElement;
  unit: HTMLSpanElement;
} => {
  const { min, max, step, suffix } = options;
  const control = document.createElement("div");
  Object.assign(control.style, {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    width: "100%",
  });

  const label = document.createElement("span");
  label.textContent = labelText;
  Object.assign(label.style, {
    fontSize: "0.75rem",
    fontWeight: "600",
    minWidth: "46px",
  });

  const input = document.createElement("input");
  input.type = "number";
  if (min !== undefined) input.min = min.toString();
  if (max !== undefined) input.max = max.toString();
  if (step !== undefined) input.step = step.toString();
  Object.assign(input.style, {
    flexGrow: "1",
    cursor: "text",
    padding: "0.15rem 0.35rem",
    fontSize: "0.8rem",
  });
  registerEditingInput(input);

  const unit = document.createElement("span");
  unit.textContent = suffix ?? "";
  Object.assign(unit.style, {
    fontSize: "0.75rem",
    minWidth: "24px",
    textAlign: "right",
  });

  control.append(label, input, unit);
  return { control, input, unit };
};

const cameraDebugPanel = document.createElement("div");
cameraDebugPanel.id = "camera-debug-panel";
Object.assign(cameraDebugPanel.style, {
  position: "fixed",
  bottom: "1rem",
  right: "1rem",
  width: "260px",
  padding: "0.6rem 0.85rem",
  borderRadius: "0.75rem",
  background: "rgba(0, 0, 0, 0.75)",
  border: "1px solid rgba(255, 255, 255, 0.4)",
  color: "#fff",
  fontSize: "0.75rem",
  fontFamily: "monospace",
  zIndex: "1000",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
});

const cameraDebugInfoRow = document.createElement("div");
cameraDebugInfoRow.style.display = "flex";
cameraDebugInfoRow.style.justifyContent = "space-between";

const cameraYawText = document.createElement("span");
cameraYawText.textContent = "Yaw --°";
const cameraPitchText = document.createElement("span");
cameraPitchText.textContent = "Pitch --°";
cameraDebugInfoRow.append(cameraYawText, cameraPitchText);

const yawControl = createNumberInputControl("Yaw", {
  min: -180,
  max: 180,
  step: 0.5,
  suffix: "°",
});
const pitchControl = createNumberInputControl("Pitch", {
  min: -89,
  max: 89,
  step: 0.5,
  suffix: "°",
});
const zoomControl = createNumberInputControl("Zoom", {
  min: 0.3,
  max: 4,
  step: 0.05,
});

const cameraXControl = createNumberInputControl("Cam X", { step: 0.1 });
const cameraYControl = createNumberInputControl("Cam Y", { step: 0.1 });
const cameraZControl = createNumberInputControl("Cam Z", { step: 0.1 });

const tempDirection = new Vector3();

const applyCameraStyleInputs = () => {
  const yawDeg = parseFloat(yawControl.input.value);
  const pitchDeg = parseFloat(pitchControl.input.value);
  if (Number.isFinite(yawDeg) && Number.isFinite(pitchDeg)) {
    const yawRad = yawDeg * DEG2RAD;
    const pitchRad = pitchDeg * DEG2RAD;
    const cosPitch = Math.cos(pitchRad);
    tempDirection.set(
      Math.sin(yawRad) * cosPitch,
      Math.sin(pitchRad),
      Math.cos(yawRad) * cosPitch,
    );
    tempDirection.normalize();
    cameraRig.setViewDirection(tempDirection);
  }
  const zoomVal = parseFloat(zoomControl.input.value);
  if (Number.isFinite(zoomVal)) {
    cameraRig.setZoomFactor(zoomVal);
  }
  pageCameraSettings[activePage] = captureCameraState();
};

const applyCameraPositionInputs = () => {
  const x = parseFloat(cameraXControl.input.value);
  const y = parseFloat(cameraYControl.input.value);
  const z = parseFloat(cameraZControl.input.value);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return;
  }
  const desired = new Vector3(x, y, z);
  const target = cameraRig.getTarget();
  const offset = desired.sub(target);
  if (offset.lengthSq() < 1e-8) {
    return;
  }
  const distance = offset.length();
  cameraRig.setViewDirection(offset.normalize());
  cameraRig.setCameraDistance(distance);
  pageCameraSettings[activePage] = captureCameraState();
};

const cameraStyleInputs = [
  yawControl.input,
  pitchControl.input,
  zoomControl.input,
];
cameraStyleInputs.forEach((input) => {
  input.addEventListener("input", () => {
    applyCameraStyleInputs();
  });
});
const cameraPositionInputs = [
  cameraXControl.input,
  cameraYControl.input,
  cameraZControl.input,
];
cameraPositionInputs.forEach((input) => {
  input.addEventListener("input", applyCameraPositionInputs);
});

cameraDebugPanel.append(
  cameraDebugInfoRow,
  yawControl.control,
  pitchControl.control,
  zoomControl.control,
  cameraXControl.control,
  cameraYControl.control,
  cameraZControl.control,
);
root.appendChild(cameraDebugPanel);

type ScenePage =
  | "home"
  | "turntable"
  | "portfolio"
  | "placeholder_A"
  | "placeholder_B";

const TURNTABLE_PAGE = "turntable";
type PageCameraSettings = {
  target: Vector3;
  yaw: number;
  pitch: number;
  zoom: number;
};
const HOME_CAMERA_YAW = -28;
const HOME_CAMERA_PITCH = 32;
const HOME_CAMERA_ZOOM = 1;
const PORTFOLIO_CAMERA_YAW = -58;
const PORTFOLIO_CAMERA_PITCH = 30;
const PORTFOLIO_CAMERA_ZOOM = 4.0;
const PORTFOLIO_TOP_CAMERA_PITCH = 88.88;
const PLACEHOLDER_CAMERA_YAW = 0;
const PLACEHOLDER_CAMERA_PITCH = 45;
const PLACEHOLDER_CAMERA_ZOOM = 1.4;

const TURNTABLE_CAMERA_YAW = 0;
const TURNTABLE_CAMERA_PITCH = 45;
const TURNTABLE_CAMERA_ZOOM = 1.6;
const HOME_FRAME_OFFSET = 2;

const PLACEHOLDER_SCENES = [
  {
    id: "placeholder_A",
    geometry: "box" as const,
    color: 0xff2d2d,
    position: new Vector3(-45, -5, -40),
  },
  {
    id: "placeholder_B",
    geometry: "sphere" as const,
    color: 0x2454ff,
    position: new Vector3(-30, -5, -60),
  },
] as const;
const PLACEHOLDER_SIZE = 10;
const placeholderMeshes: Record<string, Mesh> = {};
const pageSceneRoots: Record<string, Object3D> = {};

type PortfolioSceneConfig = {
  id: "portfolio";
  glbUrl: string;
  rotation?: Euler;
  focusOffset?: Vector3;
};

const PORTFOLIO_SCENE_CONFIGS: ReadonlyArray<PortfolioSceneConfig> = [
  {
    id: "portfolio",
    glbUrl: "/portfolio.glb",
    rotation: new Euler(0, Math.PI * 0.25, 0),
    focusOffset: new Vector3(0, 12, 0),
  },
];

const HERO_LAYOUT_RADIUS = 50;
const HERO_LAYOUT_Y = 0;
const HERO_LAYOUT_START_ANGLE = Math.PI / 8;
const HERO_LAYOUT_PAGES: Array<string> = [
  TURNTABLE_PAGE,
  ...PORTFOLIO_SCENE_CONFIGS.map((config) => config.id),
  ...PLACEHOLDER_SCENES.map((config) => config.id),
];
const getHeroCirclePosition = (pageId: string) => {
  const index = HERO_LAYOUT_PAGES.indexOf(pageId);
  if (index < 0) {
    return new Vector3(0, HERO_LAYOUT_Y, 0);
  }
  const angle =
    HERO_LAYOUT_START_ANGLE + (index / HERO_LAYOUT_PAGES.length) * Math.PI * 2;
  return new Vector3(
    Math.sin(angle) * HERO_LAYOUT_RADIUS,
    HERO_LAYOUT_Y,
    Math.cos(angle) * HERO_LAYOUT_RADIUS,
  );
};

const pageCameraSettings: Record<ScenePage, PageCameraSettings> = {
  home: {
    target: new Vector3(0, 0, 0),
    yaw: HOME_CAMERA_YAW,
    pitch: HOME_CAMERA_PITCH,
    zoom: HOME_CAMERA_ZOOM,
  },
  turntable: {
    target: getHeroCirclePosition(TURNTABLE_PAGE),
    yaw: TURNTABLE_CAMERA_YAW,
    pitch: TURNTABLE_CAMERA_PITCH,
    zoom: TURNTABLE_CAMERA_ZOOM,
  },
  portfolio: {
    target: getHeroCirclePosition("portfolio"),
    yaw: PORTFOLIO_CAMERA_YAW,
    pitch: PORTFOLIO_CAMERA_PITCH,
    zoom: PORTFOLIO_CAMERA_ZOOM,
  },
  placeholder_A: {
    target: getHeroCirclePosition("placeholder_A"),
    yaw: PLACEHOLDER_CAMERA_YAW,
    pitch: PLACEHOLDER_CAMERA_PITCH,
    zoom: PLACEHOLDER_CAMERA_ZOOM,
  },
  placeholder_B: {
    target: getHeroCirclePosition("placeholder_B"),
    yaw: PLACEHOLDER_CAMERA_YAW,
    pitch: PLACEHOLDER_CAMERA_PITCH,
    zoom: PLACEHOLDER_CAMERA_ZOOM,
  },
};

const setHeroPageVisibility = (page: ScenePage | null) => {
  Object.entries(pageSceneRoots).forEach(([pageId, model]) => {
    model.visible = page === null || pageId === page;
  });
};
let activePage: ScenePage = "home";
let youtubeBridge: YouTubeBridge | null = null;
const directionFromAngles = (
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

const lerpAngleDegrees = (start: number, end: number, t: number) => {
  let diff = ((end - start + 180) % 360) - 180;
  if (diff < -180) diff += 360;
  return start + diff * t;
};

const cloneCameraSettings = (
  settings: PageCameraSettings,
): PageCameraSettings => ({
  target: settings.target.clone(),
  yaw: settings.yaw,
  pitch: settings.pitch,
  zoom: settings.zoom,
});

const applyPageCameraSettings = (settings: PageCameraSettings) => {
  cameraRig.setLookTarget(settings.target, false);
  cameraRig.setViewDirection(
    directionFromAngles(settings.yaw, settings.pitch),
    false,
  );
  cameraRig.setZoomFactor(settings.zoom);
};

const captureCameraState = (): PageCameraSettings => {
  const orbitAngles = cameraRig.getOrbitAngles();
  return {
    target: cameraRig.getTarget().clone(),
    yaw: orbitAngles.azimuth * RAD2DEG,
    pitch: orbitAngles.polar * RAD2DEG,
    zoom: cameraRig.getZoomFactor(),
  };
};

const pageTransitionDuration = 0.9;
const pageTransitionState = {
  startTime: 0,
  fromSettings: cloneCameraSettings(pageCameraSettings.home),
  toSettings: cloneCameraSettings(pageCameraSettings.home),
  active: false,
};

const homePageTargets: Array<{ model: Object3D; page: ScenePage }> = [];

const registerHomePageTarget = (model: Object3D, page: ScenePage) => {
  homePageTargets.push({ model, page });
};

const applyHomeCameraPreset = () => {
  pageCameraSettings.home.target.copy(defaultCameraTarget);
  pageCameraSettings.home.yaw = HOME_CAMERA_YAW;
  pageCameraSettings.home.pitch = HOME_CAMERA_PITCH;
  pageCameraSettings.home.zoom = HOME_CAMERA_ZOOM;
};

let portfolioCoverMesh: Mesh | null = null;
let portfolioCoverOriginalRotation = 0;

const prioritizePortfolioCoverRendering = (model: Object3D) => {
  model.traverse((child) => {
    if (!("isMesh" in child) || !(child as Mesh).isMesh) {
      return;
    }
    const mesh = child as Mesh;
    const name = mesh.name.toLowerCase();
    if (PORTFOLIO_TEXT_KEYS.some((key) => name.includes(key))) {
      setMeshRenderPriority(
        mesh,
        PORTFOLIO_TEXT_ORDER,
        PORTFOLIO_TEXT_OFFSET,
        0,
      );
    } else if (PORTFOLIO_COVER_KEYS.some((key) => name.includes(key))) {
      setMeshRenderPriority(
        mesh,
        PORTFOLIO_COVER_ORDER,
        PORTFOLIO_COVER_OFFSET,
        0,
      );
      // Store reference to cover mesh for animation
      portfolioCoverMesh = mesh;
      portfolioCoverOriginalRotation = mesh.rotation.z;
      console.log("[Portfolio Cover] Found cover mesh:", mesh.name);
      console.log(
        "[Portfolio Cover] Original Z rotation:",
        portfolioCoverOriginalRotation,
      );
    } else if (PORTFOLIO_PAPER_KEYS.some((key) => name.includes(key))) {
      setMeshRenderPriority(
        mesh,
        PORTFOLIO_PAPER_ORDER,
        PORTFOLIO_PAPER_OFFSET,
        0,
      );
    }
  });
};

const animatePortfolioCoverFlip = (reverse = false) => {
  if (!portfolioCoverMesh) {
    console.log("[Portfolio Cover] Cover mesh not found");
    return;
  }

  console.log(
    "[Portfolio Cover] Starting flip animation",
    reverse ? "(reverse)" : "",
  );
  console.log(
    "[Portfolio Cover] Initial rotation:",
    portfolioCoverMesh.rotation.z,
  );

  const startRotation = portfolioCoverMesh.rotation.z;
  const targetRotation = reverse
    ? portfolioCoverOriginalRotation
    : portfolioCoverOriginalRotation + Math.PI;
  const duration = 800; // milliseconds
  const startTime = performance.now();

  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease in-out function for smoother animation
    const easeProgress =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    portfolioCoverMesh!.rotation.z =
      startRotation + (targetRotation - startRotation) * easeProgress;

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      console.log(
        "[Portfolio Cover] Animation complete. Final rotation:",
        portfolioCoverMesh!.rotation.z,
      );
    }
  };

  requestAnimationFrame(animate);
};

const setMeshRenderPriority = (
  mesh: Mesh,
  order: number,
  factor: number,
  units: number,
) => {
  mesh.renderOrder = Math.max(mesh.renderOrder, order);
  applyPolygonOffsetToMaterials(mesh, factor, units);
};

const applyPolygonOffsetToMaterials = (
  mesh: Mesh,
  factor: number,
  units: number,
) => {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  materials.forEach((material) => {
    if (!material) {
      return;
    }
    material.polygonOffset = true;
    material.polygonOffsetFactor = factor;
    material.polygonOffsetUnits = units;
    material.needsUpdate = true;
  });
};

const homeOverlay = document.createElement("div");
homeOverlay.id = "home-overlay";
homeOverlay.textContent = "home view — click a model to explore";
Object.assign(homeOverlay.style, {
  position: "fixed",
  top: "1.5rem",
  left: "50%",
  transform: "translateX(-50%)",
  padding: "0.75rem 1.5rem",
  borderRadius: "999px",
  background: "rgba(0, 0, 0, 0.75)",
  color: "#fff",
  fontSize: "0.85rem",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  pointerEvents: "auto",
  opacity: "1",
  transition: "opacity 0.4s ease",
  zIndex: "1200",
});
root.appendChild(homeOverlay);

const updateHomeOverlayVisibility = () => {
  const isHome = activePage === "home";
  homeOverlay.style.opacity = isHome ? "1" : "0";
  homeOverlay.style.pointerEvents = isHome ? "auto" : "none";
};
const setTurntableUIVisible = (visible: boolean) => {
  const effective =
    visible &&
    vinylUIFadeTriggered &&
    !isFullscreenMode &&
    activePage === "turntable";
  vinylViewerContainer.style.opacity = effective ? "1" : "0";
  vinylViewerContainer.style.pointerEvents = effective ? "auto" : "none";
  hideLibraryBtn.style.opacity = effective ? "1" : "0";
  hideLibraryBtn.style.pointerEvents = effective ? "auto" : "none";
  focusCardContainers.forEach((container) => {
    const shouldShow = effective && container.childElementCount > 0;
    container.style.opacity = shouldShow ? "1" : "0";
    container.style.pointerEvents = shouldShow ? "auto" : "none";
  });
  showFocusBtn.style.opacity = effective ? "1" : "0";
  showFocusBtn.style.pointerEvents = effective ? "auto" : "none";
  vinylLibraryContainer.style.transition = "opacity 0.3s ease";
  vinylLibraryContainer.style.opacity = effective ? "1" : "0";
  vinylLibraryContainer.style.pointerEvents = effective ? "auto" : "none";
  if (vinylUIFadeTriggered) {
    tutorialContainer.style.display = effective ? "block" : "none";
    tutorialContainer.style.opacity = effective ? "1" : "0";
    tutorialContainer.style.pointerEvents = effective ? "auto" : "none";
  } else {
    tutorialContainer.style.display = "none";
  }
};
updateHomeOverlayVisibility();
setTurntableUIVisible(false);
homeOverlay.addEventListener("click", () => {
  setActiveScenePage("turntable");
});

const globalControls = document.createElement("div");
globalControls.id = "global-controls";
Object.assign(globalControls.style, {
  position: "fixed",
  bottom: "20px",
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: "0.75rem",
  zIndex: HIDE_BUTTON_Z_INDEX,
});
root.appendChild(globalControls);

const homeNavButton = document.createElement("button");
homeNavButton.textContent = "home view";
homeNavButton.addEventListener("click", () => {
  setActiveScenePage("home");
});
globalControls.appendChild(homeNavButton);

const portfolioNavButton = document.createElement("button");
portfolioNavButton.textContent = "portfolio view";
portfolioNavButton.addEventListener("click", () => {
  console.log("[Portfolio] Button clicked");
  setActiveScenePage("portfolio");
  animatePortfolioCoverFlip();
});
globalControls.appendChild(portfolioNavButton);

const resetTutorialButton = document.createElement("button");
resetTutorialButton.id = "reset-tutorial-button";
resetTutorialButton.textContent = "reset tutorial";
resetTutorialButton.addEventListener("click", () => {
  const tutorialManager = (window as any).tutorialManager;
  if (tutorialManager) {
    tutorialManager.reset();
    console.log("Tutorial reset");
  }
});
globalControls.appendChild(resetTutorialButton);

const setActiveScenePage = (page: ScenePage) => {
  if (page === activePage) {
    return;
  }
  // Reverse portfolio cover animation when leaving portfolio page
  if (activePage === "portfolio" && page !== "portfolio") {
    animatePortfolioCoverFlip(true);
  }
  const toSettings = pageCameraSettings[page];
  const fromSettings = captureCameraState();
  let frameObjectTarget: Object3D = heroGroup;
  let frameOffset = page === "home" ? HOME_FRAME_OFFSET : 2.6;
  if (page === "turntable" && turntableSceneRoot) {
    frameObjectTarget = turntableSceneRoot;
  } else if (pageSceneRoots[page]) {
    frameObjectTarget = pageSceneRoots[page];
  }
  cameraRig.frameObject(frameObjectTarget, frameOffset);
  if (page === "home") {
    cameraRig.setLookTarget(defaultCameraTarget, false);
  }
  cameraRig.setLookTarget(fromSettings.target, false);
  cameraRig.setViewDirection(
    directionFromAngles(fromSettings.yaw, fromSettings.pitch),
    false,
  );
  cameraRig.setZoomFactor(fromSettings.zoom);
  pageTransitionState.startTime = performance.now();
  pageTransitionState.fromSettings = cloneCameraSettings(fromSettings);
  pageTransitionState.toSettings = cloneCameraSettings(toSettings);
  pageTransitionState.active = true;
  const wasTurntable = activePage === "turntable";
  activePage = page;
  youtubeBridge?.setFKeyListenerEnabled(page === "turntable");
  const shouldShowFocusVinyl = page === "turntable";
  focusVinylManuallyHidden = !shouldShowFocusVinyl;
  if (!shouldShowFocusVinyl && focusVinylState?.model) {
    focusVinylState.model.visible = false;
    setFocusCoverClickBodyClass(false);
  }
  updateFocusVinylVisibility();
  vinylCameraTrackingEnabled = page === "turntable";
  updateHomeOverlayVisibility();
  setTurntableUIVisible(activePage === "turntable");
  if (wasTurntable && page !== "turntable") {
    hideFocusCardAndVinyl();
    // Collapse player when leaving turntable
    if (yt && !yt.isPlayerCollapsed()) {
      yt.setPlayerCollapsed(true);
    }
  } else if (!wasTurntable && page === "turntable") {
    // Returning to turntable page - uncollapse player if vinyl is loaded and tonearm in play area
    if (
      yt &&
      yt.isPlayerCollapsed() &&
      ON_TURNTABLE &&
      loadedSelectionVideoId !== null
    ) {
      const isTonearmInPlayArea =
        turntableController?.isTonearmInPlayArea() ?? false;
      if (isTonearmInPlayArea) {
        yt.setPlayerCollapsed(false);
      }
    }
  }
};

const findPageForObject = (object: Object3D | null): ScenePage | null => {
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

const pendingTurntableCallbacks: Array<() => void> = [];
const runWhenTurntableReady = (callback: () => void, autoNavigate = true) => {
  if (activePage === "turntable" && !pageTransitionState.active) {
    callback();
    return;
  }
  pendingTurntableCallbacks.push(callback);
  if (autoNavigate && activePage !== "turntable") {
    setActiveScenePage("turntable");
  }
};

const transitionTarget = new Vector3();
const updateScenePageTransition = () => {
  if (!pageTransitionState.active) {
    return;
  }
  const elapsed =
    (performance.now() - pageTransitionState.startTime) /
    (pageTransitionDuration * 1000);
  const progress = Math.min(Math.max(elapsed, 0), 1);
  const ease = 1 - Math.pow(1 - progress, 3);
  const from = pageTransitionState.fromSettings;
  const to = pageTransitionState.toSettings;
  const yaw = lerpAngleDegrees(from.yaw, to.yaw, ease);
  const pitch = lerpAngleDegrees(from.pitch, to.pitch, ease);
  const zoom = from.zoom + (to.zoom - from.zoom) * ease;
  transitionTarget.copy(from.target).lerp(to.target, ease);
  cameraRig.setLookTarget(transitionTarget, false);
  cameraRig.setViewDirection(directionFromAngles(yaw, pitch), false);
  cameraRig.setZoomFactor(zoom);
  if (progress >= 1) {
    pageTransitionState.active = false;
    pageCameraSettings[activePage] = cloneCameraSettings(to);
    updateCameraDebugPanel();
    if (activePage === "turntable" && pendingTurntableCallbacks.length) {
      const callbacks = pendingTurntableCallbacks.splice(
        0,
        pendingTurntableCallbacks.length,
      );
      callbacks.forEach((fn) => fn());
    }
  }
};

const updateCameraDebugPanel = () => {
  const orbitAngles = cameraRig.getOrbitAngles();
  const yawDeg = orbitAngles.azimuth * RAD2DEG;
  const pitchDeg = orbitAngles.polar * RAD2DEG;
  cameraYawText.textContent = `Yaw ${yawDeg.toFixed(1)}°`;
  cameraPitchText.textContent = `Pitch ${pitchDeg.toFixed(1)}°`;
  if (!editingInputs.has(yawControl.input)) {
    yawControl.input.value = yawDeg.toFixed(1);
  }
  if (!editingInputs.has(pitchControl.input)) {
    pitchControl.input.value = pitchDeg.toFixed(1);
  }
  const zoomFactor = cameraRig.getZoomFactor();
  if (!editingInputs.has(zoomControl.input)) {
    zoomControl.input.value = zoomFactor.toFixed(2);
  }
  const cameraPos = camera.position;
  if (!editingInputs.has(cameraXControl.input)) {
    cameraXControl.input.value = cameraPos.x.toFixed(2);
  }
  if (!editingInputs.has(cameraYControl.input)) {
    cameraYControl.input.value = cameraPos.y.toFixed(2);
  }
  if (!editingInputs.has(cameraZControl.input)) {
    cameraZControl.input.value = cameraPos.z.toFixed(2);
  }
};

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

const layoutCircleSegments = 96;
const layoutCirclePoints = [];
for (let i = 0; i <= layoutCircleSegments; i += 1) {
  const angle = (i / layoutCircleSegments) * Math.PI * 2;
  layoutCirclePoints.push(
    new Vector3(
      Math.sin(angle) * HERO_LAYOUT_RADIUS,
      HERO_LAYOUT_Y,
      Math.cos(angle) * HERO_LAYOUT_RADIUS,
    ),
  );
}
const layoutCircleGeometry = new BufferGeometry().setFromPoints(
  layoutCirclePoints,
);
const layoutCircleMaterial = new LineBasicMaterial({
  color: new Color("#ffeb3b"),
  transparent: true,
  opacity: 0.85,
  linewidth: 3,
});
const layoutCircle = new Line(layoutCircleGeometry, layoutCircleMaterial);
layoutCircle.name = "hero-layout-circle";
layoutCircle.frustumCulled = false;
layoutCircle.renderOrder = 1000;
layoutCircle.material.depthWrite = false;
layoutCircle.material.depthTest = false;
scene.add(layoutCircle);

const layoutCircleOutlineMaterial = new LineBasicMaterial({
  color: new Color("#ff5722"),
  transparent: true,
  opacity: 0.35,
});
const layoutCircleOutline = new Line(
  layoutCircleGeometry.clone(),
  layoutCircleOutlineMaterial,
);
layoutCircleOutline.name = "hero-layout-circle-outline";
layoutCircleOutline.frustumCulled = false;
layoutCircleOutline.renderOrder = 999;
layoutCircleOutline.material.depthWrite = false;
layoutCircleOutline.material.depthTest = false;
scene.add(layoutCircleOutline);

let zoomFactor = 1;
cameraRig.setZoomFactor(zoomFactor);

// const cameraInfoDisplay = createCameraInfoDisplay();
// root.appendChild(cameraInfoDisplay.container);

// Create vinyl debug display

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
let turntableSceneRoot: Object3D | null = null;
const turntableBounds = new Box3();
const turntableBoundsSize = new Vector3();
const turntableBoundsCenter = new Vector3();
type VinylSource = "focus" | "turntable";
let activeVinylSource: VinylSource | null = null;
let currentDragSource: VinylSource | null = null;
let pendingPromotionSource: VinylSource | null = null;
type FlyawayVinyl = {
  model: Object3D;
  velocity: Vector3;
  spin: Vector3;
  lifetime: number;
  initialScale: number;
  textures: LabelTextures;
};
const flyawayVinyls: FlyawayVinyl[] = [];
let isFullscreenMode = false;
let fullscreenVinylRestoreTimeout: number | null = null;

const syncAnimationStateToModel = (model: Object3D) => {
  if (model === focusVinylState?.model) {
    setVinylAnchorPosition(model.position, "focus");
  } else if (model === turntableVinylState?.model) {
    setVinylAnchorPosition(model.position, "turntable");
  } else {
    vinylAnchorPosition.copy(model.position);
  }
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
const TURN_TABLE_ANCHOR_OFFSET = new Vector3(0, 6.41, 0);
const turntableAnchorPosition = new Vector3(0, 6.41, 0); // Updated to model position + offset
const cameraOrbitState = {
  isOrbiting: false,
  pointerId: -1,
  lastX: 0,
  lastY: 0,
  mode: null as ScenePage | null,
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
type VinylAnchorType = "turntable" | "focus";
let currentVinylAnchorType: VinylAnchorType = "turntable";
const setVinylAnchorPosition = (anchor: Vector3, type: VinylAnchorType) => {
  vinylAnchorPosition.copy(anchor);
  currentVinylAnchorType = type;
};
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
youtubeBridge = yt;
yt.setFKeyListenerEnabled(false);
yt.onPlaybackEnded(() => {
  turntableController?.notifyPlaybackFinishedExternally();
});

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

  await applySelectionVisualsToVinyl(selection);
  if (turntableVinylState) {
    updateTurntableVinylVisuals(turntableVinylState.labelVisuals);
  }

  // Always dispose old focus vinyl
  disposeFocusVinyl();
  shouldTrackFocusCard = true;

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

  // Keep vinyl invisible initially (including if not in fullscreen mode)
  model.visible = false;

  resetVinylAnimationState(focusCardAnchorPosition, "focus");

  // Enable billboard effect immediately
  vinylCameraTrackingEnabled = true;

  // Wait for camera animation to complete before showing vinyl (700ms matches camera animation)
  setTimeout(() => {
    if (token === focusVinylLoadToken && focusVinylState?.model === model) {
      updateFocusVinylVisibility();
    }
  }, 700);

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
const FOCUS_VINYL_CLICK_ANIMATION_SPEED = 0.12;
const FOCUS_COVER_CLICK_CLASS = "focus-cover-click-active";
const FOCUS_COVER_CLICK_TIMEOUT = 3000;
let focusVinylHoverOffset = 0;
let focusVinylHoverOffsetTarget = 0;
let focusCoverHoverActive = false;
let focusCoverHoverOverride: boolean | null = null;
let focusVinylManuallyHidden = false;
let focusCoverZIndexActive = false;
let focusCoverFallbackTimer: number | null = null;
let focusCoverFallbackAnimationKey = 0;

const setFocusCoverClickBodyClass = (active: boolean) => {
  const body = document.body;
  if (!body) {
    return;
  }
  body.classList.toggle(FOCUS_COVER_CLICK_CLASS, active);
};

const applyFocusCoverHoverState = () => {
  const effectiveHover =
    focusCoverHoverOverride !== null
      ? focusCoverHoverOverride
      : focusCoverHoverActive;
  focusVinylHoverOffsetTarget = effectiveHover ? FOCUS_VINYL_HOVER_DISTANCE : 0;
};

const updateFocusVinylVisibility = () => {
  if (!focusVinylState?.model) {
    return;
  }
  // Only show focus vinyl if there's a focus card rendered
  const hasFocusCard = focusCardCoverContainer.childElementCount > 0;
  focusVinylState.model.visible =
    !isFullscreenMode && !focusVinylManuallyHidden && hasFocusCard;
};

const clearFocusCoverFallbackTimer = () => {
  if (focusCoverFallbackTimer !== null) {
    window.clearTimeout(focusCoverFallbackTimer);
    focusCoverFallbackTimer = null;
  }
};

const resetFocusCoverFallbackState = () => {
  focusCoverFallbackAnimationKey += 1;
  focusCoverHoverOverride = null;
  applyFocusCoverHoverState();
  return focusCoverFallbackAnimationKey;
};

const hideFocusCardAndVinyl = () => {
  focusCardContainers.forEach((container) => {
    container.innerHTML = "";
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
  });
  focusVinylManuallyHidden = true;
  focusVinylHoverOffsetTarget = 0;
  setFocusCoverClickBodyClass(false);
  updateFocusVinylVisibility();
};

const waitForFocusVinylOffset = (
  target: number,
  animationKey: number,
): Promise<void> => {
  return new Promise((resolve) => {
    const check = () => {
      if (focusCoverFallbackAnimationKey !== animationKey) {
        resolve();
        return;
      }
      if (Math.abs(focusVinylHoverOffset - target) < 0.01) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
};

const waitMs = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const beginFocusCoverFallbackSequence = () => {
  if (!focusCoverZIndexActive) {
    deactivateFocusCoverZIndexImmediate();
    return;
  }
  clearFocusCoverFallbackTimer();
  const animationKey = resetFocusCoverFallbackState();

  const run = async () => {
    focusCoverHoverOverride = true;
    applyFocusCoverHoverState();
    await waitForFocusVinylOffset(FOCUS_VINYL_HOVER_DISTANCE, animationKey);
    if (focusCoverFallbackAnimationKey !== animationKey) {
      return;
    }

    await waitMs(100);
    if (focusCoverFallbackAnimationKey !== animationKey) {
      return;
    }

    if (focusCoverZIndexActive) {
      focusCoverZIndexActive = false;
      setFocusCoverClickBodyClass(false);
    }

    focusCoverHoverOverride = false;
    applyFocusCoverHoverState();
    await waitForFocusVinylOffset(0, animationKey);
    if (focusCoverFallbackAnimationKey !== animationKey) {
      return;
    }

    await waitMs(150);
    if (focusCoverFallbackAnimationKey !== animationKey) {
      return;
    }

    resetFocusCoverFallbackState();
  };

  void run();
};

const scheduleFocusCoverFallback = () => {
  clearFocusCoverFallbackTimer();
  focusCoverFallbackTimer = window.setTimeout(() => {
    focusCoverFallbackTimer = null;
    beginFocusCoverFallbackSequence();
  }, FOCUS_COVER_CLICK_TIMEOUT);
};

const activateFocusCoverZIndex = () => {
  focusCoverZIndexActive = true;
  setFocusCoverClickBodyClass(true);
  resetFocusCoverFallbackState();
  scheduleFocusCoverFallback();
};

const deactivateFocusCoverZIndexImmediate = () => {
  clearFocusCoverFallbackTimer();
  resetFocusCoverFallbackState();
  if (focusCoverZIndexActive) {
    focusCoverZIndexActive = false;
    setFocusCoverClickBodyClass(false);
  }
};

window.addEventListener("focus-cover-hover", (event: any) => {
  const { hovered } = event.detail;
  focusCoverHoverActive = Boolean(hovered);
  applyFocusCoverHoverState();
  console.log(
    `[main] Focus cover hover: ${hovered}, target offset: ${focusVinylHoverOffsetTarget}`,
  );
});

window.addEventListener("focus-cover-click", (event: any) => {
  const active = Boolean(event.detail?.active);
  if (active) {
    activateFocusCoverZIndex();
  } else {
    beginFocusCoverFallbackSequence();
  }
});

window.addEventListener("focus-cover-click-reset", () => {
  deactivateFocusCoverZIndexImmediate();
});

window.addEventListener("focus-visibility-change", (event: any) => {
  const visible = event.detail?.visible ?? true;
  focusVinylManuallyHidden = !visible;
  updateFocusVinylVisibility();
});

const getFocusVisualOffset = () => focusVinylHoverOffset;

const getVisualOffsetForSource = (source: VinylSource | null) =>
  source === "focus" ? getFocusVisualOffset() : 0;

const hideFocusVinylForFullscreen = () => {
  if (fullscreenVinylRestoreTimeout !== null) {
    window.clearTimeout(fullscreenVinylRestoreTimeout);
    fullscreenVinylRestoreTimeout = null;
  }
  if (focusVinylState?.model) {
    focusVinylState.model.visible = false;
  }
};

const scheduleFocusVinylRestore = () => {
  if (fullscreenVinylRestoreTimeout !== null) {
    window.clearTimeout(fullscreenVinylRestoreTimeout);
    fullscreenVinylRestoreTimeout = null;
  }
  if (!focusVinylState?.model) {
    return;
  }
  const modelRef = focusVinylState.model;
  modelRef.visible = false;
  fullscreenVinylRestoreTimeout = window.setTimeout(() => {
    fullscreenVinylRestoreTimeout = null;
    if (focusVinylState?.model === modelRef) {
      updateFocusVinylVisibility();
    }
  }, 250);
};

// Listen for focus card show events to change camera position and angle
window.addEventListener("focus-card-shown", (event: any) => {
  const { position, polarAngle } = event.detail;
  runWhenTurntableReady(() => {
    console.log(
      `[main] Focus card shown, changing camera position to: ${position}, polar angle to: ${polarAngle}°`,
    );
    if (position === "bottom-center") {
      turntablePositionState = "bottom-center";
      cameraRig.setLookTarget(CAMERA_TARGETS[turntablePositionState], true);
      vinylAnimationState.cameraRelativeOffsetValid = false;
    }
    if (polarAngle !== undefined) {
      cameraRig.setPolarAngle(polarAngle, true);
    }
  });
});

// Initially hide the player controls (only show when tonearm is in play area)
yt.setControlsVisible(false);

// Register callback to query tonearm state when exiting fullscreen
yt.setIsTonearmInPlayAreaQuery(() => isTonearmInPlayArea);

// Register callback to query if on turntable page
yt.setIsOnTurntablePageQuery(() => activePage === "turntable");

// Auto-hide library and button in fullscreen player mode
yt.onFullscreenChange((isFullscreen: boolean) => {
  runWhenTurntableReady(() => {
    setHeroPageVisibility(isFullscreen ? "turntable" : null);
    if (isFullscreen) {
      isFullscreenMode = true;
      hideFocusVinylForFullscreen();
      setTurntableUIVisible(false);

      // Switch to fullscreen camera position
      turntablePositionState = "fullscreen";
      cameraRig.setLookTarget(CAMERA_TARGETS["fullscreen"], true);
      cameraRig.setPolarAngle(2, true);
    } else {
      isFullscreenMode = false;
      scheduleFocusVinylRestore();
      setTurntableUIVisible(true);

      // Return to bottom-center when exiting fullscreen
      turntablePositionState = "bottom-center";
      cameraRig.setLookTarget(CAMERA_TARGETS["bottom-center"], true);
      // Restore bottom-center polar angle (22 degrees)
      cameraRig.setPolarAngle(22, true);
    }
  });
});

// Track when video reaches the last 2 seconds to animate out
let hasStartedFadeOut = false;
let isTonearmInPlayArea = false;
yt.onPlaybackProgress(() => {
  const currentTime = yt.getCurrentTime();
  const duration = youtubePlayer.getDuration();
  const timeRemaining = duration - currentTime;

  // When video has 1 seconds or less remaining, animate controls and viewport out (only in small mode)
  if (!yt.isFullscreen()) {
    if (timeRemaining <= 1 && !hasStartedFadeOut) {
      hasStartedFadeOut = true;
      // Fade out the controls
      yt.setControlsVisible(false);
      // Animate viewport height to 0
      const viewport = root.querySelector(".yt-player-viewport") as HTMLElement;
      if (viewport) {
        viewport.style.height = "0px";
      }
    } else if (timeRemaining > 1) {
      // Reset the flag if we seek back
      hasStartedFadeOut = false;
    }
  }
});

let vinylDragPointerId: number | null = null;
let activeDragVisualOffset = 0;
let isReturningVinyl = false;
let hasClearedNub = false;
let nubClearanceY = 0;
let vinylDragExceededThreshold = false;
// tonearm drag handled by controller
let ON_TURNTABLE = false;
const notifyFocusVinylTurntableState = () => {
  window.dispatchEvent(
    new CustomEvent("focus-vinyl-turntable-state", {
      detail: {
        onTurntable: ON_TURNTABLE,
        turntableVideoId: turntableVinylState?.selection.videoId ?? null,
      },
    }),
  );
  (window as any).__FOCUS_VINYL_ON_TURNTABLE__ = ON_TURNTABLE;
  (window as any).__FOCUS_VINYL_TURNTABLE_VIDEO_ID__ =
    turntableVinylState?.selection.videoId ?? null;
};
notifyFocusVinylTurntableState();
const VINYL_DRAG_THRESHOLD = 38; // Y position threshold - vinyl only returns if below this value
let isReturningToFocusCard = false; // Separate state for returning to focus card
function setVinylOnTurntable(onTurntable: boolean) {
  if (onTurntable === ON_TURNTABLE) {
    return;
  }

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
    notifyFocusVinylTurntableState();
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
  notifyFocusVinylTurntableState();
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

const clearTurntableVinylPreservingPromotion = () => {
  if (!turntableVinylState) {
    return;
  }
  const previousPromotion = pendingPromotionSource;
  setVinylOnTurntable(false);
  pendingPromotionSource = previousPromotion;
  turntableController?.returnTonearmHome();
};

const startTurntableVinylFlyaway = () => {
  if (!turntableVinylState) {
    return;
  }
  const { model, labelTextures } = turntableVinylState;
  flyawayVinyls.push({
    model,
    velocity: new Vector3(
      (Math.random() - 0.5) * 2.1,
      (1.5 + Math.random() * 0.7) * 1.5,
      (2.2 + Math.random() * 1.2) * 1.5,
    ),
    spin: new Vector3(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 6,
    ),
    lifetime: 0,
    initialScale: model.scale.x,
    textures: labelTextures,
  });
  turntableVinylState = null;
  ON_TURNTABLE = false;
  notifyFocusVinylTurntableState();
  pendingPromotionSource = null;
  turntableController?.setVinylPresence(false);
  turntableController?.liftNeedle();
  loadedSelectionVideoId = null;
  isTonearmInPlayArea = false;
  yt.setControlsVisible(false);
  const viewport = root.querySelector(
    ".yt-player-viewport",
  ) as HTMLElement | null;
  if (viewport) {
    viewport.style.height = "0px";
  }
  setActiveVinylSource(focusVinylState ? "focus" : null);
};
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
  const focusVisualOffset = getFocusVisualOffset();
  const focusModel = focusVinylState?.model ?? null;
  const shouldOffsetFocus = !!focusModel?.visible && focusVisualOffset !== 0;
  if (shouldOffsetFocus && focusModel) {
    focusModel.position.x += focusVisualOffset;
  }
  const hits: {
    source: VinylSource;
    model: Object3D;
    hit: Intersection<Object3D>;
  }[] = [];
  if (focusModel?.visible) {
    const focusHit = raycaster.intersectObject(focusModel, true);
    if (focusHit.length) {
      hits.push({
        source: "focus",
        model: focusModel,
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
  if (shouldOffsetFocus && focusModel) {
    focusModel.position.x -= focusVisualOffset;
  }
  if (!hits.length) {
    return null;
  }
  hits.sort((a, b) => a.hit.distance - b.hit.distance);
  return hits[0];
};

canvas.addEventListener("pointerdown", (event) => {
  if (event.button === 1) {
    if (activePage !== "turntable" || pageTransitionState.active) {
      return;
    }
    startCameraPan(event);
    return;
  }
  if (event.button === 2) {
    if (
      (activePage !== "turntable" && activePage !== "home") ||
      pageTransitionState.active
    ) {
      return;
    }
    startCameraOrbit(event);
    return;
  }
  if (event.button !== 0) {
    return;
  }
  if (!updatePointer(event, pointerNDC, canvas)) {
    return;
  }
  raycaster.setFromCamera(pointerNDC, camera);
  if (activePage !== "turntable") {
    if (pageTransitionState.active || yt.isFullscreen()) {
      return;
    }
    if (activePage !== "home") {
      return;
    }
    if (heroGroup.children.length) {
      const heroHits = raycaster.intersectObject(heroGroup, true);
      if (heroHits.length) {
        for (const hit of heroHits) {
          const page = findPageForObject(hit.object as Object3D);
          if (page && page !== "home") {
            setActiveScenePage(page);
            if (page === "portfolio") {
              animatePortfolioCoverFlip();
            }
            break;
          }
        }
      }
    }
    return;
  }
  if (turntableController && turntableController.handlePointerDown(event)) {
    return;
  }
  // Disable vinyl dragging in fullscreen mode
  if (yt.isFullscreen()) {
    return;
  }
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
    resetVinylAnimationState(focusCardAnchorPosition, "focus");
  } else if (
    vinylSelection.source === "turntable" &&
    turntableVinylState &&
    previousSource !== "turntable"
  ) {
    resetVinylAnimationState(turntableAnchorPosition, "turntable");
  }
  // Set drag plane perpendicular to camera forward direction for unrestricted dragging
  camera.getWorldDirection(cameraForward);
  const selectionVisualOffset = getVisualOffsetForSource(vinylSelection.source);
  activeDragVisualOffset = selectionVisualOffset;
  vinylDisplayPosition.copy(vinylModel.position);
  if (selectionVisualOffset !== 0) {
    vinylDisplayPosition.x += selectionVisualOffset;
  }
  dragPlane.setFromNormalAndCoplanarPoint(cameraForward, vinylDisplayPosition);

  const hit = raycaster.ray.intersectPlane(dragPlane, dragIntersectPoint);
  if (!hit) {
    return;
  }

  vinylDragPointerId = event.pointerId;
  currentDragSource = vinylSelection.source;
  isReturningVinyl = false;
  hasClearedNub = false;
  vinylDragExceededThreshold = false;
  (window as any).VINYL_DRAG_ACTIVE = true;
  if (vinylSelection.source === "turntable") {
    turntableController?.liftNeedle();
    turntableController?.setVinylPresence(false);
  }
  if (selectionVisualOffset !== 0) {
    hit.x -= selectionVisualOffset;
  }

  currentPointerWorld.copy(hit);
  pointerAttachmentOffset.copy(vinylModel.position).sub(hit);
  vinylTargetPosition.copy(vinylModel.position);
  lastTargetPosition.copy(vinylModel.position);
  swingState.targetX = 0;
  swingState.targetZ = 0;
  canvas.setPointerCapture(event.pointerId);
  document.body.classList.add("vinyl-drag-active");
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
        turntableFocusTarget.z - 23.4,
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
  if (currentDragSource === "focus" && activeDragVisualOffset !== 0) {
    hit.x -= activeDragVisualOffset;
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
  activeDragVisualOffset = 0;
  (window as any).VINYL_DRAG_ACTIVE = false;
  document.body.classList.remove("vinyl-drag-active");
  pointerAttachmentOffset.copy(hangOffset);
  if (vinylModel) {
    currentPointerWorld.copy(vinylModel.position);
    vinylTargetPosition.copy(vinylModel.position);
    lastTargetPosition.copy(vinylModel.position);
  } else {
    currentPointerWorld.copy(vinylAnchorPosition);
    vinylTargetPosition.copy(vinylAnchorPosition);
    lastTargetPosition.copy(vinylAnchorPosition);
  }

  let launchedTurntableFlyaway = false;
  if (
    dragSource === "turntable" &&
    vinylModel &&
    vinylModel.position.y >= VINYL_DRAG_THRESHOLD
  ) {
    startTurntableVinylFlyaway();
    launchedTurntableFlyaway = true;
  }

  // Determine which anchor to return to based on Y position threshold
  if (
    !launchedTurntableFlyaway &&
    vinylModel &&
    vinylModel.position.y < VINYL_DRAG_THRESHOLD
  ) {
    // Below threshold: return to turntable with full animation (nub clearance, etc.)
    if (!isReturningVinyl && !isReturningToFocusCard) {
      isReturningVinyl = true;
      isReturningToFocusCard = false;
      hasClearedNub = false;
      // Only set pendingPromotionSource if dragging from focus (not if already on turntable)
      pendingPromotionSource = dragSource === "turntable" ? null : dragSource;
      if (dragSource !== "turntable" && turntableVinylState) {
        clearTurntableVinylPreservingPromotion();
      }
      // Switch anchor to turntable when starting return (but keep shouldTrackFocusCard - only disable when actually on turntable)
      setVinylAnchorPosition(turntableAnchorPosition, "turntable");
      // Reset target positions to vinyl's current position after anchor switch to prevent teleporting
      vinylTargetPosition.copy(vinylModel.position);
      lastTargetPosition.copy(vinylModel.position);
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
      setVinylAnchorPosition(focusCardAnchorPosition, "focus");
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
    !isReturningToFocusCard &&
    !launchedTurntableFlyaway
  ) {
    setActiveVinylSource("focus");
  }
  deactivateFocusCoverZIndexImmediate();
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

    const turntableCirclePos = getHeroCirclePosition("turntable");
    turntable.position.copy(turntableCirclePos);
    heroGroup.add(turntable);
    turntableSceneRoot = turntable;
    registerHomePageTarget(turntable, "turntable");
    turntableAnchorPosition
      .copy(turntableCirclePos)
      .add(TURN_TABLE_ANCHOR_OFFSET);

    cameraRig.frameObject(heroGroup, HOME_FRAME_OFFSET);
    baseTurntableCameraPosition.copy(camera.position);
    turntableBounds.setFromObject(turntable);
    turntableBounds.getSize(turntableBoundsSize);
    turntableBounds.getCenter(turntableBoundsCenter);
    turntableFocusTarget.copy(turntableBoundsCenter);
    // Store the actual default camera target (bounding box center)
    defaultCameraTarget.set(0, 0, 0);

    // Initialize camera positions (will be set by updateCameraTargetsForWindowSize)
    updateCameraTargetsForWindowSize();
    pageCameraSettings.turntable = {
      target: turntableFocusTarget.clone(),
      yaw: TURNTABLE_CAMERA_YAW,
      pitch: TURNTABLE_CAMERA_PITCH,
      zoom: TURNTABLE_CAMERA_ZOOM,
    };
    applyHomeCameraPreset();
    applyPageCameraSettings(pageCameraSettings.home);
    pageTransitionState.fromSettings = cloneCameraSettings(
      pageCameraSettings.home,
    );
    pageTransitionState.toSettings = cloneCameraSettings(
      pageCameraSettings.home,
    );
    pageTransitionState.active = false;
    updateCameraDebugPanel();
    updateHomeOverlayVisibility();
    vinylCameraTrackingEnabled = activePage === "turntable";

    setVinylAnchorPosition(turntableAnchorPosition, "turntable");
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

createPlaceholderScenes();
loadPortfolioModel()
  .then((portfolioModel) => {
    portfolioModel.visible = true;
    const referenceScale = turntableSceneRoot ? turntableSceneRoot.scale.x : 1;
    portfolioModel.scale.setScalar(referenceScale);
    const circlePos = getHeroCirclePosition("portfolio");
    portfolioModel.position.copy(circlePos);
    portfolioModel.rotation.set(0, Math.PI * 0.25, 0);
    heroGroup.add(portfolioModel);
    pageSceneRoots["portfolio"] = portfolioModel;
    registerHomePageTarget(portfolioModel, "portfolio");
    prioritizePortfolioCoverRendering(portfolioModel);
    // Center camera on model origin instead of bounding box center
    const focusPoint = circlePos.clone().add(PORTFOLIO_CAMERA_TARGET_OFFSET);
    pageCameraSettings.portfolio.target.copy(focusPoint);
    const rotationYawDeg = Math.PI * 0.25 * RAD2DEG;
    pageCameraSettings.portfolio.yaw = rotationYawDeg;
    pageCameraSettings.portfolio.pitch = PORTFOLIO_TOP_CAMERA_PITCH;
    applyHomeCameraPreset();
    if (activePage === "home" && !pageTransitionState.active) {
      applyPageCameraSettings(pageCameraSettings.home);
      updateCameraDebugPanel();
    }
    if (activePage === "portfolio" && !pageTransitionState.active) {
      applyPageCameraSettings(pageCameraSettings.portfolio);
      updateCameraDebugPanel();
    }
  })
  .catch((error) => {
    console.error("Failed to load portfolio model:", error);
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
  setVinylAnchorPosition(focusCardAnchorPosition, "focus");
  if (activeVinylSource === "focus") {
    vinylTargetPosition.copy(vinylPosition);
    lastTargetPosition.copy(vinylPosition);
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
    turntableFocusTarget.x,
    turntableFocusTarget.y + verticalPan,
    turntableFocusTarget.z,
  );

  CAMERA_TARGETS["bottom-left"].set(
    turntableFocusTarget.x + leftwardPan,
    turntableFocusTarget.y + verticalPan,
    turntableFocusTarget.z,
  );

  // Fullscreen position: same as bottom-center but with 5 units higher pan and 5 units forward on Z
  CAMERA_TARGETS["fullscreen"].set(
    turntableFocusTarget.x,
    turntableFocusTarget.y + verticalPan + 20,
    turntableFocusTarget.z + 40,
  );
  pageCameraSettings.turntable.target.copy(turntableFocusTarget);
  applyHomeCameraPreset();
  if (activePage === "home" && !pageTransitionState.active) {
    applyPageCameraSettings(pageCameraSettings.home);
    updateCameraDebugPanel();
  }

  // Update focus card position on window resize
  updateFocusCardPosition();
};
cameraRig.onAnimationComplete(() => {
  updateFocusCardPosition();
});

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
  let renderVisualOffset = 0;
  requestAnimationFrame(animate);
  const delta = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  tonearmPlayTime += delta;

  // Update camera animation
  cameraRig.updateAnimation(delta);
  updateScenePageTransition();
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
      const wasReturningVinyl = isReturningVinyl;
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
        anchorType: currentVinylAnchorType,
      });
      const shouldSignalOnTurntable =
        !ON_TURNTABLE && vinylAnimationResult.hasClearedNub;
      if (
        activeVinylSource === "focus" &&
        turntableVinylState &&
        !wasReturningVinyl &&
        vinylAnimationResult.isReturningVinyl
      ) {
        clearTurntableVinylPreservingPromotion();
      }
      isReturningVinyl = vinylAnimationResult.isReturningVinyl;
      hasClearedNub = vinylAnimationResult.hasClearedNub;
      vinylReturnBaseTwist = vinylAnimationResult.vinylReturnBaseTwist;
      vinylReturnTwist = vinylAnimationResult.vinylReturnTwist;
      vinylReturnTwistTarget = vinylAnimationResult.vinylReturnTwistTarget;
      if (shouldSignalOnTurntable) {
        setVinylOnTurntable(true);
        shouldTrackFocusCard = false;
        setVinylAnchorPosition(turntableAnchorPosition, "turntable");
      }
      if (vinylAnimationResult.returnedToPlatter) {
        setVinylOnTurntable(true);
        shouldTrackFocusCard = false;
        // Switch anchor back to turntable position
        setVinylAnchorPosition(turntableAnchorPosition, "turntable");
      }
    }

    // Apply position offset and scale from controls
    vinylModel.position.add(vinylPositionOffset);
    const baseVinylY = vinylModel.position.y;

    // Smoothly animate hover offset for focus vinyl
    const hoverAnimationSpeed =
      focusCoverHoverOverride !== null
        ? FOCUS_VINYL_CLICK_ANIMATION_SPEED
        : FOCUS_VINYL_HOVER_ANIMATION_SPEED;
    if (Math.abs(focusVinylHoverOffsetTarget - focusVinylHoverOffset) > 0.001) {
      focusVinylHoverOffset +=
        (focusVinylHoverOffsetTarget - focusVinylHoverOffset) *
        hoverAnimationSpeed;
    } else {
      focusVinylHoverOffset = focusVinylHoverOffsetTarget;
    }

    renderVisualOffset =
      activeVinylSource === "focus" && !isReturningVinyl
        ? getFocusVisualOffset()
        : 0;

    // Scale based on distance to TURNTABLE (not current anchor) - reaches 1.0 before threshold
    const distanceToTurntable = baseVinylY - turntableAnchorPosition.y;
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

  // Sync turntable time with YouTube player to prevent desync when tab is inactive
  if (turntableController && ON_TURNTABLE && loadedSelectionVideoId !== null) {
    turntableController.syncTime(yt.getCurrentTime());
  }
  // const cameraAngles = cameraRig.getOrbitAngles();
  // cameraInfoDisplay.setValue(
  //   cameraAngles.azimuth * RAD2DEG,
  //   cameraAngles.polar * RAD2DEG,
  // );

  // Show/hide player based on tonearm position in play area (only in small mode)
  if (!yt.isFullscreen()) {
    const vinylReadyForPlayback =
      ON_TURNTABLE && loadedSelectionVideoId !== null;
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
        // Update button visibility after viewport height change
        yt.updateButtonVisibility();
      }
    } else if (!tonearmNowInPlayArea && isTonearmInPlayArea) {
      // Tonearm just left play area - hide player
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
      // Update button visibility after viewport height change
      yt.updateButtonVisibility();
    }
  }

  const angularStep = turntableController?.getAngularStep() ?? 0;
  if (ON_TURNTABLE && vinylDragPointerId === null) {
    vinylSpinAngle += angularStep;
  }
  if (turntableVinylState) {
    turntableVinylState.model.rotation.y += angularStep;
  }

  for (let i = flyawayVinyls.length - 1; i >= 0; i--) {
    const entry = flyawayVinyls[i];
    entry.lifetime += delta;
    entry.velocity.y += 0.4 * delta * 1.5;
    entry.model.position.addScaledVector(entry.velocity, delta * 1.5);
    entry.model.rotation.x += entry.spin.x * delta;
    entry.model.rotation.y += entry.spin.y * delta;
    entry.model.rotation.z += entry.spin.z * delta;
    const scaleFactor = Math.max(
      0.001,
      entry.initialScale * (1 - entry.lifetime / 1.5),
    );
    entry.model.scale.setScalar(scaleFactor);
    if (entry.lifetime > 1.5 || scaleFactor <= 0.01) {
      heroGroup.remove(entry.model);
      entry.textures.sideA.dispose();
      entry.textures.sideB.dispose();
      flyawayVinyls.splice(i, 1);
    }
  }

  const hasActiveVinyl =
    Boolean(focusVinylState?.model) ||
    Boolean(turntableVinylState?.model) ||
    flyawayVinyls.length > 0;
  if (!hasActiveVinyl) {
    deactivateFocusCoverZIndexImmediate();
  }

  if (vinylModel && renderVisualOffset !== 0) {
    vinylModel.position.x += renderVisualOffset;
  }
  renderer.render(scene, camera);
  if (vinylModel && renderVisualOffset !== 0) {
    vinylModel.position.x -= renderVisualOffset;
  }
  window.PLAYING_SOUND = turntableController?.isPlaying() ?? false;
  updateVideoProgress();
  updateCameraDebugPanel();

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

function resetVinylAnimationState(anchor: Vector3, type: VinylAnchorType) {
  setVinylAnchorPosition(anchor, type);
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

  // Constrain Y position to not go below 14
  if (dragIntersectPoint.y < 14) {
    dragIntersectPoint.y = 14;
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
  if (
    (activePage !== "turntable" && activePage !== "home") ||
    pageTransitionState.active
  ) {
    return;
  }
  cameraOrbitState.isOrbiting = true;
  cameraOrbitState.pointerId = event.pointerId;
  cameraOrbitState.lastX = event.clientX;
  cameraOrbitState.lastY = event.clientY;
  cameraOrbitState.mode = activePage;

  if (activePage === "turntable") {
    cameraRig.saveRotationState();
  }

  canvas.setPointerCapture(event.pointerId);
}

function handleCameraOrbitMove(event: PointerEvent) {
  if (
    (activePage !== "turntable" && activePage !== "home") ||
    pageTransitionState.active ||
    !cameraOrbitState.isOrbiting ||
    event.pointerId !== cameraOrbitState.pointerId
  ) {
    return false;
  }
  const deltaX = event.clientX - cameraOrbitState.lastX;
  const deltaY = event.clientY - cameraOrbitState.lastY;
  cameraOrbitState.lastX = event.clientX;
  cameraOrbitState.lastY = event.clientY;
  const allowPolar = cameraOrbitState.mode === "turntable";
  cameraRig.orbit(
    deltaX * CAMERA_ORBIT_SENSITIVITY,
    allowPolar ? deltaY * CAMERA_ORBIT_SENSITIVITY : 0,
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

  if (cameraOrbitState.mode === "turntable") {
    // Restore to saved rotation state with animation
    cameraRig.restoreRotationState();
  }

  cameraOrbitState.mode = null;

  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // ignore fallback
  }
}

function startCameraPan(event: PointerEvent) {
  if (activePage !== "turntable" || pageTransitionState.active) {
    return;
  }
  cameraPanState.isPanning = true;
  cameraPanState.pointerId = event.pointerId;
  cameraPanState.lastX = event.clientX;
  cameraPanState.lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
}

function handleCameraPanMove(event: PointerEvent) {
  if (
    activePage !== "turntable" ||
    pageTransitionState.active ||
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

// Initialize Tutorial Manager
(async () => {
  try {
    const tutorialManager = new TutorialManager("vinyl-tutorial");
    tutorialManager.init();
    console.log("✓ Tutorial manager initialized");

    // Expose tutorial manager to window for debugging
    (window as any).tutorialManager = tutorialManager;
  } catch (error) {
    console.error("✗ Failed to initialize tutorial manager:", error);
  } finally {
    markVinylUIReady("tutorial");
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
  } finally {
    markVinylUIReady("viewer");
  }
})();
