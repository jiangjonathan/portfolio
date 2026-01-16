import type { Vector3 } from "three";
import type { CameraRig } from "../camera/cameraRig";
import type { ScenePage } from "../camera/pageNavigation";
import type { TurntableStateManager } from "./turntableState";
import type { YouTubeBridge } from "../youtube/youtube";
import type { FreeLookTutorialAction } from "./freeLookTutorial";

export type TurntablePosition =
  | "default"
  | "bottom-center"
  | "bottom-left"
  | "fullscreen";

type PageTurntableSettings = {
  target: Vector3;
  yaw: number;
  pitch: number;
  zoom: number;
};

type TurntableUiDeps = {
  vinylViewerContainer: HTMLDivElement;
  hideLibraryBtn: HTMLButtonElement;
  focusCardContainers: HTMLElement[];
  showFocusBtn: HTMLButtonElement;
  vinylLibraryContainer: HTMLDivElement;
  tutorialContainer: HTMLDivElement;
  getVinylUIFadeTriggered: () => boolean;
  getActivePage: () => ScenePage;
  getIsPageTransitionActive: () => boolean;
  turntableStateManager: TurntableStateManager;
  freeLookTutorialController: {
    setVisible: (visible: boolean) => void;
  };
  freeLookButton: HTMLButtonElement;
  updateFocusVinylVisibility: () => void;
  getFocusVinylManuallyHidden: () => boolean;
  setFocusVinylManuallyHidden: (value: boolean) => void;
  setTurntablePositionState: (state: TurntablePosition) => void;
  getTurntablePositionState: () => TurntablePosition;
  cameraRig: CameraRig;
  cameraTargets: Record<TurntablePosition, Vector3>;
  directionFromAngles: (yaw: number, pitch: number) => Vector3;
  pageTurntableSettings: PageTurntableSettings;
  getYouTubeBridge: () => YouTubeBridge | null;
};

export const createTurntableUiController = (deps: TurntableUiDeps) => {
  let isFreeLookMode = false;
  let freeLookWasPlayerCollapsed = false;
  let freeLookFocusHidden = false;
  let vinylViewerHideToken = 0;

  const setTurntableUIVisible = (visible: boolean) => {
    const effective =
      visible &&
      deps.getVinylUIFadeTriggered() &&
      !deps.turntableStateManager.getIsFullscreenMode() &&
      deps.getActivePage() === "turntable" &&
      !isFreeLookMode;
    const fadeMs = 300;
    deps.vinylViewerContainer.style.transition =
      "opacity 0.3s ease, transform 0.3s ease";
    deps.vinylViewerContainer.style.opacity = effective ? "1" : "0";
    deps.vinylViewerContainer.style.pointerEvents = effective ? "auto" : "none";
    if (effective) {
      vinylViewerHideToken += 1;
      deps.vinylViewerContainer.style.visibility = "visible";
    } else {
      const hideToken = (vinylViewerHideToken += 1);
      deps.vinylViewerContainer.style.visibility = "visible";
      window.setTimeout(() => {
        if (
          vinylViewerHideToken === hideToken &&
          deps.vinylViewerContainer.style.opacity === "0"
        ) {
          deps.vinylViewerContainer.style.visibility = "hidden";
        }
      }, fadeMs);
    }
    deps.vinylViewerContainer.style.transform = effective
      ? "translateY(0)"
      : "translateY(8px)";
    deps.hideLibraryBtn.style.opacity = effective ? "1" : "0";
    deps.hideLibraryBtn.style.pointerEvents = effective ? "auto" : "none";
    deps.focusCardContainers.forEach((container) => {
      const shouldShow = effective && container.childElementCount > 0;
      container.style.transition = "opacity 0.3s ease";
      container.style.opacity = shouldShow ? "1" : "0";
      container.style.pointerEvents = shouldShow ? "auto" : "none";
    });
    deps.showFocusBtn.style.opacity = effective ? "1" : "0";
    deps.showFocusBtn.style.pointerEvents = effective ? "auto" : "none";
    deps.vinylLibraryContainer.style.transition = "opacity 0.3s ease";
    deps.vinylLibraryContainer.style.opacity = effective ? "1" : "0";
    deps.vinylLibraryContainer.style.pointerEvents = effective
      ? "auto"
      : "none";
    if (deps.getVinylUIFadeTriggered()) {
      const tutorialManager = (window as any).tutorialManager;
      const isTutorialDismissed = tutorialManager?.isDismissed() ?? false;

      deps.tutorialContainer.style.opacity =
        effective && !isTutorialDismissed ? "1" : "0";
      deps.tutorialContainer.style.pointerEvents =
        effective && !isTutorialDismissed ? "auto" : "none";
      if (!effective || isTutorialDismissed) {
        setTimeout(() => {
          if (deps.tutorialContainer.style.opacity === "0") {
            deps.tutorialContainer.style.display = "none";
          }
        }, 450);
      } else {
        deps.tutorialContainer.style.display = "block";
      }
    } else {
      deps.tutorialContainer.style.display = "none";
    }
  };

  const exitFreeLookMode = ({
    restoreCamera = true,
    restoreUI = true,
    restorePlayer = true,
  }: {
    restoreCamera?: boolean;
    restoreUI?: boolean;
    restorePlayer?: boolean;
  } = {}) => {
    if (!isFreeLookMode) {
      return;
    }
    isFreeLookMode = false;
    deps.freeLookButton.textContent = "free-look";
    deps.freeLookTutorialController.setVisible(false);

    deps.tutorialContainer.style.display = "block";

    deps.setFocusVinylManuallyHidden(true);
    deps.updateFocusVinylVisibility();
    const yt = deps.getYouTubeBridge();
    if (restorePlayer && yt) {
      yt.setPlayerCollapsed(freeLookWasPlayerCollapsed);
    }
    if (restoreCamera) {
      deps.setTurntablePositionState("bottom-center");
      deps.cameraRig.setLookTarget(
        deps.cameraTargets[deps.getTurntablePositionState()],
        true,
      );
      deps.cameraRig.setViewDirection(
        deps.directionFromAngles(deps.pageTurntableSettings.yaw, 22),
        true,
      );
      deps.cameraRig.setZoomFactor(deps.pageTurntableSettings.zoom);
      deps.cameraRig.onAnimationComplete(() => {
        deps.setFocusVinylManuallyHidden(freeLookFocusHidden);
        deps.updateFocusVinylVisibility();
      });
    } else {
      deps.setFocusVinylManuallyHidden(freeLookFocusHidden);
      deps.updateFocusVinylVisibility();
    }
    if (restoreUI) {
      setTurntableUIVisible(deps.getActivePage() === "turntable");
    }
  };

  const enterFreeLookMode = () => {
    if (
      isFreeLookMode ||
      deps.getActivePage() !== "turntable" ||
      deps.getIsPageTransitionActive()
    ) {
      return;
    }
    isFreeLookMode = true;
    deps.freeLookButton.textContent = "exit free-look";
    const yt = deps.getYouTubeBridge();
    freeLookWasPlayerCollapsed = yt?.isPlayerCollapsed() ?? false;
    freeLookFocusHidden = deps.getFocusVinylManuallyHidden();
    deps.setFocusVinylManuallyHidden(true);
    deps.updateFocusVinylVisibility();

    deps.tutorialContainer.style.display = "none";

    setTurntableUIVisible(false);
    if (yt) {
      yt.setPlayerCollapsed(true);
    }
    deps.setTurntablePositionState("default");
    const defaultTurntableSettings = deps.pageTurntableSettings;
    deps.cameraRig.setLookTarget(defaultTurntableSettings.target, true);
    deps.cameraRig.setViewDirection(
      deps.directionFromAngles(
        defaultTurntableSettings.yaw,
        defaultTurntableSettings.pitch,
      ),
      true,
    );
    deps.cameraRig.setZoomFactor(defaultTurntableSettings.zoom);
    deps.freeLookTutorialController.setVisible(true);
  };

  const toggleFreeLookMode = () => {
    if (isFreeLookMode) {
      exitFreeLookMode();
    } else {
      enterFreeLookMode();
    }
  };

  const notifyFreeLookAction = (action: FreeLookTutorialAction) => {
    window.dispatchEvent(
      new CustomEvent("free-look-action", {
        detail: { action },
      }),
    );
  };

  return {
    setTurntableUIVisible,
    enterFreeLookMode,
    exitFreeLookMode,
    toggleFreeLookMode,
    isFreeLookMode: () => isFreeLookMode,
    notifyFreeLookAction,
  };
};
