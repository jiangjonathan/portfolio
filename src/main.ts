import "./style.css";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  LinearSRGBColorSpace,
  Material,
  Mesh,
  Object3D,
  Quaternion,
  Plane,
  PointLight,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
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
import { CameraRig } from "./cameraRig";
import {} from // createTonearmRotationDisplay,
// createCameraInfoDisplay,
"./ui";
import { initializeYouTubePlayer } from "./youtube";
import { createMetadataController } from "./metadata";
import { clampValue } from "./utils";
import {
  createVinylAnimationState,
  RETURN_CLEARANCE,
  updateVinylAnimation,
} from "./vinylAnimation";
import { EnhancedVinylLibraryWidget } from "./vinylLibraryWidgetEnhanced";
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
  max-width: 350px;
  z-index: 100;
  max-height: auto;
  overflow-y: auto;
`;
root.appendChild(vinylLibraryContainer);

// Create container for vinyl library viewer (grid)
const vinylViewerContainer = document.createElement("div");
vinylViewerContainer.id = "vinyl-library-viewer";
vinylViewerContainer.style.cssText = `
  position: fixed;
  top: 20px;
  right: 20px;
  bottom: 20px;
  max-width: 600px;
  z-index: 100;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  transition: opacity 0.3s ease;
  opacity: 1;
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
  z-index: 101;
  transition: opacity 0.3s ease, transform 0.3s ease;
  opacity: 1;
`;
hideLibraryBtn.addEventListener("click", () => {
  const isHidden = vinylViewerContainer.style.opacity === "0";
  if (isHidden) {
    vinylViewerContainer.style.opacity = "1";
    vinylViewerContainer.style.pointerEvents = "auto";
    hideLibraryBtn.textContent = "hide library";
  } else {
    vinylViewerContainer.style.opacity = "0";
    vinylViewerContainer.style.pointerEvents = "none";
    hideLibraryBtn.textContent = "show library";
  }
});
root.appendChild(hideLibraryBtn);

// Hide scrollbar for webkit browsers and add global hyperlink button styles
const style = document.createElement("style");
style.textContent = `
  #vinyl-library-viewer::-webkit-scrollbar {
    display: none;
  }

  /* Centralized hyperlink button styling */
  :root {
    --vinyl-link-color: #000;
    --vinyl-link-hover-color: #0066cc;
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

  #turntable-position-button {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
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

  #turntable-position-button:hover {
    background: rgba(0, 0, 0, 0.9);
  }
`;
document.head.appendChild(style);
root.appendChild(vinylViewerContainer);

// Turntable position cycling (camera view)
type TurntablePosition = "default" | "bottom-center" | "bottom-left";
let turntablePositionState: TurntablePosition = "default";

// Camera target positions (pan/translation only, no angle change)
// Will be initialized after heroGroup is loaded based on bounding box center
let defaultCameraTarget = new Vector3(0, 0.15, 0);
const CAMERA_TARGETS: Record<TurntablePosition, Vector3> = {
  default: defaultCameraTarget,
  "bottom-center": new Vector3(), // Will be set after heroGroup loads
  "bottom-left": new Vector3(), // Will be set after heroGroup loads
};

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
  };
  positionButton.textContent = labels[turntablePositionState];
});
root.appendChild(positionButton);

const canvas = document.createElement("canvas");
canvas.id = "vinyl-viewer";
root.appendChild(canvas);

const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new Scene();
scene.background = null; // Transparent background

const cameraRig = new CameraRig();
const { camera } = cameraRig;

const ambientLight = new AmbientLight(0xffffff, 0.9);
const keyLight = new DirectionalLight(0xffffff, 1.25);
keyLight.position.set(2.5, 3.5, 3.5);

const fillLight = new DirectionalLight(0xcad7ff, 0.55);
fillLight.position.set(-3, 2, -2);

const rimLight = new PointLight(0xfff5dc, 0.8, 10);
rimLight.position.set(0, 1.2, 2.5);

scene.add(ambientLight, keyLight, fillLight, rimLight);

const textureLoader = new TextureLoader();
const vinylNormalTexture = textureLoader.load("/vinyl-normal.png");
vinylNormalTexture.colorSpace = LinearSRGBColorSpace;
vinylNormalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

let labelVisuals: LabelVisualOptions = createDefaultLabelVisuals();

let labelTextures: LabelTextures = createLabelTextures(labelVisuals);
const applyLabelTextureQuality = (textures: LabelTextures) => {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  textures.sideA.anisotropy = anisotropy;
  textures.sideB.anisotropy = anisotropy;
};
applyLabelTextureQuality(labelTextures);

let labelOptions: LabelApplicationOptions = {
  scale: 1,
  padding: 0,
  offsetX: 0,
  offsetY: 0,
};

// const RAD2DEG = 180 / Math.PI;

const heroGroup = new Group();
scene.add(heroGroup);

const MIN_ZOOM = 0.7;
const MAX_ZOOM = 5;
let zoomFactor = 1.8;
cameraRig.setZoomFactor(zoomFactor);

// const cameraInfoDisplay = createCameraInfoDisplay();
// root.appendChild(cameraInfoDisplay.container);

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.08 : -0.08;
    zoomFactor = clampValue(zoomFactor + delta, MIN_ZOOM, MAX_ZOOM);
    cameraRig.setZoomFactor(zoomFactor);
  },
  { passive: false },
);

let vinylModel: Object3D | null = null;
const cameraOrbitState = {
  isOrbiting: false,
  pointerId: -1,
  lastX: 0,
  lastY: 0,
};
const CAMERA_ORBIT_SENSITIVITY = 0.0045;

const cameraPanState = {
  isPanning: false,
  pointerId: -1,
  lastX: 0,
  lastY: 0,
};

const raycaster = new Raycaster();
const pointerNDC = new Vector2();
const dragPlane = new Plane(new Vector3(0, 0, 1), 0);
const dragIntersectPoint = new Vector3();
const vinylAnimationState = createVinylAnimationState();
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
const platterSampleOffset = new Vector3(8, 0, 0);
const centerSampleOffset = new Vector3();
const platterSampleWorld = new Vector3();
const turntableWorldPos = new Vector3();
const turntableWorldQuat = new Quaternion();
let turntableController: TurntableController | null = null;
function rebuildLabelTextures() {
  labelTextures.sideA.dispose();
  labelTextures.sideB.dispose();
  labelTextures = createLabelTextures(labelVisuals);
  applyLabelTextureQuality(labelTextures);
  if (vinylModel) {
    applyLabelTextures(vinylModel, labelTextures, labelOptions, labelVisuals);
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

// Listen for song clicks from the viewer
window.addEventListener("load-vinyl-song", async (event: any) => {
  const { videoId, artistName, songName, aspectRatio } = event.detail;

  // Reset the fade-out flag for the new video
  hasStartedFadeOut = false;

  // Reset turntable state when new video loads
  if (turntableController) {
    turntableController.resetState();
  }

  // Randomize vinyl rotation on song load
  if (vinylModel) {
    const randomRotation = Math.random() * Math.PI * 2;
    vinylReturnBaseTwist = randomRotation;
  }

  // Apply aspect ratio if provided
  if (aspectRatio !== undefined) {
    const { setVideoAspectRatio } = await import("./youtube");
    setVideoAspectRatio(aspectRatio);
    console.log(`[main] Applied aspect ratio: ${aspectRatio}`);
  }

  // Load the video with corrected metadata from library
  await youtubePlayer.loadVideo(videoId, (videoMetadata) => {
    // Use corrected artist and song names from library instead of YouTube metadata
    const correctedMetadata: VideoMetadata = {
      artist: artistName,
      song: songName,
      album: videoMetadata?.album || "",
    };
    applyMetadataToLabels(correctedMetadata, true);
  });

  // Extract dominant color from thumbnail and update labels
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  try {
    const dominantColor = await extractDominantColor(thumbnailUrl);
    labelVisuals.background = dominantColor;
  } catch (error) {
    console.warn("Failed to extract dominant color, using fallback");
    labelVisuals.background = "#1a1a1a";
  }

  rebuildLabelTextures();

  // Apply updated textures to vinyl if it's loaded
  if (vinylModel) {
    applyLabelTextures(vinylModel, labelTextures, labelOptions, labelVisuals);
  }

  // Update turntable controller with new duration
  const duration = youtubePlayer.getDuration();
  if (duration > 1 && turntableController) {
    turntableController.setMediaDuration(duration);
  }

  // Update the timeline display with new duration
  videoControls.setProgress(0, duration);

  // Don't show player controls immediately when clicking an album
  // Controls will only show when tonearm enters play area
  const isPlayerCollapsed = yt.isPlayerCollapsed();

  // Auto-play briefly to show first frame instead of thumbnail (muted)
  yt.setVolume(0);
  yt.play();
  setTimeout(() => {
    yt.pause();
    yt.seek(0);
    yt.setVolume(100);
  }, 300);

  console.log(`Loaded from viewer: ${artistName} - ${songName}`);
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
  } else {
    vinylViewerContainer.style.opacity = "1";
    vinylViewerContainer.style.pointerEvents = "auto";
    hideLibraryBtn.style.opacity = "1";
    hideLibraryBtn.style.pointerEvents = "auto";
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
// tonearm drag handled by controller
let ON_TURNTABLE = true;
function setVinylOnTurntable(onTurntable: boolean) {
  if (ON_TURNTABLE === onTurntable) {
    return;
  }
  ON_TURNTABLE = onTurntable;
  turntableController?.setVinylPresence(onTurntable);
  if (!onTurntable) {
    turntableController?.liftNeedle();
  }
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
  // Check if user is typing in an input or textarea
  const target = event.target as HTMLElement;
  const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

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
  if (!vinylModel || !updatePointerFromEvent(event)) {
    return;
  }
  raycaster.setFromCamera(pointerNDC, camera);
  const vinylHit = raycaster.intersectObject(vinylModel, true);
  if (!vinylHit.length) {
    return;
  }
  const hit = raycaster.ray.intersectPlane(dragPlane, dragIntersectPoint);
  if (!hit) {
    return;
  }
  vinylDragPointerId = event.pointerId;
  isReturningVinyl = false;
  hasClearedNub = false;
  setVinylOnTurntable(false);
  currentPointerWorld.copy(hit);
  pointerAttachmentOffset.copy(vinylModel.position).sub(hit);
  vinylTargetPosition.copy(vinylModel.position);
  lastTargetPosition.copy(vinylModel.position);
  swingState.targetX = 0;
  swingState.targetZ = 0;
  canvas.setPointerCapture(event.pointerId);
});

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

  vinylDragPointerId = null;
  pointerAttachmentOffset.copy(hangOffset);
  currentPointerWorld.copy(vinylAnchorPosition);
  if (vinylModel) {
    vinylTargetPosition.copy(vinylModel.position);
    lastTargetPosition.copy(vinylModel.position);
  } else {
    vinylTargetPosition.copy(vinylAnchorPosition);
    lastTargetPosition.copy(vinylAnchorPosition);
  }
  isReturningVinyl = true;
  hasClearedNub = false;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // ignore if pointer was already released
  }

  swingState.targetX = 0;
  swingState.targetZ = 0;
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

Promise.all([loadTurntableModel(), loadVinylModel(vinylNormalTexture)])
  .then(([turntable, vinyl]) => {
    vinylModel = vinyl;
    // references not needed; controller handles rotation
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
        yt.seek(seconds);
        videoControls.setProgress(
          seconds,
          youtubePlayer.getDuration() || yt.getDuration(),
        );
      },
      onPlay: () => yt.play(),
      onPause: () => yt.pause(),
      onRateChange: (rate) => yt.setRate(rate),
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
    logMaterialNames(vinyl);

    applyLabelTextures(vinyl, labelTextures, labelOptions, labelVisuals);
    positionVinylOnTurntable(vinyl, turntable);

    heroGroup.add(turntable);
    heroGroup.add(vinyl);

    cameraRig.frameObject(heroGroup, 2.6);

    // Store the actual default camera target (bounding box center)
    defaultCameraTarget.copy(cameraRig.getTarget());

    // Initialize camera positions (will be set by updateCameraTargetsForWindowSize)
    updateCameraTargetsForWindowSize();

    vinylUserRotation = 0;
  })
  .catch((error) => {
    console.error("Failed to load hero models", error);
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
    defaultCameraTarget.x,
    defaultCameraTarget.y + verticalPan,
    defaultCameraTarget.z,
  );

  CAMERA_TARGETS["bottom-left"].set(
    defaultCameraTarget.x + leftwardPan,
    defaultCameraTarget.y + verticalPan,
    defaultCameraTarget.z,
  );
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
      onTurntable: ON_TURNTABLE,
    });
    isReturningVinyl = vinylAnimationResult.isReturningVinyl;
    hasClearedNub = vinylAnimationResult.hasClearedNub;
    vinylReturnBaseTwist = vinylAnimationResult.vinylReturnBaseTwist;
    vinylReturnTwist = vinylAnimationResult.vinylReturnTwist;
    vinylReturnTwistTarget = vinylAnimationResult.vinylReturnTwistTarget;
    if (vinylAnimationResult.returnedToPlatter) {
      setVinylOnTurntable(true);
    }
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
    const tonearmNowInPlayArea =
      turntableController?.isTonearmInPlayArea() ?? false;
    if (tonearmNowInPlayArea && !isTonearmInPlayArea) {
      // Tonearm just entered play area - show player (if not manually collapsed)
      isTonearmInPlayArea = true;
      if (!yt.isPlayerCollapsed() && youtubePlayer.getDuration() > 0) {
        yt.setControlsVisible(true);
        // Animate viewport back in using the current video's aspect ratio
        const targetHeight = 512 / yt.getAspectRatio();
        const viewport = root.querySelector(
          ".yt-player-viewport",
        ) as HTMLElement;
        if (viewport) {
          viewport.style.height = `${targetHeight}px`;
        }
      }
    } else if (!tonearmNowInPlayArea && isTonearmInPlayArea) {
      // Tonearm just left play area - hide player (unless we're in the last 2 seconds)
      const timeRemaining = youtubePlayer.getDuration() - yt.getCurrentTime();
      if (timeRemaining > 2) {
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
  if (ON_TURNTABLE) {
    vinylSpinAngle += angularStep;
  }

  renderer.render(scene, camera);
  window.PLAYING_SOUND = turntableController?.isPlaying() ?? false;
  updateVideoProgress();
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

function positionVinylOnTurntable(vinyl: Object3D, turntable: Object3D) {
  const vinylBox = new Box3().setFromObject(vinyl);

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

  const supportY = sampleHeight(platterSampleOffset);
  const nubTopY = sampleHeight(centerSampleOffset);
  nubClearanceY = nubTopY + RETURN_CLEARANCE;

  const lift = supportY + 0.002 - vinylBox.min.y;
  const alignedPosition = new Vector3().copy(turntable.position);
  alignedPosition.y += lift;

  vinyl.position.copy(alignedPosition);
  vinylAnchorPosition.copy(alignedPosition);
  vinylTargetPosition.copy(alignedPosition);
  lastTargetPosition.copy(alignedPosition);
  currentPointerWorld.copy(alignedPosition);
  pointerAttachmentOffset.copy(hangOffset);
  swingState.currentX = 0;
  swingState.currentZ = 0;
  swingState.targetX = 0;
  swingState.targetZ = 0;
  setVinylOnTurntable(true);
  updateDragPlaneDepth(alignedPosition.z);
}

function pickPointOnPlane(event: PointerEvent) {
  if (!updatePointerFromEvent(event)) {
    return null;
  }

  raycaster.setFromCamera(pointerNDC, camera);
  const hit = raycaster.ray.intersectPlane(dragPlane, dragIntersectPoint);
  if (!hit) {
    return null;
  }
  return dragIntersectPoint;
}

function updatePointerFromEvent(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  return true;
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
  const PAN_SENSITIVITY = 0.08;
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

  const vinylLibraryWidget = new EnhancedVinylLibraryWidget({
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
  } catch (error) {
    console.error("✗ Failed to initialize vinyl library viewer:", error);
  }
})();
