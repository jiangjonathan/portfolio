import { Vector3 } from "three";
import type { Object3D } from "three";
import type { LabelTextures, LabelVisualOptions } from "./labels";

export type VinylSource = "focus" | "turntable";
export type VinylAnchorType = "turntable" | "focus";

export interface VinylSelectionDetail {
  entryId?: string | null;
  videoId: string;
  artistName: string;
  songName: string;
  aspectRatio?: number;
  imageUrl?: string;
}

export interface FocusVinylState {
  model: Object3D;
  selection: VinylSelectionDetail;
}

export interface TurntableVinylState {
  model: Object3D;
  selection: VinylSelectionDetail;
  labelTextures: LabelTextures;
  labelVisuals: LabelVisualOptions;
}

export interface FlyawayVinyl {
  model: Object3D;
  velocity: Vector3;
  spin: Vector3;
  lifetime: number;
  initialScale: number;
  textures: LabelTextures;
}

export class VinylStateManager {
  public focusVinylState: FocusVinylState | null = null;
  public turntableVinylState: TurntableVinylState | null = null;
  public activeVinylSource: VinylSource | null = null;
  public vinylModel: Object3D | null = null;
  public flyawayVinyls: FlyawayVinyl[] = [];
  public ON_TURNTABLE = false;

  private heroGroup: Object3D;

  constructor(heroGroup: Object3D) {
    this.heroGroup = heroGroup;
  }

  setActiveVinylSource(
    source: VinylSource | null,
    _options: { syncState?: boolean } = {},
  ): void {
    if (this.activeVinylSource === source) {
      return;
    }
    this.activeVinylSource = source;
    if (source === "focus") {
      this.vinylModel = this.focusVinylState?.model ?? null;
    } else if (source === "turntable") {
      this.vinylModel = this.turntableVinylState?.model ?? null;
    } else {
      this.vinylModel = null;
    }
  }

  disposeFocusVinyl(): void {
    if (!this.focusVinylState) {
      return;
    }
    this.heroGroup.remove(this.focusVinylState.model);
    this.focusVinylState = null;
    if (this.activeVinylSource === "focus") {
      this.setActiveVinylSource(this.turntableVinylState ? "turntable" : null);
    }
  }

  disposeTurntableVinyl(): void {
    if (!this.turntableVinylState) {
      return;
    }
    this.heroGroup.remove(this.turntableVinylState.model);
    this.turntableVinylState.labelTextures.sideA.dispose();
    this.turntableVinylState.labelTextures.sideB.dispose();
    this.turntableVinylState = null;
    if (this.activeVinylSource === "turntable") {
      this.setActiveVinylSource(this.focusVinylState ? "focus" : null);
    }
  }

  startTurntableVinylFlyaway(): void {
    if (!this.turntableVinylState) {
      return;
    }
    const { model, labelTextures } = this.turntableVinylState;
    this.flyawayVinyls.push({
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
    this.turntableVinylState = null;
    this.ON_TURNTABLE = false;
    this.setActiveVinylSource(this.focusVinylState ? "focus" : null);
  }

  updateFlyawayVinyls(delta: number): void {
    for (let i = this.flyawayVinyls.length - 1; i >= 0; i--) {
      const entry = this.flyawayVinyls[i];
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
        this.heroGroup.remove(entry.model);
        entry.textures.sideA.dispose();
        entry.textures.sideB.dispose();
        this.flyawayVinyls.splice(i, 1);
      }
    }
  }

  hasActiveVinyl(): boolean {
    return (
      Boolean(this.focusVinylState?.model) ||
      Boolean(this.turntableVinylState?.model) ||
      this.flyawayVinyls.length > 0
    );
  }
}
