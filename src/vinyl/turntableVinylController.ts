import { Vector3 } from "three";
import type { Object3D } from "three";
import type { YouTubeBridge } from "../youtube/youtube";
import type {
  FocusVinylState,
  TurntableVinylState,
  VinylSelectionDetail,
  VinylSource,
} from "./vinylInteractions";
import type { LabelTextures, LabelVisualOptions } from "./labels";

type TurntableVinylControllerDeps = {
  yt: YouTubeBridge;
  root: HTMLElement;
  turntableStateManager: {
    isOnTurntable: () => boolean;
    setOnTurntable: (value: boolean) => void;
    setTurntableVinylState: (state: TurntableVinylState | null) => void;
    setTonearmInPlayArea: (value: boolean) => void;
  };
  getTurntableController: () => {
    setVinylPresence: (value: boolean) => void;
    returnTonearmHome: () => void;
    liftNeedle: () => void;
  } | null;
  getPendingPromotionSource: () => VinylSource | null;
  setPendingPromotionSource: (
    value: VinylSource | null,
    reason: string,
  ) => void;
  getFocusVinylState: () => FocusVinylState | null;
  setFocusVinylState: (state: FocusVinylState | null) => void;
  getTurntableVinylState: () => TurntableVinylState | null;
  setTurntableVinylState: (state: TurntableVinylState | null) => void;
  getFocusVinylDerivedColor: () => string | null;
  setTurntableVinylDerivedColor: (value: string | null) => void;
  updateTurntableVinylColorFromDerived: () => void;
  detachFocusTexturesForTurntable: () => LabelTextures;
  cloneLabelVisuals: (visuals: LabelVisualOptions) => LabelVisualOptions;
  labelVisuals: LabelVisualOptions;
  setVinylModelVisibility: (
    model: Object3D | null,
    source: string,
    visible: boolean,
    reason: string,
  ) => void;
  setActiveVinylSource: (source: VinylSource | null) => void;
  setShouldTrackFocusCard: (value: boolean) => void;
  disposeTurntableVinyl: (reason: string) => void;
  loadVideoForCurrentSelection: () => Promise<void>;
  getPendingVinylSelection: () => VinylSelectionDetail | null;
  setPendingVinylSelection: (value: VinylSelectionDetail | null) => void;
  getLoadedSelectionVideoId: () => string | null;
  setLoadedSelectionVideoId: (value: string | null) => void;
  setIsTonearmInPlayArea: (value: boolean) => void;
  flyawayVinyls: Array<{
    model: Object3D;
    velocity: Vector3;
    spin: Vector3;
    lifetime: number;
    initialScale: number;
    textures: LabelTextures;
    selection: VinylSelectionDetail;
  }>;
};

type TurntableVinylController = {
  setVinylOnTurntable: (onTurntable: boolean) => void;
  clearTurntableVinylPreservingPromotion: () => void;
  startTurntableVinylFlyaway: () => void;
};

export const createTurntableVinylController = (
  deps: TurntableVinylControllerDeps,
): TurntableVinylController => {
  const setVinylOnTurntable = (onTurntable: boolean) => {
    if (onTurntable === deps.turntableStateManager.isOnTurntable()) {
      console.log(
        `[turntableVinyl] setVinylOnTurntable(${onTurntable}) skipped (already ${onTurntable})`,
      );
      return;
    }
    console.log(`[turntableVinyl] setVinylOnTurntable(${onTurntable})`);

    if (onTurntable) {
      const promotingFocus = deps.getPendingPromotionSource() === "focus";
      deps.setPendingPromotionSource(null, "setVinylOnTurntable(true)");
      if (promotingFocus && deps.getFocusVinylState()) {
        if (deps.getTurntableVinylState()) {
          deps.disposeTurntableVinyl("promoting focus->turntable");
        }
        const textures = deps.detachFocusTexturesForTurntable();
        const snapshotVisuals = deps.cloneLabelVisuals(deps.labelVisuals);
        deps.setTurntableVinylState({
          model: deps.getFocusVinylState()!.model,
          selection: deps.getFocusVinylState()!.selection,
          labelTextures: textures,
          labelVisuals: snapshotVisuals,
        });
        deps.setTurntableVinylDerivedColor(deps.getFocusVinylDerivedColor());
        deps.updateTurntableVinylColorFromDerived();
        deps.setVinylModelVisibility(
          deps.getTurntableVinylState()!.model,
          "turntable",
          true,
          "promoted from focus",
        );
        deps.setFocusVinylState(null);
        deps.setShouldTrackFocusCard(false);
        deps.setActiveVinylSource("turntable");
      }
      if (!deps.getTurntableVinylState()) {
        return;
      }
      deps.setVinylModelVisibility(
        deps.getTurntableVinylState()!.model,
        "turntable",
        true,
        "setVinylOnTurntable",
      );
      deps.turntableStateManager.setOnTurntable(true);
      deps.turntableStateManager.setTurntableVinylState(
        deps.getTurntableVinylState(),
      );
      deps.getTurntableController()?.setVinylPresence(true);
      if (promotingFocus) {
        deps.getTurntableController()?.returnTonearmHome();
        deps.setPendingVinylSelection(deps.getTurntableVinylState()!.selection);
        void deps.loadVideoForCurrentSelection();
      }
      return;
    }

    deps.setPendingPromotionSource(null, "setVinylOnTurntable(false) request");
    if (!deps.turntableStateManager.isOnTurntable()) {
      return;
    }

    deps.turntableStateManager.setOnTurntable(false);
    deps.turntableStateManager.setTurntableVinylState(null);
    deps.getTurntableController()?.setVinylPresence(false);
    deps.yt.pause();
    deps.setLoadedSelectionVideoId(null);
    deps.turntableStateManager.setTonearmInPlayArea(false);
    deps.yt.setControlsVisible(false);
    const viewport = deps.root?.querySelector(
      ".yt-player-viewport",
    ) as HTMLElement | null;
    if (viewport) {
      viewport.style.height = "0px";
    }
    deps.getTurntableController()?.liftNeedle();
    deps.disposeTurntableVinyl("setVinylOnTurntable(false)");
    deps.setActiveVinylSource(deps.getFocusVinylState() ? "focus" : null);
  };

  const clearTurntableVinylPreservingPromotion = () => {
    if (!deps.getTurntableVinylState()) {
      console.log(
        "[turntableVinyl] clearTurntableVinylPreservingPromotion skipped (no turntable state)",
      );
      return;
    }
    if (deps.getPendingPromotionSource() !== "focus") {
      console.log(
        `[turntableVinyl] clearTurntableVinylPreservingPromotion skipped (pendingPromotionSource=${deps.getPendingPromotionSource()})`,
      );
      return;
    }
    console.log(
      `[turntableVinyl] Clearing turntable vinyl for pending promotion (${deps.getTurntableVinylState()!.selection.songName})`,
    );
    const previousPromotion = deps.getPendingPromotionSource();
    setVinylOnTurntable(false);
    deps.setPendingPromotionSource(
      previousPromotion,
      "restore after clearTurntableVinylPreservingPromotion",
    );
    deps.getTurntableController()?.returnTonearmHome();
  };

  const startTurntableVinylFlyaway = () => {
    if (!deps.getTurntableVinylState()) {
      return;
    }
    console.log(
      `[turntableVinyl] Starting flyaway for ${deps.getTurntableVinylState()!.selection.songName}`,
    );
    const { model, labelTextures, selection } = deps.getTurntableVinylState()!;

    deps.flyawayVinyls.push({
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
      selection: selection,
    });
    deps.setTurntableVinylState(null);
    deps.turntableStateManager.setOnTurntable(false);
    deps.turntableStateManager.setTurntableVinylState(null);
    deps.setPendingPromotionSource(null, "startTurntableVinylFlyaway");
    deps.getTurntableController()?.setVinylPresence(false);
    deps.getTurntableController()?.liftNeedle();
    deps.yt.pause();
    deps.setLoadedSelectionVideoId(null);
    deps.setIsTonearmInPlayArea(false);
    deps.turntableStateManager.setTonearmInPlayArea(false);
    deps.yt.setControlsVisible(false);
    deps.yt.updateButtonVisibility();
    const viewport = deps.root.querySelector(
      ".yt-player-viewport",
    ) as HTMLElement | null;
    if (viewport) {
      viewport.style.height = "0px";
    }
    deps.setActiveVinylSource(deps.getFocusVinylState() ? "focus" : null);
  };

  return {
    setVinylOnTurntable,
    clearTurntableVinylPreservingPromotion,
    startTurntableVinylFlyaway,
  };
};
