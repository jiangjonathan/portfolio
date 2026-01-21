import type { Camera, Mesh, WebGLRenderer } from "three";
import { PlaneGeometry, Vector3 } from "three";

export type PaperOverlayRegistration = {
  paperId: string;
  element: HTMLElement;
  viewportWidth: number;
  viewportHeight: number;
  contentHeight: number;
};

type PaperOverlayEntry = {
  root: HTMLDivElement;
  inner: HTMLDivElement;
  viewportWidth: number;
  viewportHeight: number;
  contentHeight: number;
  scrollOffset: number;
};

const TEMP_CORNER = new Vector3();
const CORNER_POINTS = [
  new Vector3(), // top-left
  new Vector3(), // top-right
  new Vector3(), // bottom-left
];

export class PaperOverlayManager {
  private container: HTMLDivElement;
  private overlays = new Map<string, PaperOverlayEntry>();
  private isActive = false;

  constructor(parent: HTMLElement) {
    const container = document.createElement("div");
    container.id = "paper-overlay-root";
    Object.assign(container.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "900",
      overflow: "hidden",
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(container);
    this.container = container;
  }

  setActive(active: boolean) {
    this.isActive = active;
    this.container.style.display = active ? "block" : "none";
  }

  registerPaperOverlay({
    paperId,
    element,
    viewportHeight,
    viewportWidth,
    contentHeight,
  }: PaperOverlayRegistration) {
    const existing = this.overlays.get(paperId);
    const root = existing?.root ?? document.createElement("div");
    const inner = existing?.inner ?? document.createElement("div");
    const clampedContentHeight = Math.max(contentHeight, viewportHeight);

    root.className = "paper-overlay";
    Object.assign(root.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: `${viewportWidth}px`,
      height: `${viewportHeight}px`,
      transformOrigin: "0 0",
      overflow: "hidden",
      pointerEvents: "none",
      display: this.isActive ? "block" : "none",
    } satisfies Partial<CSSStyleDeclaration>);

    inner.className = "paper-overlay-inner";
    Object.assign(inner.style, {
      width: "100%",
      height: `${clampedContentHeight}px`,
      transform: "translate3d(0, 0, 0)",
      transformOrigin: "0 0",
      position: "relative",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);

    inner.replaceChildren(element);
    if (!existing) {
      root.appendChild(inner);
      this.container.appendChild(root);
    }

    this.overlays.set(paperId, {
      root,
      inner,
      viewportHeight,
      viewportWidth,
      contentHeight: clampedContentHeight,
      scrollOffset: existing?.scrollOffset ?? 0,
    });

    // Apply current scroll offset if one was previously set
    this.applyScrollOffset(paperId);
  }

  setScrollOffset(paperId: string, offset: number) {
    const entry = this.overlays.get(paperId);
    if (!entry) return;
    const maxScroll = Math.max(0, entry.contentHeight - entry.viewportHeight);
    entry.scrollOffset = Math.max(0, Math.min(maxScroll, offset));
    this.applyScrollOffset(paperId);
  }

  updateContentHeight(paperId: string, contentHeight: number) {
    const entry = this.overlays.get(paperId);
    if (!entry) return;
    entry.contentHeight = Math.max(contentHeight, entry.viewportHeight);
    entry.inner.style.height = `${entry.contentHeight}px`;
    this.applyScrollOffset(paperId);
  }

  updateTransforms(
    camera: Camera,
    renderer: WebGLRenderer,
    paperMeshes: Map<string, Mesh>,
  ) {
    if (!this.isActive) {
      return;
    }

    const viewportWidth = renderer.domElement.clientWidth;
    const viewportHeight = renderer.domElement.clientHeight;

    const projectToScreen = (world: Vector3) => {
      TEMP_CORNER.copy(world).project(camera);
      return {
        x: (TEMP_CORNER.x * 0.5 + 0.5) * viewportWidth,
        y: (-TEMP_CORNER.y * 0.5 + 0.5) * viewportHeight,
      };
    };

    for (const [paperId, entry] of this.overlays.entries()) {
      const mesh = paperMeshes.get(paperId);
      if (!mesh || !mesh.visible) {
        entry.root.style.display = "none";
        continue;
      }

      const geometry = mesh.geometry as PlaneGeometry;
      const paperWidth = geometry.parameters?.width ?? 1;
      const paperHeight = geometry.parameters?.height ?? 1;
      const halfW = paperWidth / 2;
      const halfH = paperHeight / 2;

      // Top-left
      CORNER_POINTS[0].set(-halfW, halfH, 0).applyMatrix4(mesh.matrixWorld);
      // Top-right
      CORNER_POINTS[1].set(halfW, halfH, 0).applyMatrix4(mesh.matrixWorld);
      // Bottom-left
      CORNER_POINTS[2].set(-halfW, -halfH, 0).applyMatrix4(mesh.matrixWorld);

      const screenTL = projectToScreen(CORNER_POINTS[0]);
      const screenTR = projectToScreen(CORNER_POINTS[1]);
      const screenBL = projectToScreen(CORNER_POINTS[2]);

      const basisX = {
        x: (screenTR.x - screenTL.x) / entry.viewportWidth,
        y: (screenTR.y - screenTL.y) / entry.viewportWidth,
      };
      const basisY = {
        x: (screenBL.x - screenTL.x) / entry.viewportHeight,
        y: (screenBL.y - screenTL.y) / entry.viewportHeight,
      };

      const transform = `matrix(${basisX.x}, ${basisX.y}, ${basisY.x}, ${basisY.y}, ${screenTL.x}, ${screenTL.y})`;
      entry.root.style.transform = transform;
      entry.root.style.display = "block";
    }
  }

  private applyScrollOffset(paperId: string) {
    const entry = this.overlays.get(paperId);
    if (!entry) return;
    entry.inner.style.transform = `translate3d(0, ${-entry.scrollOffset}px, 0)`;
  }
}
