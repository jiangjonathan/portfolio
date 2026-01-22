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

export function createPortfolioInteractions(deps: PortfolioInteractionsDeps) {
  const pickPortfolioPaperUnderPointer = (
    raycaster: Raycaster,
    manager: PortfolioPapersManager,
  ): PortfolioPaperHit | null => {
    const paperMeshes = manager.getPaperMeshes();
    const currentPaperId = manager.getCurrentPaperId();
    const topLeftStackPaperId = manager.getTopLeftStackPaperId();
    const topRightStackPaperId =
      manager.getPapers().find((paper) => !manager.isPaperInLeftStack(paper.id))
        ?.id ?? null;
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
      const isLeftStack = manager.isPaperInLeftStack(paperId);
      const isCurrentPaper = paperId === currentPaperId;
      const isTopLeftStackPaper = paperId === topLeftStackPaperId;
      const isTopRightStackPaper = paperId === topRightStackPaperId;
      if (isLeftStack) {
        if (!isTopLeftStackPaper) {
          continue;
        }
      } else if (!isCurrentPaper && !isTopRightStackPaper) {
        continue;
      }
      if (!bestHit || texturedHit.distance < bestHit.hit.distance) {
        bestHit = { paperId, paper, hit: texturedHit };
      }
    }
    return bestHit;
  };

  const handleHover = (event: MouseEvent, raycaster: Raycaster): boolean => {
    const manager = deps.getManager();
    if (deps.getActivePage() !== "portfolio" || !manager) {
      return false;
    }
    if (!deps.updatePointer(event, deps.pointerNDC, deps.canvas)) {
      return true;
    }
    raycaster.setFromCamera(deps.pointerNDC, deps.camera);
    const hoveredPaper = pickPortfolioPaperUnderPointer(raycaster, manager);
    const hoveringPdf = hoveredPaper?.paper.type === "pdf";
    deps.canvas.style.cursor = hoveringPdf ? "pointer" : "default";
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
    const { paper } = hoveredPaper;
    if (paper.type === "pdf") {
      console.log(`[Portfolio] Opening PDF in new window: ${paper.url}`);
      window.open(paper.url, "_blank");
      return true;
    }
    return true;
  };

  const handlePointerMove = (
    _event: PointerEvent,
    _raycaster: Raycaster,
  ): boolean => {
    return false;
  };

  const handlePointerUp = () => {
    return;
  };

  const handleWheel = (_event: WheelEvent, _raycaster: Raycaster): boolean => {
    const manager = deps.getManager();
    if (deps.getActivePage() !== "portfolio" || !manager) {
      return false;
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
