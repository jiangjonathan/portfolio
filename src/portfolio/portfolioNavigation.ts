import type { ScenePage } from "../camera/pageNavigation";
import type { PortfolioPapersManager } from "./portfolioPapers";

export interface PortfolioNavigationDependencies {
  setActiveScenePage: (page: ScenePage) => void;
  animateCoverFlip: (reverse?: boolean) => Promise<void>;
  showPortfolioUI: () => void;
  ensurePortfolioLinks: () => void;
  ensurePortfolioPanel: () => void;
  getManager: () => PortfolioPapersManager | null;
  coverWaterfallDelayMs: number;
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

  async openPortfolioPage(
    options: OpenPortfolioOptions = {},
  ): Promise<void> {
    const {
      setActiveScenePage,
      animateCoverFlip,
      showPortfolioUI,
      ensurePortfolioLinks,
      ensurePortfolioPanel,
      getManager,
      coverWaterfallDelayMs,
    } = this.deps;
    const { startAtPaperIndex, waitForEntryAnimations = false } = options;

    setActiveScenePage("portfolio");
    const coverFlipPromise = animateCoverFlip();
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

      if (
        typeof startAtPaperIndex === "number" &&
        startAtPaperIndex >= 0
      ) {
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
