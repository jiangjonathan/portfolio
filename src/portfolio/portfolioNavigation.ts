import type { ScenePage } from "../camera/pageNavigation";
import type { PortfolioPapersManager } from "./portfolioPapers";
import type { PaperOverlayManager } from "./paperOverlay";

export interface PortfolioNavigationDependencies {
  setActiveScenePage: (page: ScenePage) => void;
  animateCoverFlip: (reverse?: boolean) => Promise<void>;
  showPortfolioUI: () => void;
  ensurePortfolioLinks: () => void;
  ensurePortfolioPanel: () => void;
  getManager: () => PortfolioPapersManager | null;
  coverWaterfallDelayMs: number;
  coverFlipDurationMs: number;
  paperOverlayManager?: PaperOverlayManager;
}

export interface OpenPortfolioOptions {
  startAtPaperIndex?: number;
  waitForEntryAnimations?: boolean;
}

export class PortfolioNavigationController {
  private readonly deps: PortfolioNavigationDependencies;

  constructor(deps: PortfolioNavigationDependencies) {
    this.deps = deps;
  }

  async openPortfolioPage(options: OpenPortfolioOptions = {}): Promise<void> {
    const {
      setActiveScenePage,
      animateCoverFlip,
      showPortfolioUI,
      ensurePortfolioLinks,
      ensurePortfolioPanel,
      getManager,
      coverWaterfallDelayMs,
      coverFlipDurationMs,
      paperOverlayManager,
    } = this.deps;
    const { startAtPaperIndex, waitForEntryAnimations = false } = options;

    setActiveScenePage("portfolio");

    // Start overlays hidden
    if (paperOverlayManager) {
      paperOverlayManager.hide();
    }

    const coverFlipPromise = animateCoverFlip();

    // Show overlays instantly at halfway point of cover flip
    const halfwayDelay = coverFlipDurationMs / 2;
    setTimeout(() => {
      if (paperOverlayManager) {
        paperOverlayManager.show();
      }
    }, halfwayDelay);

    const coverDelayPromise = waitForEntryAnimations
      ? new Promise<void>((resolve) => {
          window.setTimeout(resolve, coverWaterfallDelayMs);
        })
      : null;
    if (!waitForEntryAnimations) {
      void coverFlipPromise;
    }

    showPortfolioUI();
    ensurePortfolioLinks();
    ensurePortfolioPanel();

    const manager = getManager();
    if (manager) {
      const loadPromise = manager.loadAllPapers();
      if (!waitForEntryAnimations) {
        void loadPromise;
      }

      if (waitForEntryAnimations) {
        if (coverDelayPromise) {
          await Promise.all([coverDelayPromise, loadPromise]);
        } else {
          await loadPromise;
        }
      }

      if (typeof startAtPaperIndex === "number" && startAtPaperIndex >= 0) {
        const papers = manager.getPapers();
        const targetPaper = papers[startAtPaperIndex];
        if (targetPaper) {
          const goPromise =
            startAtPaperIndex === 1
              ? manager.nextPaper()
              : manager.goToPaper(targetPaper.id);
          if (waitForEntryAnimations) {
            await goPromise;
          } else {
            void goPromise;
          }
        }
      }
    } else if (waitForEntryAnimations && coverDelayPromise) {
      await coverDelayPromise;
    }
  }
}
