import {
  UI_MAX_WIDTH,
  UI_Z_INDEX,
  VIEWER_MAX_WIDTH,
  HIDE_BUTTON_Z_INDEX,
  LINK_COLOR,
  LINK_HOVER_COLOR,
} from "./config";

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
  vinylViewerContainer: HTMLDivElement;
  hideLibraryBtn: HTMLButtonElement;
  focusCardCoverContainer: HTMLDivElement;
  focusCardInfoContainer: HTMLDivElement;
  showFocusBtn: HTMLButtonElement;
  globalControls: HTMLDivElement;
  homeNavButton: HTMLButtonElement;
  turntableNavButton: HTMLButtonElement;
  portfolioNavButton: HTMLButtonElement;
  resetTutorialButton: HTMLButtonElement;
  contactButton: HTMLButtonElement;
  cameraDebugPanel: HTMLDivElement;
  portfolioPapersContainer: HTMLDivElement;
  portfolioPrevArrow: HTMLButtonElement;
  portfolioNextArrow: HTMLButtonElement;
  placeholderAInfo: HTMLDivElement;
  placeholderBInfo: HTMLDivElement;
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
    z-index: ${UI_Z_INDEX};
    overflow: visible;
  `;
  root.appendChild(vinylLibraryContainer);

  // Create tutorial container
  const tutorialContainer = document.createElement("div");
  tutorialContainer.id = "vinyl-tutorial";
  tutorialContainer.style.cssText = `
    position: fixed;
    bottom: 180px;
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

  const contactButton = document.createElement("button");
  contactButton.id = "contact-button";
  contactButton.textContent = "contact";
  globalControls.appendChild(contactButton);

  const resetTutorialButton = document.createElement("button");
  resetTutorialButton.id = "reset-tutorial-button";
  resetTutorialButton.textContent = "reset tutorial";
  globalControls.appendChild(resetTutorialButton);

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

  // Create portfolio navigation arrows
  const portfolioPrevArrow = document.createElement("button");
  portfolioPrevArrow.textContent = "‹";
  Object.assign(portfolioPrevArrow.style, {
    position: "fixed",
    left: "50px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "4rem",
    background: "transparent",
    border: "none",
    color: "#000",
    cursor: "pointer",
    padding: "0.5rem",
    zIndex: "1050",
    opacity: "0",
    pointerEvents: "none",
    transition: "all 0.3s ease",
    textShadow: "-0.5px 0 #ff0000, 0.5px 0 #0000ff",
  });
  portfolioPrevArrow.addEventListener("mouseover", () => {
    portfolioPrevArrow.style.fontSize = "4.5rem";
  });
  portfolioPrevArrow.addEventListener("mouseout", () => {
    portfolioPrevArrow.style.fontSize = "4rem";
  });
  root.appendChild(portfolioPrevArrow);

  const portfolioNextArrow = document.createElement("button");
  portfolioNextArrow.textContent = "›";
  Object.assign(portfolioNextArrow.style, {
    position: "fixed",
    right: "50px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "4rem",
    background: "transparent",
    border: "none",
    color: "#000",
    cursor: "pointer",
    padding: "0.5rem",
    zIndex: "1050",
    opacity: "0",
    pointerEvents: "none",
    transition: "all 0.3s ease",
    textShadow: "-0.5px 0 #ff0000, 0.5px 0 #0000ff",
  });
  portfolioNextArrow.addEventListener("mouseover", () => {
    portfolioNextArrow.style.fontSize = "4.5rem";
  });
  portfolioNextArrow.addEventListener("mouseout", () => {
    portfolioNextArrow.style.fontSize = "4rem";
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
    vinylViewerContainer,
    hideLibraryBtn,
    focusCardCoverContainer,
    focusCardInfoContainer,
    showFocusBtn,
    globalControls,
    homeNavButton,
    turntableNavButton,
    portfolioNavButton,
    resetTutorialButton,
    contactButton,
    cameraDebugPanel,
    portfolioPapersContainer,
    portfolioPrevArrow,
    portfolioNextArrow,
    placeholderAInfo,
    placeholderBInfo,
  };
}
