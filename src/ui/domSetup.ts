import {
  UI_MAX_WIDTH,
  UI_Z_INDEX,
  VIEWER_MAX_WIDTH,
  HIDE_BUTTON_Z_INDEX,
  LINK_COLOR,
  LINK_HOVER_COLOR,
} from "../utils/config";
import {
  FOCUS_CARD_BASE_WIDTH,
  FOCUS_CARD_MIN_SCALE,
} from "../vinyl/vinylHelpers";

// Navigation controls styling - used on page load and when switching pages
export const GLOBAL_CONTROLS_DEFAULT = {
  top: "150px",
  left: "20px",
  gap: "3rem",
  flexDirection: "column" as const,
  transform: "none",
} as const;

export const GLOBAL_CONTROLS_TURNTABLE = {
  bottom: "23px",
  left: "65px",
  gap: "1rem",
  flexDirection: "row" as const,
  transform: "none",
} as const;

export interface DOMElements {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  vinylLibraryContainer: HTMLDivElement;
  tutorialContainer: HTMLDivElement;
  freeLookTutorialContainer: HTMLDivElement;
  vinylViewerContainer: HTMLDivElement;
  hideLibraryBtn: HTMLButtonElement;
  focusCardCoverContainer: HTMLDivElement;
  focusCardInfoContainer: HTMLDivElement;
  showFocusBtn: HTMLButtonElement;
  globalControls: HTMLDivElement;
  homeNavButton: HTMLButtonElement;
  turntableNavButton: HTMLButtonElement;
  portfolioNavButton: HTMLButtonElement;
  portfolioResumeButton: HTMLButtonElement;
  resetTutorialButton: HTMLButtonElement;
  freeLookButton: HTMLButtonElement;
  contactButton: HTMLButtonElement;
  cameraDebugPanel: HTMLDivElement;
  portfolioPapersContainer: HTMLDivElement;
  portfolioPrevArrow: HTMLButtonElement;
  portfolioNextArrow: HTMLButtonElement;
  placeholderAInfo: HTMLDivElement;
  placeholderBInfo: HTMLDivElement;
  portfolioPaperLinksBar: HTMLDivElement;
}

export function setupDOM(): DOMElements {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Missing #app container.");
  }
  root.innerHTML = "";

  // Create name text in top left corner
  const nameText = document.createElement("div");
  nameText.id = "jonathan-jiang-name";
  nameText.textContent = "jonathan jiang";
  nameText.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    font-size: 0.85rem;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    color: #000;
    z-index: 100;
    font-family: inherit;
    opacity: 1;
    transition: opacity 0.3s ease;
    pointer-events: none;
  `;
  root.appendChild(nameText);

  // Create vinyl library widget container
  const vinylLibraryContainer = document.createElement("div");
  vinylLibraryContainer.id = "vinyl-library-widget";
  vinylLibraryContainer.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    max-width: ${UI_MAX_WIDTH};
    width: min(${UI_MAX_WIDTH}, calc(100vw - 40px));
    z-index: ${UI_Z_INDEX};
    overflow: visible;
  `;
  root.appendChild(vinylLibraryContainer);

  // Create tutorial container
  const tutorialContainer = document.createElement("div");
  tutorialContainer.id = "vinyl-tutorial";
  tutorialContainer.style.cssText = `
    position: fixed;
    bottom: 230px;
    left: 20px;
    max-width: 600px;
    z-index: ${UI_Z_INDEX};
    background: transparent;
    padding: 0;
    border: none;
    font-size: 0.85rem;
    line-height: 1.6;
    display: none;
    opacity: 0;
    transition: opacity 0.45s ease;
    pointer-events: none;
  `;
  root.appendChild(tutorialContainer);

  // Create free-look tutorial container (only shown during free-look mode)
  const freeLookTutorialContainer = document.createElement("div");
  freeLookTutorialContainer.id = "free-look-tutorial";
  freeLookTutorialContainer.style.cssText = `
    position: fixed;
    bottom: 230px;
    left: 20px;
    max-width: 600px;
    z-index: ${UI_Z_INDEX};
    background: transparent;
    padding: 0;
    border: none;
    font-size: 0.85rem;
    line-height: 1.6;
    display: none;
    opacity: 0;
    transition: opacity 0.45s ease;
    pointer-events: none;
  `;
  freeLookTutorialContainer.innerHTML = "";
  root.appendChild(freeLookTutorialContainer);

  // Create vinyl viewer container
  const vinylViewerContainer = document.createElement("div");
  vinylViewerContainer.id = "vinyl-library-viewer";
  vinylViewerContainer.style.cssText = `
    position: fixed;
    top: 0;
    right: -20px;
    bottom: 0;
    width: fit-content;
    max-width: ${VIEWER_MAX_WIDTH};
    z-index: ${UI_Z_INDEX};
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    transition: opacity 0.45s ease, transform 0.45s ease;
    opacity: 0;
    transform: var(--vinyl-viewer-translate, translateY(8px));
    padding: 20px 40px 20px 20px;
    margin-left: auto;
  `;
  vinylViewerContainer.style.pointerEvents = "none";

  const updateVinylViewerScale = () => {
    const viewportWidth = window.innerWidth;
    const baseWidth = 1400;
    const minScale = 0.8;
    const isCompact = document.body.classList.contains("focus-card-compact");
    const scale = isCompact
      ? minScale
      : Math.max(minScale, Math.min(1, viewportWidth / baseWidth));
    vinylViewerContainer.style.setProperty(
      "--vinyl-widget-scale",
      scale.toString(),
    );
  };

  // Initial scale update for vinyl viewer only (focus cards created later)
  updateVinylViewerScale();
  window.addEventListener("resize", () => {
    updateVinylViewerScale();
  });
  window.addEventListener("focus-card-layout-updated", () => {
    updateVinylViewerScale();
  });

  // Create hide/show library button
  const hideLibraryBtn = document.createElement("button");
  hideLibraryBtn.id = "vinyl-hide-library-btn";
  hideLibraryBtn.className = "vinyl-hyperlink";
  hideLibraryBtn.textContent = "hide library";
  hideLibraryBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: ${HIDE_BUTTON_Z_INDEX};
    transition: opacity 0.3s ease, transform 0.3s ease;
    opacity: 1;
  `;
  hideLibraryBtn.addEventListener("click", () => {
    const libraryGrid = document.getElementById("vinyl-viewer-grid");
    const filterControls = document.querySelector(".filter-controls");

    if (!libraryGrid) return;

    const isHidden = libraryGrid.style.opacity === "0";
    if (isHidden) {
      libraryGrid.style.display = "";
      if (filterControls) (filterControls as HTMLElement).style.display = "";

      requestAnimationFrame(() => {
        libraryGrid.style.transition = "opacity 0.3s ease";
        libraryGrid.style.opacity = "1";
        if (filterControls) {
          (filterControls as HTMLElement).style.transition =
            "opacity 0.3s ease";
          (filterControls as HTMLElement).style.opacity = "1";
        }
      });

      hideLibraryBtn.textContent = "hide library";
    } else {
      libraryGrid.style.transition = "opacity 0.3s ease";
      libraryGrid.style.opacity = "0";
      if (filterControls) {
        (filterControls as HTMLElement).style.transition = "opacity 0.3s ease";
        (filterControls as HTMLElement).style.opacity = "0";
      }

      setTimeout(() => {
        libraryGrid.style.display = "none";
        if (filterControls)
          (filterControls as HTMLElement).style.display = "none";
      }, 300);

      hideLibraryBtn.textContent = "show library";
    }
  });
  root.appendChild(hideLibraryBtn);

  // Create focus card containers
  const focusCardCoverContainer = document.createElement("div");
  focusCardCoverContainer.id = "vinyl-focus-card-cover-root";
  focusCardCoverContainer.className =
    "focus-card-container focus-card-cover-container";
  root.appendChild(focusCardCoverContainer);

  const focusCardInfoContainer = document.createElement("div");
  focusCardInfoContainer.id = "vinyl-focus-card-info-root";
  focusCardInfoContainer.className =
    "focus-card-container focus-card-info-container";
  root.appendChild(focusCardInfoContainer);
  // Focus card scaling/movement
  let focusCardAnimationReady = false;
  let focusCardAnimationCount = 0;
  const notifyFocusCardMotion = (animating: boolean) => {
    window.dispatchEvent(
      new CustomEvent("focus-card-motion", { detail: { animating } }),
    );
  };
  const handleAnimationDone = () => {
    focusCardAnimationCount = Math.max(0, focusCardAnimationCount - 1);
    if (focusCardAnimationCount === 0) {
      notifyFocusCardMotion(false);
    }
  };
  const animateFocusCardPosition = (
    element: HTMLElement,
    left: number,
    top: number,
    allowAnimation: boolean,
  ) => {
    const computed = window.getComputedStyle(element);
    const currentLeft = parseFloat(computed.left);
    const currentTop = parseFloat(computed.top);
    const hasNumericPositions =
      Number.isFinite(currentLeft) && Number.isFinite(currentTop);
    const shouldAnimate =
      focusCardAnimationReady &&
      allowAnimation &&
      hasNumericPositions &&
      (Math.abs(currentLeft - left) > 0.5 || Math.abs(currentTop - top) > 0.5);

    if (shouldAnimate) {
      const animation = element.animate(
        [
          { left: `${currentLeft}px`, top: `${currentTop}px` },
          { left: `${left}px`, top: `${top}px` },
        ],
        { duration: 450, easing: "ease-in-out" },
      );
      if (focusCardAnimationCount === 0) {
        notifyFocusCardMotion(true);
      }
      focusCardAnimationCount += 1;
      animation.addEventListener("finish", handleAnimationDone, { once: true });
      animation.addEventListener("cancel", handleAnimationDone, {
        once: true,
      });
    }

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  };

  // Keep player + focus card from overlapping: threshold matches player minimum size
  const PLAYER_MIN_WIDTH_PX = 250;
  const PLAYER_MARGIN_PX = 20;
  const PLAYER_GAP_PX = 20;

  let focusCardLastCompact = false;
  const applyFocusCardScale = () => {
    const viewportWidth = window.innerWidth;
    const scale = Math.max(
      FOCUS_CARD_MIN_SCALE,
      Math.min(1, viewportWidth / FOCUS_CARD_BASE_WIDTH),
    );

    // Scale both containers
    focusCardCoverContainer.style.transform = `scale(${scale})`;
    focusCardCoverContainer.style.transformOrigin = "top left";
    focusCardInfoContainer.style.transform = `scale(${scale})`;
    focusCardInfoContainer.style.transformOrigin = "top left";

    const coverWidth = 250;
    const gap = 16; // 1rem
    const coverHeight = 250;
    const totalWidth = 700; // approximate combined width
    const offsetFromCenter = totalWidth / 2; // 350px at scale=1
    const scaledCoverWidth = coverWidth * scale;
    const scaledCoverHeight = coverHeight * scale;
    const scaledGap = gap * scale;
    const topOffset = 20;

    // Predict whether the player would overlap the centered card; if so, switch to compact (left) layout
    const centerX = viewportWidth * 0.525;
    const coverLeftCentered = centerX - offsetFromCenter * scale;
    const inlineWidthIfCentered =
      coverLeftCentered - PLAYER_MARGIN_PX - PLAYER_GAP_PX;
    const isCompactLayout =
      inlineWidthIfCentered <
      PLAYER_MIN_WIDTH_PX + PLAYER_MARGIN_PX + PLAYER_GAP_PX;
    const wasCompact = focusCardLastCompact;
    const layoutChanged = isCompactLayout !== wasCompact;
    focusCardLastCompact = isCompactLayout;

    // Hide/show the name text depending on layout
    nameText.style.opacity = isCompactLayout ? "0" : "1";
    document.body.classList.toggle("focus-card-compact", isCompactLayout);

    let coverLeft: number;
    if (isCompactLayout) {
      coverLeft = PLAYER_MARGIN_PX;
    } else {
      coverLeft = coverLeftCentered;
    }

    const infoLeft = coverLeft + scaledCoverWidth + scaledGap;
    const coverCenterX = coverLeft + scaledCoverWidth / 2;
    const coverCenterY = topOffset + scaledCoverHeight / 2;

    // Animate when crossing between compact and centered layouts (both directions)
    const allowMovementAnimation = layoutChanged && focusCardAnimationReady;
    animateFocusCardPosition(
      focusCardCoverContainer,
      coverLeft,
      topOffset,
      allowMovementAnimation,
    );
    animateFocusCardPosition(
      focusCardInfoContainer,
      infoLeft,
      topOffset,
      allowMovementAnimation,
    );

    if (!focusCardAnimationReady) {
      focusCardAnimationReady = true;
    }
    window.dispatchEvent(
      new CustomEvent("focus-card-layout-updated", {
        detail: {
          compact: isCompactLayout,
          coverCenterX,
          coverCenterY,
          layoutChanged,
        },
      }),
    );
  };
  applyFocusCardScale();
  window.addEventListener("resize", applyFocusCardScale);

  // Create show focus button
  const showFocusBtn = document.createElement("button");
  showFocusBtn.id = "vinyl-show-focus-btn";
  showFocusBtn.className = "vinyl-hyperlink";
  showFocusBtn.textContent = "show focus";
  showFocusBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 110px;
    z-index: ${HIDE_BUTTON_Z_INDEX};
    transition: opacity 0.3s ease, transform 0.3s ease;
    opacity: 1;
    display: none;
  `;
  showFocusBtn.addEventListener("click", () => {
    const viewer = (window as any).vinylLibraryViewer;
    if (viewer) {
      viewer.showFocusCard();
    }
  });
  root.appendChild(showFocusBtn);

  // Add global styles
  const style = document.createElement("style");
  style.textContent = `
    #vinyl-library-viewer::-webkit-scrollbar {
      display: none;
    }

    :root {
      --vinyl-link-color: ${LINK_COLOR};
      --vinyl-link-hover-color: ${LINK_HOVER_COLOR};
      --vinyl-link-font-size: 0.85rem;
      --vinyl-link-text-shadow: 0.2px 0 0 rgba(255, 0, 0, 0.5), -0.2px 0 0 rgba(0, 100, 200, 0.5);
      --vinyl-focus-info-max-width: 420px;
    }

    body.focus-card-compact #jonathan-jiang-name {
      opacity: 0 !important;
    }

    .vinyl-hyperlink {
      padding: 0;
      background: transparent;
      color: var(--vinyl-link-color);
      border: none;
      border-radius: 0;
      font-weight: normal;
      cursor: pointer;
      font-size: var(--vinyl-link-font-size);
      transition: color 0.15s;
      letter-spacing: 0;
      text-transform: none;
      text-decoration: underline;
      font-family: inherit;
      -webkit-font-smoothing: none;
      -moz-osx-font-smoothing: grayscale;
      text-shadow: var(--vinyl-link-text-shadow);
    }

    .vinyl-hyperlink:hover {
      background: transparent;
      color: var(--vinyl-link-hover-color);
    }

    .vinyl-hyperlink:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    #global-controls {
      gap: 1.5rem;
      opacity: 1;
      transition: opacity 0.3s ease;
      pointer-events: auto;
    }

    #global-controls button {
      padding: 0;
      background: transparent;
      color: var(--vinyl-link-color);
      border: none;
      border-radius: 0;
      font-weight: normal;
      cursor: pointer;
      font-size: var(--vinyl-link-font-size);
      transition: color 0.15s;
      letter-spacing: 0;
      text-transform: none;
      text-decoration: underline;
      font-family: inherit;
      -webkit-font-smoothing: none;
      -moz-osx-font-smoothing: grayscale;
      text-shadow: var(--vinyl-link-text-shadow);
    }

    #global-controls button:hover {
      background: transparent;
      color: var(--vinyl-link-hover-color);
    }

    #global-controls button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);
  root.appendChild(vinylViewerContainer);

  // Create global controls
  const globalControls = document.createElement("div");
  globalControls.id = "global-controls";
  Object.assign(globalControls.style, {
    position: "fixed",
    top: GLOBAL_CONTROLS_DEFAULT.top,
    left: GLOBAL_CONTROLS_DEFAULT.left,
    transform: GLOBAL_CONTROLS_DEFAULT.transform,
    display: "flex",
    flexDirection: GLOBAL_CONTROLS_DEFAULT.flexDirection,
    gap: GLOBAL_CONTROLS_DEFAULT.gap,
    alignItems: "flex-start",
    zIndex: HIDE_BUTTON_Z_INDEX,
  });
  root.appendChild(globalControls);

  const homeNavButton = document.createElement("button");
  homeNavButton.textContent = "home";
  globalControls.appendChild(homeNavButton);

  const turntableNavButton = document.createElement("button");
  turntableNavButton.textContent = "turntable";
  globalControls.appendChild(turntableNavButton);

  const portfolioNavButton = document.createElement("button");
  portfolioNavButton.textContent = "portfolio";
  globalControls.appendChild(portfolioNavButton);

  const portfolioResumeButton = document.createElement("button");
  portfolioResumeButton.textContent = "resume";
  globalControls.appendChild(portfolioResumeButton);

  const contactButton = document.createElement("button");
  contactButton.id = "contact-button";
  contactButton.textContent = "contact";
  globalControls.appendChild(contactButton);

  const resetTutorialButton = document.createElement("button");
  resetTutorialButton.id = "reset-tutorial-button";
  resetTutorialButton.textContent = "reset tutorial";
  globalControls.appendChild(resetTutorialButton);

  const freeLookButton = document.createElement("button");
  freeLookButton.id = "free-look-button";
  freeLookButton.textContent = "free-look";
  globalControls.appendChild(freeLookButton);

  // Create camera debug panel (debug - hidden)
  const cameraDebugPanel = document.createElement("div");
  cameraDebugPanel.id = "camera-debug-panel";
  Object.assign(cameraDebugPanel.style, {
    position: "fixed",
    bottom: "1rem",
    right: "1rem",
    width: "260px",
    padding: "0.6rem 0.85rem",
    borderRadius: "0.75rem",
    background: "rgba(0, 0, 0, 0.75)",
    border: "1px solid rgba(255, 255, 255, 0.4)",
    color: "#fff",
    fontSize: "0.75rem",
    fontFamily: "monospace",
    zIndex: "1000",
    display: "none", // Debug UI - hidden
    flexDirection: "column",
    gap: "0.4rem",
  });
  // root.appendChild(cameraDebugPanel); // Debug UI - disabled

  // Create portfolio papers UI container (debug - hidden)
  const portfolioPapersContainer = document.createElement("div");
  portfolioPapersContainer.id = "portfolio-papers-ui";
  Object.assign(portfolioPapersContainer.style, {
    position: "fixed",
    top: "80px",
    right: "20px",
    padding: "1rem",
    background: "rgba(0, 0, 0, 0.8)",
    border: "1px solid #666",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    fontFamily: "inherit",
    zIndex: "1100",
    display: "none", // Always hidden (debug UI)
    flexDirection: "column",
    gap: "0.5rem",
    minWidth: "180px",
  });
  // root.appendChild(portfolioPapersContainer); // Debug UI - disabled

  const portfolioPaperLinksBar = document.createElement("div");
  portfolioPaperLinksBar.id = "portfolio-paper-links";
  Object.assign(portfolioPaperLinksBar.style, {
    position: "fixed",
    bottom: "32px",
    left: "32px",
    transform: "none",
    display: "none",
    gap: "1.25rem",
    fontFamily: "inherit",
    fontSize: "var(--vinyl-link-font-size)",
    color: "var(--vinyl-link-color)",
    zIndex: `${UI_Z_INDEX}`,
    pointerEvents: "auto",
    alignItems: "center",
    justifyContent: "center",
    textTransform: "none",
    letterSpacing: "0.02em",
  } as CSSStyleDeclaration);
  root.appendChild(portfolioPaperLinksBar);

  const arrowBaseStyles: Partial<CSSStyleDeclaration> = {
    position: "fixed",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "3rem",
    background: "transparent",
    border: "none",
    color: "#000",
    cursor: "pointer",
    padding: "0.25rem",
    textShadow: "-0.5px 0 #ff0000, 0.5px 0 #0000ff",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "1050",
    transition: "opacity 0.3s ease, transform 0.15s ease",
    lineHeight: "1",
  };

  const portfolioPrevArrow = document.createElement("button");
  portfolioPrevArrow.textContent = "‹";
  Object.assign(portfolioPrevArrow.style, arrowBaseStyles, { left: "50px" });
  portfolioPrevArrow.addEventListener("mouseover", () => {
    portfolioPrevArrow.style.transform = "translateY(-50%) scale(1.05)";
  });
  portfolioPrevArrow.addEventListener("mouseout", () => {
    portfolioPrevArrow.style.transform = "translateY(-50%) scale(1)";
  });
  root.appendChild(portfolioPrevArrow);

  const portfolioNextArrow = document.createElement("button");
  portfolioNextArrow.textContent = "›";
  Object.assign(portfolioNextArrow.style, arrowBaseStyles, { right: "50px" });
  portfolioNextArrow.addEventListener("mouseover", () => {
    portfolioNextArrow.style.transform = "translateY(-50%) scale(1.05)";
  });
  portfolioNextArrow.addEventListener("mouseout", () => {
    portfolioNextArrow.style.transform = "translateY(-50%) scale(1)";
  });
  root.appendChild(portfolioNextArrow);

  // Append camera debug panel to DOM (hidden by default)
  root.appendChild(cameraDebugPanel);

  // Create placeholder A info
  const placeholderAInfo = document.createElement("div");
  placeholderAInfo.id = "placeholder-a-info";
  placeholderAInfo.style.cssText = `
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1000;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
    display: none;
    font-size: 0.85rem;
  `;
  placeholderAInfo.textContent = `placeholder \nunder construction`;
  root.appendChild(placeholderAInfo);

  // Create placeholder B info
  const placeholderBInfo = document.createElement("div");
  placeholderBInfo.id = "placeholder-b-info";
  placeholderBInfo.style.cssText = `
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1000;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
    display: none;
    font-size: 0.85rem;
  `;
  placeholderBInfo.textContent = `placeholder \n under construction`;
  root.appendChild(placeholderBInfo);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.id = "vinyl-viewer";
  root.appendChild(canvas);

  return {
    root,
    canvas,
    vinylLibraryContainer,
    tutorialContainer,
    freeLookTutorialContainer,
    vinylViewerContainer,
    hideLibraryBtn,
    focusCardCoverContainer,
    focusCardInfoContainer,
    showFocusBtn,
    globalControls,
    homeNavButton,
    turntableNavButton,
    portfolioNavButton,
    portfolioResumeButton,
    resetTutorialButton,
    freeLookButton,
    contactButton,
    cameraDebugPanel,
    portfolioPapersContainer,
    portfolioPrevArrow,
    portfolioNextArrow,
    placeholderAInfo,
    placeholderBInfo,
    portfolioPaperLinksBar,
  };
}
