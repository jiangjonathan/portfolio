import type { Camera, Object3D, Raycaster, Vector2 } from "three";
import type { Intersection } from "three";
import type { ScenePage } from "../camera/pageNavigation";
import type { PaperConfig, PortfolioPapersManager } from "./portfolioPapers";

type PortfolioInteractionsDeps = {
  canvas: HTMLCanvasElement;
  camera: Camera;
  pointerNDC: Vector2;
  updatePointer: (
    event: MouseEvent | PointerEvent | WheelEvent,
    pointer: Vector2,
    canvas: HTMLCanvasElement,
  ) => boolean;
  getActivePage: () => ScenePage;
  getManager: () => PortfolioPapersManager | null;
};

type PortfolioPaperHit = {
  paperId: string;
  paper: PaperConfig;
  hit: Intersection<Object3D>;
};

const isMarkdownPaperConfig = (paper: { url: string }): boolean => {
  return paper.url?.toLowerCase().endsWith(".md");
};

const isResumePaperConfig = (paper: { id: string }): boolean =>
  paper.id === "resume-pdf";

export function createPortfolioInteractions(
  deps: PortfolioInteractionsDeps,
) {
  let paperScrollDragPointerId: number | null = null;

  const pickPortfolioPaperUnderPointer = (
    raycaster: Raycaster,
    manager: PortfolioPapersManager,
    options: { requireScrollable?: boolean } = {},
  ): PortfolioPaperHit | null => {
    const { requireScrollable = false } = options;
    const paperMeshes = manager.getPaperMeshes();
    const currentPaperId = manager.getCurrentPaperId();
    const topLeftStackPaperId = manager.getTopLeftStackPaperId();
    const papersById = new Map(
      manager.getPapers().map((paper) => [paper.id, paper]),
    );
    let bestHit: PortfolioPaperHit | null = null;

    for (const [paperId, mesh] of paperMeshes) {
      const hits = raycaster.intersectObject(mesh, true);
      if (!hits.length) {
        continue;
      }
      const texturedHit = hits.find((hit) => hit.uv);
      if (!texturedHit) {
        continue;
      }
      const paper = papersById.get(paperId);
      if (!paper) {
        continue;
      }
      if (requireScrollable && !manager.isPaperScrollable(paperId)) {
        continue;
      }
      const allowLeftStackInteraction =
        isMarkdownPaperConfig(paper) || isResumePaperConfig(paper);
      const isLeftStack = manager.isPaperInLeftStack(paperId);
      const isCurrentPaper = paperId === currentPaperId;
      const isTopLeftStackPaper = paperId === topLeftStackPaperId;
      if (isLeftStack) {
        if (!allowLeftStackInteraction) {
          continue;
        }
        if (!isTopLeftStackPaper) {
          continue;
        }
      } else if (!isCurrentPaper) {
        continue;
      }
      if (!bestHit || texturedHit.distance < bestHit.hit.distance) {
        bestHit = { paperId, paper, hit: texturedHit };
      }
    }
    return bestHit;
  };

  const handleHover = (
    event: MouseEvent,
    raycaster: Raycaster,
  ): boolean => {
    const manager = deps.getManager();
    if (deps.getActivePage() !== "portfolio" || !manager) {
      return false;
    }
    if (!deps.updatePointer(event, deps.pointerNDC, deps.canvas)) {
      return true;
    }
    raycaster.setFromCamera(deps.pointerNDC, deps.camera);
    const hoveredPaper = pickPortfolioPaperUnderPointer(raycaster, manager);
    let hoveringLink = false;
    if (hoveredPaper) {
      if (hoveredPaper.paper.type === "pdf") {
        hoveringLink = true;
      } else if (hoveredPaper.hit.uv) {
        const linkUrl = manager.checkLinkAtUV(
          hoveredPaper.paperId,
          hoveredPaper.hit.uv.x,
          hoveredPaper.hit.uv.y,
        );
        hoveringLink = Boolean(linkUrl);
        if (hoveringLink) {
          console.log("[Portfolio Link Check] Found link:", {
            paperId: hoveredPaper.paperId,
            linkUrl,
            uv: hoveredPaper.hit.uv,
          });
        }
      }
    }
    deps.canvas.style.cursor = hoveringLink ? "pointer" : "default";
    return true;
  };

  const handlePointerDown = (
    event: PointerEvent,
    raycaster: Raycaster,
  ): boolean => {
    const manager = deps.getManager();
    if (deps.getActivePage() !== "portfolio" || !manager) {
      return false;
    }
    if (!deps.updatePointer(event, deps.pointerNDC, deps.canvas)) {
      return true;
    }
    raycaster.setFromCamera(deps.pointerNDC, deps.camera);
    const hoveredPaper = pickPortfolioPaperUnderPointer(raycaster, manager);
    if (!hoveredPaper) {
      return true;
    }
    const { paperId, paper, hit } = hoveredPaper;
    if (hit.uv) {
      const linkUrl = manager.checkLinkAtUV(paperId, hit.uv.x, hit.uv.y);
      if (linkUrl) {
        console.log(`[Portfolio] Opening link: ${linkUrl}`);
        window.open(linkUrl, "_blank");
        return true;
      }

      if (manager.isPaperScrollable(paperId)) {
        const canvasCoords = manager.uvToCanvasCoords(paperId, {
          x: hit.uv.x,
          y: hit.uv.y,
        });
        if (canvasCoords) {
          manager.startPaperDrag(paperId, canvasCoords.y);
          try {
            deps.canvas.setPointerCapture(event.pointerId);
          } catch {
            // ignore inability to capture pointer
          }
          paperScrollDragPointerId = event.pointerId;
          event.preventDefault();
          return true;
        }
      }
    }

    if (paper.type === "pdf") {
      console.log(`[Portfolio] Opening PDF in new window: ${paper.url}`);
      window.open(paper.url, "_blank");
      return true;
    }
    return true;
  };

  const handlePointerMove = (
    event: PointerEvent,
    raycaster: Raycaster,
  ): boolean => {
    const manager = deps.getManager();
    if (!manager || !manager.isDraggingPaper()) {
      return false;
    }
    const draggingPaperId = manager.getDraggingPaperId();
    if (!draggingPaperId) {
      return true;
    }
    let canvasCoords: { x: number; y: number } | null = null;
    if (deps.updatePointer(event, deps.pointerNDC, deps.canvas)) {
      raycaster.setFromCamera(deps.pointerNDC, deps.camera);
      const mesh = manager.getPaperMeshes().get(draggingPaperId);
      if (mesh) {
        const hits = raycaster.intersectObject(mesh, true);
        if (hits.length > 0 && hits[0].uv) {
          canvasCoords = manager.uvToCanvasCoords(draggingPaperId, {
            x: hits[0].uv.x,
            y: hits[0].uv.y,
          });
        }
      }
    }
    if (!canvasCoords) {
      canvasCoords = manager.clientToCanvasCoords(
        draggingPaperId,
        event.clientX,
        event.clientY,
        deps.canvas,
      );
    }
    if (canvasCoords) {
      manager.updatePaperDrag(canvasCoords.y);
    }
    return true;
  };

  const handlePointerUp = () => {
    const manager = deps.getManager();
    manager?.endPaperDrag();
    if (paperScrollDragPointerId !== null) {
      try {
        deps.canvas.releasePointerCapture(paperScrollDragPointerId);
      } catch {
        // ignore
      }
      paperScrollDragPointerId = null;
    }
  };

  const handleWheel = (
    event: WheelEvent,
    raycaster: Raycaster,
  ): boolean => {
    const manager = deps.getManager();
    if (deps.getActivePage() !== "portfolio" || !manager) {
      return false;
    }
    let hoveredPaper: PortfolioPaperHit | null = null;
    if (deps.updatePointer(event, deps.pointerNDC, deps.canvas)) {
      raycaster.setFromCamera(deps.pointerNDC, deps.camera);
      hoveredPaper = pickPortfolioPaperUnderPointer(raycaster, manager);
    }

    const targetPaperId =
      hoveredPaper && manager.isPaperScrollable(hoveredPaper.paperId)
        ? hoveredPaper.paperId
        : null;

    if (targetPaperId) {
      return manager.scrollPaper(targetPaperId, event.deltaY);
    }

    return false;
  };

  return {
    handleHover,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
  };
}
