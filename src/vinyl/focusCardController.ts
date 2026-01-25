import { Raycaster, Vector2 } from "three";
import type { Camera, Object3D, Vector3 } from "three";
import type { CameraRig } from "../camera/cameraRig";
import type { FocusVinylState, VinylSource } from "./vinylInteractions";
import { getFocusVinylScale } from "./vinylHelpers";

type FocusCardControllerDeps = {
  focusCardContainers: HTMLElement[];
  focusCardCoverContainer: HTMLElement;
  camera: Camera;
  cameraRig: CameraRig;
  getFocusCardScale: () => number;
  setVinylModelVisibility: (
    model: Object3D | null,
    source: string,
    visible: boolean,
    reason: string,
  ) => void;
  getFocusVinylState: () => FocusVinylState | null;
  getActiveVinylSource: () => VinylSource | null;
  getVinylDragPointerId: () => number | null;
  getShouldTrackFocusCard: () => boolean;
  setVinylAnchorPosition: (anchor: Vector3, source: VinylSource) => void;
  updateDragPlaneDepthLocal: (z: number) => void;
  applyFocusVinylScale: (model: Object3D | null, rig: CameraRig) => void;
  vinylTargetPosition: Vector3;
  lastTargetPosition: Vector3;
  resetVinylAnimationState: (anchor: Vector3, source: VinylSource) => void;
  vinylAnimationState: { cameraRelativeOffsetValid: boolean };
  swingState: {
    targetX: number;
    targetZ: number;
    currentX: number;
    currentZ: number;
  };
  isFreeLookModeActive: () => boolean;
  getIsFullscreenMode: () => boolean;
  setAspectRatio: (ratio: number) => void;
  loadVinylModel: (texture: any) => Promise<Object3D>;
  vinylNormalTexture: any;
  heroGroup: Object3D;
  runWhenTurntableReady: (callback: () => void) => void;
  cameraTargets: Record<string, Vector3>;
  setTurntablePositionState: (state: string) => void;
  FOCUS_VINYL_CLICK_ANIMATION_SPEED: number;
};

type FocusCardController = {
  getFocusCardAnchorPosition: () => Vector3;
  getFocusVisualOffset: () => number;
  getFocusVinylYOffset: () => number;
  getVisualOffsetForSource: (source: VinylSource | null) => number;
  updateFocusVinylVisibility: () => void;
  updateFocusCardPosition: (override?: {
    screenX: number;
    screenY: number;
  }) => void;
  hideFocusCardAndVinyl: () => void;
  hideFocusVinylForFullscreen: () => void;
  scheduleFocusVinylRestore: () => void;
  setFocusVinylManuallyHidden: (value: boolean) => void;
  getFocusVinylManuallyHidden: () => boolean;
  deactivateFocusCoverZIndexImmediate: () => void;
  updateHoverOffsetAnimation: () => void;
  syncHoverDistanceOnResize: () => void;
  clearPreloadedFocusVinyl: () => void;
  ensureFocusVinylPreloaded: () => void;
  takePreloadedFocusVinyl: () => {
    model: Object3D | null;
    promise: Promise<Object3D | null> | null;
  };
  cachePreloadedFocusVinyl: (model: Object3D) => void;
};

const FOCUS_VINYL_HOVER_DISTANCE_BASE = 7.19;
const FOCUS_VINYL_HOVER_ANIMATION_SPEED = 0.25;
const FOCUS_COVER_CLICK_CLASS = "focus-cover-click-active";
const FOCUS_COVER_CLICK_TIMEOUT = 3000;
const FOCUS_VINYL_Y_OFFSET = -0.25;
const FOCUS_VINYL_Y_OFFSET_COMPACT = FOCUS_VINYL_Y_OFFSET;

export const createFocusCardController = (
  deps: FocusCardControllerDeps,
): FocusCardController => {
  let focusVinylHoverOffset = 0;
  let focusVinylHoverOffsetTarget = 0;
  let focusCoverHoverActive = false;
  let focusCoverHoverOverride: boolean | null = null;
  let focusVinylManuallyHidden = false;
  let focusCoverZIndexActive = false;
  let focusCoverFallbackTimer: number | null = null;
  let focusCoverFallbackAnimationKey = 0;
  let fullscreenVinylRestoreTimeout: number | null = null;
  let focusCardScreenHint: { x: number; y: number } | null = null;
  let focusCardMotionFrame: number | null = null;
  let pendingFocusVinylRevealFrame: number | null = null;
  let isFocusCardAnimationActive = false;
  let focusCardLayoutCompact = false;
  let preloadedFocusVinylModel: Object3D | null = null;
  let preloadedFocusVinylPromise: Promise<Object3D | null> | null = null;
  const preloadedFocusVinylAnchor = deps.cameraTargets.default.clone();
  const focusCardAnchorBasePosition = deps.cameraTargets.default.clone();
  const focusCardAnchorPosition = focusCardAnchorBasePosition.clone();

  const getCurrentYOffset = () =>
    focusCardLayoutCompact
      ? FOCUS_VINYL_Y_OFFSET_COMPACT
      : FOCUS_VINYL_Y_OFFSET;

  const applyAnchorYOffset = () => {
    focusCardAnchorPosition.copy(focusCardAnchorBasePosition);
    focusCardAnchorPosition.y += getCurrentYOffset();
  };

  const getFocusVinylHoverDistance = () =>
    FOCUS_VINYL_HOVER_DISTANCE_BASE * getFocusVinylScale(deps.cameraRig);

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
    focusVinylHoverOffsetTarget = effectiveHover
      ? getFocusVinylHoverDistance()
      : 0;
  };

  const updateFocusVinylVisibility = () => {
    const hasFocusCard = deps.focusCardCoverContainer.childElementCount > 0;
    const shouldShow =
      !deps.getIsFullscreenMode() &&
      !deps.isFreeLookModeActive() &&
      !focusVinylManuallyHidden &&
      hasFocusCard;
    deps.setVinylModelVisibility(
      deps.getFocusVinylState()?.model ?? null,
      "focus",
      shouldShow,
      `updateFocusVinylVisibility (hasFocusCard=${hasFocusCard}, manualHidden=${focusVinylManuallyHidden}, fullscreen=${deps.getIsFullscreenMode()}, freeLook=${deps.isFreeLookModeActive()})`,
    );
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
    deps.focusCardContainers.forEach((container) => {
      container.innerHTML = "";
      container.style.opacity = "0";
      container.style.pointerEvents = "none";
    });
    focusVinylManuallyHidden = true;
    focusVinylHoverOffsetTarget = 0;
    setFocusCoverClickBodyClass(false);
    updateFocusVinylVisibility();
    // Notify player that focus card is hidden (for repositioning)
    window.dispatchEvent(
      new CustomEvent("focus-visibility-change", {
        detail: { visible: false },
      }),
    );
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
      await waitForFocusVinylOffset(getFocusVinylHoverDistance(), animationKey);
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

  const getLiveFocusCoverCenter = (): { x: number; y: number } | null => {
    const coverElement = document.querySelector(
      ".focus-card-cover-container .album-cover",
    ) as HTMLElement | null;
    if (!coverElement) {
      return null;
    }
    const rect = coverElement.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  const updateFocusCardPosition = (override?: {
    screenX: number;
    screenY: number;
  }) => {
    if (!deps.getShouldTrackFocusCard() || !deps.getFocusVinylState()) {
      return;
    }

    let screenX: number | null = null;
    let screenY: number | null = null;

    if (override) {
      screenX = override.screenX;
      screenY = override.screenY;
    } else {
      const liveCenter = getLiveFocusCoverCenter();
      if (liveCenter) {
        screenX = liveCenter.x;
        screenY = liveCenter.y;
        focusCardScreenHint = liveCenter;
      } else if (focusCardScreenHint) {
        screenX = focusCardScreenHint.x;
        screenY = focusCardScreenHint.y;
      } else {
        return;
      }
    }

    if (screenX === null || screenY === null) {
      return;
    }

    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;

    const trackingRaycaster = new Raycaster();
    trackingRaycaster.setFromCamera(new Vector2(ndcX, ndcY), deps.camera);

    const distanceFromCamera = 100;
    const baseVinylPosition = trackingRaycaster.ray.origin
      .clone()
      .add(
        trackingRaycaster.ray.direction
          .clone()
          .multiplyScalar(distanceFromCamera),
      );

    focusCardAnchorBasePosition.copy(baseVinylPosition);
    applyAnchorYOffset();
    const anchoredPosition = baseVinylPosition.clone();
    anchoredPosition.y += getCurrentYOffset();

    if (
      deps.getVinylDragPointerId() !== null &&
      deps.getActiveVinylSource() === "focus"
    ) {
      return;
    }

    const model = deps.getFocusVinylState()?.model;
    if (!model) {
      return;
    }
    model.position.copy(anchoredPosition);
    deps.setVinylAnchorPosition(focusCardAnchorPosition, "focus");
    if (deps.getActiveVinylSource() === "focus") {
      deps.vinylTargetPosition.copy(anchoredPosition);
      deps.lastTargetPosition.copy(anchoredPosition);
      deps.updateDragPlaneDepthLocal(baseVinylPosition.z);
      deps.applyFocusVinylScale(model, deps.cameraRig);
    }
  };

  const projectScreenPointToWorld = (
    screenX: number,
    screenY: number,
    distanceFromCamera = 100,
  ) => {
    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(ndcX, ndcY), deps.camera);
    return raycaster.ray.origin
      .clone()
      .add(raycaster.ray.direction.clone().multiplyScalar(distanceFromCamera));
  };

  const getFocusCardContainerCenter = (): { x: number; y: number } | null => {
    const rect = deps.focusCardCoverContainer.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return null;
    }
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  const clearPreloadedFocusVinyl = () => {
    preloadedFocusVinylPromise = null;
    if (preloadedFocusVinylModel) {
      deps.heroGroup.remove(preloadedFocusVinylModel);
      preloadedFocusVinylModel = null;
    }
  };

  const ensureFocusVinylPreloaded = () => {
    if (
      deps.getFocusVinylState() ||
      preloadedFocusVinylModel ||
      preloadedFocusVinylPromise
    ) {
      return;
    }
    const liveCenter = getLiveFocusCoverCenter();
    const fallbackCenter = liveCenter ?? getFocusCardContainerCenter();
    if (!fallbackCenter) {
      return;
    }
    const anchor = projectScreenPointToWorld(
      fallbackCenter.x,
      fallbackCenter.y,
    );
    preloadedFocusVinylAnchor.copy(anchor);
    const promise = deps
      .loadVinylModel(deps.vinylNormalTexture)
      .then((model) => {
        if (preloadedFocusVinylPromise !== promise) {
          deps.heroGroup.remove(model);
          return null;
        }
        preloadedFocusVinylPromise = null;
        if (deps.getFocusVinylState()) {
          deps.heroGroup.remove(model);
          return null;
        }
        preloadedFocusVinylModel = model;
        deps.setVinylModelVisibility(
          model,
          "focus-preload",
          false,
          "preloading",
        );
        model.position.copy(preloadedFocusVinylAnchor);
        deps.applyFocusVinylScale(model, deps.cameraRig);
        deps.heroGroup.add(model);
        return model;
      })
      .catch((error) => {
        console.error("[Focus Vinyl] Failed to preload vinyl model:", error);
        preloadedFocusVinylPromise = null;
        return null;
      });
    preloadedFocusVinylPromise = promise;
  };

  const cancelPendingFocusVinylReveal = () => {
    if (pendingFocusVinylRevealFrame !== null) {
      cancelAnimationFrame(pendingFocusVinylRevealFrame);
      pendingFocusVinylRevealFrame = null;
    }
  };

  const hideFocusVinyl = () => {
    cancelPendingFocusVinylReveal();
    focusVinylManuallyHidden = true;
    deps.setVinylModelVisibility(
      deps.getFocusVinylState()?.model ?? null,
      "focus",
      false,
      "hideFocusVinyl",
    );
  };

  const scheduleFocusVinylReveal = (framesRemaining: number = 1) => {
    cancelPendingFocusVinylReveal();
    const step = () => {
      const liveCenter = getLiveFocusCoverCenter();
      if (liveCenter) {
        focusCardScreenHint = liveCenter;
        updateFocusCardPosition({
          screenX: liveCenter.x,
          screenY: liveCenter.y,
        });
      } else {
        updateFocusCardPosition();
      }
      if (framesRemaining > 0) {
        framesRemaining -= 1;
        pendingFocusVinylRevealFrame = requestAnimationFrame(step);
      } else {
        pendingFocusVinylRevealFrame = null;
        focusVinylManuallyHidden = false;
        updateFocusVinylVisibility();
      }
    };
    pendingFocusVinylRevealFrame = requestAnimationFrame(step);
  };

  const stopFocusCardMotionLoop = () => {
    if (focusCardMotionFrame !== null) {
      cancelAnimationFrame(focusCardMotionFrame);
      focusCardMotionFrame = null;
    }
  };

  const runFocusCardMotionLoop = () => {
    const liveCenter = getLiveFocusCoverCenter();
    if (liveCenter) {
      focusCardScreenHint = liveCenter;
      updateFocusCardPosition({
        screenX: liveCenter.x,
        screenY: liveCenter.y,
      });
    } else {
      updateFocusCardPosition();
    }
    updateFocusVinylVisibility();
    focusCardMotionFrame = requestAnimationFrame(runFocusCardMotionLoop);
  };

  window.addEventListener("update-aspect-ratio", (event: any) => {
    const { aspectRatio } = event.detail;
    console.log(`[main] Updating aspect ratio live to: ${aspectRatio}`);
    deps.setAspectRatio(aspectRatio);
  });

  window.addEventListener("focus-cover-hover", (event: any) => {
    const { hovered } = event.detail;
    focusCoverHoverActive = Boolean(hovered);
    applyFocusCoverHoverState();
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

  window.addEventListener("focus-card-shown", (event: any) => {
    const { position, polarAngle } = event.detail;
    deps.runWhenTurntableReady(() => {
      console.log(
        `[main] Focus card shown, changing camera position to: ${position}, polar angle to: ${polarAngle}°`,
      );
      if (position === "bottom-center") {
        deps.setTurntablePositionState("bottom-center");
        deps.cameraRig.setLookTarget(deps.cameraTargets["bottom-center"], true);
        deps.vinylAnimationState.cameraRelativeOffsetValid = false;
      }
      if (polarAngle !== undefined) {
        deps.cameraRig.setPolarAngle(polarAngle, true);
      }
    });
  });

  window.addEventListener("focus-card-motion", (event: any) => {
    const animating = Boolean(event.detail?.animating);
    if (animating) {
      isFocusCardAnimationActive = true;
      hideFocusVinyl();
      const liveCenter = getLiveFocusCoverCenter();
      if (liveCenter) {
        focusCardScreenHint = liveCenter;
      }
      if (
        deps.getFocusVinylState()?.model &&
        deps.getShouldTrackFocusCard() &&
        deps.getVinylDragPointerId() === null
      ) {
        updateFocusCardPosition(
          liveCenter
            ? { screenX: liveCenter.x, screenY: liveCenter.y }
            : undefined,
        );
        deps.resetVinylAnimationState(focusCardAnchorPosition, "focus");
        deps.vinylAnimationState.cameraRelativeOffsetValid = false;
      }
      if (focusCardMotionFrame === null) {
        runFocusCardMotionLoop();
      }
      return;
    }

    stopFocusCardMotionLoop();
    isFocusCardAnimationActive = false;
    if (
      deps.getFocusVinylState()?.model &&
      deps.getShouldTrackFocusCard() &&
      deps.getVinylDragPointerId() === null
    ) {
      const liveCenter = getLiveFocusCoverCenter();
      updateFocusCardPosition(
        liveCenter
          ? { screenX: liveCenter.x, screenY: liveCenter.y }
          : undefined,
      );
      deps.resetVinylAnimationState(focusCardAnchorPosition, "focus");
      deps.vinylAnimationState.cameraRelativeOffsetValid = false;
      deps.swingState.targetX = 0;
      deps.swingState.targetZ = 0;
      deps.swingState.currentX = 0;
      deps.swingState.currentZ = 0;
    }
    scheduleFocusVinylReveal(2);
  });

  window.addEventListener("focus-card-layout-updated", (event: any) => {
    const { coverCenterX, coverCenterY, layoutChanged, compact } =
      event.detail || {};
    if (typeof compact === "boolean") {
      focusCardLayoutCompact = compact;
      applyAnchorYOffset();
    }
    const hasCoords =
      typeof coverCenterX === "number" && typeof coverCenterY === "number";
    if (!hasCoords) {
      return;
    }

    focusCardScreenHint = { x: coverCenterX, y: coverCenterY };
    updateFocusCardPosition({ screenX: coverCenterX, screenY: coverCenterY });
    if (
      deps.getFocusVinylState()?.model &&
      deps.getShouldTrackFocusCard() &&
      deps.getVinylDragPointerId() === null
    ) {
      deps.resetVinylAnimationState(focusCardAnchorPosition, "focus");
      deps.vinylAnimationState.cameraRelativeOffsetValid = false;
    }

    if (!isFocusCardAnimationActive && layoutChanged) {
      hideFocusVinyl();
      scheduleFocusVinylReveal(2);
    }
  });

  return {
    getFocusCardAnchorPosition: () => {
      applyAnchorYOffset();
      return focusCardAnchorPosition;
    },
    getFocusVisualOffset: () => focusVinylHoverOffset,
    getFocusVinylYOffset: () => getCurrentYOffset(),
    getVisualOffsetForSource: (source) =>
      source === "focus" ? focusVinylHoverOffset : 0,
    updateFocusVinylVisibility,
    updateFocusCardPosition,
    hideFocusCardAndVinyl,
    hideFocusVinylForFullscreen: () => {
      if (fullscreenVinylRestoreTimeout !== null) {
        window.clearTimeout(fullscreenVinylRestoreTimeout);
        fullscreenVinylRestoreTimeout = null;
      }
      const model = deps.getFocusVinylState()?.model ?? null;
      if (model) {
        deps.setVinylModelVisibility(model, "focus", false, "fullscreen hide");
      }
    },
    scheduleFocusVinylRestore: () => {
      if (fullscreenVinylRestoreTimeout !== null) {
        window.clearTimeout(fullscreenVinylRestoreTimeout);
        fullscreenVinylRestoreTimeout = null;
      }
      const model = deps.getFocusVinylState()?.model ?? null;
      if (!model) {
        return;
      }
      const modelRef = model;
      deps.setVinylModelVisibility(
        modelRef,
        "focus",
        false,
        "fullscreen restore delay",
      );
      fullscreenVinylRestoreTimeout = window.setTimeout(() => {
        fullscreenVinylRestoreTimeout = null;
        if (deps.getFocusVinylState()?.model === modelRef) {
          updateFocusVinylVisibility();
        }
      }, 250);
    },
    setFocusVinylManuallyHidden: (value) => {
      focusVinylManuallyHidden = value;
    },
    getFocusVinylManuallyHidden: () => focusVinylManuallyHidden,
    deactivateFocusCoverZIndexImmediate,
    updateHoverOffsetAnimation: () => {
      const hoverAnimationSpeed =
        focusCoverHoverOverride !== null
          ? deps.FOCUS_VINYL_CLICK_ANIMATION_SPEED
          : FOCUS_VINYL_HOVER_ANIMATION_SPEED;
      if (
        Math.abs(focusVinylHoverOffsetTarget - focusVinylHoverOffset) > 0.001
      ) {
        focusVinylHoverOffset +=
          (focusVinylHoverOffsetTarget - focusVinylHoverOffset) *
          hoverAnimationSpeed;
      } else {
        focusVinylHoverOffset = focusVinylHoverOffsetTarget;
      }
    },
    syncHoverDistanceOnResize: () => {
      const wasHovering = focusVinylHoverOffsetTarget > 0;
      if (wasHovering) {
        const newHoverDistance = getFocusVinylHoverDistance();
        focusVinylHoverOffsetTarget = newHoverDistance;
        focusVinylHoverOffset = newHoverDistance;
      }
    },
    clearPreloadedFocusVinyl,
    ensureFocusVinylPreloaded,
    takePreloadedFocusVinyl: () => {
      const model = preloadedFocusVinylModel;
      const promise = preloadedFocusVinylPromise;
      preloadedFocusVinylModel = null;
      preloadedFocusVinylPromise = null;
      return { model, promise };
    },
    cachePreloadedFocusVinyl: (model) => {
      preloadedFocusVinylModel = model;
      deps.setVinylModelVisibility(
        model,
        "focus-preload",
        false,
        "focus load token mismatch cached",
      );
    },
  };
};
