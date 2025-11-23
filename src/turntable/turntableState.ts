import type { YouTubeBridge } from "../youtube/youtube";
import type { TurntableVinylState } from "../vinyl/vinylInteractions";
import type { ScenePage } from "../camera/pageNavigation";
import { Vector3 } from "three";

// CameraRig interface for type safety
interface CameraRig {
  setLookTarget(target: Vector3, smooth: boolean): void;
  setPolarAngle(angle: number, smooth: boolean): void;
}

export class TurntableStateManager {
  private onTurntable: boolean;
  private hasStartedFadeOut: boolean;
  private isTonearmInPlayArea: boolean;
  private isFullscreenMode: boolean;

  private turntableVinylState: TurntableVinylState | null = null;
  private activePage: ScenePage = "home";

  private yt: YouTubeBridge;
  private root: HTMLElement;

  constructor(yt: YouTubeBridge, root: HTMLElement) {
    this.onTurntable = false;
    this.hasStartedFadeOut = false;
    this.isTonearmInPlayArea = false;
    this.isFullscreenMode = false;
    this.yt = yt;
    this.root = root;
  }

  initialize(
    cameraRig: CameraRig,
    cameraTargets: Record<string, Vector3>,
    callbacks: {
      runWhenTurntableReady: (fn: () => void) => void;
      setHeroPageVisibility: (page: ScenePage | null) => void;
      hideFocusVinylForFullscreen: () => void;
      scheduleFocusVinylRestore: () => void;
      setTurntableUIVisible: (visible: boolean) => void;
      setTurntablePositionState: (state: string) => void;
      setGroundShadowsVisible: (visible: boolean) => void;
      setFullscreenLighting: (enabled: boolean) => void;
      onEnterFullscreen?: () => void;
      onExitFullscreen?: () => void;
    },
  ): void {
    // Initially hide the player controls (only show when tonearm is in play area)
    this.yt.setControlsVisible(false);

    // Register callback to query tonearm state when exiting fullscreen
    this.yt.setIsTonearmInPlayAreaQuery(() => this.isTonearmInPlayArea);

    // Register callback to query if on turntable page
    this.yt.setIsOnTurntablePageQuery(() => this.activePage === "turntable");

    // Auto-hide library and button in fullscreen player mode
    this.yt.onFullscreenChange((isFullscreen: boolean) => {
      // Fade hyperlinks in/out with fullscreen
      const globalControls = document.getElementById("global-controls");
      if (globalControls) {
        globalControls.style.opacity = isFullscreen ? "0" : "1";
        globalControls.style.pointerEvents = isFullscreen ? "none" : "auto";
      }

      callbacks.runWhenTurntableReady(() => {
        callbacks.setHeroPageVisibility(isFullscreen ? "turntable" : null);
        if (isFullscreen) {
          this.isFullscreenMode = true;
          callbacks.hideFocusVinylForFullscreen();
          callbacks.setTurntableUIVisible(false);
          callbacks.setGroundShadowsVisible(false);
          callbacks.setFullscreenLighting(true);
          callbacks.onEnterFullscreen?.();

          // Switch to fullscreen camera position
          callbacks.setTurntablePositionState("fullscreen");
          cameraRig.setLookTarget(cameraTargets["fullscreen"], true);
          cameraRig.setPolarAngle(2, true);
        } else {
          this.isFullscreenMode = false;
          callbacks.scheduleFocusVinylRestore();
          callbacks.setTurntableUIVisible(true);
          callbacks.setGroundShadowsVisible(true);
          callbacks.setFullscreenLighting(false);
          callbacks.onExitFullscreen?.();

          // Hide other page models when returning to turntable
          callbacks.setHeroPageVisibility("turntable");

          // Return to bottom-center when exiting fullscreen
          callbacks.setTurntablePositionState("bottom-center");
          cameraRig.setLookTarget(cameraTargets["bottom-center"], true);
          // Restore bottom-center polar angle (22 degrees)
          cameraRig.setPolarAngle(22, true);
        }
      });
    });

    // Track when video reaches the last 2 seconds to animate out
    this.yt.onPlaybackProgress(() => {
      const currentTime = this.yt.getCurrentTime();
      const duration = this.yt.getDuration();
      const timeRemaining = duration - currentTime;

      // When video has 1 seconds or less remaining, animate controls and viewport out (only in small mode)
      if (!this.yt.isFullscreen()) {
        if (timeRemaining <= 1 && !this.hasStartedFadeOut) {
          this.hasStartedFadeOut = true;
          // Fade out the controls
          this.yt.setControlsVisible(false);
          // Animate viewport height to 0
          const viewport = this.root.querySelector(
            ".yt-player-viewport",
          ) as HTMLElement;
          if (viewport) {
            viewport.style.height = "0px";
          }
        } else if (timeRemaining > 1) {
          // Reset the flag if we seek back
          this.hasStartedFadeOut = false;
        }
      }
    });
  }

  setActivePage(page: ScenePage): void {
    this.activePage = page;
  }

  setTurntableVinylState(state: TurntableVinylState | null): void {
    this.turntableVinylState = state;
    this.notifyState();
  }

  getTurntableVinylState(): TurntableVinylState | null {
    return this.turntableVinylState;
  }

  isOnTurntable(): boolean {
    return this.onTurntable;
  }

  setOnTurntable(onTurntable: boolean): void {
    if (this.onTurntable === onTurntable) {
      return;
    }
    this.onTurntable = onTurntable;
    this.notifyState();
  }

  setTonearmInPlayArea(inPlayArea: boolean): void {
    this.isTonearmInPlayArea = inPlayArea;
  }

  resetFadeOut(): void {
    this.hasStartedFadeOut = false;
  }

  getIsFullscreenMode(): boolean {
    return this.isFullscreenMode;
  }

  private notifyState(): void {
    window.dispatchEvent(
      new CustomEvent("focus-vinyl-turntable-state", {
        detail: {
          onTurntable: this.onTurntable,
          turntableVideoId: this.turntableVinylState?.selection.videoId ?? null,
        },
      }),
    );
    (window as any).__FOCUS_VINYL_ON_TURNTABLE__ = this.onTurntable;
    (window as any).__FOCUS_VINYL_TURNTABLE_VIDEO_ID__ =
      this.turntableVinylState?.selection.videoId ?? null;
  }
}
