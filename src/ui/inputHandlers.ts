import { Vector2 } from "three";
import type { Camera, Object3D, Raycaster, Vector3 } from "three";
import type { ScenePage } from "../camera/pageNavigation";
import type { CameraRig } from "../camera/cameraRig";
import type { VinylSource } from "../vinyl/vinylInteractions";
import type { FreeLookTutorialAction } from "../turntable/freeLookTutorial";

type InputHandlersDeps = {
  canvas: HTMLCanvasElement;
  camera: Camera;
  cameraRig: CameraRig;
  raycaster: Raycaster;
  pointerNDC: Vector2;
  cameraForward: Vector3;
  dragPlane: any;
  dragIntersectPoint: Vector3;
  updatePointer: (
    event: MouseEvent | PointerEvent | WheelEvent,
    pointer: Vector2,
    canvas: HTMLCanvasElement,
  ) => boolean;
  getActivePage: () => ScenePage;
  isPageTransitionActive: () => boolean;
  isFreeLookModeActive: () => boolean;
  updateBusinessCardMousePosition: (x: number, y: number) => void;
  setBusinessCardContactHighlight: (value: any) => void;
  findBusinessCardLinkUnderRay: () => any;
  updateBusinessCardHoverState: () => void;
  getBusinessCardRoot: () => Object3D | null;
  setBusinessCardHovered: (value: boolean) => void;
  handleBusinessCardRotationMove: (event: PointerEvent) => boolean;
  startBusinessCardRotation: () => void;
  endBusinessCardRotation: (event: PointerEvent) => void;
  handleBusinessCardLinkClick: () => boolean;
  heroGroup: Object3D;
  homePageTargets: Array<{ model: Object3D; page: ScenePage }>;
  findPageForObject: (object: Object3D, targets: any) => ScenePage | null;
  openPortfolioPage: () => void;
  setActiveScenePage: (page: ScenePage) => void;
  portfolioInteractions: {
    handleHover: (event: MouseEvent, raycaster: Raycaster) => boolean;
    handlePointerDown: (event: PointerEvent, raycaster: Raycaster) => boolean;
    handlePointerMove: (event: PointerEvent, raycaster: Raycaster) => boolean;
    handlePointerUp: () => void;
    handleWheel: (event: WheelEvent, raycaster: Raycaster) => boolean;
  };
  BUSINESS_CARD_PAGE: ScenePage;
  getTurntableController: () => any;
  yt: any;
  getTurntablePositionState: () => string;
  onFullscreenTurntableHoverChange: (hovered: boolean) => void;
  pickVinylUnderPointer: () => {
    source: VinylSource;
    model: Object3D;
  } | null;
  getVinylModel: () => Object3D | null;
  getFocusVinylState: () => any;
  getTurntableVinylState: () => any;
  resetVinylAnimationState: (anchor: Vector3, source: VinylSource) => void;
  getFocusCardAnchorPosition: () => Vector3;
  getTurntableAnchorPosition: () => Vector3;
  getVisualOffsetForSource: (source: VinylSource | null) => number;
  setActiveVinylSource: (source: VinylSource) => void;
  getActiveVinylSource: () => VinylSource | null;
  setPendingPromotionSource: (
    value: VinylSource | null,
    reason: string,
  ) => void;
  setVinylAnchorPosition: (anchor: Vector3, source: VinylSource) => void;
  clearTurntableVinylPreservingPromotion: () => void;
  disposeDroppingVinyl: () => void;
  startTurntableVinylFlyaway: () => void;
  getVinylDragThreshold: () => number;
  getVinylDisplayPosition: () => Vector3;
  getCurrentPointerWorld: () => Vector3;
  getPointerAttachmentOffset: () => Vector3;
  getHangOffset: () => Vector3;
  getVinylTargetPosition: () => Vector3;
  getLastTargetPosition: () => Vector3;
  getSwingState: () => { targetX: number; targetZ: number };
  setVinylDragPointerId: (value: number | null) => void;
  getVinylDragPointerId: () => number | null;
  setCurrentDragSource: (value: VinylSource | null) => void;
  getCurrentDragSource: () => VinylSource | null;
  setActiveDragVisualOffset: (value: number) => void;
  getActiveDragVisualOffset: () => number;
  setIsReturningVinyl: (value: boolean) => void;
  getIsReturningVinyl: () => boolean;
  setIsReturningToFocusCard: (value: boolean) => void;
  getIsReturningToFocusCard: () => boolean;
  setHasClearedNub: (value: boolean) => void;
  setVinylDragExceededThreshold: (value: boolean) => void;
  getVinylDragExceededThreshold: () => boolean;
  getShouldTrackFocusCard: () => boolean;
  setMouseInactivityTimer: (value: number | null) => void;
  getMouseInactivityTimer: () => number | null;
  notifyFreeLookAction: (action: FreeLookTutorialAction) => void;
  CAMERA_ORBIT_SENSITIVITY: number;
  PAN_SENSITIVITY: number;
  FREE_LOOK_MIN_ZOOM: number;
};

type CameraOrbitState = {
  isOrbiting: boolean;
  pointerId: number;
  lastX: number;
  lastY: number;
  velocityX: number;
  velocityY: number;
  lastDeltaX: number;
  lastDeltaY: number;
  isAutoOrbiting: boolean;
  isHoveringModel: boolean;
  mode: ScenePage | null;
};

type CameraPanState = {
  isPanning: boolean;
  pointerId: number;
  lastX: number;
  lastY: number;
};

const MOMENTUM_FRICTION = 0.94;
const MOMENTUM_MIN_VELOCITY = 0.001;
const AUTO_ORBIT_SPEED = 0.001;
const AUTO_ORBIT_DECEL_RATE = 0.967;

export const registerInputHandlers = (deps: InputHandlersDeps) => {
  const cameraOrbitState: CameraOrbitState = {
    isOrbiting: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
    velocityX: 0,
    velocityY: 0,
    lastDeltaX: 0,
    lastDeltaY: 0,
    isAutoOrbiting: false,
    isHoveringModel: false,
    mode: null,
  };
  const cameraPanState: CameraPanState = {
    isPanning: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
  };
  const vinylDragStartScreen = new Vector2();
  let vinylDragHasMoved = false;
  const VINYL_DRAG_RESET_THRESHOLD = 4;
  let isCameraOrbitDecelerating = false;
  let autoOrbitStartTime = 0;
  let autoOrbitDirection = 1;
  let autoOrbitSpeedMultiplier = 1.0;
  let isTurntableHovered = false;
  let isSpacePressed = false;

  const startAutoOrbit = () => {
    cameraOrbitState.isAutoOrbiting = true;
    autoOrbitSpeedMultiplier = 1.0;
    if (autoOrbitStartTime === 0) {
      autoOrbitStartTime = performance.now();
    }
  };

  const updateAutoOrbit = () => {
    if (!cameraOrbitState.isAutoOrbiting) {
      return;
    }
    if (cameraOrbitState.isOrbiting) {
      return;
    }
    if (deps.isPageTransitionActive()) {
      return;
    }
    if (deps.getActivePage() !== "home") {
      return;
    }

    if (cameraOrbitState.isHoveringModel) {
      autoOrbitSpeedMultiplier *= AUTO_ORBIT_DECEL_RATE;
      if (autoOrbitSpeedMultiplier < 0.01) {
        autoOrbitSpeedMultiplier = 0;
      }
    } else {
      autoOrbitSpeedMultiplier += (1.0 - autoOrbitSpeedMultiplier) * 0.08;
      if (autoOrbitSpeedMultiplier > 0.99) {
        autoOrbitSpeedMultiplier = 1.0;
      }
    }

    const autoOrbitSpeed =
      AUTO_ORBIT_SPEED * autoOrbitDirection * autoOrbitSpeedMultiplier;
    deps.cameraRig.orbit(autoOrbitSpeed, 0);
  };

  const startCameraOrbitMomentum = () => {
    if (isCameraOrbitDecelerating) {
      return;
    }
    if (
      Math.abs(cameraOrbitState.velocityX) < MOMENTUM_MIN_VELOCITY &&
      Math.abs(cameraOrbitState.velocityY) < MOMENTUM_MIN_VELOCITY
    ) {
      return;
    }
    isCameraOrbitDecelerating = true;

    const decelerate = () => {
      cameraOrbitState.velocityX *= MOMENTUM_FRICTION;
      cameraOrbitState.velocityY *= MOMENTUM_FRICTION;

      if (
        Math.abs(cameraOrbitState.velocityX) < MOMENTUM_MIN_VELOCITY &&
        Math.abs(cameraOrbitState.velocityY) < MOMENTUM_MIN_VELOCITY
      ) {
        isCameraOrbitDecelerating = false;
        cameraOrbitState.velocityX = 0;
        cameraOrbitState.velocityY = 0;
        return;
      }

      deps.cameraRig.orbit(cameraOrbitState.velocityX, 0);
      requestAnimationFrame(decelerate);
    };

    requestAnimationFrame(decelerate);
  };

  const startCameraOrbit = (event: PointerEvent) => {
    if (
      (deps.getActivePage() !== "turntable" &&
        deps.getActivePage() !== "home") ||
      deps.isPageTransitionActive()
    ) {
      return;
    }
    cameraOrbitState.isOrbiting = true;
    cameraOrbitState.pointerId = event.pointerId;
    cameraOrbitState.lastX = event.clientX;
    cameraOrbitState.lastY = event.clientY;
    cameraOrbitState.mode = deps.getActivePage();

    if (deps.getActivePage() === "turntable" && !deps.isFreeLookModeActive()) {
      deps.cameraRig.saveRotationState();
    }

    if (deps.isFreeLookModeActive()) {
      deps.notifyFreeLookAction("rotate");
    }

    deps.canvas.setPointerCapture(event.pointerId);
  };

  const handleCameraOrbitMove = (event: PointerEvent) => {
    if (
      (deps.getActivePage() !== "turntable" &&
        deps.getActivePage() !== "home") ||
      deps.isPageTransitionActive() ||
      !cameraOrbitState.isOrbiting ||
      event.pointerId !== cameraOrbitState.pointerId
    ) {
      return false;
    }
    const deltaX = event.clientX - cameraOrbitState.lastX;
    const deltaY = event.clientY - cameraOrbitState.lastY;
    cameraOrbitState.lastX = event.clientX;
    cameraOrbitState.lastY = event.clientY;

    cameraOrbitState.velocityX = deltaX * deps.CAMERA_ORBIT_SENSITIVITY;
    cameraOrbitState.velocityY = deltaY * deps.CAMERA_ORBIT_SENSITIVITY;
    cameraOrbitState.lastDeltaX = deltaX;
    cameraOrbitState.lastDeltaY = deltaY;

    if (cameraOrbitState.mode === "home" && Math.abs(deltaX) > 0.5) {
      autoOrbitDirection = deltaX > 0 ? 1 : -1;
      autoOrbitSpeedMultiplier = 1.0;
    }

    const allowPolar = cameraOrbitState.mode === "turntable";
    deps.cameraRig.orbit(
      deltaX * deps.CAMERA_ORBIT_SENSITIVITY,
      allowPolar ? deltaY * deps.CAMERA_ORBIT_SENSITIVITY : 0,
    );
    return true;
  };

  const endCameraOrbit = (event: PointerEvent) => {
    if (
      !cameraOrbitState.isOrbiting ||
      event.pointerId !== cameraOrbitState.pointerId
    ) {
      return;
    }
    cameraOrbitState.isOrbiting = false;
    cameraOrbitState.pointerId = -1;

    if (cameraOrbitState.mode === "turntable" && !deps.isFreeLookModeActive()) {
      deps.cameraRig.restoreRotationState();
    } else if (cameraOrbitState.mode === "home") {
      if (Math.abs(cameraOrbitState.velocityX) > 0.0001) {
        autoOrbitDirection = cameraOrbitState.velocityX > 0 ? 1 : -1;
      }
      startCameraOrbitMomentum();
    }

    cameraOrbitState.mode = null;

    try {
      deps.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignore fallback
    }
  };

  const startCameraPan = (event: PointerEvent) => {
    if (
      deps.getActivePage() !== "turntable" ||
      deps.isPageTransitionActive() ||
      !deps.isFreeLookModeActive()
    ) {
      return;
    }
    cameraPanState.isPanning = true;
    cameraPanState.pointerId = event.pointerId;
    cameraPanState.lastX = event.clientX;
    cameraPanState.lastY = event.clientY;
    if (deps.isFreeLookModeActive()) {
      deps.notifyFreeLookAction("pan");
    }
    deps.canvas.setPointerCapture(event.pointerId);
  };

  const handleCameraPanMove = (event: PointerEvent) => {
    if (
      deps.getActivePage() !== "turntable" ||
      deps.isPageTransitionActive() ||
      !deps.isFreeLookModeActive() ||
      !cameraPanState.isPanning ||
      event.pointerId !== cameraPanState.pointerId
    ) {
      return false;
    }
    const deltaX = event.clientX - cameraPanState.lastX;
    const deltaY = event.clientY - cameraPanState.lastY;
    cameraPanState.lastX = event.clientX;
    cameraPanState.lastY = event.clientY;

    const zoomScale = 1 / deps.cameraRig.getZoomFactor();
    deps.cameraRig.pan(
      -deltaX * deps.PAN_SENSITIVITY * zoomScale,
      deltaY * deps.PAN_SENSITIVITY * zoomScale,
    );
    return true;
  };

  const endCameraPan = (event: PointerEvent) => {
    if (
      !cameraPanState.isPanning ||
      event.pointerId !== cameraPanState.pointerId
    ) {
      return;
    }
    cameraPanState.isPanning = false;
    cameraPanState.pointerId = -1;
    try {
      deps.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignore fallback
    }
  };

  document.addEventListener("mousemove", (event) => {
    const isVinylDragging = deps.getVinylDragPointerId() !== null;
    const isTonearmDragging =
      deps.getTurntableController()?.getIsDraggingTonearm?.() ?? false;
    if (isVinylDragging || isTonearmDragging) {
      deps.canvas.style.cursor = "grabbing";
      return;
    }
    const x = event.clientX / window.innerWidth;
    const y = event.clientY / window.innerHeight;
    deps.updateBusinessCardMousePosition(x, y);

    const raycaster = deps.raycaster;
    const pointer = new Vector2();
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, deps.camera);

    if (deps.getActivePage() === "home") {
      let isHoveringAnyModel = false;
      for (const { model } of deps.homePageTargets) {
        const intersects = raycaster.intersectObject(model, true);
        if (intersects.length > 0) {
          isHoveringAnyModel = true;
          break;
        }
      }
      cameraOrbitState.isHoveringModel = isHoveringAnyModel;
    } else {
      cameraOrbitState.isHoveringModel = false;
    }

    if (deps.getActivePage() === deps.BUSINESS_CARD_PAGE) {
      const root = deps.getBusinessCardRoot();
      if (root) {
        const intersects = raycaster.intersectObject(root, true);
        deps.setBusinessCardHovered(intersects.length > 0);
      } else {
        deps.setBusinessCardHovered(false);
      }
    } else {
      deps.setBusinessCardHovered(false);
    }

    const handledPortfolioHover = deps.portfolioInteractions.handleHover(
      event,
      raycaster,
    );
    if (!handledPortfolioHover) {
      if (deps.getActivePage() === deps.BUSINESS_CARD_PAGE) {
        const link = deps.findBusinessCardLinkUnderRay();
        deps.canvas.style.cursor = link ? "pointer" : "auto";
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    const isTyping =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable;
    if (isTyping) {
      return;
    }
    if (
      (event.code === "Space" || event.key === " ") &&
      !event.repeat &&
      !isSpacePressed
    ) {
      isSpacePressed = true;
      event.preventDefault();
      deps.getTurntableController()?.toggleStartStop();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.code === "Space" || event.key === " ") {
      isSpacePressed = false;
    }
  });

  deps.canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 1) {
      if (
        deps.getActivePage() !== "turntable" ||
        deps.isPageTransitionActive() ||
        !deps.isFreeLookModeActive()
      ) {
        return;
      }
      startCameraPan(event);
      return;
    }
    if (event.button === 2) {
      if (
        (deps.getActivePage() !== "turntable" &&
          deps.getActivePage() !== "home") ||
        deps.isPageTransitionActive()
      ) {
        return;
      }
      startCameraOrbit(event);
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (!deps.updatePointer(event, deps.pointerNDC, deps.canvas)) {
      return;
    }
    deps.raycaster.setFromCamera(deps.pointerNDC, deps.camera);
    if (deps.getActivePage() !== "turntable") {
      if (deps.isPageTransitionActive() || deps.yt.isFullscreen()) {
        return;
      }
      if (deps.getActivePage() === "home") {
        if (deps.heroGroup.children.length) {
          const heroHits = deps.raycaster.intersectObject(deps.heroGroup, true);
          if (heroHits.length) {
            for (const hit of heroHits) {
              const page = deps.findPageForObject(
                hit.object as Object3D,
                deps.homePageTargets,
              );
              if (page && page !== "home") {
                if (page === "portfolio") {
                  deps.openPortfolioPage();
                } else {
                  deps.setActiveScenePage(page);
                }
                break;
              }
            }
          }
        }
      } else if (deps.getActivePage() === deps.BUSINESS_CARD_PAGE) {
        if (deps.handleBusinessCardLinkClick()) {
          return;
        }
        deps.startBusinessCardRotation();
      } else if (deps.getActivePage() === "portfolio") {
        if (
          deps.portfolioInteractions.handlePointerDown(event, deps.raycaster)
        ) {
          return;
        }
      }
      return;
    }
    if (deps.getTurntableController()?.handlePointerDown(event)) {
      return;
    }
    if (deps.yt.isFullscreen()) {
      return;
    }
    const vinylSelection = deps.pickVinylUnderPointer();
    if (!vinylSelection) {
      return;
    }
    const previousSource = deps.getActiveVinylSource();
    deps.setActiveVinylSource(vinylSelection.source);
    const vinylModel = deps.getVinylModel();
    if (!vinylModel) {
      return;
    }
    if (
      vinylSelection.source === "focus" &&
      deps.getFocusVinylState() &&
      previousSource !== "focus"
    ) {
      deps.resetVinylAnimationState(deps.getFocusCardAnchorPosition(), "focus");
    } else if (
      vinylSelection.source === "turntable" &&
      deps.getTurntableVinylState() &&
      previousSource !== "turntable"
    ) {
      deps.resetVinylAnimationState(
        deps.getTurntableAnchorPosition(),
        "turntable",
      );
    }
    deps.camera.getWorldDirection(deps.cameraForward);
    const selectionVisualOffset = deps.getVisualOffsetForSource(
      vinylSelection.source,
    );
    deps.setActiveDragVisualOffset(selectionVisualOffset);
    const vinylDisplayPosition = deps.getVinylDisplayPosition();
    vinylDisplayPosition.copy(vinylModel.position);
    if (selectionVisualOffset !== 0) {
      vinylDisplayPosition.x += selectionVisualOffset;
    }
    deps.dragPlane.setFromNormalAndCoplanarPoint(
      deps.cameraForward,
      vinylDisplayPosition,
    );

    const hit = deps.raycaster.ray.intersectPlane(
      deps.dragPlane,
      deps.dragIntersectPoint,
    );
    if (!hit) {
      return;
    }

    deps.setVinylDragPointerId(event.pointerId);
    deps.setCurrentDragSource(vinylSelection.source);
    deps.setIsReturningVinyl(false);
    deps.setHasClearedNub(false);
    deps.setVinylDragExceededThreshold(false);
    vinylDragStartScreen.set(event.clientX, event.clientY);
    vinylDragHasMoved = false;
    (window as any).VINYL_DRAG_ACTIVE = true;

    // Show clenched hand cursor while dragging vinyl
    deps.canvas.style.cursor = "grabbing";
    if (vinylSelection.source === "turntable") {
      deps.getTurntableController()?.liftNeedle();
      deps.getTurntableController()?.setVinylPresence(false);
    }
    if (selectionVisualOffset !== 0) {
      hit.x -= selectionVisualOffset;
    }

    const currentPointerWorld = deps.getCurrentPointerWorld();
    currentPointerWorld.copy(hit);
    deps.getPointerAttachmentOffset().copy(vinylModel.position).sub(hit);
    deps.getVinylTargetPosition().copy(vinylModel.position);
    deps.getLastTargetPosition().copy(vinylModel.position);
    const swingState = deps.getSwingState();
    swingState.targetX = 0;
    swingState.targetZ = 0;
    deps.canvas.setPointerCapture(event.pointerId);
    document.body.classList.add("vinyl-drag-active");
  });

  const showCursor = () => {
    deps.canvas.style.cursor = "";
    const timer = deps.getMouseInactivityTimer();
    if (timer !== null) {
      clearTimeout(timer);
    }
  };

  const scheduleCursorHide = () => {
    const timer = deps.getMouseInactivityTimer();
    if (timer !== null) {
      clearTimeout(timer);
    }
    if (deps.yt.isFullscreen()) {
      const newTimer = window.setTimeout(() => {
        deps.canvas.style.cursor = "none";
      }, 2000);
      deps.setMouseInactivityTimer(newTimer);
    }
  };

  deps.canvas.addEventListener("pointermove", (event) => {
    const isVinylDragging = deps.getVinylDragPointerId() !== null;
    const isTonearmDragging =
      deps.getTurntableController()?.getIsDraggingTonearm?.() ?? false;
    const shouldLockDragCursor = isVinylDragging || isTonearmDragging;
    if (shouldLockDragCursor) {
      deps.canvas.style.cursor = "grabbing";
    }
    if (deps.yt.isFullscreen()) {
      showCursor();
      scheduleCursorHide();
    }
    if (
      deps.getActivePage() === deps.BUSINESS_CARD_PAGE &&
      deps.updatePointer(event, deps.pointerNDC, deps.canvas)
    ) {
      deps.raycaster.setFromCamera(deps.pointerNDC, deps.camera);
      deps.updateBusinessCardHoverState();
    } else if (
      deps.getActivePage() !== deps.BUSINESS_CARD_PAGE &&
      !shouldLockDragCursor
    ) {
      deps.setBusinessCardContactHighlight(null);
      if (deps.getActivePage() !== "home") {
        deps.canvas.style.cursor = "";
      }
    }
    if (deps.handleBusinessCardRotationMove(event)) {
      return;
    }
    if (handleCameraPanMove(event)) {
      return;
    }
    if (handleCameraOrbitMove(event)) {
      return;
    }

    if (deps.portfolioInteractions.handlePointerMove(event, deps.raycaster)) {
      return;
    }

    if (deps.getTurntableController()?.handlePointerMove(event)) {
      return;
    }

    if (
      deps.getActivePage() === "home" &&
      !deps.isPageTransitionActive() &&
      !shouldLockDragCursor
    ) {
      if (deps.updatePointer(event, deps.pointerNDC, deps.canvas)) {
        deps.raycaster.setFromCamera(deps.pointerNDC, deps.camera);
      }
    }

    if (
      deps.getActivePage() === "turntable" &&
      !deps.isPageTransitionActive() &&
      !deps.yt.isFullscreen() &&
      !shouldLockDragCursor
    ) {
      if (deps.updatePointer(event, deps.pointerNDC, deps.canvas)) {
        deps.raycaster.setFromCamera(deps.pointerNDC, deps.camera);
        const vinylPick = deps.pickVinylUnderPointer();
        const isHoveringTonearm =
          deps.getTurntableController()?.getIsHoveringTonearm?.() ?? false;
        const hoveringControls =
          deps.getTurntableController()?.isHoveringControls() ?? false;

        if (vinylPick || isHoveringTonearm) {
          deps.canvas.style.cursor = "grab";
        } else if (hoveringControls) {
          deps.canvas.style.cursor = "pointer";
        } else {
          deps.canvas.style.cursor = "";
        }
      }
    }

    if (
      deps.yt.isFullscreen() &&
      deps.getTurntablePositionState() === "fullscreen"
    ) {
      if (!deps.updatePointer(event, deps.pointerNDC, deps.canvas)) {
        return;
      }
      deps.raycaster.setFromCamera(deps.pointerNDC, deps.camera);
      const turntableHits = deps.raycaster
        .intersectObject(deps.heroGroup, true)
        .filter((hit: any) => {
          let obj: Object3D | null = hit.object;
          while (obj && obj !== deps.heroGroup) {
            if (!obj.visible) return false;
            obj = obj.parent;
          }
          return true;
        });
      const wasHovered = isTurntableHovered;
      isTurntableHovered = turntableHits.length > 0;
      if (isTurntableHovered !== wasHovered) {
        deps.onFullscreenTurntableHoverChange(isTurntableHovered);
      }
    }

    const vinylDragPointerId = deps.getVinylDragPointerId();
    const vinylModel = deps.getVinylModel();
    if (
      vinylDragPointerId === null ||
      event.pointerId !== vinylDragPointerId ||
      !vinylModel
    ) {
      return;
    }
    if (deps.updatePointer(event, deps.pointerNDC, deps.canvas)) {
      deps.raycaster.setFromCamera(deps.pointerNDC, deps.camera);
    }
    const hit = deps.raycaster.ray.intersectPlane(
      deps.dragPlane,
      deps.dragIntersectPoint,
    );
    if (!hit) {
      return;
    }
    if (
      deps.getCurrentDragSource() === "focus" &&
      deps.getActiveDragVisualOffset() !== 0
    ) {
      hit.x -= deps.getActiveDragVisualOffset();
    }
    deps.getCurrentPointerWorld().copy(hit);
    if (!vinylDragHasMoved) {
      const dx = event.clientX - vinylDragStartScreen.x;
      const dy = event.clientY - vinylDragStartScreen.y;
      if (Math.hypot(dx, dy) >= VINYL_DRAG_RESET_THRESHOLD) {
        vinylDragHasMoved = true;
      }
    }
  });

  const endDrag = (event: PointerEvent) => {
    const vinylDragPointerId = deps.getVinylDragPointerId();
    if (vinylDragPointerId === null || event.pointerId !== vinylDragPointerId) {
      return;
    }

    const dragSource = deps.getCurrentDragSource();
    deps.setVinylDragPointerId(null);
    deps.setCurrentDragSource(null);
    deps.setActiveDragVisualOffset(0);
    (window as any).VINYL_DRAG_ACTIVE = false;
    document.body.classList.remove("vinyl-drag-active");

    // Reset cursor when vinyl drag ends
    deps.canvas.style.cursor = "default";
    deps.getPointerAttachmentOffset().copy(deps.getHangOffset());
    const vinylModel = deps.getVinylModel();
    if (vinylModel) {
      deps.getCurrentPointerWorld().copy(vinylModel.position);
      deps.getVinylTargetPosition().copy(vinylModel.position);
      deps.getLastTargetPosition().copy(vinylModel.position);
    }

    let launchedTurntableFlyaway = false;
    if (
      dragSource === "turntable" &&
      vinylModel &&
      vinylModel.position.y >= deps.getVinylDragThreshold()
    ) {
      deps.startTurntableVinylFlyaway();
      launchedTurntableFlyaway = true;
    }

    if (
      !launchedTurntableFlyaway &&
      vinylModel &&
      vinylModel.position.y < deps.getVinylDragThreshold()
    ) {
      if (!deps.getIsReturningVinyl() && !deps.getIsReturningToFocusCard()) {
        deps.setIsReturningVinyl(true);
        deps.setIsReturningToFocusCard(false);
        deps.setHasClearedNub(false);
        deps.setPendingPromotionSource(
          dragSource === "turntable" ? null : dragSource,
          "start vinyl return from drag",
        );
        if (dragSource !== "turntable") {
          deps.disposeDroppingVinyl();
        }
        if (dragSource !== "turntable") {
          deps.clearTurntableVinylPreservingPromotion();
        }
        deps.setVinylAnchorPosition(
          deps.getTurntableAnchorPosition(),
          "turntable",
        );
        deps.getVinylTargetPosition().copy(vinylModel.position);
        deps.getLastTargetPosition().copy(vinylModel.position);

        // Clamp Y position to prevent vinyl from being below turntable surface
        const MIN_Y_OFFSET = 8;
        const minY = deps.getTurntableAnchorPosition().y + MIN_Y_OFFSET;
        if (deps.getVinylTargetPosition().y < minY) {
          deps.getVinylTargetPosition().y = minY;
          deps.getLastTargetPosition().y = minY;
        }
      }
    } else if (
      vinylModel &&
      vinylModel.position.y >= deps.getVinylDragThreshold() &&
      deps.getShouldTrackFocusCard()
    ) {
      if (!deps.getIsReturningVinyl() && !deps.getIsReturningToFocusCard()) {
        deps.setIsReturningVinyl(false);
        deps.setIsReturningToFocusCard(true);
        deps.setPendingPromotionSource(null, "returning focus vinyl to card");
        deps.setVinylAnchorPosition(deps.getFocusCardAnchorPosition(), "focus");
      }
    }

    if (
      !deps.getVinylDragExceededThreshold() &&
      vinylModel &&
      vinylModel.position.y < deps.getVinylDragThreshold() &&
      dragSource === "turntable"
    ) {
      deps.getTurntableController()?.setVinylPresence(true);
    }
    deps.setVinylDragExceededThreshold(false);

    try {
      deps.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignore if pointer was already released
    }

    const swingState = deps.getSwingState();
    swingState.targetX = 0;
    swingState.targetZ = 0;
    if (vinylDragHasMoved) {
      window.dispatchEvent(new Event("focus-cover-click-reset"));
    }
    if (
      deps.getFocusVinylState() &&
      deps.getActiveVinylSource() !== "focus" &&
      !deps.getIsReturningVinyl() &&
      !deps.getIsReturningToFocusCard() &&
      !launchedTurntableFlyaway
    ) {
      deps.setActiveVinylSource("focus");
    }
  };

  deps.canvas.addEventListener("pointerup", endDrag);
  deps.canvas.addEventListener("pointercancel", endDrag);
  deps.canvas.addEventListener("pointerleave", endDrag);

  const endTonearmDrag = (event: PointerEvent) => {
    deps.getTurntableController()?.handlePointerUp(event);
  };

  deps.canvas.addEventListener("pointerup", endTonearmDrag);
  deps.canvas.addEventListener("pointercancel", endTonearmDrag);
  deps.canvas.addEventListener("pointerleave", endTonearmDrag);
  deps.canvas.addEventListener("pointerup", endCameraOrbit);
  deps.canvas.addEventListener("pointercancel", endCameraOrbit);
  deps.canvas.addEventListener("pointerleave", endCameraOrbit);
  deps.canvas.addEventListener("pointerup", endCameraPan);
  deps.canvas.addEventListener("pointercancel", endCameraPan);
  deps.canvas.addEventListener("pointerleave", endCameraPan);
  deps.canvas.addEventListener("pointerleave", () => {
    deps.setBusinessCardContactHighlight(null);
    deps.canvas.style.cursor = "";
  });
  deps.canvas.addEventListener("pointerup", deps.endBusinessCardRotation);
  deps.canvas.addEventListener("pointercancel", deps.endBusinessCardRotation);
  deps.canvas.addEventListener("pointerleave", deps.endBusinessCardRotation);

  const endPaperScrollDrag = () => {
    deps.portfolioInteractions.handlePointerUp();
  };

  deps.canvas.addEventListener("pointerup", endPaperScrollDrag);
  deps.canvas.addEventListener("pointercancel", endPaperScrollDrag);
  deps.canvas.addEventListener("pointerleave", endPaperScrollDrag);

  deps.canvas.addEventListener(
    "wheel",
    (event) => {
      const scrolledPaper = deps.portfolioInteractions.handleWheel(
        event,
        deps.raycaster,
      );
      if (scrolledPaper) {
        event.preventDefault();
        return;
      }

      if (deps.isPageTransitionActive()) {
        return;
      }

      if (deps.isFreeLookModeActive()) {
        event.preventDefault();
        const zoomMultiplier = Math.pow(1.0015, -event.deltaY);
        const candidateZoom = deps.cameraRig.getZoomFactor() * zoomMultiplier;
        deps.cameraRig.setZoomFactor(
          Math.max(deps.FREE_LOOK_MIN_ZOOM, candidateZoom),
        );
        deps.notifyFreeLookAction("zoom");
        return;
      }

      if (deps.getActivePage() !== "home") {
        return;
      }

      event.preventDefault();

      const deltaY = event.deltaY;
      const scrollSensitivity = 0.001;
      deps.cameraRig.orbit(deltaY * scrollSensitivity, 0);

      if (Math.abs(deltaY) > 5) {
        autoOrbitDirection = deltaY > 0 ? 1 : -1;
        autoOrbitSpeedMultiplier = 1.0;
      }
    },
    { passive: false },
  );

  return {
    startAutoOrbit,
    updateAutoOrbit,
    scheduleCursorHide,
    resetCursorHide: () => {
      const timer = deps.getMouseInactivityTimer();
      if (timer !== null) {
        clearTimeout(timer);
        deps.setMouseInactivityTimer(null);
      }
      deps.canvas.style.cursor = "";
    },
    setAutoOrbitActive: (value: boolean) => {
      cameraOrbitState.isAutoOrbiting = value;
    },
  };
};
