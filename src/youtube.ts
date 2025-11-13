/* eslint-disable @typescript-eslint/no-explicit-any */
import { clampValue } from "./utils";
import { extractYouTubeVideoId } from "./metadata";

type YTPlayer = any;

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    __YT_IFRAME_READY_QUEUE__?: Array<() => void>;
  }
}

export type VideoMetadata = {
  artist: string;
  song: string;
  album: string;
};

export interface YouTubeBridge {
  el: HTMLDivElement;
  load(videoId: string): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  setVolume(value: number): void;
  getDuration(): number;
  getCurrentTime(): number;
  getVideoMetadata(): VideoMetadata | null;
  setSimulatedSize(width: number, height: number): void;
  setLetterboxColor(color: string): void;
  setOverlayEnabled(enabled: boolean): void;
  isOverlayEnabled(): boolean;
  setControlsVisible(visible: boolean): void;
  onPlaybackProgress(callback: (progress: number) => void): void;
  getAspectRatio(): number;
  setFullscreen(enabled: boolean): void;
  isFullscreen(): boolean;
  onFullscreenChange(callback: (isFullscreen: boolean) => void): void;
  setIsTonearmInPlayAreaQuery(callback: () => boolean): void;
  isPlayerCollapsed(): boolean;
  setPlayerCollapsed(collapsed: boolean): void;
}

let apiReadyPromise: Promise<void> | null = null;

function loadYouTubeIframeAPI(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise<void>((resolve) => {
    const queue = (window.__YT_IFRAME_READY_QUEUE__ ??= []);
    queue.push(resolve);

    if (!document.getElementById("youtube-iframe-api")) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }

    window.onYouTubeIframeAPIReady = () => {
      while (queue.length) {
        queue.shift()?.();
      }
    };
  });

  return apiReadyPromise;
}

let DYNAMIC_VIDEO_ASPECT = 16 / 9;

export function createYouTubePlayer(): YouTubeBridge {
  const wrapper = document.createElement("div");
  wrapper.className = "yt-shell";
  Object.assign(wrapper.style, {
    position: "absolute",
    top: "1.5rem",
    left: "1.5rem",
    zIndex: "1000",
    pointerEvents: "auto",
    transition: "all 0.3s ease-in-out",
  });

  const viewport = document.createElement("div");
  viewport.className = "yt-player-viewport";
  viewport.style.width = "512px";
  viewport.style.height = "0px";
  viewport.style.transition = "height 0.5s ease-out";
  viewport.style.transformOrigin = "center center";
  wrapper.appendChild(viewport);

  // Button container that stays visible
  const buttonContainer = document.createElement("div");
  Object.assign(buttonContainer.style, {
    position: "absolute",
    top: "-10px",
    right: "-10px",
    zIndex: "1001",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 0.2s ease",
  });
  wrapper.appendChild(buttonContainer);

  // Collapse/expand button with SVG
  let isCollapsed = false;
  const collapseButton = document.createElement("button");
  collapseButton.tabIndex = -1;
  Object.assign(collapseButton.style, {
    width: "48px",
    height: "48px",
    padding: "0",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
    outline: "none",
  });
  collapseButton.title = "Hide player";

  // Prevent focus on mousedown
  collapseButton.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });

  // Create SVG arrow
  const createArrowSvg = (direction: "up" | "down") => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "36");
    svg.setAttribute("height", "36");
    svg.style.display = "block";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    if (direction === "up") {
      path.setAttribute("d", "M7 14l5-5 5 5z");
    } else {
      path.setAttribute("d", "M7 10l5 5 5-5z");
    }
    path.setAttribute("fill", "#999");

    svg.appendChild(path);
    return svg;
  };

  let currentArrowSvg = createArrowSvg("up");
  collapseButton.appendChild(currentArrowSvg);

  collapseButton.addEventListener("mouseenter", () => {
    const path = currentArrowSvg.querySelector("path") as SVGPathElement;
    if (path) {
      path.setAttribute("fill", "#bbb");
    }
  });

  collapseButton.addEventListener("mouseleave", () => {
    const path = currentArrowSvg.querySelector("path") as SVGPathElement;
    if (path) {
      path.setAttribute("fill", "#999");
    }
  });

  collapseButton.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    if (isCollapsed) {
      viewport.style.height = "0px";
      collapseButton.title = "Show player";
      // Replace SVG with down arrow
      currentArrowSvg.remove();
      currentArrowSvg = createArrowSvg("down");
      collapseButton.appendChild(currentArrowSvg);
      // Hide fullscreen button when collapsed so it doesn't cover the uncollapse button
      fullscreenButtonContainer.style.display = "none";
    } else {
      // Restore to previous height or calculate it
      const isTonearmInPlayArea = isTonearmInPlayAreaQuery?.() ?? false;
      if (isTonearmInPlayArea) {
        const targetHeight = 512 / DYNAMIC_VIDEO_ASPECT;
        viewport.style.height = `${targetHeight}px`;
      }
      collapseButton.title = "Hide player";
      // Replace SVG with up arrow
      currentArrowSvg.remove();
      currentArrowSvg = createArrowSvg("up");
      collapseButton.appendChild(currentArrowSvg);
      // Show fullscreen button when expanded
      fullscreenButtonContainer.style.display = "flex";
    }
    // After state change, update button visibility based on current state
    if (isCollapsed) {
      // Show black button when collapsed
      updateButtonVisibility();
      updateFullscreenButtonVisibility();
    } else {
      // When uncollapsing, check if mouse is hovering
      // If hovering, show buttons immediately; otherwise they'll show on next hover
      const isMouseHovering = wrapper.matches(":hover");
      if (isMouseHovering) {
        // Show collapse button with grey color
        buttonContainer.style.opacity = "1";
        const path = currentArrowSvg.querySelector("path") as SVGPathElement;
        if (path) {
          path.setAttribute("fill", "#999");
        }
        // Show fullscreen button (viewport height may still be animating, but show it anyway)
        fullscreenButtonContainer.style.opacity = "1";
        // After height transition completes, validate visibility
        setTimeout(() => {
          updateFullscreenButtonVisibility();
        }, 550);
      } else {
        // Mouse not hovering, hide buttons until next hover
        buttonContainer.style.opacity = "0";
        fullscreenButtonContainer.style.opacity = "0";
      }
    }
  });

  buttonContainer.appendChild(collapseButton);

  // Show button on hover, or always show when collapsed
  const updateButtonVisibility = () => {
    const isPlayerVisible = viewport.clientHeight > 0;
    // Show button if player is visible (on hover) OR if player is collapsed
    if (isPlayerVisible || isCollapsed) {
      buttonContainer.style.opacity = "1";
      // Change button color: grey when player visible, black when collapsed
      if (isCollapsed) {
        const path = currentArrowSvg.querySelector("path") as SVGPathElement;
        if (path) {
          path.setAttribute("fill", "#000");
        }
      }
    } else {
      buttonContainer.style.opacity = "0";
    }
  };

  // Show fullscreen button on hover when player is visible
  const updateFullscreenButtonVisibility = () => {
    const isPlayerVisible = viewport.clientHeight > 0;
    const isTonearmInPlayArea = isTonearmInPlayAreaQuery?.() ?? false;
    // Only show if player is visible AND not collapsed AND tonearm is in play area
    if (isPlayerVisible && !isCollapsed && isTonearmInPlayArea) {
      fullscreenButtonContainer.style.opacity = "1";
      fullscreenButtonContainer.style.pointerEvents = "auto";
    } else {
      fullscreenButtonContainer.style.opacity = "0";
      fullscreenButtonContainer.style.pointerEvents = "none";
    }
  };

  wrapper.addEventListener("mouseenter", () => {
    const isTonearmInPlayArea = isTonearmInPlayAreaQuery?.() ?? false;
    if (!isCollapsed && isTonearmInPlayArea) {
      const path = currentArrowSvg.querySelector("path") as SVGPathElement;
      if (path) {
        path.setAttribute("fill", "#999");
      }
      // Show button when hovering over expanded player
      buttonContainer.style.opacity = "1";
      buttonContainer.style.pointerEvents = "auto";
      updateFullscreenButtonVisibility();
    }
  });

  wrapper.addEventListener("mouseleave", () => {
    // Only hide button if not collapsed. If collapsed, keep it visible
    if (!isCollapsed) {
      buttonContainer.style.opacity = "0";
      buttonContainer.style.pointerEvents = "none";
    }
    fullscreenButtonContainer.style.opacity = "0";
  });

  const playerSize = document.createElement("div");
  playerSize.id = "player-size";
  playerSize.style.width = "512px";
  playerSize.style.height = "1024px";
  viewport.appendChild(playerSize);

  const playerHostId = "player";
  const playerHost = document.createElement("div");
  playerHost.id = playerHostId;
  playerSize.appendChild(playerHost);

  let player: YTPlayer | null = null;
  let videoMetadata: VideoMetadata | null = null;
  let overlayEnabled = true;
  let controlsContainer: HTMLDivElement | null = null;
  let onVideoLoadedCallback: (() => void) | null = null;
  let isFullscreenMode = false;
  let fullscreenControls: HTMLDivElement | null = null;
  let userActivityTimeout: number | null = null;
  let fullscreenChangeCallback: ((isFullscreen: boolean) => void) | null = null;
  let isTonearmInPlayAreaQuery: (() => boolean) | null = null;

  const disablePlayerInteraction = () => {
    const iframe = player?.getIframe?.();
    if (!iframe) return;
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("draggable", "false");
    iframe.blur?.();
    Object.assign(iframe.style, {
      pointerEvents: "none",
      userSelect: "none",
      touchAction: "none",
    });
  };

  const updateViewport = () => {
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const playerWidth = playerSize.clientWidth;
    const playerHeight = playerSize.clientHeight;

    if (!viewportWidth || !viewportHeight || !playerWidth || !playerHeight)
      return;

    viewport.style.overflow = "hidden";

    const excessY = playerHeight - viewportHeight;
    playerSize.style.transform = `translateY(${-excessY / 2}px)`;
  };

  const resizeObserver = new ResizeObserver(() => updateViewport());
  resizeObserver.observe(playerSize);
  resizeObserver.observe(viewport);

  const ensureApi = () => loadYouTubeIframeAPI();

  const updateVideoMetadata = () => {
    if (!player?.getVideoData) return null;
    const data = player.getVideoData();
    videoMetadata = normalizeVideoMetadata(
      data?.title ?? "",
      data?.author ?? "",
    );
    disablePlayerInteraction();
    return videoMetadata;
  };

  const detectAndUpdateAspectRatio = async (videoId: string) => {
    try {
      const endpoint = "https://www.youtube.com/oembed";
      const params = new URLSearchParams({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        format: "json",
      });

      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) {
        DYNAMIC_VIDEO_ASPECT = 16 / 9;
        return;
      }

      const data = await response.json();
      const html = (data.html ?? "").trim();
      const title = data.title ?? "";

      if (
        html.startsWith('<iframe width="200" height="150"') &&
        title.includes("Album")
      ) {
        DYNAMIC_VIDEO_ASPECT = 1;
      } else if (html.startsWith('<iframe width="200" height="150"')) {
        DYNAMIC_VIDEO_ASPECT = 4 / 3;
      } else if (html.startsWith('<iframe width="200" height="113"')) {
        DYNAMIC_VIDEO_ASPECT = 16 / 9;
      } else {
        DYNAMIC_VIDEO_ASPECT = 16 / 9;
      }
      updateViewport();
    } catch (error) {
      console.warn("Failed to detect video aspect ratio:", error);
      DYNAMIC_VIDEO_ASPECT = 16 / 9;
      updateViewport();
    }
  };

  async function load(videoId: string) {
    await ensureApi();

    await detectAndUpdateAspectRatio(videoId);

    if (player) {
      player.cueVideoById(videoId);
      disablePlayerInteraction();
      return new Promise<void>((resolve) => {
        onVideoLoadedCallback = resolve;
      });
    }

    await new Promise<void>((resolve) => {
      const YT = (window as any).YT;
      player = new YT.Player(playerHostId, {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          disablekb: 1,
          playsinline: 1,
          fs: 0,
          iv_load_policy: 3,
          showinfo: 0,
          cc_load_policy: 0,
        },
        events: {
          onReady: () => {
            player!.setPlaybackRate(1);
            disablePlayerInteraction();
            updateVideoMetadata();
            resolve();
          },
          onStateChange: (event: any) => {
            const state = event.data;
            if (state === 5) {
              updateVideoMetadata();
              onVideoLoadedCallback?.();
              onVideoLoadedCallback = null;
            }
          },
        },
      });
    });
  }

  // Fullscreen button container (positioned in wrapper, similar to collapse button)
  const fullscreenButtonContainer = document.createElement("div");
  // Store original small mode position values
  const SMALL_MODE_POSITION = {
    position: "absolute",
    bottom: "32px",
    right: "-10px",
    zIndex: "1001",
  };
  Object.assign(fullscreenButtonContainer.style, {
    ...SMALL_MODE_POSITION,
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 0.2s ease",
  });
  wrapper.appendChild(fullscreenButtonContainer);

  const createFullscreenToggle = () => {
    const toggle = document.createElement("button");
    toggle.tabIndex = -1;
    Object.assign(toggle.style, {
      width: "48px",
      height: "48px",
      padding: "0",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
      outline: "none",
    });
    toggle.title = "Fullscreen";

    // Prevent focus on mousedown
    toggle.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    Object.assign(icon.style, {
      width: "32px",
      height: "32px",
      display: "block",
    });

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    // Fullscreen icon - arrows pointing outward to corners
    path.setAttribute(
      "d",
      "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
    );
    path.setAttribute("fill", "#999");
    icon.appendChild(path);
    toggle.appendChild(icon);

    toggle.addEventListener("click", () => {
      setFullscreen(!isFullscreenMode);
    });

    toggle.addEventListener("mouseenter", () => {
      path.setAttribute("fill", "#bbb");
    });

    toggle.addEventListener("mouseleave", () => {
      path.setAttribute("fill", "#999");
    });

    return toggle;
  };

  const fullscreenToggle = createFullscreenToggle();
  fullscreenButtonContainer.appendChild(fullscreenToggle);

  const createFullscreenControls = () => {
    const container = document.createElement("div");
    container.className = "yt-fullscreen-controls";
    Object.assign(container.style, {
      position: "fixed",
      left: "1.5rem",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: "10001",
      display: "flex",
      flexDirection: "column",
      gap: "1rem",
      padding: "1rem 0.5rem",
      background: "#000",
      opacity: "1",
      transition: "opacity 0.3s ease-in-out",
      pointerEvents: "auto",
    });

    // timeline
    const timelineContainer = document.createElement("div");
    Object.assign(timelineContainer.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0.5rem",
    });

    const timeline = document.createElement("div");
    Object.assign(timeline.style, {
      width: "4px",
      height: "300px",
      background: "rgba(255,255,255,0.2)",
      position: "relative",
    });

    const timelineFill = document.createElement("div");
    Object.assign(timelineFill.style, {
      width: "100%",
      height: "0%",
      background: "#fff",
      transition: "height 0.1s linear",
      position: "absolute",
      bottom: "0",
    });
    timeline.appendChild(timelineFill);

    const timingLabel = document.createElement("div");
    Object.assign(timingLabel.style, {
      color: "#fff",
      fontSize: "0.7rem",
      fontFamily: '"Space Grotesk", "Inter", sans-serif',
      fontWeight: "600",
      fontVariantNumeric: "tabular-nums",
      writingMode: "vertical-rl",
      textOrientation: "mixed",
      transform: "rotate(180deg)",
    });
    timingLabel.textContent = "0:00 / 0:00";

    timelineContainer.appendChild(timeline);
    timelineContainer.appendChild(timingLabel);

    container.appendChild(timelineContainer);

    // store refs
    (container as any)._timelineFill = timelineFill;
    (container as any)._timingLabel = timingLabel;

    return container;
  };

  const resetUserActivityTimer = () => {
    if (userActivityTimeout !== null) {
      clearTimeout(userActivityTimeout);
    }

    if (isFullscreenMode && fullscreenControls) {
      fullscreenControls.style.opacity = "1";
      fullscreenControls.style.pointerEvents = "auto";
      // Also show fullscreen button in fullscreen mode
      fullscreenButtonContainer.style.opacity = "1";

      userActivityTimeout = window.setTimeout(() => {
        if (fullscreenControls) {
          fullscreenControls.style.opacity = "0";
          fullscreenControls.style.pointerEvents = "none";
        }
        // Hide fullscreen button after inactivity
        fullscreenButtonContainer.style.opacity = "0";
      }, 2000);
    }
  };

  const setFullscreen = (enabled: boolean) => {
    isFullscreenMode = enabled;

    if (fullscreenChangeCallback) {
      fullscreenChangeCallback(enabled);
    }

    if (enabled) {
      // Uncollapse the player when entering fullscreen
      isCollapsed = false;
      collapseButton.title = "Hide player";
      currentArrowSvg.remove();
      currentArrowSvg = createArrowSvg("up");
      collapseButton.appendChild(currentArrowSvg);

      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const playerWidth = windowWidth;
      const playerHeight = 2 * windowWidth;

      wrapper.style.transition = "none";
      wrapper.style.opacity = "0";

      Object.assign(wrapper.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: `${windowWidth}px`,
        height: `${windowHeight}px`,
        zIndex: "0",
      });

      const appDiv = document.getElementById("app");
      if (appDiv) {
        appDiv.style.background = "transparent";
      }

      viewport.style.width = `${windowWidth}px`;
      viewport.style.height = `${windowHeight}px`;
      viewport.style.opacity = "0";
      viewport.style.transition = "opacity 0.5s ease-out";
      void viewport.offsetHeight;
      viewport.style.opacity = "1";

      wrapper.style.transition = "opacity 0.5s ease-out";
      void wrapper.offsetHeight;
      wrapper.style.opacity = "1";

      Object.assign(playerSize.style, {
        width: `${playerWidth}px`,
        height: `${playerHeight}px`,
      });

      if (controlsContainer) {
        (controlsContainer as HTMLDivElement).style.display = "none";
      }

      if (!fullscreenControls) {
        fullscreenControls = createFullscreenControls();
        document.body.appendChild(fullscreenControls);
      } else {
        fullscreenControls.style.display = "flex";
      }

      // Handle ESC key to exit fullscreen
      const handleFullscreenEsc = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setFullscreen(false);
        } else {
          resetUserActivityTimer();
        }
      };

      // Handle window resize to adjust viewport and player size dynamically
      const handleFullscreenResize = () => {
        const newWindowWidth = window.innerWidth;
        const newWindowHeight = window.innerHeight;
        const newPlayerWidth = newWindowWidth;
        const newPlayerHeight = 2 * newWindowWidth;

        wrapper.style.width = `${newWindowWidth}px`;
        wrapper.style.height = `${newWindowHeight}px`;
        viewport.style.width = `${newWindowWidth}px`;
        viewport.style.height = `${newWindowHeight}px`;
        Object.assign(playerSize.style, {
          width: `${newPlayerWidth}px`,
          height: `${newPlayerHeight}px`,
        });
        updateViewport();
      };

      document.addEventListener("mousemove", resetUserActivityTimer);
      document.addEventListener("mousedown", resetUserActivityTimer);
      document.addEventListener("keydown", handleFullscreenEsc);
      window.addEventListener("resize", handleFullscreenResize);
      resetUserActivityTimer();

      // Store references for cleanup
      (wrapper as any)._fullscreenEscHandler = handleFullscreenEsc;
      (wrapper as any)._fullscreenResizeHandler = handleFullscreenResize;

      // Move fullscreen button outside wrapper and to fixed position for fullscreen
      document.body.appendChild(fullscreenButtonContainer);
      Object.assign(fullscreenButtonContainer.style, {
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        opacity: "1",
        pointerEvents: "auto",
        zIndex: "10002",
      });
      // Change to exit fullscreen icon (minimize - arrows pointing inward)
      const fullscreenPath = fullscreenToggle.querySelector(
        "path",
      ) as SVGPathElement;
      if (fullscreenPath) {
        // Exit fullscreen icon - arrows pointing inward from corners
        fullscreenPath.setAttribute(
          "d",
          "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
        );
        fullscreenPath.removeAttribute("stroke");
        fullscreenPath.removeAttribute("stroke-width");
        fullscreenPath.removeAttribute("stroke-linecap");
        fullscreenPath.removeAttribute("stroke-linejoin");
        fullscreenPath.setAttribute("fill", "#999");
      }
    } else {
      viewport.style.transition = "none";
      viewport.style.opacity = "0";

      (() => {
        wrapper.style.transition = "none";
        viewport.style.transition = "none";
        playerSize.style.transition = "none";

        Object.assign(playerSize.style, {
          width: "512px",
          height: "1024px",
        });

        viewport.style.width = "512px";
        viewport.style.height = "0px";
        viewport.style.opacity = "1";
        void viewport.offsetHeight;

        Object.assign(wrapper.style, {
          position: "absolute",
          top: "1.5rem",
          left: "1.5rem",
          width: "auto",
          height: "auto",
          zIndex: "1000",
        });

        const appDiv = document.getElementById("app");
        if (appDiv) {
          appDiv.style.background = "";
        }

        if (controlsContainer) {
          (controlsContainer as HTMLDivElement).style.display = "flex";
        }

        if (fullscreenControls) {
          fullscreenControls.style.display = "none";
        }

        viewport.style.transition = "height 0.5s ease-out";
        void viewport.offsetHeight;

        // Only show player if tonearm is in play area
        const isTonearmInPlayArea = isTonearmInPlayAreaQuery?.() ?? false;
        if (isTonearmInPlayArea) {
          const targetHeight = 512 / DYNAMIC_VIDEO_ASPECT;
          viewport.style.height = `${targetHeight}px`;
        }
      })();

      document.removeEventListener("mousemove", resetUserActivityTimer);
      document.removeEventListener("mousedown", resetUserActivityTimer);

      // Remove fullscreen-specific event listeners
      const fullscreenEscHandler = (wrapper as any)._fullscreenEscHandler;
      const fullscreenResizeHandler = (wrapper as any)._fullscreenResizeHandler;
      if (fullscreenEscHandler) {
        document.removeEventListener("keydown", fullscreenEscHandler);
        (wrapper as any)._fullscreenEscHandler = null;
      }
      if (fullscreenResizeHandler) {
        window.removeEventListener("resize", fullscreenResizeHandler);
        (wrapper as any)._fullscreenResizeHandler = null;
      }

      if (userActivityTimeout !== null) {
        clearTimeout(userActivityTimeout);
        userActivityTimeout = null;
      }

      // Update button visibility after exiting fullscreen
      updateButtonVisibility();

      // Move fullscreen button back to wrapper and restore small mode position
      wrapper.appendChild(fullscreenButtonContainer);
      // Restore original small mode positioning
      Object.assign(fullscreenButtonContainer.style, {
        ...SMALL_MODE_POSITION,
        opacity: "0",
        pointerEvents: "auto",
      });
      // Revert icon back to fullscreen icon (arrows pointing outward)
      const exitFullscreenPath = fullscreenToggle.querySelector(
        "path",
      ) as SVGPathElement;
      if (exitFullscreenPath) {
        exitFullscreenPath.setAttribute(
          "d",
          "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
        );
        exitFullscreenPath.setAttribute("fill", "#999");
      }
      updateFullscreenButtonVisibility();
    }

    updateViewport();
  };

  const bridge: YouTubeBridge = {
    el: wrapper,
    load,
    play() {
      player?.playVideo?.();
    },
    pause() {
      player?.pauseVideo?.();
    },
    seek(seconds: number) {
      if (!player?.seekTo) return;
      const state = player.getPlayerState?.();
      player.seekTo(Math.max(0, seconds), true);
      if (state !== (window as any).YT?.PlayerState?.PLAYING) {
        player.pauseVideo?.();
      }
    },
    setRate(rate: number) {
      try {
        player?.setPlaybackRate?.(rate);
      } catch {}
    },
    setVolume(value: number) {
      const clamped = Math.max(0, Math.min(100, value));
      try {
        player?.setVolume?.(clamped);
      } catch {}
      // no fullscreen volume to sync anymore
    },
    getDuration() {
      return player?.getDuration?.() ?? 0;
    },
    getCurrentTime() {
      return player?.getCurrentTime?.() ?? 0;
    },
    getVideoMetadata() {
      return updateVideoMetadata();
    },
    setSimulatedSize(width: number, height: number) {
      playerSize.style.width = `${width}px`;
      playerSize.style.height = `${height}px`;
      updateViewport();
    },
    setLetterboxColor(color: string) {
      viewport.style.background = color;
      playerSize.style.background = color;
      playerHost.style.background = color;
    },
    setOverlayEnabled(enabled: boolean) {
      overlayEnabled = enabled;
      updateViewport();
    },
    isOverlayEnabled() {
      return overlayEnabled;
    },
    setControlsVisible(visible: boolean) {
      const container = (this as any)._controlsContainer || controlsContainer;
      if (container) {
        (container as any)._setVisible?.(visible);
      }
      if (fullscreenToggle) {
        (fullscreenToggle as any)._setVisible?.(visible);
      }
    },
    onPlaybackProgress(callback: (progress: number) => void) {
      (this as any).onPlaybackProgressCallback = callback;
    },
    getAspectRatio() {
      return DYNAMIC_VIDEO_ASPECT;
    },
    setFullscreen(enabled: boolean) {
      setFullscreen(enabled);
    },
    isFullscreen() {
      return isFullscreenMode;
    },
    onFullscreenChange(callback: (isFullscreen: boolean) => void) {
      fullscreenChangeCallback = callback;
    },
    setIsTonearmInPlayAreaQuery(callback: () => boolean) {
      isTonearmInPlayAreaQuery = callback;
    },
    isPlayerCollapsed(): boolean {
      return isCollapsed;
    },
    setPlayerCollapsed(collapsed: boolean): void {
      if (collapsed === isCollapsed) {
        return; // No change needed
      }
      isCollapsed = collapsed;
      if (isCollapsed) {
        viewport.style.height = "0px";
        collapseButton.title = "Show player";
        // Replace SVG with down arrow
        currentArrowSvg.remove();
        currentArrowSvg = createArrowSvg("down");
        collapseButton.appendChild(currentArrowSvg);
      } else {
        // Restore to previous height or calculate it
        const isTonearmInPlayArea = isTonearmInPlayAreaQuery?.() ?? false;
        if (isTonearmInPlayArea) {
          const targetHeight = 512 / DYNAMIC_VIDEO_ASPECT;
          viewport.style.height = `${targetHeight}px`;
        }
        collapseButton.title = "Hide player";
        // Replace SVG with up arrow
        currentArrowSvg.remove();
        currentArrowSvg = createArrowSvg("up");
        collapseButton.appendChild(currentArrowSvg);
      }
    },
  };

  (bridge as any)._fullscreenControls = () => fullscreenControls;

  // Add F key handler to toggle fullscreen mode (only when tonearm is in play area)
  let isFPressed = false;
  const handleFKeyToggle = (event: KeyboardEvent) => {
    if ((event.key.toLowerCase() === "f" || event.key === "F") && !isFPressed) {
      isFPressed = true;
      // Don't toggle if the key is pressed within an input field or textarea
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }
      // Always prevent default for F key to prevent browser focus behavior
      event.preventDefault();

      // Only toggle if tonearm is in play area
      const isTonearmInPlayArea = isTonearmInPlayAreaQuery?.() ?? false;
      if (!isTonearmInPlayArea) {
        return;
      }
      setFullscreen(!isFullscreenMode);
    }
  };

  const handleFKeyUp = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === "f" || event.key === "F") {
      isFPressed = false;
    }
  };

  document.addEventListener("keydown", handleFKeyToggle);
  document.addEventListener("keyup", handleFKeyUp);
  (bridge as any)._fKeyToggleHandler = handleFKeyToggle;

  return bridge;
}

export interface VideoControls {
  container: HTMLDivElement;
  setProgress: (current: number, duration: number) => void;
  setVolume: (value: number) => void;
}

export interface YouTubeExperience {
  bridge: YouTubeBridge;
  controls: VideoControls;
}

export function createYouTubeExperience(host: HTMLElement): YouTubeExperience {
  const bridge = createYouTubePlayer();
  host.appendChild(bridge.el);
  const controls = createVideoControls((value) => bridge.setVolume(value));
  bridge.el.appendChild(controls.container);
  controls.setVolume(100);
  (bridge as any)._controlsContainer = controls.container;
  return { bridge, controls };
}

export function createProgressUpdater(
  bridge: YouTubeBridge,
  controls: VideoControls,
  durationProvider: () => number,
) {
  return () => {
    const duration = durationProvider() || bridge.getDuration();
    if (!duration || duration <= 0) {
      controls.setProgress(0, 0);
      return;
    }
    const currentTime = bridge.getCurrentTime();
    controls.setProgress(currentTime, duration);

    const fullscreenControls = (bridge as any)._fullscreenControls?.();
    if (fullscreenControls) {
      const safeDuration = duration > 0 ? duration : 1;
      const ratio = clampValue(currentTime / safeDuration, 0, 1);
      const fill = (fullscreenControls as any)._timelineFill;
      const label = (fullscreenControls as any)._timingLabel;
      if (fill) {
        fill.style.height = `${ratio * 100}%`;
      }
      if (label) {
        label.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
      }
    }

    const progress = duration > 0 ? currentTime / duration : 0;
    (bridge as any).onPlaybackProgressCallback?.(progress);
  };
}

function normalizeVideoMetadata(
  titleRaw: string,
  authorRaw: string,
): VideoMetadata {
  const title = titleRaw.trim();
  const author = authorRaw.trim();
  const split = splitArtistAndSong(title);
  let artist = split.artist || author || "Unknown Artist";
  let song = split.song || title || "Untitled Track";

  const parsedFromSong = scrubSongDecorations(song);
  song = parsedFromSong.text || song;
  let album = parsedFromSong.album;

  if (!album) {
    const parsedFromTitle = scrubSongDecorations(title);
    if (parsedFromTitle.album) {
      album = parsedFromTitle.album;
    }
  }

  return {
    artist: artist || "Unknown Artist",
    song: song || "Untitled Track",
    album: album ?? "",
  };
}

function splitArtistAndSong(title: string) {
  const separators = [" - ", " – ", " — ", ": "];
  for (const separator of separators) {
    if (title.includes(separator)) {
      const [artist, ...rest] = title.split(separator);
      const song = rest.join(separator);
      if (artist && song) {
        return { artist: artist.trim(), song: song.trim() };
      }
    }
  }
  return { artist: "", song: title.trim() };
}

function scrubSongDecorations(input: string) {
  const ALBUM_KEYWORDS = /\b(album|ep)\b/i;
  const IGNORED =
    /(official|video|lyrics?|audio|visualizer|remix|live|performance|prod\.?|feat\.?|full|remastered|hd|4k)/i;
  let album = "";
  let text = input;
  text = text.replace(/\(([^)]+)\)|\[([^\]]+)\]/g, (_match, group1, group2) => {
    const inner = (group1 ?? group2 ?? "").trim();
    if (!inner) return "";
    if (ALBUM_KEYWORDS.test(inner) && !album) {
      album = inner
        .replace(ALBUM_KEYWORDS, "")
        .replace(/official/gi, "")
        .replace(/version/gi, "")
        .replace(/full/gi, "")
        .trim();
      return "";
    }
    if (IGNORED.test(inner)) {
      return "";
    }
    return ` ${inner}`;
  });

  text = text.replace(/\s+/g, " ").trim();
  return { text, album };
}

export function createVideoControls(
  onVolumeChange: (value: number) => void,
): VideoControls {
  const container = document.createElement("div");
  Object.assign(container.style, {
    width: "100%",
    marginTop: "0.6rem",
    padding: "0 0.25rem 0.3rem",
    color: "#000",
    fontSize: "0.75rem",
    fontFamily: '"Space Grotesk", "Inter", sans-serif',
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    opacity: "0",
    transition: "opacity 0.3s ease-in-out",
    pointerEvents: "none",
  });

  (container as any)._setVisible = (visible: boolean) => {
    container.style.opacity = visible ? "1" : "0";
    container.style.pointerEvents = visible ? "auto" : "none";
  };

  const bar = document.createElement("div");
  Object.assign(bar.style, {
    width: "100%",
    height: "4px",
    background: "rgba(0,0,0,0.08)",
    overflow: "hidden",
  });

  const fill = document.createElement("div");
  Object.assign(fill.style, {
    width: "0%",
    height: "100%",
    background: "#000",
    transition: "width 0.1s linear",
  });
  bar.appendChild(fill);

  const timingLabel = document.createElement("div");
  timingLabel.textContent = "0:00 / 0:00";
  timingLabel.style.fontVariantNumeric = "tabular-nums";
  timingLabel.style.fontWeight = "600";
  timingLabel.style.fontSize = "0.7rem";

  const controlsRow = document.createElement("div");
  Object.assign(controlsRow.style, {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
  });

  const volumeSlider = document.createElement("input");
  volumeSlider.type = "range";
  volumeSlider.min = "0";
  volumeSlider.max = "100";
  volumeSlider.value = "100";
  volumeSlider.className = "volume-slider";
  volumeSlider.style.width = "92px";
  volumeSlider.style.height = "4px";
  volumeSlider.tabIndex = -1;

  let clickSetVolume = false;

  volumeSlider.addEventListener("pointerdown", (e) => {
    const rect = volumeSlider.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.min(Math.max(x / rect.width, 0), 1);
    const value = Math.round(ratio * 100);
    handleVolumeChange(value, true);
    clickSetVolume = true;
  });

  volumeSlider.addEventListener("input", () => {
    const v = parseInt(volumeSlider.value, 10);
    if (clickSetVolume) {
      clickSetVolume = false;
      return;
    }
    onVolumeChange(Number.isFinite(v) ? v : 0);
  });

  const volumeGroup = document.createElement("div");
  Object.assign(volumeGroup.style, {
    display: "flex",
    alignItems: "center",
    gap: "0.2rem",
    marginLeft: "auto",
  });

  const volumeIcon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  volumeIcon.setAttribute("viewBox", "0 0 20 20");
  volumeIcon.setAttribute("aria-hidden", "true");
  volumeIcon.setAttribute("role", "button");
  volumeIcon.setAttribute("aria-label", "Toggle mute");
  Object.assign(volumeIcon.style, {
    width: "14px",
    height: "14px",
    display: "block",
    cursor: "pointer",
    outline: "none",
  });
  volumeIcon.tabIndex = -1;

  // Prevent focus on mousedown
  volumeIcon.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });

  const volumeSpeakerPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  volumeSpeakerPath.setAttribute("d", "M2 7h3l4-3v12l-4-3H2z");
  volumeSpeakerPath.setAttribute("fill", "#000");
  const volumeWavesPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  volumeWavesPath.setAttribute(
    "d",
    "M13.5 10a2.5 2.5 0 0 1-1.3 2.2v-4.4a2.5 2.5 0 0 1 1.3 2.2zm2.5 0a5 5 0 0 1-2.6 4.4V5.6A5 5 0 0 1 16 10z",
  );
  volumeWavesPath.setAttribute("fill", "#000");
  volumeIcon.append(volumeSpeakerPath, volumeWavesPath);

  const setFillVisual = (value: number) => {
    const ratio = clampValue(value / 100, 0, 1) * 100;
    volumeSlider.style.background = `linear-gradient(90deg, #000 0%, #000 ${ratio}%, rgba(0,0,0,0.08) ${ratio}%, rgba(0,0,0,0.08) 100%)`;
  };

  let currentFillValue = 100;
  let fillAnimationFrame: number | null = null;

  const applyVolumeVisual = (value: number) => {
    currentFillValue = value;
    setFillVisual(value);
  };

  const animateFillTo = (target: number) => {
    if (fillAnimationFrame) {
      cancelAnimationFrame(fillAnimationFrame);
      fillAnimationFrame = null;
    }
    const startValue = currentFillValue;
    const delta = target - startValue;
    if (Math.abs(delta) < 0.5) {
      applyVolumeVisual(target);
      return;
    }
    const duration = 180;
    const startTime = performance.now();

    const tick = (time: number) => {
      const progress = Math.min(1, (time - startTime) / duration);
      const value = startValue + delta * progress;
      setFillVisual(value);
      if (progress < 1) {
        fillAnimationFrame = requestAnimationFrame(tick);
      } else {
        fillAnimationFrame = null;
        applyVolumeVisual(target);
      }
    };

    fillAnimationFrame = requestAnimationFrame(tick);
  };

  let lastVolumeBeforeMute = 100;

  const updateVolumeIcon = (value: number) => {
    const muted = value <= 0;
    volumeWavesPath.style.display = muted ? "none" : "block";
  };

  const handleVolumeChange = (value: number, animate = false) => {
    const safe = clampValue(value, 0, 100);
    volumeSlider.value = String(safe);
    if (animate) {
      animateFillTo(safe);
    } else {
      if (fillAnimationFrame) {
        cancelAnimationFrame(fillAnimationFrame);
        fillAnimationFrame = null;
      }
      applyVolumeVisual(safe);
    }
    if (safe > 0) {
      lastVolumeBeforeMute = safe;
    }
    updateVolumeIcon(safe);
    onVolumeChange(safe);
  };

  volumeSlider.addEventListener("input", () => {
    const value = parseInt(volumeSlider.value, 10);
    handleVolumeChange(Number.isFinite(value) ? value : 0);
  });

  const toggleMute = () => {
    const current = parseInt(volumeSlider.value, 10) || 0;
    if (current > 0) {
      lastVolumeBeforeMute = current;
      handleVolumeChange(0, true);
    } else {
      const restore = lastVolumeBeforeMute > 0 ? lastVolumeBeforeMute : 100;
      handleVolumeChange(restore, true);
    }
  };

  volumeIcon.addEventListener("click", () => toggleMute());
  volumeIcon.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleMute();
  });

  volumeGroup.append(volumeIcon, volumeSlider);
  controlsRow.append(timingLabel, volumeGroup);
  container.append(bar, controlsRow);

  const alignVolumeSlider = () => {
    if (!container.isConnected) return;
    const barRect = bar.getBoundingClientRect();
    const sliderRect = volumeSlider.getBoundingClientRect();
    if (!barRect.width || !sliderRect.width) return;
    const diff = barRect.right - sliderRect.right;
    if (Math.abs(diff) < 0.5) {
      volumeGroup.style.marginRight = "0px";
    } else {
      volumeGroup.style.marginRight = `${-diff}px`;
    }
  };
  const volumeAlignmentObserver = new ResizeObserver(() => alignVolumeSlider());
  volumeAlignmentObserver.observe(container);
  requestAnimationFrame(() => alignVolumeSlider());

  handleVolumeChange(100);

  return {
    container,
    setProgress: (current: number, duration: number) => {
      const safeDuration = duration > 0 ? duration : 1;
      const ratio = clampValue(current / safeDuration, 0, 1);
      fill.style.width = `${ratio * 100}%`;
      timingLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    },
    setVolume: (value: number) => {
      handleVolumeChange(value);
    },
  };
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export interface YouTubePlayerManager {
  bridge: YouTubeBridge;
  controls: VideoControls;
  getDuration: () => number;
  updateProgress: () => void;
  ready: Promise<void>;
  getVideoMetadata: () => VideoMetadata | null;
  loadVideo: (
    videoId: string,
    onMetadataLoaded?: (metadata: VideoMetadata | null) => void,
  ) => Promise<void>;
}

export function initializeYouTubePlayer(
  host: HTMLElement,
  youtubeSource?: string,
  onMetadataLoaded?: (metadata: VideoMetadata | null) => void,
): YouTubePlayerManager {
  const { bridge, controls } = createYouTubeExperience(host);

  let youtubeDuration = 0;

  const updateProgress = createProgressUpdater(
    bridge,
    controls,
    () => youtubeDuration,
  );

  const loadVideo = async (
    videoId: string,
    callback?: (metadata: VideoMetadata | null) => void,
  ) => {
    await bridge.load(videoId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    youtubeDuration = bridge.getDuration();
    controls.setProgress(0, youtubeDuration);
    const metadata = bridge.getVideoMetadata?.() ?? null;
    if (callback) {
      callback(metadata);
    }
  };

  const ready = youtubeSource
    ? (() => {
        const youtubeVideoId = extractYouTubeVideoId(youtubeSource);
        if (!youtubeVideoId) {
          return Promise.reject(
            new Error("Invalid YouTube video source provided."),
          );
        }
        return loadVideo(youtubeVideoId, onMetadataLoaded);
      })()
    : Promise.resolve();

  return {
    bridge,
    controls,
    getDuration: () => youtubeDuration,
    updateProgress,
    ready,
    getVideoMetadata: () => bridge.getVideoMetadata?.() ?? null,
    loadVideo,
  };
}
