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
  });

  const viewport = document.createElement("div");
  viewport.className = "yt-player-viewport";
  viewport.style.width = "512px";
  viewport.style.height = "0px"; // Start with 0 height when no video loaded
  viewport.style.transition = "height 0.5s ease-out"; // Add animation for height changes
  viewport.style.transformOrigin = "center center"; // Expand from center
  wrapper.appendChild(viewport);

  const playerSize = document.createElement("div");
  playerSize.id = "player-size";
  playerSize.style.width = "512px";
  playerSize.style.height = "1024px"; // Player stays fixed at 512x1024
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

    // Center the playerSize (512x1024) within the viewport
    // Viewport width is always 512, height varies by aspect ratio
    viewport.style.overflow = "hidden";

    // Calculate excess to center vertically
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

      // Detect aspect ratio from oEmbed response
      if (
        html.startsWith('<iframe width="200" height="150"') &&
        title.includes("Album")
      ) {
        DYNAMIC_VIDEO_ASPECT = 1; // Square (album art)
      } else if (html.startsWith('<iframe width="200" height="150"')) {
        DYNAMIC_VIDEO_ASPECT = 4 / 3; // Classic 4:3
      } else if (html.startsWith('<iframe width="200" height="113"')) {
        DYNAMIC_VIDEO_ASPECT = 16 / 9; // Widescreen
      } else {
        DYNAMIC_VIDEO_ASPECT = 16 / 9; // Default
      }

      // Don't set viewport height here - let main.ts control visibility based on tonearm position
      updateViewport();
    } catch (error) {
      console.warn("Failed to detect video aspect ratio:", error);
      DYNAMIC_VIDEO_ASPECT = 16 / 9;
      updateViewport();
    }
  };

  async function load(videoId: string) {
    await ensureApi();
    const YT = (window as any).YT;

    // Detect aspect ratio and update player size
    await detectAndUpdateAspectRatio(videoId);

    if (player) {
      // Use cueVideoById instead of loadVideoById to prevent autoplay
      player.cueVideoById(videoId);
      disablePlayerInteraction();
      // Wait for onStateChange event with CUED state (5) which fires when metadata is ready
      return new Promise<void>((resolve) => {
        onVideoLoadedCallback = resolve;
      });
    }

    await new Promise<void>((resolve) => {
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
            // UNSTARTED = -1, ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5
            const state = event.data;
            // When state changes to CUED (5), video metadata is available
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

  return {
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
    },
    onPlaybackProgress(callback: (progress: number) => void) {
      (this as any).onPlaybackProgressCallback = callback;
    },
    getAspectRatio() {
      return DYNAMIC_VIDEO_ASPECT;
    },
  };
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

  // Store controls container reference in bridge
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

    // Calculate progress as a ratio (0 to 1)
    const progress = duration > 0 ? currentTime / duration : 0;
    // Call the playback progress callback if registered
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

  // Expose a method to show/hide controls
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
  volumeSlider.style.height = "3px";

  let clickSetVolume = false;

  // user clicked somewhere on the track → animate
  volumeSlider.addEventListener("pointerdown", (e) => {
    const rect = volumeSlider.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.min(Math.max(x / rect.width, 0), 1);
    const value = Math.round(ratio * 100);

    handleVolumeChange(value, true); // ← your animated path
    clickSetVolume = true; // remember that we just set it ourselves
    // NO preventDefault here → dragging still works
  });

  // user drags the thumb → just update volume, no animation
  volumeSlider.addEventListener("input", () => {
    const v = parseInt(volumeSlider.value, 10);

    // if this input came right after our pointer click, skip it
    if (clickSetVolume) {
      clickSetVolume = false;
      return;
    }

    onVolumeChange(Number.isFinite(v) ? v : 0); // non-animated drag update
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
  });
  volumeIcon.tabIndex = 0;

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
    // Small delay to ensure metadata is extracted from the player
    await new Promise((resolve) => setTimeout(resolve, 100));
    youtubeDuration = bridge.getDuration();
    controls.setProgress(0, youtubeDuration);
    const metadata = bridge.getVideoMetadata?.() ?? null;
    if (callback) {
      callback(metadata);
    }
  };

  // Only load initial video if provided
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
