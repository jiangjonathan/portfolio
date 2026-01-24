import {
  directionFromAngles,
  TURNTABLE_CAMERA_YAW,
} from "../camera/pageNavigation";
import type { Object3D } from "three";
import type { CameraRig } from "../camera/cameraRig";
import type { YouTubeBridge, VideoMetadata } from "../youtube/youtube";
import type {
  FocusVinylState,
  TurntableVinylState,
  VinylSource,
} from "./vinylInteractions";
import type { VinylSelectionDetail } from "./vinylInteractions";
import type {
  LabelApplicationOptions,
  LabelTextures,
  LabelVisualOptions,
} from "./labels";

type VinylSelectionControllerDeps = {
  yt: YouTubeBridge;
  youtubePlayer: {
    loadVideo: (
      videoId: string,
      onMetadata: (metadata: VideoMetadata | null) => void,
    ) => Promise<void>;
    getDuration: () => number;
  };
  videoControls: {
    setProgress: (value: number, duration: number) => void;
    getVolume: () => number;
  };
  turntableStateManager: {
    isOnTurntable: () => boolean;
    resetFadeOut: () => void;
    setOnTurntable: (value: boolean) => void;
    setTurntableVinylState: (state: TurntableVinylState | null) => void;
  };
  getTurntableController: () => {
    returnTonearmHome: () => void;
    pausePlayback: () => void;
    setMediaDuration: (duration: number) => void;
  } | null;
  focusCardController: {
    setFocusVinylManuallyHidden: (value: boolean) => void;
    updateFocusVinylVisibility: () => void;
    updateFocusCardPosition: () => void;
    takePreloadedFocusVinyl: () => {
      model: Object3D | null;
      promise: Promise<Object3D | null> | null;
    };
    cachePreloadedFocusVinyl: (model: Object3D) => void;
  };
  cameraRig: CameraRig;
  cameraTargets: Record<string, any>;
  runWhenTurntableReady: (callback: () => void) => void;
  setTurntablePositionState: (state: string) => void;
  setVinylCameraTrackingEnabled: (value: boolean) => void;
  focusCardAnchorPosition: Object3D["position"];
  vinylAnimationState: { cameraRelativeOffsetValid: boolean };
  resetVinylAnimationState: (
    anchor: Object3D["position"],
    source: VinylSource,
  ) => void;
  setVinylModelVisibility: (
    model: Object3D | null,
    source: string,
    visible: boolean,
    reason: string,
  ) => void;
  applyLabelTextures: (
    model: Object3D,
    textures: LabelTextures,
    options: LabelApplicationOptions,
    visuals: LabelVisualOptions,
  ) => void;
  applyFocusVinylScale: (model: Object3D | null, rig: CameraRig) => void;
  getFocusVinylScale: (rig: CameraRig) => number;
  setVinylScaleFactor: (value: number) => void;
  loadVinylModel: (texture: any) => Promise<Object3D>;
  vinylNormalTexture: any;
  heroGroup: Object3D;
  getSelectionCoverUrl: (selection: VinylSelectionDetail) => Promise<string>;
  extractVibrantColor: (url: string) => Promise<string>;
  extractDominantColor: (url: string) => Promise<string>;
  deriveVinylColorFromAlbumColor: (color: string) => string | null;
  FALLBACK_BACKGROUND_COLOR: string;
  applyMetadataToLabels: (
    metadata: VideoMetadata,
    allowOverride: boolean,
  ) => void;
  rebuildLabelTextures: () => void;
  labelVisuals: LabelVisualOptions;
  labelOptions: LabelApplicationOptions;
  getFocusLabelTextures: () => LabelTextures;
  setFocusVinylDerivedColor: (value: string | null) => void;
  getFocusVinylDerivedColor: () => string | null;
  getTurntableVinylDerivedColor: () => string | null;
  updateFocusVinylColorFromDerived: () => void;
  updateTurntableVinylVisuals: (visuals: LabelVisualOptions) => void;
  restoreDroppingVinylAppearance: (reason: string) => void;
  detachFocusTexturesForTurntable: () => LabelTextures;
  cloneLabelVisuals: (visuals: LabelVisualOptions) => LabelVisualOptions;
  disposeDroppingVinyl: () => void;
  disposeFocusVinyl: () => void;
  setActiveVinylSource: (
    source: VinylSource | null,
    options?: { syncState?: boolean },
  ) => void;
  getActiveVinylSource: () => VinylSource | null;
  getPendingPromotionSource: () => VinylSource | null;
  setPendingPromotionSource: (
    value: VinylSource | null,
    reason: string,
  ) => void;
  getFocusVinylState: () => FocusVinylState | null;
  setFocusVinylState: (state: FocusVinylState | null) => void;
  getTurntableVinylState: () => TurntableVinylState | null;
  setTurntableVinylState: (state: TurntableVinylState | null) => void;
  getDroppingVinylState: () => DroppingVinylState | null;
  setDroppingVinylState: (state: DroppingVinylState | null) => void;
  applyFocusVinylColorToModel: () => void;
  incrementFocusVinylLoadToken: () => number;
  getFocusVinylLoadToken: () => number;
  setVinylDragPointerId: (value: number | null) => void;
  getIsReturningVinyl: () => boolean;
  setIsReturningVinyl: (value: boolean) => void;
  setIsReturningToFocusCard: (value: boolean) => void;
  setShouldTrackFocusCard: (value: boolean) => void;
  getPendingVinylSelection: () => VinylSelectionDetail | null;
  setPendingVinylSelection: (value: VinylSelectionDetail | null) => void;
  getLoadedSelectionVideoId: () => string | null;
  setLoadedSelectionVideoId: (value: string | null) => void;
  getCurrentVideoLoad: () => Promise<void> | null;
  setCurrentVideoLoad: (value: Promise<void> | null) => void;
  incrementSelectionVisualUpdateId: () => number;
  getSelectionVisualUpdateId: () => number;
};

type DroppingVinylState = {
  model: Object3D;
  selection: VinylSelectionDetail;
  labelTextures: LabelTextures;
  labelVisuals: LabelVisualOptions;
  derivedColor: string | null;
};

type VinylSelectionController = {
  loadVideoForCurrentSelection: () => Promise<void>;
  handleFocusSelection: (selection: VinylSelectionDetail) => Promise<void>;
  resetFocusCardState: () => void;
};

export const createVinylSelectionController = (
  deps: VinylSelectionControllerDeps,
): VinylSelectionController => {
  let hasFocusCardRendered = false;

  const applySelectionVisualsToVinyl = async (
    selection: VinylSelectionDetail,
  ) => {
    const refreshFocusVinylColor = () => {
      deps.setFocusVinylDerivedColor(null);
      deps.updateFocusVinylColorFromDerived();
    };

    deps.applyMetadataToLabels(
      {
        artist: selection.artistName,
        song: selection.songName,
        album: "",
      },
      true,
    );
    deps.rebuildLabelTextures();

    if (
      typeof selection.labelColor === "string" &&
      selection.vinylColor !== undefined
    ) {
      deps.labelVisuals.background = selection.labelColor;
      deps.setFocusVinylDerivedColor(selection.vinylColor ?? null);
      deps.updateFocusVinylColorFromDerived();
      deps.rebuildLabelTextures();
      return;
    }

    const updateId = deps.incrementSelectionVisualUpdateId();
    try {
      const coverUrl = await deps.getSelectionCoverUrl(selection);
      const labelColor = await deps.extractVibrantColor(coverUrl);
      const vinylColor = await deps.extractDominantColor(coverUrl);

      if (updateId !== deps.getSelectionVisualUpdateId()) {
        return;
      }
      deps.labelVisuals.background = labelColor;
      deps.setFocusVinylDerivedColor(
        deps.deriveVinylColorFromAlbumColor(vinylColor),
      );
      deps.updateFocusVinylColorFromDerived();
    } catch (error) {
      if (updateId !== deps.getSelectionVisualUpdateId()) {
        return;
      }
      console.warn("Failed to extract dominant color, using fallback", error);
      deps.labelVisuals.background = deps.FALLBACK_BACKGROUND_COLOR;
      refreshFocusVinylColor();
    }
    if (updateId === deps.getSelectionVisualUpdateId()) {
      deps.rebuildLabelTextures();
    }
  };

  const loadVideoForCurrentSelection = async () => {
    const pending = deps.getPendingVinylSelection();
    if (!pending || !deps.turntableStateManager.isOnTurntable()) {
      return;
    }

    const currentLoad = deps.getCurrentVideoLoad();
    if (currentLoad) {
      try {
        await currentLoad;
      } catch {
        // ignore prior failure and attempt again
      }
      if (
        !deps.getPendingVinylSelection() ||
        !deps.turntableStateManager.isOnTurntable() ||
        (deps.getLoadedSelectionVideoId() &&
          deps.getPendingVinylSelection()?.videoId ===
            deps.getLoadedSelectionVideoId())
      ) {
        return;
      }
    }

    const selection = pending;
    const loadPromise = (async () => {
      console.log(
        `[loadVideoForCurrentSelection] Starting load for ${selection.artistName} - ${selection.songName}`,
      );
      deps.turntableStateManager.resetFadeOut();
      deps.getTurntableController()?.returnTonearmHome();
      deps.getTurntableController()?.pausePlayback();
      console.log(
        `[loadVideoForCurrentSelection] Clearing loadedSelectionVideoId (was "${deps.getLoadedSelectionVideoId()}")`,
      );
      deps.setLoadedSelectionVideoId(null);

      if (selection.aspectRatio !== undefined) {
        deps.yt.setAspectRatio(selection.aspectRatio);
        console.log(`[main] Applied aspect ratio: ${selection.aspectRatio}`);
      } else {
        deps.yt.setAspectRatio(null as any);
      }

      await deps.youtubePlayer.loadVideo(selection.videoId, (videoMetadata) => {
        const correctedMetadata: VideoMetadata = {
          artist: selection.artistName,
          song: selection.songName,
          album: videoMetadata?.album || "",
        };
        const focusMatchesSelection =
          deps.getFocusVinylState()?.selection.videoId === selection.videoId;
        if (!deps.getFocusVinylState() || focusMatchesSelection) {
          deps.applyMetadataToLabels(correctedMetadata, true);
        }
        const turntableVinylState = deps.getTurntableVinylState();
        if (turntableVinylState) {
          const updatedTurntableVisuals: LabelVisualOptions = {
            ...turntableVinylState.labelVisuals,
            title1:
              correctedMetadata.artist ||
              turntableVinylState.labelVisuals.title1,
            title2:
              correctedMetadata.song || turntableVinylState.labelVisuals.title2,
            title3:
              correctedMetadata.album ??
              turntableVinylState.labelVisuals.title3,
          };
          deps.updateTurntableVinylVisuals(updatedTurntableVisuals);
        }

        const duration = deps.youtubePlayer.getDuration();
        if (duration > 0 && deps.getTurntableController()) {
          deps.getTurntableController()?.setMediaDuration(duration);
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

      const duration = deps.youtubePlayer.getDuration();
      if (duration > 1 && deps.getTurntableController()) {
        deps.getTurntableController()?.setMediaDuration(duration);
      }
      deps.videoControls.setProgress(0, duration);

      const currentVolume = deps.videoControls.getVolume();
      deps.yt.setVolume(0);
      deps.yt.play();
      setTimeout(() => {
        deps.yt.pause();
        deps.yt.seek(0);
        deps.yt.setVolume(currentVolume);
      }, 300);

      const isOnTurntable = deps.turntableStateManager.isOnTurntable();
      console.log(
        `[loadVideoForCurrentSelection] isOnTurntable=${isOnTurntable}`,
      );
      if (isOnTurntable) {
        deps.setLoadedSelectionVideoId(selection.videoId);
        console.log(
          `Loaded for turntable: ${selection.artistName} - ${selection.songName}`,
        );
        console.log(
          `[loadVideoForCurrentSelection] Set loadedSelectionVideoId="${deps.getLoadedSelectionVideoId()}"`,
        );
      } else {
        deps.setLoadedSelectionVideoId(null);
        console.log(
          `[loadVideoForCurrentSelection] Not on turntable, cleared loadedSelectionVideoId`,
        );
      }
    })();

    deps.setCurrentVideoLoad(loadPromise);
    try {
      await loadPromise;
    } finally {
      if (deps.getCurrentVideoLoad() === loadPromise) {
        deps.setCurrentVideoLoad(null);
      }
    }

    if (
      deps.getPendingVinylSelection() &&
      deps.getPendingVinylSelection()?.videoId !== selection.videoId
    ) {
      void loadVideoForCurrentSelection();
    }
  };

  const prepareFocusVinylPresentation = (model: Object3D, token: number) => {
    if (!deps.getDroppingVinylState()) {
      deps.setActiveVinylSource("focus");
    }
    const scaleFactor = deps.getFocusVinylScale(deps.cameraRig);
    deps.setVinylScaleFactor(scaleFactor);
    deps.vinylAnimationState.cameraRelativeOffsetValid = false;
    deps.focusCardController.updateFocusCardPosition();

    deps.setVinylModelVisibility(
      model,
      "focus",
      false,
      "prepareFocusVinylPresentation",
    );

    deps.resetVinylAnimationState(deps.focusCardAnchorPosition, "focus");
    deps.setVinylCameraTrackingEnabled(true);

    deps.cameraRig.onAnimationComplete(() => {
      if (
        token === deps.getFocusVinylLoadToken() &&
        deps.getFocusVinylState()?.model === model
      ) {
        deps.focusCardController.setFocusVinylManuallyHidden(false);
        deps.focusCardController.updateFocusVinylVisibility();
        deps.focusCardController.updateFocusCardPosition();

        // console.log(
        //   "[load-vinyl-song] Camera animation complete, vinyl now visible",
        // );
      }
    });

    deps.cameraRig.clearRotationState();
    deps.runWhenTurntableReady(() => {
      deps.setTurntablePositionState("bottom-center");
      deps.cameraRig.setLookTarget(deps.cameraTargets["bottom-center"], true);
      const focusDirection = directionFromAngles(TURNTABLE_CAMERA_YAW, 22);
      deps.cameraRig.setViewDirection(focusDirection, true);
      deps.vinylAnimationState.cameraRelativeOffsetValid = false;

      // Show focus card with fade-in only if there's no focus card rendered yet
      if (!hasFocusCardRendered) {
        hasFocusCardRendered = true;
        const viewer = (window as any).vinylLibraryViewer;
        if (viewer?.showFocusCardUI) {
          viewer.showFocusCardUI(0); // Show immediately as camera starts moving
        }
      } else {
        // Show immediately without fade-in for subsequent cards
        const viewer = (window as any).vinylLibraryViewer;
        if (viewer?.showFocusCardUIImmediate) {
          viewer.showFocusCardUIImmediate();
        }
      }
    });
  };

  const handleFocusSelection = async (selection: VinylSelectionDetail) => {
    // console.log(
    //   `[handleFocusSelection] Starting for ${selection.artistName} - ${selection.songName}`,
    // );
    // console.log(
    //   `[handleFocusSelection] State: isReturningVinyl=${deps.getIsReturningVinyl()}, focusVinylState=${deps.getFocusVinylState() ? "exists" : "null"}, pendingPromotionSource=${deps.getPendingPromotionSource()}, activeVinylSource=${deps.getActiveVinylSource()}`,
    // );
    const loadToken = deps.incrementFocusVinylLoadToken();
    deps.setVinylDragPointerId(null);

    const focusVinylIsReturning =
      deps.getIsReturningVinyl() &&
      deps.getFocusVinylState() &&
      deps.getPendingPromotionSource() === "focus";
    const turntableVinylIsReturning =
      deps.getIsReturningVinyl() &&
      deps.getTurntableVinylState() &&
      deps.getActiveVinylSource() === "turntable";

    if (focusVinylIsReturning && deps.getFocusVinylState()) {
      // console.log(
      //   `[handleFocusSelection] Transferring returning FOCUS vinyl to dropping state: ${deps.getFocusVinylState()!.selection.songName}`,
      // );
      deps.disposeDroppingVinyl();
      const droppingTextures = deps.detachFocusTexturesForTurntable();
      deps.setDroppingVinylState({
        model: deps.getFocusVinylState()!.model,
        selection: deps.getFocusVinylState()!.selection,
        labelTextures: droppingTextures,
        labelVisuals: deps.cloneLabelVisuals(deps.labelVisuals),
        derivedColor: deps.getFocusVinylDerivedColor(),
      });
      deps.setVinylModelVisibility(
        deps.getDroppingVinylState()!.model,
        "dropping",
        true,
        "transferred from focus to dropping",
      );
      deps.setFocusVinylState(null);
      deps.setActiveVinylSource("dropping");
    } else if (turntableVinylIsReturning && deps.getTurntableVinylState()) {
      // console.log(
      //   `[handleFocusSelection] Transferring returning TURNTABLE vinyl to dropping state: ${deps.getTurntableVinylState()!.selection.songName}`,
      // );
      deps.disposeDroppingVinyl();
      deps.setDroppingVinylState({
        model: deps.getTurntableVinylState()!.model,
        selection: deps.getTurntableVinylState()!.selection,
        labelTextures: deps.getTurntableVinylState()!.labelTextures,
        labelVisuals: deps.getTurntableVinylState()!.labelVisuals,
        derivedColor: deps.getTurntableVinylDerivedColor(),
      });
      deps.setVinylModelVisibility(
        deps.getDroppingVinylState()!.model,
        "dropping",
        true,
        "transferred from turntable to dropping",
      );
      deps.setTurntableVinylState(null);
      deps.turntableStateManager.setOnTurntable(false);
      deps.turntableStateManager.setTurntableVinylState(null);
      deps.setActiveVinylSource("dropping");
    } else {
      deps.setIsReturningVinyl(false);
      deps.setIsReturningToFocusCard(false);
    }
    deps.setPendingPromotionSource(null, "handleFocusSelection-start");

    deps.focusCardController.setFocusVinylManuallyHidden(true);
    deps.focusCardController.updateFocusVinylVisibility();

    if (deps.getTurntableVinylState()?.model) {
      // console.log(
      //   `[handleFocusSelection] Turntable vinyl BEFORE visuals: visible=${deps.getTurntableVinylState()!.model.visible}, song=${deps.getTurntableVinylState()!.selection.songName}`,
      // );
    } else {
      // console.log(
      //   `[handleFocusSelection] No turntable vinyl state BEFORE visuals`,
      // );
    }

    // console.log(`[handleFocusSelection] Applying selection visuals...`);
    await applySelectionVisualsToVinyl(selection);
    // console.log(`[handleFocusSelection] Selection visuals applied`);
    deps.restoreDroppingVinylAppearance("focusSelection");
    if (deps.getTurntableVinylState()) {
      deps.updateTurntableVinylVisuals(
        deps.getTurntableVinylState()!.labelVisuals,
      );
    }

    if (deps.getTurntableVinylState()?.model) {
      // console.log(
      //   `[handleFocusSelection] Turntable vinyl AFTER visuals: visible=${deps.getTurntableVinylState()!.model.visible}, song=${deps.getTurntableVinylState()!.selection.songName}`,
      // );
    } else {
      // console.log(
      //   `[handleFocusSelection] No turntable vinyl state AFTER visuals`,
      // );
    }

    if (deps.getFocusVinylState()) {
      deps.disposeFocusVinyl();
    }
    deps.setShouldTrackFocusCard(true);

    try {
      let model: Object3D | null = null;
      const preloaded = deps.focusCardController.takePreloadedFocusVinyl();
      if (preloaded.model) {
        if (preloaded.model === deps.getTurntableVinylState()?.model) {
          console.warn(
            "[handleFocusSelection] Preloaded model is turntable vinyl! Loading fresh model.",
          );
          model = await deps.loadVinylModel(deps.vinylNormalTexture);
        } else {
          model = preloaded.model;
        }
      } else if (preloaded.promise) {
        const resolved = await preloaded.promise;
        if (resolved && !deps.getFocusVinylState()) {
          if (resolved === deps.getTurntableVinylState()?.model) {
            console.warn(
              "[handleFocusSelection] Resolved preload is turntable vinyl! Loading fresh model.",
            );
            model = await deps.loadVinylModel(deps.vinylNormalTexture);
          } else {
            model = resolved;
          }
        }
      }
      if (!model) {
        model = await deps.loadVinylModel(deps.vinylNormalTexture);
      }
      if (loadToken !== deps.getFocusVinylLoadToken()) {
        deps.heroGroup.remove(model);
        deps.focusCardController.cachePreloadedFocusVinyl(model);
        return;
      }
      deps.setFocusVinylState({ model, selection });
      deps.applyFocusVinylColorToModel();
      deps.setVinylModelVisibility(
        model,
        "focus",
        false,
        "initial hide before reveal",
      );
      if (!model.parent) {
        deps.heroGroup.add(model);
      }
      deps.applyLabelTextures(
        model,
        deps.getFocusLabelTextures(),
        deps.labelOptions,
        deps.labelVisuals,
      );
      deps.applyFocusVinylScale(
        deps.getFocusVinylState()?.model ?? null,
        deps.cameraRig,
      );
      if (!deps.getDroppingVinylState()) {
        deps.setActiveVinylSource("focus");
      }

      if (deps.getTurntableVinylState()?.model) {
        // console.log(
        //   `[handleFocusSelection] Turntable vinyl BEFORE prepare: visible=${deps.getTurntableVinylState()!.model.visible}, song=${deps.getTurntableVinylState()!.selection.songName}`,
        // );
      } else {
        // console.log(
        //   `[handleFocusSelection] No turntable vinyl state BEFORE prepare`,
        // );
      }

      prepareFocusVinylPresentation(model, loadToken);

      if (deps.getTurntableVinylState()?.model) {
        // console.log(
        //   `[handleFocusSelection] Turntable vinyl AFTER prepare: visible=${deps.getTurntableVinylState()!.model.visible}, song=${deps.getTurntableVinylState()!.selection.songName}`,
        // );
      } else {
        // console.log(
        //   `[handleFocusSelection] No turntable vinyl state AFTER prepare`,
        // );
      }
    } catch (error) {
      console.error("Failed to load focus vinyl", error);
    }
  };

  window.addEventListener("load-vinyl-song", (event) => {
    const detail = (event as CustomEvent<VinylSelectionDetail>).detail;
    // console.log(`[load-vinyl-song] Event received:`, detail);
    if (!detail || !detail.videoId) {
      console.warn(`[load-vinyl-song] Invalid detail or missing videoId`);
      return;
    }

    deps.setPendingVinylSelection(detail);
    void handleFocusSelection(detail);
  });

  const resetFocusCardState = () => {
    hasFocusCardRendered = false;
  };

  return {
    loadVideoForCurrentSelection,
    handleFocusSelection,
    resetFocusCardState,
  };
};
