import type { Object3D, Mesh, WebGLRenderer } from "three";
import type { ScenePage } from "../camera/pageNavigation";
import { PortfolioNavigationController } from "./portfolioNavigation";
import { PortfolioPapersManager } from "./portfolioPapers";
import { prioritizePortfolioCoverRendering } from "../scene/sceneObjects";
import type { PaperOverlayManager } from "./paperOverlay";

type PortfolioFeatureDeps = {
  renderer: WebGLRenderer;
  papersContainer: HTMLDivElement;
  paperLinksBar: HTMLDivElement;
  prevArrow: HTMLButtonElement;
  nextArrow: HTMLButtonElement;
  paperOverlayManager?: PaperOverlayManager;
};

type PortfolioFeature = {
  init: () => PortfolioPapersManager;
  getManager: () => PortfolioPapersManager | null;
  setupCover: (model: Object3D) => void;
  animateCoverFlip: (reverse?: boolean) => Promise<void>;
  showUI: () => void;
  ensureLinksReady: () => void;
  ensurePanelReady: () => void;
  handlePageExit: (previousPage: ScenePage, nextPage: ScenePage) => void;
  setArrowVisibility: (visible: boolean) => void;
  createNavigationController: (
    setActiveScenePage: (page: ScenePage) => void,
  ) => PortfolioNavigationController;
};

const PORTFOLIO_COVER_FLIP_DURATION_MS = 800;
const PORTFOLIO_COVER_WATERFALL_DELAY_MS = 500;

export function createPortfolioFeature(
  deps: PortfolioFeatureDeps,
): PortfolioFeature {
  let portfolioCoverMesh: Mesh | null = null;
  let portfolioCoverOriginalRotation = 0;
  let portfolioPapersManager: PortfolioPapersManager | null = null;
  const paperLinkElements = new Map<string, HTMLButtonElement>();
  let detachPaperChangeListener: (() => void) | null = null;

  const updatePaperLinkActiveState = (activeId?: string | null) => {
    const currentId =
      activeId ?? portfolioPapersManager?.getCurrentPaperId() ?? null;
    paperLinkElements.forEach((link, id) => {
      const isActive = id === currentId;
      link.style.opacity = isActive ? "1" : "0.65";
      link.style.textDecoration = isActive ? "underline" : "none";
      link.style.color = "#000";
    });
  };

  const buildPortfolioPaperLinks = () => {
    deps.paperLinksBar.innerHTML = "";
    paperLinkElements.clear();
    if (!portfolioPapersManager) {
      return;
    }
    const papers = portfolioPapersManager.getPapers();
    papers.forEach((paper) => {
      const link = document.createElement("button");
      link.type = "button";
      link.textContent = paper.name.toLowerCase();
      link.className = "vinyl-hyperlink";
      link.style.transition = "opacity 0.2s ease, color 0.2s ease";
      link.style.textTransform = "none";
      link.style.letterSpacing = "0.05em";
      link.style.fontSize = "0.85rem";
      link.addEventListener("mouseenter", () => {
        link.style.opacity = "1";
        link.style.color = "var(--vinyl-link-hover-color)";
        link.style.textDecoration = "underline";
      });
      link.addEventListener("mouseleave", () => {
        updatePaperLinkActiveState();
        link.style.color = "var(--vinyl-link-color)";
        if (
          !portfolioPapersManager ||
          portfolioPapersManager.getCurrentPaperId() !== paper.id
        ) {
          link.style.textDecoration = "none";
        }
      });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (!portfolioPapersManager) {
          return;
        }
        void portfolioPapersManager.goToPaper(paper.id);
      });
      deps.paperLinksBar.appendChild(link);
      paperLinkElements.set(paper.id, link);
    });
    updatePaperLinkActiveState();
  };

  const attachPaperLinkListener = () => {
    detachPaperChangeListener?.();
    if (!portfolioPapersManager) {
      return;
    }
    detachPaperChangeListener = portfolioPapersManager.onCurrentPaperChange(
      (paperId) => {
        updatePaperLinkActiveState(paperId);
      },
    );
  };

  const createPapersUI = () => {
    deps.papersContainer.innerHTML = "";

    const title = document.createElement("div");
    title.textContent = "Portfolio Papers";
    title.style.fontWeight = "bold";
    title.style.marginBottom = "0.5rem";
    deps.papersContainer.appendChild(title);

    // Navigation arrows
    const navContainer = document.createElement("div");
    navContainer.style.cssText = `
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    `;

    const prevButton = document.createElement("button");
    prevButton.textContent = "← Previous";
    prevButton.style.cssText = `
      flex: 1;
      padding: 8px 12px;
      background: rgba(100, 100, 255, 0.3);
      color: #fff;
      border: 1px solid #66f;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      transition: background 0.15s;
    `;
    prevButton.onmouseover = () => {
      prevButton.style.background = "rgba(100, 100, 255, 0.5)";
    };
    prevButton.onmouseout = () => {
      prevButton.style.background = "rgba(100, 100, 255, 0.3)";
    };
    prevButton.onclick = () => {
      portfolioPapersManager?.previousPaper();
    };

    const nextButton = document.createElement("button");
    nextButton.textContent = "Next →";
    nextButton.style.cssText = `
      flex: 1;
      padding: 8px 12px;
      background: rgba(100, 100, 255, 0.3);
      color: #fff;
      border: 1px solid #66f;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      transition: background 0.15s;
    `;
    nextButton.onmouseover = () => {
      nextButton.style.background = "rgba(100, 100, 255, 0.5)";
    };
    nextButton.onmouseout = () => {
      nextButton.style.background = "rgba(100, 100, 255, 0.3)";
    };
    nextButton.onclick = () => {
      portfolioPapersManager?.nextPaper();
    };

    navContainer.appendChild(prevButton);
    navContainer.appendChild(nextButton);
    deps.papersContainer.appendChild(navContainer);

    const papers = portfolioPapersManager?.getPapers() ?? [];
    papers.forEach((paper) => {
      const button = document.createElement("button");
      button.textContent = paper.name;
      button.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: 1px solid #666;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 13px;
        transition: background 0.15s;
        text-align: left;
      `;
      button.onmouseover = () => {
        button.style.background = "rgba(255, 255, 255, 0.2)";
      };
      button.onmouseout = () => {
        button.style.background = "rgba(255, 255, 255, 0.1)";
      };
      button.onclick = () => {
        console.log(`[Portfolio] Loading paper: ${paper.name}`);
        portfolioPapersManager?.hideAllPapers();
        portfolioPapersManager?.loadPaper(paper.id);
      };
      deps.papersContainer.appendChild(button);
    });
  };

  const showPortfolioUI = () => {
    deps.papersContainer.style.display = "flex";
    deps.paperLinksBar.style.display = "flex";

    // Use requestAnimationFrame to ensure transition animates
    requestAnimationFrame(() => {
      deps.papersContainer.style.opacity = "1";
      deps.paperLinksBar.style.opacity = "1";
    });
  };

  const ensurePortfolioLinksReady = () => {
    if (paperLinkElements.size === 0) {
      buildPortfolioPaperLinks();
    } else {
      updatePaperLinkActiveState();
    }
  };

  const ensurePortfolioPanelReady = () => {
    if (deps.papersContainer.children.length === 0) {
      createPapersUI();
    }
  };

  const setupPortfolioCover = (model: Object3D) => {
    prioritizePortfolioCoverRendering(
      model,
      (mesh) => {
        portfolioCoverMesh = mesh;
        portfolioCoverOriginalRotation = mesh.rotation.z;
        // Set high render order so cover appears in front of papers (papers are 210)
        mesh.renderOrder = 220;
        // Disable shadow receiving on cover to prevent z-fighting
        mesh.receiveShadow = false;
      },
      (whitepaperMesh) => {
        whitepaperMesh.visible = false;
        if (portfolioPapersManager) {
          portfolioPapersManager.setWhitepaperMesh(whitepaperMesh);
        }
      },
    );
  };

  const animatePortfolioCoverFlip = (reverse = false): Promise<void> => {
    if (!portfolioCoverMesh) {
      console.log("[Portfolio Cover] Cover mesh not found");
      return Promise.resolve();
    }

    // console.log(
    //   "[Portfolio Cover] Starting flip animation",
    //   reverse ? "(reverse)" : "",
    // );
    // console.log(
    //   "[Portfolio Cover] Initial rotation:",
    //   portfolioCoverMesh.rotation.z,
    // );

    const startRotation = portfolioCoverMesh.rotation.z;
    const targetRotation = reverse
      ? portfolioCoverOriginalRotation
      : portfolioCoverOriginalRotation + Math.PI;
    const duration = PORTFOLIO_COVER_FLIP_DURATION_MS;

    return new Promise((resolve) => {
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const easeProgress =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        portfolioCoverMesh!.rotation.z =
          startRotation + (targetRotation - startRotation) * easeProgress;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // console.log(
          //   "[Portfolio Cover] Animation complete. Final rotation:",
          //   portfolioCoverMesh!.rotation.z,
          // );
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  };

  const handlePageExit = (previousPage: ScenePage, nextPage: ScenePage) => {
    if (previousPage !== "portfolio" || nextPage === "portfolio") {
      return;
    }
    deps.papersContainer.style.opacity = "0";
    deps.paperLinksBar.style.opacity = "0";

    // Wait for fade-out to complete before hiding
    setTimeout(() => {
      deps.papersContainer.style.display = "none";
      deps.paperLinksBar.style.display = "none";
    }, 300);

    (async () => {
      try {
        if (portfolioPapersManager) {
          await portfolioPapersManager.resetPapersToOriginalStack();
        }
      } catch (error) {
        console.error(
          "[Portfolio] Error resetting papers before closing cover:",
          error,
        );
      } finally {
        // Ensure only the first paper is visible to prevent z-fighting during camera pullback
        if (portfolioPapersManager) {
          portfolioPapersManager.hideAllPapersExceptFirst();
        }
        void animatePortfolioCoverFlip(true);
      }
    })();
  };

  const setArrowVisibility = (visible: boolean) => {
    const opacity = visible ? "1" : "0";
    const pointer = visible ? "auto" : "none";
    deps.prevArrow.style.opacity = opacity;
    deps.prevArrow.style.pointerEvents = pointer;
    deps.nextArrow.style.opacity = opacity;
    deps.nextArrow.style.pointerEvents = pointer;
  };

  const init = () => {
    portfolioPapersManager = new PortfolioPapersManager(
      deps.papersContainer,
      deps.renderer,
      deps.paperOverlayManager,
    );
    attachPaperLinkListener();
    buildPortfolioPaperLinks();
    deps.prevArrow.addEventListener("click", () => {
      portfolioPapersManager?.previousPaper();
    });
    deps.nextArrow.addEventListener("click", () => {
      portfolioPapersManager?.nextPaper();
    });

    // Load all paper meshes on startup regardless of which page is active
    portfolioPapersManager.loadAllPapers().catch((error) => {
      console.error("[Portfolio] Error loading papers on startup:", error);
    });
    return portfolioPapersManager;
  };

  const createNavigationController = (
    setActiveScenePage: (page: ScenePage) => void,
  ) =>
    new PortfolioNavigationController({
      setActiveScenePage,
      animateCoverFlip: animatePortfolioCoverFlip,
      showPortfolioUI,
      ensurePortfolioLinks: ensurePortfolioLinksReady,
      ensurePortfolioPanel: ensurePortfolioPanelReady,
      getManager: () => portfolioPapersManager,
      coverWaterfallDelayMs: PORTFOLIO_COVER_WATERFALL_DELAY_MS,
      coverFlipDurationMs: PORTFOLIO_COVER_FLIP_DURATION_MS,
      paperOverlayManager: deps.paperOverlayManager,
    });

  return {
    init,
    getManager: () => portfolioPapersManager,
    setupCover: setupPortfolioCover,
    animateCoverFlip: animatePortfolioCoverFlip,
    showUI: showPortfolioUI,
    ensureLinksReady: ensurePortfolioLinksReady,
    ensurePanelReady: ensurePortfolioPanelReady,
    handlePageExit,
    setArrowVisibility,
    createNavigationController,
  };
}
