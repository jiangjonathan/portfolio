import type { Camera, Mesh, WebGLRenderer } from "three";
import { PlaneGeometry, Vector3 } from "three";

export type PaperOverlayRegistration = {
  paperId: string;
  element: HTMLElement;
  viewportWidth: number;
  viewportHeight: number;
  contentHeight: number;
  interactive?: boolean;
  useNativeScroll?: boolean;
  onScroll?: (metrics: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  }) => void;
  overlayClass?: string;
  stackIndex?: number;
};

type PaperOverlayEntry = {
  root: HTMLDivElement;
  inner: HTMLDivElement;
  scrollbar?: HTMLDivElement;
  scrollbarThumb?: HTMLDivElement;
  viewportWidth: number;
  viewportHeight: number;
  contentHeight: number;
  scrollOffset: number;
  scrollMode: "manual" | "native";
  onScroll?: (metrics: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  }) => void;
  scrollHandler?: () => void;
  interactive: boolean;
  overlayClass?: string;
  stackIndex: number;
};

const TEMP_CORNER = new Vector3();
const TEMP_CENTER = new Vector3();
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
      display: "contents",
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(container);
    this.container = container;
  }

  setActive(active: boolean) {
    this.isActive = active;
    this.container.style.display = active ? "contents" : "none";
  }

  show() {
    this.overlays.forEach((entry) => {
      entry.root.style.opacity = "1";
      entry.root.style.visibility = "visible";
    });
  }

  hide() {
    this.overlays.forEach((entry) => {
      entry.root.style.opacity = "0";
      entry.root.style.visibility = "hidden";
    });
  }

  registerPaperOverlay({
    paperId,
    element,
    viewportHeight,
    viewportWidth,
    contentHeight,
    interactive = false,
    useNativeScroll = false,
    onScroll,
    overlayClass,
    stackIndex = 0,
  }: PaperOverlayRegistration) {
    const existing = this.overlays.get(paperId);
    const root = existing?.root ?? document.createElement("div");
    const inner = existing?.inner ?? document.createElement("div");
    const scrollbar = existing?.scrollbar ?? document.createElement("div");
    const scrollbarThumb =
      existing?.scrollbarThumb ?? document.createElement("div");
    const clampedContentHeight = Math.max(contentHeight, viewportHeight);
    const scrollMode = useNativeScroll ? "native" : "manual";
    const normalizedStackIndex =
      typeof stackIndex === "number" && Number.isFinite(stackIndex)
        ? stackIndex
        : 0;

    // Calculate z-index: lower stackIndex = higher in stack = higher z-index
    // Base z-index is 900, top paper (stackIndex 0) gets 900, next gets 899, etc.
    const overlayZIndex = 900 - normalizedStackIndex;

    root.className = "paper-overlay";
    if (overlayClass) {
      root.classList.add(overlayClass);
    }
    Object.assign(root.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: `${viewportWidth}px`,
      height: `${viewportHeight}px`,
      transformOrigin: "0 0",
      overflow: useNativeScroll ? "hidden auto" : "hidden",
      overflowX: "hidden",
      overflowY: useNativeScroll ? "auto" : "hidden",
      pointerEvents: interactive ? "auto" : "none",
      display: this.isActive ? "block" : "none",
      overscrollBehavior: "contain",
      zIndex: String(overlayZIndex),
    } satisfies Partial<CSSStyleDeclaration>);

    inner.className = "paper-overlay-inner";
    Object.assign(inner.style, {
      width: "100%",
      maxWidth: "100%",
      height: useNativeScroll ? "auto" : `${clampedContentHeight}px`,
      transform: "translate3d(0, 0, 0)",
      transformOrigin: "0 0",
      position: "relative",
      pointerEvents: interactive ? "auto" : "none",
      overflow: "hidden",
      boxSizing: "border-box",
    } satisfies Partial<CSSStyleDeclaration>);

    inner.replaceChildren(element);
    scrollbar.className = "paper-overlay-scrollbar";
    scrollbarThumb.className = "paper-overlay-scrollbar-thumb";
    if (!existing) {
      root.appendChild(inner);
      scrollbar.appendChild(scrollbarThumb);
      root.appendChild(scrollbar);
      this.container.appendChild(root);
    }

    if (existing?.scrollHandler) {
      root.removeEventListener("scroll", existing.scrollHandler);
    }

    const scrollHandler = useNativeScroll
      ? () => {
          const entry = this.overlays.get(paperId);
          if (!entry) return;
          entry.scrollOffset = root.scrollTop;
          entry.onScroll?.({
            scrollTop: root.scrollTop,
            scrollHeight: root.scrollHeight,
            clientHeight: root.clientHeight,
          });
          this.updateScrollbar(entry);
        }
      : undefined;

    if (scrollHandler) {
      root.addEventListener("scroll", scrollHandler);
    }

    const overlayEntry: PaperOverlayEntry = {
      root,
      inner,
      scrollbar,
      scrollbarThumb,
      viewportHeight,
      viewportWidth,
      contentHeight: clampedContentHeight,
      scrollOffset: existing?.scrollOffset ?? 0,
      scrollMode,
      onScroll,
      scrollHandler,
      interactive,
      overlayClass,
      stackIndex: normalizedStackIndex,
    };
    this.overlays.set(paperId, overlayEntry);

    // Apply current scroll offset if one was previously set
    this.applyScrollOffset(paperId, useNativeScroll);

    if (useNativeScroll) {
      requestAnimationFrame(() => {
        const entry = this.overlays.get(paperId);
        if (!entry) return;
        entry.contentHeight = Math.max(
          entry.root.scrollHeight,
          entry.viewportHeight,
        );
        this.updateScrollbar(entry);
      });
    }
  }

  setOverlayInteractive(paperId: string, interactive: boolean) {
    const entry = this.overlays.get(paperId);
    if (!entry) return;
    entry.interactive = interactive;
    entry.root.style.pointerEvents = interactive ? "auto" : "none";
    entry.inner.style.pointerEvents = interactive ? "auto" : "none";
  }

  setScrollOffset(
    paperId: string,
    offset: number,
    options: { force?: boolean } = {},
  ) {
    const entry = this.overlays.get(paperId);
    if (!entry) return;
    const maxScroll = Math.max(0, entry.contentHeight - entry.viewportHeight);
    entry.scrollOffset = Math.max(0, Math.min(maxScroll, offset));
    const forceNative = options.force ?? false;
    this.applyScrollOffset(paperId, forceNative);
  }

  updateContentHeight(paperId: string, contentHeight: number) {
    const entry = this.overlays.get(paperId);
    if (!entry) return;
    entry.contentHeight = Math.max(contentHeight, entry.viewportHeight);
    if (entry.scrollMode === "manual") {
      entry.inner.style.height = `${entry.contentHeight}px`;
    }
    this.updateScrollbar(entry);
    this.applyScrollOffset(paperId, false);
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

      mesh.getWorldPosition(TEMP_CENTER);
      const distance = TEMP_CENTER.distanceTo(camera.position);
      const zIndex = Math.max(0, Math.round(10000 - distance * 100));

      const basisX = {
        x: (screenTR.x - screenTL.x) / entry.viewportWidth,
        y: (screenTR.y - screenTL.y) / entry.viewportWidth,
      };
      const basisY = {
        x: (screenBL.x - screenTL.x) / entry.viewportHeight,
        y: (screenBL.y - screenTL.y) / entry.viewportHeight,
      };

      const scaleX = Math.hypot(basisX.x, basisX.y);
      const scaleY = Math.hypot(basisY.x, basisY.y);
      const screenScale = Math.max((scaleX + scaleY) * 0.5, 0.0001);
      const desiredScrollbarScreenWidth = 28;
      const desiredBorderScreenWidth = 6;
      entry.root.style.setProperty(
        "--paper-scrollbar-width",
        `${desiredScrollbarScreenWidth / screenScale}px`,
      );
      entry.root.style.setProperty(
        "--paper-scrollbar-border",
        `${desiredBorderScreenWidth / screenScale}px`,
      );

      const transform = `matrix(${basisX.x}, ${basisX.y}, ${basisY.x}, ${basisY.y}, ${screenTL.x}, ${screenTL.y})`;
      entry.root.style.transform = transform;
      entry.root.style.zIndex = `${zIndex}`;
      entry.root.style.display = "block";
      this.updateScrollbar(entry);
    }
  }

  private applyScrollOffset(paperId: string, forceNative: boolean) {
    const entry = this.overlays.get(paperId);
    if (!entry) return;
    if (entry.scrollMode === "native") {
      if (!forceNative) {
        return;
      }
      if (Math.abs(entry.root.scrollTop - entry.scrollOffset) > 1) {
        entry.root.scrollTop = entry.scrollOffset;
      }
      entry.inner.style.transform = "translate3d(0, 0, 0)";
      this.updateScrollbar(entry);
      return;
    }
    entry.inner.style.transform = `translate3d(0, ${-entry.scrollOffset}px, 0)`;
    this.updateScrollbar(entry);
  }

  private updateScrollbar(entry: PaperOverlayEntry) {
    if (!entry.scrollbar || !entry.scrollbarThumb) {
      return;
    }
    const scrollHeight = entry.root.scrollHeight;
    const clientHeight = entry.root.clientHeight;
    const maxScroll = Math.max(scrollHeight - clientHeight, 0);
    if (maxScroll <= 0) {
      entry.scrollbarThumb.style.height = "0px";
      return;
    }
    const barHeight = clientHeight;
    const thumbHeight = Math.max(barHeight * (clientHeight / scrollHeight), 24);
    const thumbTravel = Math.max(barHeight - thumbHeight, 0);
    const scrollRatio = entry.root.scrollTop / maxScroll;
    const thumbTop = thumbTravel * Math.min(Math.max(scrollRatio, 0), 1);
    entry.scrollbarThumb.style.height = `${thumbHeight}px`;
    entry.scrollbarThumb.style.transform = `translateY(${thumbTop}px)`;
  }
}
