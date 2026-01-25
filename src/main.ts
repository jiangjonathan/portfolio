import "./style.css";
import {
  Box3,
  BufferGeometry,
  Color,
  Euler,
  Group,
  Line,
  LineBasicMaterial,
  Material,
  Mesh,
  Object3D,
  Plane,
  Quaternion,
  Raycaster,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  loadVinylModel,
  applyVinylColor,
  applyVinylEmissive,
} from "./vinyl/vinyl";
import {
  applyLabelTextures,
  createLabelTextures,
  createDefaultLabelVisuals,
  type LabelVisualOptions,
  type LabelApplicationOptions,
  type LabelTextures,
} from "./vinyl/labels";
import { loadTurntableModel, TurntableController } from "./turntable/turntable";
import {
  createScene,
  createLights,
  createRenderer,
  createCameraRig,
  createGroundPlane,
  loadTextures,
  LightingAnimator,
  NORMAL_LIGHTING,
  DARK_MODE_LIGHTING,
  FULLSCREEN_LIGHTING,
  FULLSCREEN_HOVER_LIGHTING,
} from "./scene/scene";
import {} from // createTonearmRotationDisplay,
// createCameraInfoDisplay,
"./ui/ui";
import { initializeYouTubePlayer, type YouTubeBridge } from "./youtube/youtube";
import { createMetadataController } from "./utils/metadata";
import { updatePointer } from "./utils/utils";
import {
  CAMERA_ORBIT_SENSITIVITY,
  PAN_SENSITIVITY,
  FALLBACK_BACKGROUND_COLOR,
} from "./utils/config";
import {
  createVinylAnimationState,
  RETURN_CLEARANCE,
  updateVinylAnimation,
} from "./vinyl/vinylAnimation";
import { VinylLibraryManager } from "./vinyl/vinylLibraryManager";
import { VinylLibraryViewer } from "./vinyl/vinylLibraryViewer";
import {
  extractVibrantColor,
  extractDominantColor,
  deriveVinylColorFromAlbumColor,
} from "./utils/colorUtils";
import { createVinylSelectionController } from "./vinyl/vinylSelectionController";
import { initializeCache } from "./utils/albumCoverCache";
import { TutorialManager } from "./turntable/tutorialManager";

// New modular imports
import {
  directionFromAngles,
  lerpAngleDegrees,
  cloneCameraSettings,
  applyPageCameraSettings,
  captureCameraState,
  findPageForObject,
  HOME_CAMERA_YAW,
  HOME_CAMERA_PITCH,
  HOME_CAMERA_ZOOM,
  PORTFOLIO_CAMERA_YAW,
  PORTFOLIO_CAMERA_PITCH,
  PORTFOLIO_CAMERA_ZOOM,
  PORTFOLIO_TOP_CAMERA_PITCH,
  PLACEHOLDER_CAMERA_YAW,
  PLACEHOLDER_CAMERA_PITCH,
  PLACEHOLDER_CAMERA_ZOOM,
  TURNTABLE_CAMERA_YAW,
  TURNTABLE_CAMERA_PITCH,
  TURNTABLE_CAMERA_ZOOM,
  HOME_FRAME_OFFSET,
  type ScenePage,
  type PageCameraSettings,
} from "./camera/pageNavigation";
import {
  createBusinessCardMesh,
  createPlaceholderMesh,
  BUSINESS_CARD_PAGE,
  BUSINESS_CARD_FOCUS_TARGET,
  BUSINESS_CARD_CAMERA_YAW,
  BUSINESS_CARD_CAMERA_PITCH,
  BUSINESS_CARD_CAMERA_ZOOM,
  PLACEHOLDER_SCENES,
  PLACEHOLDER_SIZE,
  PORTFOLIO_CAMERA_TARGET_OFFSET,
  getBusinessCardEmailUV,
  getBusinessCardLinkedInUV,
  getBusinessCardGitHubUV,
  BUSINESS_CARD_EMAIL_URI,
  BUSINESS_CARD_LINKEDIN_URL,
  BUSINESS_CARD_GITHUB_URL,
  setBusinessCardContactHighlight,
} from "./scene/sceneObjects";
import type { BusinessCardContact, UVRect } from "./scene/sceneObjects";
import { createBusinessCardAnimation } from "./scene/businessCardAnimation";
import {
  getFocusVinylScale,
  applyFocusVinylScale,
  getFocusCardScale,
  cloneLabelVisuals,
  getSelectionCoverUrl,
  applyLabelTextureQuality,
} from "./vinyl/vinylHelpers";
import { createFocusCardController } from "./vinyl/focusCardController";
import { createTurntableVinylController } from "./vinyl/turntableVinylController";
import {
  VINYL_DRAG_THRESHOLD,
  FOCUS_VINYL_CLICK_ANIMATION_SPEED,
  type VinylSource,
  type VinylSelectionDetail,
  type FocusVinylState,
  type TurntableVinylState,
} from "./vinyl/vinylInteractions";
import { TurntableStateManager } from "./turntable/turntableState";
import { createFreeLookTutorialController } from "./turntable/freeLookTutorial";
import {
  createTurntableUiController,
  type TurntablePosition,
} from "./turntable/turntableUi";
import { createTurntablePointerUtils } from "./turntable/turntablePointerUtils";
import {
  setupDOM,
  GLOBAL_CONTROLS_DEFAULT,
  GLOBAL_CONTROLS_TURNTABLE,
} from "./ui/domSetup";
import { registerInputHandlers } from "./ui/inputHandlers";
import { setupSettingsPersistence } from "./ui/settingsPersistence";
import type { PortfolioPapersManager } from "./portfolio/portfolioPapers";
import { createPortfolioFeature } from "./portfolio/portfolioFeature";
import { createPortfolioInteractions } from "./portfolio/portfolioInteractions";
import { PaperOverlayManager } from "./portfolio/paperOverlay";

declare global {
  interface Window {
    PLAYING_SOUND: boolean;
    sfx_on: boolean;
  }
}

let coloredVinylsEnabled = true;
let sfx_on = true;
window.sfx_on = sfx_on;

// Setup DOM and get element references
const dom = setupDOM();
const {
  root,
  canvas,
  vinylLibraryContainer,
  tutorialContainer,
  freeLookTutorialContainer,
  vinylViewerContainer,
  hideLibraryBtn,
  focusCardCoverContainer,
  focusCardInfoContainer,
  showFocusBtn,
  portfolioPapersContainer,
  globalControls,
  homeNavButton,
  turntableNavButton,
  portfolioNavButton,
  portfolioResumeButton,
  resetTutorialButton,
  freeLookButton,
  settingsButton,
  settingsPanel,
  coloredVinylsCheckbox,
  sfxCheckbox,
  songCommentsCheckbox,
  contactButton,
  // cameraDebugPanel, // Debug UI - disabled
  portfolioPrevArrow,
  portfolioNextArrow,
  placeholderAInfo,
  placeholderBInfo,
  portfolioPaperLinksBar,
} = dom;

let activePage: ScenePage = "home";

const paperOverlayManager = new PaperOverlayManager(root);
paperOverlayManager.setActive(false);

// Initialize button visibility based on initial page (home)
homeNavButton.style.display = "none";
turntableNavButton.style.display = "block";
portfolioNavButton.style.display = "block";
portfolioResumeButton.style.display = "block";
contactButton.style.display = "block";
resetTutorialButton.style.display = "none";
freeLookButton.style.display = "none";
settingsButton.style.display = "block";
settingsPanel.style.display = "flex";

const SETTINGS_PANEL_GAP = "8px";
let isSettingsPanelVisible = false;
const setSettingsPanelLayout = (horizontal: boolean) => {
  if (horizontal) {
    settingsPanel.style.left = "0";
    settingsPanel.style.right = "auto";
    settingsPanel.style.top = "auto";
    settingsPanel.style.bottom = `calc(100% + ${SETTINGS_PANEL_GAP})`;
  } else {
    settingsPanel.style.left = `calc(100% + ${SETTINGS_PANEL_GAP})`;
    settingsPanel.style.right = "auto";
    settingsPanel.style.top = "0";
    settingsPanel.style.bottom = "auto";
  }
};
setSettingsPanelLayout(false);
const setSettingsPanelVisible = (visible: boolean) => {
  isSettingsPanelVisible = visible;
  settingsPanel.style.opacity = visible ? "1" : "0";
  settingsPanel.style.pointerEvents = visible ? "auto" : "none";
  settingsPanel.style.transform = visible ? "translateY(0)" : "translateY(4px)";
  settingsButton.setAttribute("aria-expanded", visible ? "true" : "false");
};
settingsButton.setAttribute("aria-haspopup", "true");

settingsButton.addEventListener("click", (event) => {
  event.stopPropagation();
  if (settingsButton.style.display === "none") {
    return;
  }
  setSettingsPanelVisible(!isSettingsPanelVisible);
});

settingsPanel.addEventListener("click", (event) => {
  event.stopPropagation();
});

document.addEventListener("click", (event) => {
  if (!isSettingsPanelVisible) {
    return;
  }
  const target = event.target as Node | null;
  if (
    target &&
    (settingsPanel.contains(target) || settingsButton.contains(target))
  ) {
    return;
  }
  setSettingsPanelVisible(false);
});

// Initialize IndexedDB cache for album covers
initializeCache().catch((error) => {
  console.error("Failed to initialize album cover cache:", error);
  // Continue even if cache initialization fails
});

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
      vinylViewerContainer.style.setProperty(
        "--vinyl-viewer-translate",
        "translateY(0)",
      );
      turntableUiController?.setTurntableUIVisible(activePage === "turntable");
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

// Vinyl position offset (added to the calculated position)
const vinylPositionOffset = new Vector3(0, 0, 0);
const vinylDisplayPosition = new Vector3();
let vinylScaleFactor = 1.0;
const FREE_LOOK_MIN_ZOOM = 1.1;
const freeLookTutorialController = createFreeLookTutorialController(
  freeLookTutorialContainer,
);
let turntableUiController: ReturnType<
  typeof createTurntableUiController
> | null = null;
const isFreeLookModeActive = () =>
  turntableUiController?.isFreeLookMode() ?? false;

let turntablePositionState: TurntablePosition = "default";
let vinylCameraTrackingEnabled = false;

// Camera target positions (pan/translation only, no angle change)
// Will be initialized after heroGroup is loaded based on bounding box center
let defaultCameraTarget = new Vector3(0, 0, 0);
const turntableFocusTarget = new Vector3(0, 0.15, 0);
// PORTFOLIO_* and BUSINESS_CARD_* constants now imported from sceneObjects.ts
const CAMERA_TARGETS: Record<TurntablePosition, Vector3> = {
  default: turntableFocusTarget,
  "bottom-center": new Vector3(), // Will be set after heroGroup loads
  "bottom-left": new Vector3(), // Will be set after heroGroup loads
  fullscreen: new Vector3(), // Will be set after heroGroup loads
};

// Canvas is now created by setupDOM()

const renderer = createRenderer(canvas);
const scene = createScene();
const { ambientLight, keyLight, fillLight } = createLights();
scene.add(ambientLight, keyLight, fillLight);

// Add invisible ground plane to receive shadows
const groundPlane = createGroundPlane();
scene.add(groundPlane);

// Create lighting animator for fullscreen transitions
const lightingAnimator = new LightingAnimator(
  ambientLight,
  keyLight,
  fillLight,
);

let darkModeLightingEnabled = false;
let darkModeEnabled = false;
let fullscreenLightingEnabled = false;
let focusCoverClickActive = false;

const refreshLightingTarget = () => {
  if (fullscreenLightingEnabled) {
    lightingAnimator.setTargetState(FULLSCREEN_LIGHTING);
    return;
  }

  lightingAnimator.setTargetState(
    darkModeLightingEnabled ? DARK_MODE_LIGHTING : NORMAL_LIGHTING,
  );
};

darkModeLightingEnabled =
  typeof document !== "undefined" &&
  document.documentElement.classList.contains("dark-mode");
darkModeEnabled = darkModeLightingEnabled;
refreshLightingTarget();

window.addEventListener("dark-mode-change", (event) => {
  const customEvent = event as CustomEvent<{ enabled: boolean }>;
  const enabled = Boolean(customEvent.detail?.enabled);
  darkModeLightingEnabled = enabled;
  darkModeEnabled = enabled;
  refreshLightingTarget();
});

window.addEventListener("focus-cover-click", (event) => {
  const detail = (event as CustomEvent<{ active?: boolean }>).detail;
  focusCoverClickActive = Boolean(detail?.active);
});

window.addEventListener("focus-cover-click-reset", () => {
  focusCoverClickActive = false;
});

// Create light control panel (press 'L' to toggle)
// const lightControlPanel = createLightControlPanel({
//   ambientLight,
//   keyLight,
//   fillLight,
// });

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

// Enable shadow casting and receiving on all meshes in a model
const enableShadows = (
  object: Object3D,
  castShadow = true,
  receiveShadow = true,
) => {
  object.traverse((child) => {
    if ("isMesh" in child) {
      const mesh = child as Mesh;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
    }
  });
};

const createPlaceholderScenes = () => {
  PLACEHOLDER_SCENES.forEach((config) => {
    const circlePos = getHeroCirclePosition(config.id);
    const mesh = createPlaceholderMesh(config, circlePos);
    enableShadows(mesh);
    heroGroup.add(mesh);
    placeholderMeshes[config.id] = mesh;
    registerHomePageTarget(mesh, config.id);
    pageSceneRoots[config.id] = mesh;
    pageCameraSettings[config.id].target.copy(circlePos);
  });
};

// createBusinessCardTexture and createBusinessCardScene now use functions from sceneObjects.ts

const createBusinessCardScene = () => {
  const circlePos = getHeroCirclePosition(BUSINESS_CARD_PAGE);
  const cardMesh = createBusinessCardMesh(renderer, circlePos);
  heroGroup.add(cardMesh);
  registerHomePageTarget(cardMesh, BUSINESS_CARD_PAGE);
  pageSceneRoots[BUSINESS_CARD_PAGE] = cardMesh;
};

const baseTurntableCameraPosition = new Vector3();
const RAD2DEG = 180 / Math.PI;
// const DEG2RAD = Math.PI / 180; // Debug UI - disabled

// const editingInputs: Set<HTMLInputElement> = new Set(); // Debug UI - disabled
// const registerEditingInput = (input: HTMLInputElement) => { // Debug UI - disabled
//   input.addEventListener("focus", () => editingInputs.add(input));
//   input.addEventListener("blur", () => editingInputs.delete(input));
// };

// Debug UI function - disabled
// const createNumberInputControl = (
//   labelText: string,
//   options: {
//     min?: number;
//     max?: number;
//     step?: number;
//     suffix?: string;
//   } = {},
// ): {
//   control: HTMLDivElement;
//   input: HTMLInputElement;
//   unit: HTMLSpanElement;
// } => {
//   const { min, max, step, suffix } = options;
//   const control = document.createElement("div");
//   Object.assign(control.style, {
//     display: "flex",
//     alignItems: "center",
//     gap: "0.35rem",
//     width: "100%",
//   });
//
//   const label = document.createElement("span");
//   label.textContent = labelText;
//   Object.assign(label.style, {
//     fontSize: "0.75rem",
//     fontWeight: "600",
//     minWidth: "46px",
//   });
//
//   const input = document.createElement("input");
//   input.type = "number";
//   if (min !== undefined) input.min = min.toString();
//   if (max !== undefined) input.max = max.toString();
//   if (step !== undefined) input.step = step.toString();
//   Object.assign(input.style, {
//     flexGrow: "1",
//     cursor: "text",
//     padding: "0.15rem 0.35rem",
//     fontSize: "0.8rem",
//   });
//   registerEditingInput(input);
//
//   const unit = document.createElement("span");
//   unit.textContent = suffix ?? "";
//   Object.assign(unit.style, {
//     fontSize: "0.75rem",
//     minWidth: "24px",
//     textAlign: "right",
//   });
//
//   control.append(label, input, unit);
//   return { control, input, unit };
// };

// Camera debug panel setup - disabled
// cameraDebugPanel is now created by setupDOM()
// const cameraDebugPanel = document.getElementById("camera-debug-panel");
//
// const cameraDebugInfoRow = document.createElement("div");
// cameraDebugInfoRow.style.display = "flex";
// cameraDebugInfoRow.style.justifyContent = "space-between";
//
// const cameraYawText = document.createElement("span");
// cameraYawText.textContent = "Yaw --°";
// const cameraPitchText = document.createElement("span");
// cameraPitchText.textContent = "Pitch --°";
// cameraDebugInfoRow.append(cameraYawText, cameraPitchText);
//
// const yawControl = createNumberInputControl("Yaw", {
//   min: -180,
//   max: 180,
//   step: 0.5,
//   suffix: "°",
// });
// const pitchControl = createNumberInputControl("Pitch", {
//   min: -89,
//   max: 89,
//   step: 0.5,
//   suffix: "°",
// });
// const zoomControl = createNumberInputControl("Zoom", {
//   min: 0.3,
//   max: 4,
//   step: 0.05,
// });
//
// const cameraXControl = createNumberInputControl("Cam X", { step: 0.1 });
// const cameraYControl = createNumberInputControl("Cam Y", { step: 0.1 });
// const cameraZControl = createNumberInputControl("Cam Z", { step: 0.1 });
//
// const tempDirection = new Vector3();
//
// const applyCameraStyleInputs = () => {
//   const yawDeg = parseFloat(yawControl.input.value);
//   const pitchDeg = parseFloat(pitchControl.input.value);
//   if (Number.isFinite(yawDeg) && Number.isFinite(pitchDeg)) {
//     const yawRad = yawDeg * DEG2RAD;
//     const pitchRad = pitchDeg * DEG2RAD;
//     const cosPitch = Math.cos(pitchRad);
//     tempDirection.set(
//       Math.sin(yawRad) * cosPitch,
//       Math.sin(pitchRad),
//       Math.cos(yawRad) * cosPitch,
//     );
//     tempDirection.normalize();
//     cameraRig.setViewDirection(tempDirection);
//   }
//   const zoomVal = parseFloat(zoomControl.input.value);
//   if (Number.isFinite(zoomVal)) {
//     cameraRig.setZoomFactor(zoomVal);
//   }
//   pageCameraSettings[activePage] = captureCameraState(cameraRig);
// };
//
// const applyCameraPositionInputs = () => {
//   const x = parseFloat(cameraXControl.input.value);
//   const y = parseFloat(cameraYControl.input.value);
//   const z = parseFloat(cameraZControl.input.value);
//   if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
//     return;
//   }
//   const desired = new Vector3(x, y, z);
//   const target = cameraRig.getTarget();
//   const offset = desired.sub(target);
//   if (offset.lengthSq() < 1e-8) {
//     return;
//   }
//   const distance = offset.length();
//   cameraRig.setViewDirection(offset.normalize());
//   cameraRig.setCameraDistance(distance);
//   pageCameraSettings[activePage] = captureCameraState(cameraRig);
// };
//
// const cameraStyleInputs = [
//   yawControl.input,
//   pitchControl.input,
//   zoomControl.input,
// ];
// cameraStyleInputs.forEach((input) => {
//   input.addEventListener("input", () => {
//     applyCameraStyleInputs();
//   });
// });
// const cameraPositionInputs = [
//   cameraXControl.input,
//   cameraYControl.input,
//   cameraZControl.input,
// ];
// cameraPositionInputs.forEach((input) => {
//   input.addEventListener("input", applyCameraPositionInputs);
// });
//
// cameraDebugPanel.append(
//   cameraDebugInfoRow,
//   yawControl.control,
//   pitchControl.control,
//   zoomControl.control,
//   cameraXControl.control,
//   cameraYControl.control,
//   cameraZControl.control,
// );
// root.appendChild(cameraDebugPanel);

// Types and constants now imported from pageNavigation.ts and sceneObjects.ts

const TURNTABLE_PAGE = "turntable";
// PLACEHOLDER_SIZE now in sceneObjects.ts
const placeholderMeshes: Record<string, Mesh> = {};
const pageSceneRoots: Record<string, Object3D> = {};

const businessCardAnimation = createBusinessCardAnimation({
  getBusinessCardMesh: () =>
    (pageSceneRoots[BUSINESS_CARD_PAGE] as Object3D) ?? null,
});

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

const HERO_LAYOUT_RADIUS = 48;
const HERO_LAYOUT_Y = 0;
const HERO_LAYOUT_START_ANGLE = Math.PI / 8;
const HERO_LAYOUT_PAGES: Array<string> = [
  TURNTABLE_PAGE,
  ...PORTFOLIO_SCENE_CONFIGS.map((config) => config.id),
  BUSINESS_CARD_PAGE,
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
  business_card: {
    target: BUSINESS_CARD_FOCUS_TARGET.clone(),
    yaw: BUSINESS_CARD_CAMERA_YAW,
    pitch: BUSINESS_CARD_CAMERA_PITCH,
    zoom: BUSINESS_CARD_CAMERA_ZOOM,
  },
  placeholder_A: {
    target: (() => {
      const pos = getHeroCirclePosition("placeholder_A");
      pos.y += PLACEHOLDER_SIZE / 2; // Adjust for raised placeholder center
      return pos;
    })(),
    yaw: PLACEHOLDER_CAMERA_YAW,
    pitch: PLACEHOLDER_CAMERA_PITCH,
    zoom: PLACEHOLDER_CAMERA_ZOOM,
  },
  placeholder_B: {
    target: (() => {
      const pos = getHeroCirclePosition("placeholder_B");
      pos.y += PLACEHOLDER_SIZE / 2; // Adjust for raised placeholder center
      return pos;
    })(),
    yaw: PLACEHOLDER_CAMERA_YAW,
    pitch: PLACEHOLDER_CAMERA_PITCH,
    zoom: PLACEHOLDER_CAMERA_ZOOM,
  },
};

let rememberedHomeCameraState: PageCameraSettings | null = cloneCameraSettings(
  pageCameraSettings.home,
);

const setHeroPageVisibility = (page: ScenePage | null) => {
  Object.entries(pageSceneRoots).forEach(([pageId, model]) => {
    model.visible = page === null || pageId === page;
  });
};
let youtubeBridge: YouTubeBridge | null = null;
// directionFromAngles, lerpAngleDegrees, cloneCameraSettings, applyPageCameraSettings, captureCameraState now imported from pageNavigation.ts

const pageTransitionDuration = 0.9;

const pageTransitionState: {
  startTime: number;
  fromSettings: PageCameraSettings;
  toSettings: PageCameraSettings;
  fromDistance: number;
  toDistance: number;
  active: boolean;
} = {
  startTime: 0,
  fromSettings: cloneCameraSettings(pageCameraSettings.home),
  toSettings: cloneCameraSettings(pageCameraSettings.home),
  fromDistance: 0,
  toDistance: 0,
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

let portfolioPapersManager: PortfolioPapersManager | null = null;
const portfolioFeature = createPortfolioFeature({
  renderer,
  papersContainer: portfolioPapersContainer,
  paperLinksBar: portfolioPaperLinksBar,
  prevArrow: portfolioPrevArrow,
  nextArrow: portfolioNextArrow,
  paperOverlayManager,
});
portfolioPapersManager = portfolioFeature.init();

type PaperDirection = "prev" | "next";
type PendingNav = { direction: PaperDirection; durationMs?: number };
let pendingPaperNav: PendingNav | null = null;

const runQueuedNavigation = () => {
  if (!pendingPaperNav) return;
  const { direction, durationMs } = pendingPaperNav;
  pendingPaperNav = null;
  triggerPaperNavigation(direction, { durationMs });
};

const triggerPaperNavigation = async (
  direction: PaperDirection,
  options?: { durationMs?: number },
) => {
  if (!portfolioPapersManager) return;
  try {
    if (direction === "prev") {
      await portfolioPapersManager.previousPaper({
        durationMs: options?.durationMs,
      });
    } else {
      await portfolioPapersManager.nextPaper({
        durationMs: options?.durationMs,
      });
    }
  } catch (error) {
    console.error("[Portfolio] Keyboard navigation error:", error);
  } finally {
    runQueuedNavigation();
  }
};

const handlePortfolioArrowNav = (event: KeyboardEvent) => {
  if (activePage !== "portfolio") return;
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (target.isContentEditable ||
      ["input", "textarea", "select"].includes(target.tagName.toLowerCase()))
  ) {
    return;
  }
  const direction: PaperDirection | null =
    event.key === "ArrowLeft"
      ? "prev"
      : event.key === "ArrowRight"
        ? "next"
        : null;
  if (!direction) return;
  event.preventDefault();
  if (!portfolioPapersManager) return;
  if (portfolioPapersManager.isNavigationLocked()) {
    pendingPaperNav = { direction, durationMs: 400 };
    return;
  }
  triggerPaperNavigation(direction, { durationMs: 400 });
};
document.addEventListener("keydown", handlePortfolioArrowNav);

// setMeshRenderPriority and applyPolygonOffsetToMaterials now in sceneObjects.ts

// globalControls, homeNavButton, portfolioNavButton, resetTutorialButton now created by setupDOM()
homeNavButton.addEventListener("click", () => {
  setActiveScenePage("home");
});

turntableNavButton.addEventListener("click", () => {
  setActiveScenePage("turntable");
});

portfolioNavButton.addEventListener("click", () => {
  void portfolioNavigationController.openPortfolioPage({
    startAtPaperIndex: 1,
    waitForEntryAnimations: true,
  });
});

portfolioResumeButton.addEventListener("click", () => {
  void portfolioNavigationController.openPortfolioPage();
});

resetTutorialButton.addEventListener("click", () => {
  if (isFreeLookModeActive()) {
    // Only reset free-look tutorial when in free-look mode
    freeLookTutorialController.reset();
  } else {
    // Only reset turntable tutorial when not in free-look mode
    const tutorialManager = (window as any).tutorialManager;
    if (tutorialManager) {
      tutorialManager.reset();
      console.log("Tutorial reset");
    }
  }
});

freeLookButton.addEventListener("click", () => {
  turntableUiController?.toggleFreeLookMode();
});

contactButton.addEventListener("click", () => {
  setActiveScenePage("business_card");
});

const setActiveScenePage = (page: ScenePage) => {
  if (page === activePage) {
    return;
  }
  if (page !== "turntable" && isFreeLookModeActive()) {
    turntableUiController?.exitFreeLookMode({
      restoreCamera: false,
      restoreUI: false,
      restorePlayer: false,
    });
  }
  const previousPage = activePage;
  portfolioFeature.handlePageExit(previousPage, page);
  if (page === BUSINESS_CARD_PAGE) {
    businessCardAnimation.handlePageSelection(page);
    businessCardAnimation.setMouseReactiveRotation(true);
  }
  if (previousPage === BUSINESS_CARD_PAGE && page !== BUSINESS_CARD_PAGE) {
    setBusinessCardContactHighlight(null);
    businessCardAnimation.resetToHome();
    businessCardAnimation.setMouseReactiveRotation(false);
  }
  // Clean up vinyl models and reset camera state before capturing when leaving turntable
  if (previousPage === "turntable" && page !== "turntable") {
    // Remove vinyl models from heroGroup before bounding box calculation
    focusCardController.hideFocusCardAndVinyl();
    focusCardController.clearPreloadedFocusVinyl();
    disposeFocusVinyl();
    disposeDroppingVinyl();
    // Reset camera target to default if focus card had changed it
    if (turntablePositionState !== "default") {
      cameraRig.setLookTarget(pageCameraSettings.turntable.target, false);
      turntablePositionState = "default";
    }
  }
  // Capture current camera distance before any changes
  const fromDistance = cameraRig.getCameraDistance();
  const fromSettings = captureCameraState(cameraRig);
  if (previousPage === "home" && page !== "home") {
    rememberedHomeCameraState = cloneCameraSettings(fromSettings);
    pageCameraSettings.home = cloneCameraSettings(rememberedHomeCameraState);
  }
  const toSettings = pageCameraSettings[page];
  // Compute target camera distance by temporarily applying target settings
  // This ensures we get the correct distance for the destination page's framing
  let frameObjectTarget: Object3D = heroGroup;
  let frameOffset = page === "home" ? HOME_FRAME_OFFSET : 2.6;
  if (page === "turntable" && turntableSceneRoot) {
    frameObjectTarget = turntableSceneRoot;
  } else if (pageSceneRoots[page]) {
    frameObjectTarget = pageSceneRoots[page];
  }
  cameraRig.frameObject(frameObjectTarget, frameOffset);
  cameraRig.setZoomFactor(toSettings.zoom);
  const toDistance = cameraRig.getCameraDistance();

  // Restore camera to starting state for smooth transition
  cameraRig.setLookTarget(fromSettings.target, false);
  cameraRig.setViewDirection(
    directionFromAngles(fromSettings.yaw, fromSettings.pitch),
    false,
  );
  pageTransitionState.startTime = performance.now();
  pageTransitionState.fromSettings = cloneCameraSettings(fromSettings);
  pageTransitionState.toSettings = cloneCameraSettings(toSettings);
  pageTransitionState.fromDistance = fromDistance;
  pageTransitionState.toDistance = toDistance;
  pageTransitionState.active = true;
  const wasTurntable = previousPage === "turntable";
  if (page === "portfolio") {
    portfolioFeature.showUI();
    portfolioPapersManager?.showAllPapers();
    portfolioFeature.ensureLinksReady();
  }
  if (page === "turntable") {
    focusCardController.ensureFocusVinylPreloaded();
  }
  if (wasTurntable && page !== "turntable") {
    vinylSelectionController.resetFocusCardState();
  }

  activePage = page;
  turntableStateManager.setActivePage(page);

  // Start auto-orbit if moving to home page
  if (page === "home") {
    inputHandlers?.startAutoOrbit();
  } else {
    inputHandlers?.setAutoOrbitActive(false);
  }

  youtubeBridge?.setFKeyListenerEnabled(page === "turntable");
  const shouldShowFocusVinyl = page === "turntable";
  focusCardController.setFocusVinylManuallyHidden(!shouldShowFocusVinyl);
  if (!shouldShowFocusVinyl && focusVinylState?.model) {
    setVinylModelVisibility(
      focusVinylState.model,
      "focus",
      false,
      "scene-change hide",
    );
  }
  focusCardController.updateFocusVinylVisibility();
  vinylCameraTrackingEnabled = page === "turntable";
  turntableUiController?.setTurntableUIVisible(activePage === "turntable");
  if (page === "turntable") {
    setHeroPageVisibility("turntable");
    yt?.setPlayerCollapsed(false);
  } else if (wasTurntable) {
    setHeroPageVisibility(null);
  }
  if (wasTurntable && page !== "turntable") {
    focusCardController.hideFocusCardAndVinyl();
    // Collapse player when leaving turntable
    if (yt && !yt.isPlayerCollapsed()) {
      yt.setPlayerCollapsed(true);
    }
    // Clear turntable-specific state when leaving turntable
    isTonearmInPlayArea = false;
    turntableStateManager.setTonearmInPlayArea(false);
    yt?.updateButtonVisibility();
    isReturningVinyl = false;
    setPendingPromotionSource(null, "leaving turntable page");
  }

  // Reposition buttons based on page
  const isPositionChanging =
    (previousPage === "turntable") !== (page === "turntable");

  // Function to update button visibility
  const updateButtonVisibility = () => {
    homeNavButton.style.display = page === "home" ? "none" : "block";
    turntableNavButton.style.display = page === "turntable" ? "none" : "block";
    portfolioNavButton.style.display = page === "portfolio" ? "none" : "block";
    portfolioResumeButton.style.display =
      page === "portfolio" ? "none" : "block";
    contactButton.style.display = page === "business_card" ? "none" : "block";
    resetTutorialButton.style.display = page === "turntable" ? "block" : "none";
    freeLookButton.style.display = page === "turntable" ? "block" : "none";
    const shouldShowSettingsButton =
      page === "turntable" ||
      page === "home" ||
      page === "portfolio" ||
      page === "business_card";
    settingsButton.style.display = shouldShowSettingsButton ? "block" : "none";
    if (!shouldShowSettingsButton) {
      setSettingsPanelVisible(false);
    }
    setSettingsPanelLayout(page === "turntable");
  };

  if (isPositionChanging) {
    // Fade out before repositioning
    if (!globalControls.style.transition) {
      globalControls.style.transition = "opacity 0.3s ease";
    }
    globalControls.style.opacity = "0";

    setTimeout(() => {
      // Update button visibility while invisible
      updateButtonVisibility();

      if (page === "turntable") {
        // Move to bottom left, to the right of the + sign (toggle button is ~30px wide at left: 20px)
        globalControls.style.top = "";
        globalControls.style.bottom = GLOBAL_CONTROLS_TURNTABLE.bottom;
        globalControls.style.left = GLOBAL_CONTROLS_TURNTABLE.left;
        globalControls.style.transform = GLOBAL_CONTROLS_TURNTABLE.transform;
        globalControls.style.flexDirection =
          GLOBAL_CONTROLS_TURNTABLE.flexDirection;
        globalControls.style.gap = GLOBAL_CONTROLS_TURNTABLE.gap;
        globalControls.style.alignItems = "center";
      } else {
        // Return to left side top
        globalControls.style.bottom = "";
        globalControls.style.top = GLOBAL_CONTROLS_DEFAULT.top;
        globalControls.style.left = GLOBAL_CONTROLS_DEFAULT.left;
        globalControls.style.transform = GLOBAL_CONTROLS_DEFAULT.transform;
        globalControls.style.flexDirection =
          GLOBAL_CONTROLS_DEFAULT.flexDirection;
        globalControls.style.gap = GLOBAL_CONTROLS_DEFAULT.gap;
        globalControls.style.alignItems = "flex-start";
      }
      // Fade back in
      globalControls.style.opacity = "1";
    }, 300);
  } else {
    // No position change, just update styles without fade
    updateButtonVisibility();

    if (page === "turntable") {
      globalControls.style.top = "";
      globalControls.style.bottom = GLOBAL_CONTROLS_TURNTABLE.bottom;
      globalControls.style.left = GLOBAL_CONTROLS_TURNTABLE.left;
      globalControls.style.transform = GLOBAL_CONTROLS_TURNTABLE.transform;
      globalControls.style.flexDirection =
        GLOBAL_CONTROLS_TURNTABLE.flexDirection;
      globalControls.style.gap = GLOBAL_CONTROLS_TURNTABLE.gap;
      globalControls.style.alignItems = "center";
    } else {
      globalControls.style.bottom = "";
      globalControls.style.top = GLOBAL_CONTROLS_DEFAULT.top;
      globalControls.style.left = GLOBAL_CONTROLS_DEFAULT.left;
      globalControls.style.transform = GLOBAL_CONTROLS_DEFAULT.transform;
      globalControls.style.flexDirection =
        GLOBAL_CONTROLS_DEFAULT.flexDirection;
      globalControls.style.gap = GLOBAL_CONTROLS_DEFAULT.gap;
      globalControls.style.alignItems = "flex-start";
    }
  }

  // Show/hide portfolio navigation arrows
  portfolioFeature.setArrowVisibility(page === "portfolio");

  // Show/hide placeholder info
  if (page === "placeholder_A") {
    placeholderAInfo.style.display = "block";
    placeholderAInfo.style.opacity = "1";
    placeholderAInfo.style.pointerEvents = "auto";
  } else {
    placeholderAInfo.style.display = "none";
    placeholderAInfo.style.opacity = "0";
    placeholderAInfo.style.pointerEvents = "none";
  }

  if (page === "placeholder_B") {
    placeholderBInfo.style.display = "block";
    placeholderBInfo.style.opacity = "1";
    placeholderBInfo.style.pointerEvents = "auto";
  } else {
    placeholderBInfo.style.display = "none";
    placeholderBInfo.style.opacity = "0";
    placeholderBInfo.style.pointerEvents = "none";
  }
};

const portfolioNavigationController =
  portfolioFeature.createNavigationController(setActiveScenePage);

// findPageForObject now imported from pageNavigation.ts

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

  // Interpolate camera distance directly instead of zoom factor
  const distance =
    pageTransitionState.fromDistance +
    (pageTransitionState.toDistance - pageTransitionState.fromDistance) * ease;

  transitionTarget.copy(from.target).lerp(to.target, ease);
  cameraRig.setLookTarget(transitionTarget, false);
  cameraRig.setViewDirection(directionFromAngles(yaw, pitch), false);
  cameraRig.setDirectCameraDistance(distance);
  if (progress >= 1) {
    pageTransitionState.active = false;
    pageCameraSettings[activePage] = cloneCameraSettings(to);
    // updateCameraDebugPanel();

    // Restore final zoom factor for the destination page's framing
    cameraRig.setZoomFactor(to.zoom);

    if (activePage === "turntable" && pendingTurntableCallbacks.length) {
      const callbacks = pendingTurntableCallbacks.splice(
        0,
        pendingTurntableCallbacks.length,
      );
      callbacks.forEach((fn) => fn());
    }
    // Start auto-orbit after transition completes when returning to home page
    if (activePage === "home") {
      inputHandlers?.startAutoOrbit();
    }
  }
};

// Camera debug panel update function - disabled
// const updateCameraDebugPanel = () => {
//   const orbitAngles = cameraRig.getOrbitAngles();
//   const yawDeg = orbitAngles.azimuth * RAD2DEG;
//   const pitchDeg = orbitAngles.polar * RAD2DEG;
//   cameraYawText.textContent = `Yaw ${yawDeg.toFixed(1)}°`;
//   cameraPitchText.textContent = `Pitch ${pitchDeg.toFixed(1)}°`;
//   if (!editingInputs.has(yawControl.input)) {
//     yawControl.input.value = yawDeg.toFixed(1);
//   }
//   if (!editingInputs.has(pitchControl.input)) {
//     pitchControl.input.value = pitchDeg.toFixed(1);
//   }
//   const zoomFactor = cameraRig.getZoomFactor();
//   if (!editingInputs.has(zoomControl.input)) {
//     zoomControl.input.value = zoomFactor.toFixed(2);
//   }
//   const cameraPos = camera.position;
//   if (!editingInputs.has(cameraXControl.input)) {
//     cameraXControl.input.value = cameraPos.x.toFixed(2);
//   }
//   if (!editingInputs.has(cameraYControl.input)) {
//     cameraYControl.input.value = cameraPos.y.toFixed(2);
//   }
//   if (!editingInputs.has(cameraZControl.input)) {
//     cameraZControl.input.value = cameraPos.z.toFixed(2);
//   }
// };

const { vinylNormalTexture } = loadTextures(renderer);

// FOCUS_VINYL_BASE_SCALE now in vinylHelpers.ts

let labelVisuals: LabelVisualOptions = createDefaultLabelVisuals();

// applyLabelTextureQuality now imported from vinylHelpers.ts

// getFocusVinylScale and applyFocusVinylScale now imported from vinylHelpers.ts

let focusLabelTextures: LabelTextures = createLabelTextures(labelVisuals);
applyLabelTextureQuality(
  focusLabelTextures,
  renderer.capabilities.getMaxAnisotropy(),
);

let labelOptions: LabelApplicationOptions = {
  scale: 1,
  padding: 0,
  offsetX: 0,
  offsetY: 0,
};

const getInitialDerivedColor = (): string | null => null;
let focusVinylDerivedColor: string | null = getInitialDerivedColor();
let turntableVinylDerivedColor: string | null = focusVinylDerivedColor;
let focusVinylBodyColor: string | null = getEffectiveVinylColor(
  focusVinylDerivedColor,
);
let turntableVinylBodyColor: string | null = getEffectiveVinylColor(
  turntableVinylDerivedColor,
);

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
layoutCircle.visible = false; // Hidden
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
layoutCircleOutline.visible = false; // Hidden
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
// FocusVinylState and TurntableVinylState now imported from vinylInteractions.ts
let focusVinylState: FocusVinylState | null = null;
let focusVinylOutlineMesh: Mesh | null = null;
let focusVinylOutlineMaterial: ShaderMaterial | null = null;
let focusVinylOutlineNeedsRebuild = false;
let focusVinylOutlineDelayedRebuildFrames = 0;
let focusVinylOutlineLastScale = 0;
let turntableVinylState: TurntableVinylState | null = null;
// Dropping vinyl: a vinyl mid-animation that will become the turntable vinyl
// This allows a new focus vinyl to be created while the old one finishes its drop animation
type DroppingVinylState = {
  model: Object3D;
  selection: VinylSelectionDetail;
  labelTextures: LabelTextures;
  labelVisuals: LabelVisualOptions;
  derivedColor: string | null;
};
let droppingVinylState: DroppingVinylState | null = null;
let focusVinylLoadToken = 0;
let turntableSceneRoot: Object3D | null = null;
const turntableBounds = new Box3();
const turntableBoundsSize = new Vector3();
const turntableBoundsCenter = new Vector3();
// VinylSource type now imported from vinylInteractions.ts
let activeVinylSource: VinylSource | null = null;
let currentDragSource: VinylSource | null = null;
let pendingPromotionSource: VinylSource | null = null;

setupSettingsPersistence({
  coloredVinylsCheckbox,
  sfxCheckbox,
  songCommentsCheckbox,
  onColoredVinylsChange: (enabled) => {
    coloredVinylsEnabled = enabled;
    updateFocusVinylColorFromDerived();
    updateTurntableVinylColorFromDerived();
    restoreDroppingVinylAppearance("coloredVinylToggle");
  },
  onSfxChange: (enabled) => {
    sfx_on = enabled;
    window.sfx_on = sfx_on;
  },
  onSongCommentsChange: (enabled) => {
    document.body.classList.toggle("song-comments-hidden", !enabled);
  },
});

function setPendingPromotionSource(
  value: VinylSource | null,
  _reason: string,
): void {
  const prev = pendingPromotionSource ?? "null";
  const next = value ?? "null";
  if (prev === next) {
    // console.log(`[pendingPromotion] stays ${next} (${_reason})`);
  } else {
    // console.log(`[pendingPromotion] ${prev} -> ${next} (${_reason})`);
  }
  pendingPromotionSource = value;
}
type FlyawayVinyl = {
  model: Object3D;
  velocity: Vector3;
  spin: Vector3;
  lifetime: number;
  initialScale: number;
  textures: LabelTextures;
  selection: VinylSelectionDetail;
};
const flyawayVinyls: FlyawayVinyl[] = [];
type FadingVinyl = {
  model: Object3D;
  textures: LabelTextures;
  lifetime: number;
  duration: number;
  materials: Array<{
    material: Material & { opacity: number; transparent?: boolean };
    baseOpacity: number;
  }>;
};
const fadingVinyls: FadingVinyl[] = [];
const VINYL_FADE_OUT_DURATION = 0.45;
// isFullscreenMode now managed by TurntableStateManager

function applyFocusVinylColorToModel(): void {
  if (focusVinylState?.model) {
    applyVinylColor(focusVinylState.model, focusVinylBodyColor);
  }
}

function applyTurntableVinylColorToModel(): void {
  if (turntableVinylState?.model) {
    applyVinylColor(turntableVinylState.model, turntableVinylBodyColor);
  }
}

function getEffectiveVinylColor(derivedColor: string | null): string | null {
  if (!derivedColor) {
    return null;
  }
  return coloredVinylsEnabled ? derivedColor : null;
}

function updateFocusVinylColorFromDerived(): void {
  focusVinylBodyColor = getEffectiveVinylColor(focusVinylDerivedColor);
  applyFocusVinylColorToModel();
}

function updateTurntableVinylColorFromDerived(): void {
  turntableVinylBodyColor = getEffectiveVinylColor(turntableVinylDerivedColor);
  applyTurntableVinylColorToModel();
}

function restoreDroppingVinylAppearance(_context?: string): void {
  if (!droppingVinylState) {
    // console.log(
    //   `[droppingVinyl] restore skipped (no state)${_context ? ` context=${_context}` : ""}`,
    // );
    return;
  }
  // console.log(
  //   `[droppingVinyl] Restoring appearance for ${droppingVinylState.selection.songName}${_context ? ` (${_context})` : ""}`,
  // );
  applyLabelTextures(
    droppingVinylState.model,
    droppingVinylState.labelTextures,
    labelOptions,
    droppingVinylState.labelVisuals,
  );
  applyVinylColor(
    droppingVinylState.model,
    getEffectiveVinylColor(droppingVinylState.derivedColor),
  );
}

function setVinylModelVisibility(
  model: Object3D | null | undefined,
  _tag: string,
  visible: boolean,
  _reason: string,
): void {
  if (!model) {
    // console.log(`[vinylVisibility] ${_tag} missing model (${_reason})`);
    return;
  }
  if (model.visible === visible) {
    // console.log(
    //   `[vinylVisibility] ${_tag} already ${visible ? "visible" : "hidden"} (${_reason})`,
    // );
    return;
  }
  model.visible = visible;
  // console.log(
  //   `[vinylVisibility] ${_tag} -> ${visible ? "visible" : "hidden"} (${_reason})`,
  // );
}

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
    applyFocusVinylScale(focusVinylState?.model ?? null, cameraRig);
  } else if (source === "turntable") {
    vinylModel = turntableVinylState?.model ?? null;
    if (vinylModel && syncState) {
      syncAnimationStateToModel(vinylModel);
    }
  } else if (source === "dropping") {
    vinylModel = droppingVinylState?.model ?? null;
    console.log(
      `[setActiveVinylSource] Set to dropping: vinylModel=${vinylModel ? "exists" : "null"}`,
    );
    // Don't sync state - dropping vinyl continues its animation
  } else {
    vinylModel = null;
  }
};

// cloneLabelVisuals now imported from vinylHelpers.ts

const disposeFocusVinyl = () => {
  if (!focusVinylState) {
    return;
  }
  detachFocusVinylOutline();
  heroGroup.remove(focusVinylState.model);
  focusVinylState = null;
  shouldTrackFocusCard = false;
  if (activeVinylSource === "focus") {
    setActiveVinylSource(turntableVinylState ? "turntable" : null);
  }
  if (activePage === "turntable") {
    focusCardController.ensureFocusVinylPreloaded();
  }
};

const detachFocusVinylOutline = () => {
  if (!focusVinylOutlineMesh) {
    return;
  }
  focusVinylOutlineMesh.parent?.remove(focusVinylOutlineMesh);
  focusVinylOutlineMesh.geometry.dispose();
  focusVinylOutlineMaterial?.dispose();
  focusVinylOutlineMesh = null;
  focusVinylOutlineMaterial = null;
};

const attachFocusVinylOutline = (model: Object3D) => {
  detachFocusVinylOutline();
  // Temporarily remove scale to get unscaled bounds
  const originalScale = model.scale.clone();
  model.scale.set(1, 1, 1);
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  model.scale.copy(originalScale);

  const baseRadius = Math.max(size.x, size.z) / 2 || 1;
  const tubeRadius = Math.max(baseRadius * 0.035, 0.015);
  const outlineGeometry = new TorusGeometry(
    baseRadius + tubeRadius * 0.719,
    tubeRadius,
    24,
    96,
  );
  const outlineMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      baseOpacity: { value: 0 },
    },
    vertexShader: `
      varying float vTubeV;

      void main() {
        // The V texture coordinate corresponds to position around the tube (0 to 1)
        // 0.5 is the center of the tube, 0 and 1 are the edges
        vTubeV = uv.y;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float baseOpacity;
      varying float vTubeV;

      void main() {
        // Create fade from center (0.5) towards edges (0 and 1)
        float distFromCenter = abs(vTubeV - 0.5) * 2.0;

        // Sharp falloff - fade starts immediately and goes to 0 quickly
        float fadeFactor = 1.0 - smoothstep(0.0, 1.0, distFromCenter);
        // Apply power for even sharper gradient
        fadeFactor = pow(fadeFactor, 3.0);

        gl_FragColor = vec4(1.0, 1.0, 1.0, baseOpacity * fadeFactor);
      }
    `,
  });
  const outlineMesh = new Mesh(outlineGeometry, outlineMaterial);
  outlineMesh.rotation.x = Math.PI / 2;
  outlineMesh.renderOrder = 600;
  outlineMesh.frustumCulled = false;
  outlineMesh.name = "focus-vinyl-outline";
  model.add(outlineMesh);
  focusVinylOutlineMesh = outlineMesh;
  focusVinylOutlineMaterial = outlineMaterial;
};

const setFocusVinylState = (state: FocusVinylState | null) => {
  focusVinylState = state;
  if (state?.model) {
    // Delay outline build by a few frames to ensure scale is fully applied
    focusVinylOutlineDelayedRebuildFrames = 2;
  } else {
    focusVinylOutlineNeedsRebuild = false;
    focusVinylOutlineDelayedRebuildFrames = 0;
    detachFocusVinylOutline();
  }
};

const refreshFocusVinylOutline = () => {
  const model = focusVinylState?.model ?? null;
  if (!model) {
    focusVinylOutlineNeedsRebuild = false;
    detachFocusVinylOutline();
    return;
  }
  attachFocusVinylOutline(model);
  focusVinylOutlineNeedsRebuild = false;
  // Update tracked radius after rebuild - use actual bounding box radius
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  focusVinylOutlineLastScale = Math.max(size.x, size.z) / 2;
};

const disposeTurntableVinyl = (reason: string = "unknown") => {
  if (!turntableVinylState) {
    console.log(`[turntableVinyl] dispose skipped (no state) reason=${reason}`);
    return;
  }
  console.log(
    `[turntableVinyl] Disposing ${turntableVinylState.selection.songName} (reason=${reason})`,
  );
  heroGroup.remove(turntableVinylState.model);
  turntableVinylState.labelTextures.sideA.dispose();
  turntableVinylState.labelTextures.sideB.dispose();
  turntableVinylState = null;
  turntableVinylDerivedColor = null;
  turntableVinylBodyColor = getEffectiveVinylColor(turntableVinylDerivedColor);
  if (activeVinylSource === "turntable") {
    setActiveVinylSource(focusVinylState ? "focus" : null);
  }
};

const startTurntableVinylFadeOut = (reason: string = "unknown") => {
  if (!turntableVinylState) {
    console.log(
      `[turntableVinyl] fade-out skipped (no state) reason=${reason}`,
    );
    return;
  }
  console.log(
    `[turntableVinyl] Fading ${turntableVinylState.selection.songName} (reason=${reason})`,
  );

  const { model, labelTextures } = turntableVinylState;
  const materials: FadingVinyl["materials"] = [];
  const seen = new Set<Material>();
  model.traverse((child) => {
    if (!("isMesh" in child) || !(child as Mesh).isMesh) return;
    const mesh = child as Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => {
      if (!mat || seen.has(mat)) return;
      if (!("opacity" in mat)) return;
      seen.add(mat);
      const fadeMat = mat as Material & {
        opacity: number;
        transparent?: boolean;
      };
      materials.push({ material: fadeMat, baseOpacity: fadeMat.opacity ?? 1 });
      fadeMat.transparent = true;
      fadeMat.needsUpdate = true;
    });
  });

  fadingVinyls.push({
    model,
    textures: labelTextures,
    lifetime: 0,
    duration: VINYL_FADE_OUT_DURATION,
    materials,
  });

  turntableVinylState = null;
  turntableVinylDerivedColor = null;
  turntableVinylBodyColor = getEffectiveVinylColor(turntableVinylDerivedColor);
  if (activeVinylSource === "turntable") {
    setActiveVinylSource(focusVinylState ? "focus" : null);
  }
};

const disposeDroppingVinyl = () => {
  if (!droppingVinylState) {
    return;
  }
  heroGroup.remove(droppingVinylState.model);
  droppingVinylState.labelTextures.sideA.dispose();
  droppingVinylState.labelTextures.sideB.dispose();
  droppingVinylState = null;
};

const detachFocusTexturesForTurntable = (): LabelTextures => {
  const textures = focusLabelTextures;
  focusLabelTextures = createLabelTextures(labelVisuals);
  applyLabelTextureQuality(
    focusLabelTextures,
    renderer.capabilities.getMaxAnisotropy(),
  );
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
  applyLabelTextureQuality(textures, renderer.capabilities.getMaxAnisotropy());
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
const TURN_TABLE_ANCHOR_OFFSET = new Vector3(0, 6.41, 0);
const turntableAnchorPosition = new Vector3(0, 6.41, 0); // Updated to model position + offset

let vinylDragPointerId: number | null = null;
let activeDragVisualOffset = 0;
let isReturningVinyl = false;
let hasClearedNub = false;
let nubClearanceY = 0;
let vinylDragExceededThreshold = false;
// tonearm drag handled by controller
// ON_TURNTABLE state now managed by TurntableStateManager
// VINYL_DRAG_THRESHOLD now imported from vinylInteractions.ts
let isReturningToFocusCard = false; // Separate state for returning to focus card
const FOCUS_VINYL_EMISSIVE_INTENSITY = 0.12;
const FOCUS_VINYL_EMISSIVE_LERP = 0.12;
let focusVinylEmissiveCurrent = 0;

const BUSINESS_CARD_ROTATION_SENSITIVITY = 0.006;
const BUSINESS_CARD_MAX_PITCH = Math.PI / 2 - 0.05;
const businessCardDragState = {
  isRotating: false,
  pointerId: -1,
  lastX: 0,
  lastY: 0,
};

const raycaster = new Raycaster();
const pointerNDC = new Vector2();
const portfolioInteractions = createPortfolioInteractions({
  canvas,
  camera,
  pointerNDC,
  updatePointer,
  getActivePage: () => activePage,
  getManager: () => portfolioPapersManager,
});
let inputHandlers: ReturnType<typeof registerInputHandlers> | null = null;
const dragPlane = new Plane(new Vector3(0, 0, 1), 0); // Plane perpendicular to Z axis (allows X and Y movement)
const dragIntersectPoint = new Vector3();
const vinylAnimationState = createVinylAnimationState();
type BusinessCardLinkConfig = {
  name: BusinessCardContact;
  getRect: () => UVRect;
  action: () => void;
};
const businessCardContactLinks: BusinessCardLinkConfig[] = [
  {
    name: "email",
    getRect: getBusinessCardEmailUV,
    action: () => {
      window.location.href = BUSINESS_CARD_EMAIL_URI;
    },
  },
  {
    name: "linkedin",
    getRect: getBusinessCardLinkedInUV,
    action: () => {
      window.open(BUSINESS_CARD_LINKEDIN_URL, "_blank", "noopener");
    },
  },
  {
    name: "github",
    getRect: getBusinessCardGitHubUV,
    action: () => {
      window.open(BUSINESS_CARD_GITHUB_URL, "_blank", "noopener");
    },
  },
];
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
const setVinylAnchorPosition = (anchor: Vector3, type: VinylSource) => {
  vinylAnchorPosition.copy(anchor);
  if (type === "focus" || type === "turntable") {
    currentVinylAnchorType = type;
  }
};
const placementRaycaster = new Raycaster();
const placementRayOrigin = new Vector3();
const placementRayDirection = new Vector3(0, -1, 0);
const centerSampleOffset = new Vector3();
const platterSampleWorld = new Vector3();
const turntableWorldPos = new Vector3();
const turntableWorldQuat = new Quaternion();
let turntableController: TurntableController | null = null;
const isUVWithinRect = (u: number, v: number, rect: UVRect) =>
  rect.minU < rect.maxU &&
  rect.minV < rect.maxV &&
  u >= rect.minU &&
  u <= rect.maxU &&
  v >= rect.minV &&
  v <= rect.maxV;

const findBusinessCardLinkUnderRay = () => {
  const mesh = pageSceneRoots[BUSINESS_CARD_PAGE] as Mesh | undefined;
  if (!mesh) {
    return null;
  }
  const hits = raycaster.intersectObject(mesh, true);
  if (!hits.length) {
    return null;
  }
  for (const hit of hits) {
    if (!hit.uv || hit.face?.materialIndex !== 2) {
      continue;
    }
    const { x: u, y: v } = hit.uv;
    for (const link of businessCardContactLinks) {
      const rect = link.getRect();
      if (isUVWithinRect(u, v, rect)) {
        return link;
      }
    }
    break;
  }
  return null;
};

const handleBusinessCardLinkClick = (): boolean => {
  const link = findBusinessCardLinkUnderRay();
  if (!link) {
    return false;
  }
  link.action();
  return true;
};
const updateBusinessCardHoverState = () => {
  const link = findBusinessCardLinkUnderRay();
  if (!link) {
    canvas.style.cursor = "";
    setBusinessCardContactHighlight(null);
    return;
  }
  canvas.style.cursor = "pointer";
  setBusinessCardContactHighlight(link.name);
};
function rebuildLabelTextures() {
  focusLabelTextures.sideA.dispose();
  focusLabelTextures.sideB.dispose();
  focusLabelTextures = createLabelTextures(labelVisuals);
  applyLabelTextureQuality(
    focusLabelTextures,
    renderer.capabilities.getMaxAnisotropy(),
  );
  if (focusVinylState) {
    applyLabelTextures(
      focusVinylState.model,
      focusLabelTextures,
      labelOptions,
      labelVisuals,
    );
  }
  restoreDroppingVinylAppearance("rebuildLabelTextures");
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

// Initialize turntable state manager
const turntableStateManager = new TurntableStateManager(yt, root);
const focusCardController = createFocusCardController({
  focusCardContainers,
  focusCardCoverContainer,
  camera,
  cameraRig,
  getFocusCardScale,
  setVinylModelVisibility,
  getFocusVinylState: () => focusVinylState,
  getActiveVinylSource: () => activeVinylSource,
  getVinylDragPointerId: () => vinylDragPointerId,
  getShouldTrackFocusCard: () => shouldTrackFocusCard,
  setVinylAnchorPosition,
  updateDragPlaneDepthLocal,
  applyFocusVinylScale,
  vinylTargetPosition,
  lastTargetPosition,
  resetVinylAnimationState,
  vinylAnimationState,
  swingState,
  isFreeLookModeActive: () => isFreeLookModeActive(),
  getIsFullscreenMode: () => turntableStateManager.getIsFullscreenMode(),
  setAspectRatio: (ratio) => yt.setAspectRatio(ratio),
  loadVinylModel,
  vinylNormalTexture,
  heroGroup,
  runWhenTurntableReady,
  cameraTargets: CAMERA_TARGETS,
  setTurntablePositionState: (state) => {
    turntablePositionState = state as TurntablePosition;
  },
  FOCUS_VINYL_CLICK_ANIMATION_SPEED,
});
const focusCardAnchorPosition =
  focusCardController.getFocusCardAnchorPosition();
turntableUiController = createTurntableUiController({
  vinylViewerContainer,
  hideLibraryBtn,
  focusCardContainers,
  showFocusBtn,
  vinylLibraryContainer,
  tutorialContainer,
  getVinylUIFadeTriggered: () => vinylUIFadeTriggered,
  getActivePage: () => activePage,
  getIsPageTransitionActive: () => pageTransitionState.active,
  turntableStateManager,
  freeLookTutorialController,
  freeLookButton,
  updateFocusVinylVisibility: () =>
    focusCardController.updateFocusVinylVisibility(),
  getFocusVinylManuallyHidden: () =>
    focusCardController.getFocusVinylManuallyHidden(),
  setFocusVinylManuallyHidden: (value) => {
    focusCardController.setFocusVinylManuallyHidden(value);
  },
  setTurntablePositionState: (state) => {
    turntablePositionState = state;
  },
  getTurntablePositionState: () => turntablePositionState,
  cameraRig,
  cameraTargets: CAMERA_TARGETS,
  directionFromAngles,
  pageTurntableSettings: pageCameraSettings.turntable,
  getYouTubeBridge: () => yt,
});
turntableUiController.setTurntableUIVisible(false);

yt.setFKeyListenerEnabled(false);
yt.setIsFreeLookModeQuery(() => isFreeLookModeActive());
yt.onPlaybackEnded(() => {
  turntableController?.notifyPlaybackFinishedExternally();
});

let pendingVinylSelection: VinylSelectionDetail | null = null;
let pendingFocusVinylReset: VinylSelectionDetail | null = null;
let loadedSelectionVideoId: string | null = null;
let selectionVisualUpdateId = 0;
let currentVideoLoad: Promise<void> | null = null;

const vinylSelectionController = createVinylSelectionController({
  yt,
  youtubePlayer,
  videoControls,
  turntableStateManager,
  getTurntableController: () => turntableController,
  focusCardController,
  cameraRig,
  cameraTargets: CAMERA_TARGETS,
  runWhenTurntableReady,
  setTurntablePositionState: (state) => {
    turntablePositionState = state as TurntablePosition;
  },
  setVinylCameraTrackingEnabled: (value) => {
    vinylCameraTrackingEnabled = value;
  },
  focusCardAnchorPosition,
  vinylAnimationState,
  resetVinylAnimationState,
  setVinylModelVisibility,
  applyLabelTextures,
  applyFocusVinylScale,
  getFocusVinylScale,
  setVinylScaleFactor: (value) => {
    vinylScaleFactor = value;
  },
  loadVinylModel,
  vinylNormalTexture,
  heroGroup,
  getSelectionCoverUrl,
  extractVibrantColor,
  extractDominantColor,
  deriveVinylColorFromAlbumColor,
  FALLBACK_BACKGROUND_COLOR,
  applyMetadataToLabels,
  rebuildLabelTextures,
  labelVisuals,
  labelOptions,
  getFocusLabelTextures: () => focusLabelTextures,
  setFocusVinylDerivedColor: (value) => {
    focusVinylDerivedColor = value;
  },
  getFocusVinylDerivedColor: () => focusVinylDerivedColor,
  getTurntableVinylDerivedColor: () => turntableVinylDerivedColor,
  updateFocusVinylColorFromDerived,
  updateTurntableVinylVisuals,
  restoreDroppingVinylAppearance,
  detachFocusTexturesForTurntable,
  cloneLabelVisuals,
  disposeDroppingVinyl,
  disposeFocusVinyl,
  setActiveVinylSource,
  getActiveVinylSource: () => activeVinylSource,
  getPendingPromotionSource: () => pendingPromotionSource,
  setPendingPromotionSource,
  getFocusVinylState: () => focusVinylState,
  setFocusVinylState: (state) => {
    setFocusVinylState(state);
  },
  getTurntableVinylState: () => turntableVinylState,
  setTurntableVinylState: (state) => {
    turntableVinylState = state;
  },
  getDroppingVinylState: () => droppingVinylState,
  setDroppingVinylState: (state) => {
    droppingVinylState = state;
  },
  applyFocusVinylColorToModel,
  incrementFocusVinylLoadToken: () => ++focusVinylLoadToken,
  getFocusVinylLoadToken: () => focusVinylLoadToken,
  setVinylDragPointerId: (value) => {
    vinylDragPointerId = value;
  },
  getIsReturningVinyl: () => isReturningVinyl,
  setIsReturningVinyl: (value) => {
    isReturningVinyl = value;
  },
  setIsReturningToFocusCard: (value) => {
    isReturningToFocusCard = value;
  },
  setShouldTrackFocusCard: (value) => {
    shouldTrackFocusCard = value;
  },
  getPendingVinylSelection: () => pendingVinylSelection,
  setPendingVinylSelection: (value) => {
    pendingVinylSelection = value;
  },
  getLoadedSelectionVideoId: () => loadedSelectionVideoId,
  setLoadedSelectionVideoId: (value) => {
    loadedSelectionVideoId = value;
  },
  getCurrentVideoLoad: () => currentVideoLoad,
  setCurrentVideoLoad: (value) => {
    currentVideoLoad = value;
  },
  incrementSelectionVisualUpdateId: () => ++selectionVisualUpdateId,
  getSelectionVisualUpdateId: () => selectionVisualUpdateId,
});

const performFocusVinylReset = (selection: VinylSelectionDetail) => {
  if (!focusVinylState) {
    return;
  }
  vinylSelectionController.resetFocusCardState();
  void vinylSelectionController.handleFocusSelection(selection);
};

// YouTube player callbacks now managed by TurntableStateManager
let isTonearmInPlayArea = false;
let mouseInactivityTimer: number | null = null;
turntableStateManager.initialize(cameraRig, CAMERA_TARGETS, {
  runWhenTurntableReady,
  setHeroPageVisibility,
  hideFocusVinylForFullscreen: () =>
    focusCardController.hideFocusVinylForFullscreen(),
  scheduleFocusVinylRestore: () =>
    focusCardController.scheduleFocusVinylRestore(),
  setTurntableUIVisible: (visible: boolean) => {
    turntableUiController?.setTurntableUIVisible(visible);
  },
  setTurntablePositionState: (state: string) => {
    turntablePositionState = state as TurntablePosition;
  },
  setGroundShadowsVisible: (visible: boolean) => {
    groundPlane.visible = visible;
  },
  setFullscreenLighting: (enabled: boolean) => {
    fullscreenLightingEnabled = enabled;
    refreshLightingTarget();
  },
  onEnterFullscreen: () => {
    // Start cursor hide timer when entering fullscreen
    inputHandlers?.scheduleCursorHide();
  },
  onExitFullscreen: () => {
    // Clear timer and show cursor when exiting fullscreen
    inputHandlers?.resetCursorHide();
  },
});

const {
  setVinylOnTurntable,
  clearTurntableVinylPreservingPromotion,
  startTurntableVinylFlyaway,
} = createTurntableVinylController({
  yt,
  root,
  turntableStateManager,
  getTurntableController: () => turntableController,
  getPendingPromotionSource: () => pendingPromotionSource,
  setPendingPromotionSource,
  getFocusVinylState: () => focusVinylState,
  setFocusVinylState: (state) => {
    setFocusVinylState(state);
  },
  getTurntableVinylState: () => turntableVinylState,
  setTurntableVinylState: (state) => {
    turntableVinylState = state;
  },
  getFocusVinylDerivedColor: () => focusVinylDerivedColor,
  setTurntableVinylDerivedColor: (value) => {
    turntableVinylDerivedColor = value;
  },
  updateTurntableVinylColorFromDerived,
  detachFocusTexturesForTurntable,
  cloneLabelVisuals,
  labelVisuals,
  setVinylModelVisibility,
  setActiveVinylSource,
  setShouldTrackFocusCard: (value) => {
    shouldTrackFocusCard = value;
  },
  disposeTurntableVinyl,
  startTurntableVinylFadeOut,
  loadVideoForCurrentSelection: () =>
    vinylSelectionController.loadVideoForCurrentSelection(),
  getPendingVinylSelection: () => pendingVinylSelection,
  setPendingVinylSelection: (value) => {
    pendingVinylSelection = value;
  },
  getLoadedSelectionVideoId: () => loadedSelectionVideoId,
  setLoadedSelectionVideoId: (value) => {
    loadedSelectionVideoId = value;
  },
  setIsTonearmInPlayArea: (value) => {
    isTonearmInPlayArea = value;
  },
  flyawayVinyls,
});

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

const { pickVinylUnderPointer, handleFullscreenTurntableHoverChange } =
  createTurntablePointerUtils({
    raycaster,
    getFocusVinylState: () => focusVinylState,
    getTurntableVinylState: () => turntableVinylState,
    getFocusVisualOffset: () => focusCardController.getFocusVisualOffset(),
    cameraRig,
    lightingAnimator,
    cameraTargets: CAMERA_TARGETS,
    turntableFocusTarget,
    fullscreenLighting: FULLSCREEN_LIGHTING,
    fullscreenHoverLighting: FULLSCREEN_HOVER_LIGHTING,
  });

inputHandlers = registerInputHandlers({
  canvas,
  camera,
  cameraRig,
  raycaster,
  pointerNDC,
  cameraForward,
  dragPlane,
  dragIntersectPoint,
  updatePointer,
  getActivePage: () => activePage,
  isPageTransitionActive: () => pageTransitionState.active,
  isFreeLookModeActive: () => isFreeLookModeActive(),
  updateBusinessCardMousePosition: (x, y) =>
    businessCardAnimation.updateMousePosition(x, y),
  getBusinessCardRoot: () =>
    (pageSceneRoots[BUSINESS_CARD_PAGE] as Object3D) ?? null,
  setBusinessCardHovered: (hovered) => {
    businessCardAnimation.setIsHovered(hovered);
  },
  setBusinessCardContactHighlight,
  findBusinessCardLinkUnderRay,
  updateBusinessCardHoverState,
  handleBusinessCardRotationMove,
  startBusinessCardRotation,
  endBusinessCardRotation,
  handleBusinessCardLinkClick,
  heroGroup,
  homePageTargets,
  findPageForObject,
  openPortfolioPage: () => {
    void portfolioNavigationController.openPortfolioPage();
  },
  setActiveScenePage,
  portfolioInteractions,
  BUSINESS_CARD_PAGE,
  getTurntableController: () => turntableController,
  yt,
  getTurntablePositionState: () => turntablePositionState,
  onFullscreenTurntableHoverChange: handleFullscreenTurntableHoverChange,
  pickVinylUnderPointer,
  getVinylModel: () => vinylModel,
  getFocusVinylState: () => focusVinylState,
  getTurntableVinylState: () => turntableVinylState,
  resetVinylAnimationState,
  getFocusCardAnchorPosition: () => focusCardAnchorPosition,
  getTurntableAnchorPosition: () => turntableAnchorPosition,
  getVisualOffsetForSource: (source) =>
    focusCardController.getVisualOffsetForSource(source),
  setActiveVinylSource,
  getActiveVinylSource: () => activeVinylSource,
  setPendingPromotionSource,
  setVinylAnchorPosition,
  clearTurntableVinylPreservingPromotion,
  disposeDroppingVinyl,
  startTurntableVinylFlyaway,
  getVinylDragThreshold: () => VINYL_DRAG_THRESHOLD,
  getVinylDisplayPosition: () => vinylDisplayPosition,
  getCurrentPointerWorld: () => currentPointerWorld,
  getPointerAttachmentOffset: () => pointerAttachmentOffset,
  getHangOffset: () => hangOffset,
  getVinylTargetPosition: () => vinylTargetPosition,
  getLastTargetPosition: () => lastTargetPosition,
  getSwingState: () => swingState,
  setVinylDragPointerId: (value) => {
    vinylDragPointerId = value;
  },
  getVinylDragPointerId: () => vinylDragPointerId,
  setCurrentDragSource: (value) => {
    currentDragSource = value;
  },
  getCurrentDragSource: () => currentDragSource,
  setActiveDragVisualOffset: (value) => {
    activeDragVisualOffset = value;
  },
  getActiveDragVisualOffset: () => activeDragVisualOffset,
  setIsReturningVinyl: (value) => {
    isReturningVinyl = value;
  },
  getIsReturningVinyl: () => isReturningVinyl,
  setIsReturningToFocusCard: (value) => {
    isReturningToFocusCard = value;
  },
  getIsReturningToFocusCard: () => isReturningToFocusCard,
  setHasClearedNub: (value) => {
    hasClearedNub = value;
  },
  setVinylDragExceededThreshold: (value) => {
    vinylDragExceededThreshold = value;
  },
  getVinylDragExceededThreshold: () => vinylDragExceededThreshold,
  getShouldTrackFocusCard: () => shouldTrackFocusCard,
  setMouseInactivityTimer: (value) => {
    mouseInactivityTimer = value;
  },
  getMouseInactivityTimer: () => mouseInactivityTimer,
  notifyFreeLookAction: (action) => {
    turntableUiController?.notifyFreeLookAction(action);
  },
  resetFocusVinylAfterTurntableDrag: () => {
    if (!focusVinylState) {
      return;
    }
    const selection = focusVinylState.selection;
    if (isReturningVinyl || isReturningToFocusCard) {
      pendingFocusVinylReset = selection;
      return;
    }
    performFocusVinylReset(selection);
  },
  CAMERA_ORBIT_SENSITIVITY,
  PAN_SENSITIVITY,
  FREE_LOOK_MIN_ZOOM,
});

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
        console.log(
          `[TurntableController] onPlay callback triggered, loadedSelectionVideoId="${loadedSelectionVideoId}"`,
        );
        // Only play if video is loaded
        if (loadedSelectionVideoId) {
          console.log(`[TurntableController] Calling yt.play()`);
          yt.play();
        } else {
          console.warn(
            `[TurntableController] onPlay called but no video loaded (loadedSelectionVideoId is null)`,
          );
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
    turntableController.setVinylPresence(turntableStateManager.isOnTurntable());
    const applyDuration = () => {
      const duration = youtubePlayer.getDuration();
      if (duration > 1 && turntableController) {
        turntableController.setMediaDuration(duration);
      }
    };
    applyDuration();
    youtubeReady.then(applyDuration).catch(() => {});
    logMaterialNames(turntable);
    enableShadows(turntable);

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
    applyPageCameraSettings(pageCameraSettings.home, cameraRig);
    pageTransitionState.fromSettings = cloneCameraSettings(
      pageCameraSettings.home,
    );
    pageTransitionState.toSettings = cloneCameraSettings(
      pageCameraSettings.home,
    );
    pageTransitionState.active = false;
    // updateCameraDebugPanel();
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
    updateDragPlaneDepthLocal(turntableAnchorPosition.z);
    updateTurntableNubClearance(turntable);

    vinylUserRotation = 0;
  })
  .catch((error) => {
    console.error("Failed to load hero models", error);
  });

createPlaceholderScenes();
createBusinessCardScene();
loadPortfolioModel()
  .then((portfolioModel) => {
    portfolioModel.visible = true;
    enableShadows(portfolioModel);
    const referenceScale = turntableSceneRoot ? turntableSceneRoot.scale.x : 1;
    portfolioModel.scale.setScalar(referenceScale);
    const circlePos = getHeroCirclePosition("portfolio");
    portfolioModel.position.copy(circlePos);
    portfolioModel.rotation.set(0, Math.PI * 0.25, 0);
    heroGroup.add(portfolioModel);
    pageSceneRoots["portfolio"] = portfolioModel;
    registerHomePageTarget(portfolioModel, "portfolio");
    portfolioFeature.setupCover(portfolioModel);
    // Center camera on model origin instead of bounding box center
    const focusPoint = circlePos.clone().add(PORTFOLIO_CAMERA_TARGET_OFFSET);
    pageCameraSettings.portfolio.target.copy(focusPoint);
    const rotationYawDeg = Math.PI * 0.25 * RAD2DEG;
    pageCameraSettings.portfolio.yaw = rotationYawDeg;
    pageCameraSettings.portfolio.pitch = PORTFOLIO_TOP_CAMERA_PITCH;
    applyHomeCameraPreset();
    if (activePage === "home" && !pageTransitionState.active) {
      applyPageCameraSettings(pageCameraSettings.home, cameraRig);
      // updateCameraDebugPanel();
    }
    if (activePage === "portfolio" && !pageTransitionState.active) {
      applyPageCameraSettings(pageCameraSettings.portfolio, cameraRig);
      // updateCameraDebugPanel();
    }
  })
  .catch((error) => {
    console.error("Failed to load portfolio model:", error);
  });

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
    applyPageCameraSettings(pageCameraSettings.home, cameraRig);
    // updateCameraDebugPanel();
  }

  // Update focus card position on window resize
  focusCardController.updateFocusCardPosition();
};
cameraRig.onAnimationComplete(() => {
  focusCardController.updateFocusCardPosition();
});

const updateFocusVinylForResize = () => {
  // Update focus vinyl scale and position during resize - treat like first click
  if (focusVinylState?.model && shouldTrackFocusCard) {
    // Update the global scale factor
    vinylScaleFactor = getFocusVinylScale(cameraRig);
    // Apply scale to model immediately
    focusVinylState.model.scale.setScalar(vinylScaleFactor);
    // Update hover offset to match new scale
    focusCardController.syncHoverDistanceOnResize();
    // Invalidate camera-relative offset to force recalculation
    vinylAnimationState.cameraRelativeOffsetValid = false;
    // Update focus card position (this updates focusCardAnchorPosition)
    focusCardController.updateFocusCardPosition();
    // Reset ALL vinyl animation state to the new anchor position (like first click)
    resetVinylAnimationState(focusCardAnchorPosition, "focus");
  }
};

const setSize = () => {
  const width = root.clientWidth || window.innerWidth;
  const height = root.clientHeight || window.innerHeight;

  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  cameraRig.handleResize(width, height);

  // Update camera positions for new window size
  updateCameraTargetsForWindowSize();

  // Defer vinyl position update to ensure CSS transforms have been applied
  // This handles the case where focus card scale changes on resize
  requestAnimationFrame(() => {
    updateFocusVinylForResize();
  });
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

  // Update lighting animations
  lightingAnimator.update();

  // Update cursor based on drag state and hover (non-turntable pages only)
  if (activePage !== "turntable") {
    const isVinylDragging = (window as any).VINYL_DRAG_ACTIVE ?? false;
    const isTonearmDragging =
      turntableController?.getIsDraggingTonearm?.() ?? false;
    let isHomePageModelHovering = false;

    if (activePage === "home") {
      raycaster.setFromCamera(pointerNDC, camera);
      for (const { model } of homePageTargets) {
        const intersects = raycaster.intersectObject(model, true);
        if (intersects.length > 0) {
          isHomePageModelHovering = true;
          break;
        }
      }
      if (isVinylDragging || isTonearmDragging) {
        renderer.domElement.style.cursor = "grabbing";
      } else if (isHomePageModelHovering) {
        renderer.domElement.style.cursor = "pointer";
      } else {
        renderer.domElement.style.cursor = "default";
      }
    } else if (isVinylDragging || isTonearmDragging) {
      renderer.domElement.style.cursor = "grabbing";
    }
  }

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

      // Determine if we're animating a dropping vinyl (one that was transferred mid-animation)
      const isAnimatingDroppingVinyl =
        activeVinylSource === "dropping" && droppingVinylState;
      if (isAnimatingDroppingVinyl) {
        console.log(
          `[animate] Animating dropping vinyl, vinylModel=${vinylModel ? "exists" : "null"}, isReturningVinyl=${isReturningVinyl}, hasClearedNub=${hasClearedNub}`,
        );
      }

      const vinylAnimationResult = updateVinylAnimation(vinylAnimationState, {
        vinylModel,
        dragActive: vinylDragPointerId !== null && !isAnimatingDroppingVinyl,
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
        !turntableStateManager.isOnTurntable() &&
        vinylAnimationResult.hasClearedNub;
      if (
        activeVinylSource === "focus" &&
        turntableVinylState &&
        pendingPromotionSource === "focus" &&
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

      // Handle dropping vinyl landing on turntable
      if (
        isAnimatingDroppingVinyl &&
        (shouldSignalOnTurntable || vinylAnimationResult.returnedToPlatter)
      ) {
        console.log(
          `[animate] Dropping vinyl landed on turntable: ${droppingVinylState!.selection.songName}`,
        );
        // Dispose any existing turntable vinyl
        if (turntableVinylState) {
          startTurntableVinylFadeOut(
            "dropping landed - replacing existing turntable vinyl",
          );
        }
        // Promote dropping vinyl to turntable vinyl
        turntableVinylState = {
          model: droppingVinylState!.model,
          selection: droppingVinylState!.selection,
          labelTextures: droppingVinylState!.labelTextures,
          labelVisuals: droppingVinylState!.labelVisuals,
        };
        turntableVinylDerivedColor = droppingVinylState!.derivedColor;
        updateTurntableVinylColorFromDerived();
        setVinylModelVisibility(
          turntableVinylState.model,
          "turntable",
          true,
          "dropping landed on turntable",
        );
        droppingVinylState = null;

        // Complete the turntable setup
        turntableStateManager.setOnTurntable(true);
        turntableStateManager.setTurntableVinylState(turntableVinylState);
        turntableController?.setVinylPresence(true);
        turntableController?.returnTonearmHome();
        pendingVinylSelection = turntableVinylState.selection;
        void vinylSelectionController.loadVideoForCurrentSelection();

        // Reset animation state and switch to focus vinyl if available
        isReturningVinyl = false;
        hasClearedNub = false;
        setPendingPromotionSource(null, "dropping vinyl landed on turntable");
        shouldTrackFocusCard = focusVinylState !== null;
        setVinylAnchorPosition(turntableAnchorPosition, "turntable");

        // Switch vinylModel to focus vinyl if it exists, otherwise to turntable
        if (focusVinylState) {
          setActiveVinylSource("focus");
        } else {
          setActiveVinylSource("turntable");
        }
      } else if (!isAnimatingDroppingVinyl) {
        // Normal vinyl landing logic (not a dropping vinyl)
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
    }

    // Apply position offset and scale from controls
    vinylModel.position.add(vinylPositionOffset);
    const baseVinylY = vinylModel.position.y;

    // Smoothly animate hover offset for focus vinyl
    focusCardController.updateHoverOffsetAnimation();

    renderVisualOffset =
      activeVinylSource === "focus" && !isReturningVinyl
        ? focusCardController.getFocusVisualOffset()
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

  if (pendingFocusVinylReset && !isReturningVinyl && !isReturningToFocusCard) {
    const selection = pendingFocusVinylReset;
    pendingFocusVinylReset = null;
    performFocusVinylReset(selection);
  }

  // When a dropping vinyl is being animated, also update the focus vinyl position
  // The focus vinyl stays at the focus card position independently
  if (activeVinylSource === "dropping" && focusVinylState?.model) {
    // Position focus vinyl at focus card anchor
    focusVinylState.model.position.copy(
      focusCardController.getFocusCardAnchorPosition(),
    );
    // Apply hover offset
    const focusVisualOffset = focusCardController.getFocusVisualOffset();
    if (focusVisualOffset !== 0) {
      focusVinylState.model.position.x += focusVisualOffset;
    }
    // Apply focus vinyl scale
    applyFocusVinylScale(focusVinylState.model, cameraRig);
    // Billboard effect - face the camera
    if (vinylCameraTrackingEnabled) {
      focusVinylState.model.quaternion.copy(camera.quaternion);
    }
  }

  const focusModel = focusVinylState?.model ?? null;
  if (focusModel) {
    const focusVisible =
      focusModel.visible && !focusCardController.getFocusVinylManuallyHidden();
    const shouldGlow =
      focusVisible &&
      shouldTrackFocusCard &&
      currentVinylAnchorType === "focus" &&
      vinylDragPointerId === null &&
      !isReturningToFocusCard;
    const targetEmissive = shouldGlow ? FOCUS_VINYL_EMISSIVE_INTENSITY : 0;
    const emissiveDelta = targetEmissive - focusVinylEmissiveCurrent;
    if (Math.abs(emissiveDelta) < 0.001) {
      focusVinylEmissiveCurrent = targetEmissive;
    } else {
      focusVinylEmissiveCurrent += emissiveDelta * FOCUS_VINYL_EMISSIVE_LERP;
    }
    applyVinylEmissive(focusModel, focusVinylEmissiveCurrent);

    // Update focus vinyl outline
    if (focusVinylOutlineDelayedRebuildFrames > 0) {
      focusVinylOutlineDelayedRebuildFrames--;
      if (focusVinylOutlineDelayedRebuildFrames === 0) {
        focusVinylOutlineNeedsRebuild = true;
      }
    }

    if (focusVinylOutlineNeedsRebuild) {
      console.log(`[focusVinylOutline] Rebuilding outline`);
      refreshFocusVinylOutline();
    }

    // Always check and log vinyl outline size
    if (focusVinylState?.model && focusVinylOutlineMesh && focusModel) {
      // Use actual focus model's bounding box to determine outline size
      const bounds = new Box3().setFromObject(focusModel);
      const size = bounds.getSize(new Vector3());
      const actualRadius = Math.max(size.x, size.z) / 2;

      const sizeDifference = Math.abs(
        actualRadius - focusVinylOutlineLastScale,
      );

      if (sizeDifference > 0.001) {
        console.log(
          `[focusVinylOutline] actualRadius=${actualRadius.toFixed(5)}, recorded=${focusVinylOutlineLastScale.toFixed(5)}, diff=${sizeDifference.toFixed(5)}`,
        );
      }

      if (sizeDifference > 0.1) {
        console.log(
          `[focusVinylOutline] REBUILDING - Size mismatch threshold exceeded`,
        );
        focusVinylOutlineNeedsRebuild = true;
      }
    }

    if (focusVinylOutlineMaterial) {
      const shouldShowOutline =
        shouldGlow && (darkModeEnabled || focusCoverClickActive);
      const targetOpacity = shouldShowOutline ? 0.9 : 0;
      const currentOpacity =
        focusVinylOutlineMaterial.uniforms.baseOpacity.value;
      const opacityDelta = targetOpacity - currentOpacity;
      if (Math.abs(opacityDelta) > 0.001) {
        const lerpFactor = Math.min(1, delta * 8);
        focusVinylOutlineMaterial.uniforms.baseOpacity.value =
          currentOpacity + opacityDelta * lerpFactor;
      } else if (
        focusVinylOutlineMaterial.uniforms.baseOpacity.value !== targetOpacity
      ) {
        focusVinylOutlineMaterial.uniforms.baseOpacity.value = targetOpacity;
      }
    }
  } else if (focusVinylEmissiveCurrent !== 0) {
    focusVinylEmissiveCurrent = 0;
  }

  // Controller updates tonearm + platter/pulley
  turntableController?.update(delta);

  // Sync turntable time with YouTube player to prevent desync when tab is inactive
  if (
    turntableController &&
    turntableStateManager.isOnTurntable() &&
    loadedSelectionVideoId !== null
  ) {
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
      turntableStateManager.isOnTurntable() && loadedSelectionVideoId !== null;
    const tonearmNowInPlayArea =
      vinylReadyForPlayback &&
      (turntableController?.isTonearmInPlayArea() ?? false);
    if (tonearmNowInPlayArea && !isTonearmInPlayArea) {
      // Tonearm just entered play area - show controls/timeline
      isTonearmInPlayArea = true;
      turntableStateManager.setTonearmInPlayArea(true);
      if (youtubePlayer.getDuration() > 0) {
        yt.setControlsVisible(true);
        // Animate viewport back in only if not manually collapsed
        if (!yt.isPlayerCollapsed()) {
          yt.refreshLayout();
        }
        // Update button visibility after viewport height change
        yt.updateButtonVisibility();
      }
    } else if (!tonearmNowInPlayArea && isTonearmInPlayArea) {
      // Tonearm just left play area - hide player
      isTonearmInPlayArea = false;
      turntableStateManager.setTonearmInPlayArea(false);
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
  if (turntableStateManager.isOnTurntable() && vinylDragPointerId === null) {
    vinylSpinAngle += angularStep;
  }
  if (turntableVinylState) {
    turntableVinylState.model.rotation.y += angularStep;
  }

  for (let i = fadingVinyls.length - 1; i >= 0; i--) {
    const entry = fadingVinyls[i];
    entry.lifetime += delta;
    const progress = Math.min(1, entry.lifetime / entry.duration);
    const opacityScale = Math.max(0, 1 - progress);
    entry.materials.forEach(({ material, baseOpacity }) => {
      material.opacity = baseOpacity * opacityScale;
    });
    if (progress >= 1) {
      heroGroup.remove(entry.model);
      entry.textures.sideA.dispose();
      entry.textures.sideB.dispose();
      fadingVinyls.splice(i, 1);
    }
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
      // Check if this flyaway vinyl matches the current focus card
      const focusCardContainer = document.getElementById(
        "vinyl-focus-card-cover-root",
      );
      const hasFocusCard =
        focusCardContainer && focusCardContainer.childElementCount > 0;

      // Simply check if there's a focus card and no focus vinyl currently loaded
      const shouldReloadToFocus = hasFocusCard && !focusVinylState;

      heroGroup.remove(entry.model);
      entry.textures.sideA.dispose();
      entry.textures.sideB.dispose();
      flyawayVinyls.splice(i, 1);

      // Reload the vinyl to focus position after cleanup
      if (shouldReloadToFocus) {
        console.log(
          "[Flyaway] Reloading vinyl to focus position:",
          entry.selection.songName,
        );
        pendingVinylSelection = entry.selection;
        void vinylSelectionController.handleFocusSelection(entry.selection);
      }
    }
  }

  const hasActiveVinyl =
    Boolean(focusVinylState?.model) ||
    Boolean(turntableVinylState?.model) ||
    flyawayVinyls.length > 0;
  if (!hasActiveVinyl) {
    focusCardController.deactivateFocusCoverZIndexImmediate();
  }

  if (vinylModel && renderVisualOffset !== 0) {
    vinylModel.position.x += renderVisualOffset;
  }

  // Update auto-orbit and momentum
  inputHandlers?.updateAutoOrbit();

  if (portfolioPapersManager) {
    paperOverlayManager.setActive(activePage === "portfolio");
    paperOverlayManager.updateTransforms(
      camera,
      renderer,
      portfolioPapersManager.getPaperMeshes(),
    );
  } else {
    paperOverlayManager.setActive(false);
  }

  renderer.render(scene, camera);
  if (vinylModel && renderVisualOffset !== 0) {
    vinylModel.position.x -= renderVisualOffset;
  }
  window.PLAYING_SOUND = turntableController?.isPlaying() ?? false;
  updateVideoProgress();

  // Fade name in/out based on player controls visibility
  const nameElement = document.getElementById("jonathan-jiang-name");
  if (nameElement) {
    nameElement.style.opacity = yt.areControlsVisible() ? "0" : "1";
  }

  // updateCameraDebugPanel();

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

// Start auto-orbit on initial page (home)
inputHandlers?.startAutoOrbit();

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

function resetVinylAnimationState(anchor: Vector3, type: VinylSource) {
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

// start/stop + speed slide handled by controller

function startBusinessCardRotation() {
  // Disable drag-based rotation - use mouse hover tracking instead
  return;
}

function handleBusinessCardRotationMove(event: PointerEvent) {
  if (
    !businessCardDragState.isRotating ||
    event.pointerId !== businessCardDragState.pointerId ||
    activePage !== BUSINESS_CARD_PAGE
  ) {
    return false;
  }
  const cardMesh = pageSceneRoots[BUSINESS_CARD_PAGE];
  if (!cardMesh) {
    return false;
  }
  const deltaX = event.clientX - businessCardDragState.lastX;
  const deltaY = event.clientY - businessCardDragState.lastY;
  businessCardDragState.lastX = event.clientX;
  businessCardDragState.lastY = event.clientY;

  const sensitivity = BUSINESS_CARD_ROTATION_SENSITIVITY;
  cardMesh.rotation.y += deltaX * sensitivity;
  cardMesh.rotation.x += deltaY * sensitivity;
  cardMesh.rotation.x = Math.max(
    -BUSINESS_CARD_MAX_PITCH,
    Math.min(BUSINESS_CARD_MAX_PITCH, cardMesh.rotation.x),
  );
  return true;
}

function endBusinessCardRotation(event: PointerEvent) {
  if (
    !businessCardDragState.isRotating ||
    event.pointerId !== businessCardDragState.pointerId
  ) {
    return;
  }
  businessCardDragState.isRotating = false;
  businessCardDragState.pointerId = -1;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // ignore if pointer capture wasn't held
  }
}

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

// updateDragPlaneDepth now imported from vinylHelpers.ts
// Local wrapper to access dragPlane
function updateDragPlaneDepthLocal(z: number) {
  dragPlane.constant = -z;
}

// moved to utils.ts

// rpm helper moved to controller

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

    // Expose vinyl state getters for use in click handlers
    (window as any).getFocusVinylState = () => focusVinylState;
    (window as any).getTurntableVinylState = () => turntableVinylState;
  } catch (error) {
    console.error("✗ Failed to initialize vinyl library viewer:", error);
  } finally {
    markVinylUIReady("viewer");
  }
})();
