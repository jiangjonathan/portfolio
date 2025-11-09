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
  type LabelApplicationOptions,
} from "./labels";
import { loadTurntableModel, TurntableController } from "./turntable";
import { CameraRig } from "./cameraRig";
import {
  createCameraInfoDisplay,
  createTonearmRotationDisplay,
  createVinylRotationControls,
  createZoomControls,
} from "./ui";
// media helpers used by controller
import { clampValue } from "./utils";

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

const canvas = document.createElement("canvas");
canvas.id = "vinyl-viewer";
root.appendChild(canvas);

const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new Scene();
scene.background = new Color("#f7f7f2");

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

const labelVisuals = {
  background: "#f6e2f1",
  gradientInner: "#fefefe",
  gradientOuter: "#dcdcdc",
  fontFamily: '"Space Grotesk", "Inter", sans-serif',
  accent: "#202022",
};
const labelTextures = createLabelTextures(labelVisuals);
labelTextures.sideA.anisotropy = renderer.capabilities.getMaxAnisotropy();
labelTextures.sideB.anisotropy = renderer.capabilities.getMaxAnisotropy();

let labelOptions: LabelApplicationOptions = {
  scale: 1,
  padding: 0,
  offsetX: 0,
  offsetY: 0,
};

const RAD2DEG = 180 / Math.PI;

const heroGroup = new Group();
scene.add(heroGroup);

const zoomControls = createZoomControls();
root.appendChild(zoomControls.container);
cameraRig.setZoomFactor(parseFloat(zoomControls.slider.value));

const tonearmRotationDisplay = createTonearmRotationDisplay();
root.appendChild(tonearmRotationDisplay.container);
const cameraInfoDisplay = createCameraInfoDisplay();
root.appendChild(cameraInfoDisplay.container);

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.08 : -0.08;
    const slider = zoomControls.slider;
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const nextValue = clampValue(parseFloat(slider.value) + delta, min, max);
    slider.value = nextValue.toFixed(2);
    cameraRig.setZoomFactor(nextValue);
  },
  { passive: false },
);

const vinylRotationControls = createVinylRotationControls(
  setVinylRotationDegrees,
);
root.appendChild(vinylRotationControls.container);

let vinylModel: Object3D | null = null;
const vinylAnchorPosition = new Vector3();
const vinylTargetPosition = new Vector3();
const lastTargetPosition = new Vector3();
const currentPointerWorld = new Vector3();
const pointerAttachmentOffset = new Vector3();
const hangOffset = new Vector3(0, -0.08, 0);
const relativeOffset = new Vector3();
const desiredPosition = new Vector3();
const swingState = {
  targetX: 0,
  targetZ: 0,
  currentX: 0,
  currentZ: 0,
};
const cameraOrbitState = {
  isOrbiting: false,
  pointerId: -1,
  lastX: 0,
  lastY: 0,
};
const CAMERA_ORBIT_SENSITIVITY = 0.0045;
const raycaster = new Raycaster();
const pointerNDC = new Vector2();
const dragPlane = new Plane(new Vector3(0, 0, 1), 0);
const dragIntersectPoint = new Vector3();
const tempVelocity = new Vector3();
const placementRaycaster = new Raycaster();
const placementRayOrigin = new Vector3();
const placementRayDirection = new Vector3(0, -1, 0);
const platterSampleOffset = new Vector3(8, 0, 0);
const centerSampleOffset = new Vector3();
const platterSampleWorld = new Vector3();
const turntableWorldPos = new Vector3();
const turntableWorldQuat = new Quaternion();
let turntableController: TurntableController | null = null;
const MAX_DRAG_RADIUS = 100;
const SWING_DAMPING = 0.18;
const SWING_MAX_TILT = 0.35;
const SWING_VELOCITY_FACTOR = 16;
const STRING_RELAX_RATE = 0.08;
const POSITION_LERP = 0.22;
const RETURN_CLEARANCE = 0.05;
const RETURN_HORIZONTAL_EPS = 0.01;
const RETURN_VERTICAL_EPS = 0.0005;
const RETURN_DROP_RATE = 0.05;
const RETURN_APPROACH_RATE = 0.15;
let isDraggingVinyl = false;
let isReturningVinyl = false;
let hasClearedNub = false;
let nubClearanceY = 0;
// tonearm drag handled by controller
let ON_TURNTABLE = true;
let vinylSpinAngle = 0;
let vinylUserRotation = 0;
let lastTime = performance.now();
let fpsSmoothed = 60;
let fpsUpdateTimer = 0;
let PLAYING_SOUND = false;
window.PLAYING_SOUND = PLAYING_SOUND;
let tonearmPlayTime = 0;
// Vinyl twist that plays during the return-drop animation
let vinylReturnTwist = 0;
let vinylReturnTwistTarget = 0;
let vinylReturnBaseTwist = 0;
const VINYL_RETURN_FINAL_TWIST = (75 * Math.PI) / 180;
const VINYL_RETURN_TWIST_LERP = 0.14;
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

canvas.addEventListener("pointerdown", (event) => {
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
  isDraggingVinyl = true;
  isReturningVinyl = false;
  hasClearedNub = false;
  ON_TURNTABLE = false;
  currentPointerWorld.copy(hit);
  pointerAttachmentOffset.copy(vinylModel.position).sub(hit);
  vinylTargetPosition.copy(vinylModel.position);
  lastTargetPosition.copy(vinylModel.position);
  swingState.targetX = 0;
  swingState.targetZ = 0;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (handleCameraOrbitMove(event)) {
    return;
  }
  if (turntableController && turntableController.handlePointerMove(event)) {
    return;
  }
  if (!isDraggingVinyl || !vinylModel) {
    return;
  }
  const hit = pickPointOnPlane(event);
  if (!hit) {
    return;
  }
  currentPointerWorld.copy(hit);
});

const endDrag = (event: PointerEvent) => {
  if (!isDraggingVinyl) {
    return;
  }

  isDraggingVinyl = false;
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

Promise.all([loadTurntableModel(), loadVinylModel(vinylNormalTexture)])
  .then(([turntable, vinyl]) => {
    vinylModel = vinyl;
    // references not needed; controller handles rotation
    const cartridge = findObjectByName(turntable.getObjectByName("Mount") ?? null, "Cartridge");
    if (cartridge) {
      applyCartridgeColor(cartridge);
    }
    turntableController = new TurntableController(turntable, {
      camera,
      canvas,
      getZoomFactor: () => cameraRig.getZoomFactor(),
      onScrub: (seconds) => notifyMediaScrub(seconds),
    });
    logMaterialNames(turntable);
    logMaterialNames(vinyl);

    applyLabelTextures(vinyl, labelTextures, labelOptions, labelVisuals);
    positionVinylOnTurntable(vinyl, turntable);

    heroGroup.add(turntable);
    heroGroup.add(vinyl);

    cameraRig.frameObject(heroGroup, 2.6);
    vinylRotationControls.setEnabled(true);
    vinylRotationControls.setValue(0);
    setVinylRotationDegrees(0);
  })
  .catch((error) => {
    console.error("Failed to load hero models", error);
  });

const setSize = () => {
  const width = root.clientWidth || window.innerWidth;
  const height = root.clientHeight || window.innerHeight;

  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  cameraRig.handleResize(width, height);
};

window.addEventListener("resize", setSize);
setSize();

const animate = (time: number) => {
  requestAnimationFrame(animate);
  const delta = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  tonearmPlayTime += delta;
  // const isTonearmPlaying = turntableController?.isPlaying() ?? false;

  if (vinylModel) {
    if (isDraggingVinyl) {
      pointerAttachmentOffset.lerp(hangOffset, STRING_RELAX_RATE);
      desiredPosition.copy(currentPointerWorld).add(pointerAttachmentOffset);

      relativeOffset.copy(desiredPosition).sub(vinylAnchorPosition);
      const planarDistance = Math.hypot(relativeOffset.x, relativeOffset.y);
      if (planarDistance > MAX_DRAG_RADIUS) {
        const clampScale = MAX_DRAG_RADIUS / planarDistance;
        relativeOffset.x *= clampScale;
        relativeOffset.y *= clampScale;
      }

      vinylTargetPosition.copy(vinylAnchorPosition).add(relativeOffset);
      vinylTargetPosition.z = vinylAnchorPosition.z;

      tempVelocity.copy(vinylTargetPosition).sub(lastTargetPosition);
      lastTargetPosition.copy(vinylTargetPosition);

      swingState.targetX = clampValue(
        tempVelocity.y * SWING_VELOCITY_FACTOR,
        -SWING_MAX_TILT,
        SWING_MAX_TILT,
      );
      swingState.targetZ = clampValue(
        -tempVelocity.x * SWING_VELOCITY_FACTOR,
        -SWING_MAX_TILT,
        SWING_MAX_TILT,
      );
    } else {
      const horizontalDelta = vinylAnchorPosition.x - vinylTargetPosition.x;
      vinylTargetPosition.x += horizontalDelta * RETURN_APPROACH_RATE;
      vinylTargetPosition.z = vinylAnchorPosition.z;

      if (isReturningVinyl) {
        if (!hasClearedNub) {
          const targetLift =
            nubClearanceY || vinylAnchorPosition.y + RETURN_CLEARANCE;
          vinylTargetPosition.y +=
            (targetLift - vinylTargetPosition.y) * RETURN_APPROACH_RATE;
          if (Math.abs(horizontalDelta) < RETURN_HORIZONTAL_EPS) {
            hasClearedNub = true;
          }
        } else {
          vinylTargetPosition.y +=
            (vinylAnchorPosition.y - vinylTargetPosition.y) * RETURN_DROP_RATE;
          const closeHorizontally =
            Math.abs(horizontalDelta) < RETURN_HORIZONTAL_EPS;
          // During the drop phase, twist the vinyl toward the default 75° offset
          vinylReturnTwistTarget =
            VINYL_RETURN_FINAL_TWIST - vinylReturnBaseTwist;
          if (
            closeHorizontally &&
            Math.abs(vinylTargetPosition.y - vinylAnchorPosition.y) <
              RETURN_VERTICAL_EPS
          ) {
            isReturningVinyl = false;
            hasClearedNub = false;
            vinylTargetPosition.copy(vinylAnchorPosition);
            ON_TURNTABLE = true;
            // Commit the twist and reset the animated component
            vinylReturnBaseTwist = VINYL_RETURN_FINAL_TWIST;
            vinylReturnTwist = 0;
            vinylReturnTwistTarget = 0;
          }
        }
      } else {
        vinylTargetPosition.y +=
          (vinylAnchorPosition.y - vinylTargetPosition.y) * RETURN_DROP_RATE;
        // Not returning: ease twist back to zero offset
        vinylReturnTwistTarget = 0;
      }

      lastTargetPosition.copy(vinylTargetPosition);
      swingState.targetX = 0;
      swingState.targetZ = 0;
    }

    vinylModel.position.lerp(vinylTargetPosition, POSITION_LERP);
    swingState.currentX +=
      (swingState.targetX - swingState.currentX) * SWING_DAMPING;
    swingState.currentZ +=
      (swingState.targetZ - swingState.currentZ) * SWING_DAMPING;
    vinylModel.rotation.x = swingState.currentX;
    vinylModel.rotation.z = swingState.currentZ;
    // update vinyl twist easing
    vinylReturnTwist +=
      (vinylReturnTwistTarget - vinylReturnTwist) * VINYL_RETURN_TWIST_LERP;
    vinylModel.rotation.y =
      vinylUserRotation +
      vinylSpinAngle +
      vinylReturnBaseTwist +
      vinylReturnTwist;
  }

  // Controller updates tonearm + platter/pulley
  turntableController?.update(delta);
  tonearmRotationDisplay.setValue(
    turntableController?.getTonearmYawDegrees() ?? null,
  );
  const cameraAngles = cameraRig.getOrbitAngles();
  cameraInfoDisplay.setValue(
    cameraAngles.azimuth * RAD2DEG,
    cameraAngles.polar * RAD2DEG,
  );

  const angularStep = turntableController?.getAngularStep() ?? 0;
  if (ON_TURNTABLE) vinylSpinAngle += angularStep;

  // Update FPS counter (smoothed)
  const currentFps = delta > 0 ? 1 / delta : 0;
  fpsSmoothed += (currentFps - fpsSmoothed) * 0.05;
  fpsUpdateTimer += delta;
  if (fpsUpdateTimer > 0.25) {
    zoomControls.fps.textContent = `${Math.round(fpsSmoothed)} fps`;
    fpsUpdateTimer = 0;
  }

  renderer.render(scene, camera);
  window.PLAYING_SOUND = PLAYING_SOUND;
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
  ON_TURNTABLE = true;
  updateDragPlaneDepth(alignedPosition.z);
}

function setVinylRotationDegrees(value: number) {
  const clamped = clampValue(value, -180, 180);
  vinylUserRotation = (clamped * Math.PI) / 180;
  vinylRotationControls.setValue(clamped);
  applyVinylRotation();
}

function applyVinylRotation() {
  if (!vinylModel) {
    return;
  }
  vinylModel.rotation.y =
    vinylUserRotation +
    vinylSpinAngle +
    vinylReturnBaseTwist +
    vinylReturnTwist;
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

function notifyMediaScrub(_time: number) {
  // Placeholder for integrating with external media/video playback.
}

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
