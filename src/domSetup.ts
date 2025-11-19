import {
  UI_MAX_WIDTH,
  UI_Z_INDEX,
  VIEWER_MAX_WIDTH,
  HIDE_BUTTON_Z_INDEX,
  LINK_COLOR,
  LINK_HOVER_COLOR,
} from "./config";

export interface DOMElements {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  vinylLibraryContainer: HTMLDivElement;
  tutorialContainer: HTMLDivElement;
  vinylViewerContainer: HTMLDivElement;
  hideLibraryBtn: HTMLButtonElement;
  focusCardCoverContainer: HTMLDivElement;
  focusCardInfoContainer: HTMLDivElement;
  showFocusBtn: HTMLButtonElement;
  homeOverlay: HTMLDivElement;
  globalControls: HTMLDivElement;
  homeNavButton: HTMLButtonElement;
  portfolioNavButton: HTMLButtonElement;
  resetTutorialButton: HTMLButtonElement;
  cameraDebugPanel: HTMLDivElement;
}

export function setupDOM(): DOMElements {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Missing #app container.");
  }
  root.innerHTML = "";

  // Create vinyl library widget container
  const vinylLibraryContainer = document.createElement("div");
  vinylLibraryContainer.id = "vinyl-library-widget";
  vinylLibraryContainer.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    max-width: ${UI_MAX_WIDTH};
    z-index: ${UI_Z_INDEX};
    overflow: visible;
  `;
  root.appendChild(vinylLibraryContainer);

  // Create tutorial container
  const tutorialContainer = document.createElement("div");
  tutorialContainer.id = "vinyl-tutorial";
  tutorialContainer.style.cssText = `
    position: fixed;
    bottom: 250px;
    left: 20px;
    max-width: 350px;
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

  // Create vinyl viewer container
  const vinylViewerContainer = document.createElement("div");
  vinylViewerContainer.id = "vinyl-library-viewer";
  vinylViewerContainer.style.cssText = `
    position: fixed;
    top: 0;
    right: -20px;
    bottom: 0;
    max-width: ${VIEWER_MAX_WIDTH};
    z-index: ${UI_Z_INDEX};
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    transition: opacity 0.45s ease, transform 0.45s ease;
    opacity: 0;
    transform: translateY(8px);
    padding: 20px 40px 20px 20px;
  `;
  vinylViewerContainer.style.pointerEvents = "none";

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
          (filterControls as HTMLElement).style.transition = "opacity 0.3s ease";
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

    #global-controls button {
      padding: 8px 16px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      border: 1px solid #666;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      transition: background 0.15s;
      -webkit-font-smoothing: none;
      -moz-osx-font-smoothing: grayscale;
    }

    #global-controls button:hover {
      background: rgba(0, 0, 0, 0.9);
    }
  `;
  document.head.appendChild(style);
  root.appendChild(vinylViewerContainer);

  // Create home overlay
  const homeOverlay = document.createElement("div");
  homeOverlay.id = "home-overlay";
  homeOverlay.textContent = "home view — click a model to explore";
  Object.assign(homeOverlay.style, {
    position: "fixed",
    top: "1.5rem",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "0.75rem 1.5rem",
    borderRadius: "999px",
    background: "rgba(0, 0, 0, 0.75)",
    color: "#fff",
    fontSize: "0.85rem",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    pointerEvents: "auto",
    opacity: "1",
    transition: "opacity 0.4s ease",
    zIndex: "1200",
  });
  root.appendChild(homeOverlay);

  // Create global controls
  const globalControls = document.createElement("div");
  globalControls.id = "global-controls";
  Object.assign(globalControls.style, {
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: "0.75rem",
    zIndex: HIDE_BUTTON_Z_INDEX,
  });
  root.appendChild(globalControls);

  const homeNavButton = document.createElement("button");
  homeNavButton.textContent = "home view";
  globalControls.appendChild(homeNavButton);

  const portfolioNavButton = document.createElement("button");
  portfolioNavButton.textContent = "portfolio view";
  globalControls.appendChild(portfolioNavButton);

  const resetTutorialButton = document.createElement("button");
  resetTutorialButton.id = "reset-tutorial-button";
  resetTutorialButton.textContent = "reset tutorial";
  globalControls.appendChild(resetTutorialButton);

  // Create camera debug panel
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
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  });
  root.appendChild(cameraDebugPanel);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.id = "vinyl-viewer";
  root.appendChild(canvas);

  return {
    root,
    canvas,
    vinylLibraryContainer,
    tutorialContainer,
    vinylViewerContainer,
    hideLibraryBtn,
    focusCardCoverContainer,
    focusCardInfoContainer,
    showFocusBtn,
    homeOverlay,
    globalControls,
    homeNavButton,
    portfolioNavButton,
    resetTutorialButton,
    cameraDebugPanel,
  };
}
