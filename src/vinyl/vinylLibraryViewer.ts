/**
 * Vinyl Library Viewer Widget
 * Displays visitor's personal collection in a beautiful grid with album covers
 */

import {
  loadVisitorLibrary,
  saveVisitorLibrary,
  removeVisitorLink,
  fetchOwnerLibrary,
  deleteOwnerEntry,
  type VisitorEntry,
} from "../utils/visitorLibrary";

import {
  initializeCache,
  recreateBlobUrlIfNeeded,
} from "../utils/albumCoverCache";
import {
  generatePlasticOverlay,
  PLASTIC_OVERLAY_BLEND_MODE,
} from "../scene/plasticOverlay";

interface ViewerConfig {
  containerId: string;
  compact?: boolean;
  apiUrl?: string;
  isAdmin?: boolean;
  adminToken?: string;
}

interface ExtendedEntry extends VisitorEntry {
  isOwnerEntry?: boolean; // Flag to distinguish owner vs visitor entries
}

export class VinylLibraryViewer {
  private config: ViewerConfig;
  private library: ExtendedEntry[] = [];
  private visitorLibrary: VisitorEntry[] = [];
  private ownerLibrary: VisitorEntry[] = [];
  private showVisitorOnly: boolean = false;
  private searchQuery: string = ""; // Current search query
  private sortState: {
    category: "artist" | "genre" | "year" | null;
    direction: "asc" | "desc";
  } = { category: null, direction: "asc" };

  private scrollContainer: HTMLElement | null = null;

  private suppressNextLibraryUpdateEvent: boolean = false;
  private customOrder: Map<string, number> = new Map(); // Persisted custom ordering
  private isEditMode: boolean = false; // Toggle for showing delete buttons
  private focusedEntryId: string | null = null; // Track currently focused entry
  private focusedEntryVideoId: string | null = null;
  private focusCardCleanup: (() => void) | null = null;
  private isVinylOnTurntable: boolean = false;
  private turntableVideoId: string | null = null;

  constructor(config: ViewerConfig) {
    this.config = config;
    if (typeof window !== "undefined") {
      this.isVinylOnTurntable = Boolean(
        (window as any).__FOCUS_VINYL_ON_TURNTABLE__,
      );
      const initialTurntableVideoId = (window as any)
        .__FOCUS_VINYL_TURNTABLE_VIDEO_ID__;
      this.turntableVideoId =
        typeof initialTurntableVideoId === "string"
          ? initialTurntableVideoId
          : null;
    }
  }

  /**
   * Initialize and render the viewer
   */
  async init(): Promise<void> {
    const container = document.getElementById(this.config.containerId);
    if (!container) {
      console.error(`Container #${this.config.containerId} not found`);
      return;
    }

    // Initialize IndexedDB cache for blob URL recreation
    try {
      await initializeCache();
      console.log("✓ Album cover cache initialized");
    } catch (error) {
      console.error("Failed to initialize cache:", error);
    }

    // Load visitor library from localStorage
    this.visitorLibrary = loadVisitorLibrary();

    // Load owner library from API if configured
    if (this.config.apiUrl) {
      try {
        console.log("Fetching owner library from:", this.config.apiUrl);
        this.ownerLibrary = await fetchOwnerLibrary(this.config.apiUrl);
        console.log(
          "✓ Owner library loaded:",
          this.ownerLibrary.length,
          "entries",
        );
      } catch (error) {
        console.error("Failed to load owner library:", error);
        this.ownerLibrary = [];
      }
    } else {
      console.warn("No apiUrl configured for viewer");
      this.ownerLibrary = [];
    }

    console.log("Visitor library:", this.visitorLibrary.length, "entries");

    // Recreate blob URLs for cached covers in both libraries
    await this.recreateBlobUrls();

    this.loadPersistedViewerState();

    // Merge and mark libraries
    this.mergeLibraries();
    if (this.sortState.category) {
      this.applySorting();
    }
    console.log("📦 Merged library:", this.library.length, "total entries");

    // Render viewer
    this.render(container);

    // Watch for changes in localStorage
    this.watchStorageChanges();

    // Listen for video duration updates from the player
    this.watchVideoDurationUpdates();
    this.watchTurntableStateUpdates();
  }

  private loadPersistedViewerState(): void {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem("vinylLibraryViewerState");
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored) as {
        sortState?: {
          category: "artist" | "genre" | "year" | null;
          direction: "asc" | "desc";
        };
        customOrder?: Array<[string, number]>;
      };
      if (parsed?.sortState) {
        const category = parsed.sortState.category;
        const direction = parsed.sortState.direction;
        const validCategory =
          category === "artist" ||
          category === "genre" ||
          category === "year" ||
          category === null;
        const validDirection = direction === "asc" || direction === "desc";
        if (validCategory && validDirection) {
          this.sortState = { category, direction };
        }
      }
      if (Array.isArray(parsed?.customOrder)) {
        this.customOrder.clear();
        parsed.customOrder.forEach((entry) => {
          if (!Array.isArray(entry) || entry.length !== 2) {
            return;
          }
          const [id, timestamp] = entry;
          if (typeof id === "string" && typeof timestamp === "number") {
            this.customOrder.set(id, timestamp);
          }
        });
      }
    } catch (error) {
      console.warn("[vinylLibraryViewer] Failed to load viewer state:", error);
    }
  }

  private savePersistedViewerState(): void {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const state = {
        sortState: this.sortState,
        customOrder: Array.from(this.customOrder.entries()),
      };
      window.localStorage.setItem(
        "vinylLibraryViewerState",
        JSON.stringify(state),
      );
    } catch (error) {
      console.warn("[vinylLibraryViewer] Failed to save viewer state:", error);
    }
  }

  /**
   * Recreate blob URLs for all entries that have cached covers
   */
  private async recreateBlobUrls(): Promise<void> {
    console.groupCollapsed(
      `[recreateBlobUrls] Processing ${this.ownerLibrary.length} owner entries...`,
    );

    // Process entries sequentially with delay to avoid overwhelming Cover Art Archive
    for (const entry of this.ownerLibrary) {
      console.log(
        `[Owner Entry] id: ${entry.id}, releaseId: ${entry.releaseId}, imageUrl: ${entry.imageUrl}, originalImageUrl: ${entry.originalImageUrl}`,
      );

      // For entries without originalImageUrl, construct it from releaseId
      let fallbackUrl = entry.originalImageUrl;
      if (!fallbackUrl && entry.releaseId) {
        fallbackUrl = `https://coverartarchive.org/release/${entry.releaseId}/front`;
        console.log(
          `[Owner Entry] Constructed fallback URL from releaseId: ${fallbackUrl}`,
        );
      }

      const newUrl = await recreateBlobUrlIfNeeded(
        entry.imageUrl,
        entry.releaseId,
        fallbackUrl, // Pass original URL or constructed URL as fallback
      );
      console.log(
        `[Owner Entry] Updated imageUrl from ${entry.imageUrl} to ${newUrl}`,
      );
      entry.imageUrl = newUrl;

      // Small delay to avoid rate limiting (50ms between requests)
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    console.groupEnd();
    console.groupCollapsed(
      `[recreateBlobUrls] Processing ${this.visitorLibrary.length} visitor entries...`,
    );

    // Process entries sequentially with delay to avoid overwhelming Cover Art Archive
    for (const entry of this.visitorLibrary) {
      console.log(
        `[Visitor Entry] id: ${entry.id}, releaseId: ${entry.releaseId}, imageUrl: ${entry.imageUrl}, originalImageUrl: ${entry.originalImageUrl}`,
      );

      // For entries without originalImageUrl, construct it from releaseId
      let fallbackUrl = entry.originalImageUrl;
      if (!fallbackUrl && entry.releaseId) {
        fallbackUrl = `https://coverartarchive.org/release/${entry.releaseId}/front`;
        console.log(
          `[Visitor Entry] Constructed fallback URL from releaseId: ${fallbackUrl}`,
        );
      }

      const newUrl = await recreateBlobUrlIfNeeded(
        entry.imageUrl,
        entry.releaseId,
        fallbackUrl, // Pass original URL or constructed URL as fallback
      );
      console.log(
        `[Visitor Entry] Updated imageUrl from ${entry.imageUrl} to ${newUrl}`,
      );
      entry.imageUrl = newUrl;

      // Small delay to avoid rate limiting (50ms between requests)
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    console.groupEnd();
    console.log("[recreateBlobUrls] Done!");
  }

  /**
   * Merge owner and visitor libraries, marking each entry's source
   * If insertAtTop is provided, insert new entry at the top of the list
   */
  private mergeLibraries(insertAtTop?: string): void {
    // Apply cached durations to owner entries
    const ownerEntries: ExtendedEntry[] = this.ownerLibrary.map((entry) => {
      const cachedDuration = this.getCachedDuration(entry.youtubeId);
      return {
        ...entry,
        isOwnerEntry: true,
        duration:
          entry.duration ||
          (cachedDuration ? String(cachedDuration) : undefined),
      };
    });

    const visitorEntries: ExtendedEntry[] = this.visitorLibrary.map(
      (entry) => ({
        ...entry,
        isOwnerEntry: false,
      }),
    );

    let combinedEntries: ExtendedEntry[];

    // If we have an entry ID to insert at top
    if (insertAtTop) {
      // First get all entries in their default order
      const allEntries = [...visitorEntries, ...ownerEntries];
      console.log(
        `[mergeLibraries] Total entries before insertion: ${allEntries.length}`,
      );
      console.log(
        `[mergeLibraries] Owner entries: ${ownerEntries.length}, Visitor entries: ${visitorEntries.length}`,
      );

      // Find the new entry
      const newEntry = allEntries.find((e) => e.id === insertAtTop);
      console.log(
        `[mergeLibraries] Found new entry:`,
        newEntry ? `yes (id: ${newEntry.id})` : "NO",
      );

      if (newEntry) {
        // Remove the new entry from the list
        const allOtherEntries = allEntries.filter((e) => e.id !== insertAtTop);
        console.log(
          `[mergeLibraries] Other entries after removing new: ${allOtherEntries.length}`,
        );

        // Insert at the top (index 0)
        console.log(`[mergeLibraries] Inserting at top (index 0)`);

        combinedEntries = [newEntry, ...allOtherEntries];

        console.log(
          `[mergeLibraries] Combined entries after insertion: ${combinedEntries.length}`,
        );
        console.log(
          `[mergeLibraries] New entry is now at index: ${combinedEntries.findIndex((e) => e.id === insertAtTop)}`,
        );
      } else {
        // Fallback if entry not found
        combinedEntries = [...visitorEntries, ...ownerEntries];
      }
    } else {
      // Default behavior: combine both, visitor entries first
      combinedEntries = [...visitorEntries, ...ownerEntries];
    }

    // If filter is active, show only visitor entries
    if (this.showVisitorOnly) {
      this.library = combinedEntries.filter((e) => !e.isOwnerEntry);
    } else {
      this.library = combinedEntries;
    }

    // Apply search filter if active
    if (this.searchQuery.trim()) {
      const lowerQuery = this.searchQuery.toLowerCase();
      // Remove hyphens and spaces from query for flexible matching
      const normalizedQuery = lowerQuery.replace(/[\s\-]/g, "");

      this.library = this.library.filter((entry) => {
        const artist = (entry.artistName || "").toLowerCase();
        const song = (entry.songName || "").toLowerCase();
        const genre = (entry.genre || "").toLowerCase();
        const note = (entry.note || "").toLowerCase();

        // Direct match with original query
        const directMatch =
          artist.includes(lowerQuery) ||
          song.includes(lowerQuery) ||
          genre.includes(lowerQuery) ||
          note.includes(lowerQuery);

        // Flexible match by removing hyphens and spaces
        const normalizedArtist = artist.replace(/[\s\-]/g, "");
        const normalizedSong = song.replace(/[\s\-]/g, "");
        const normalizedGenre = genre.replace(/[\s\-]/g, "");
        const normalizedNote = note.replace(/[\s\-]/g, "");

        const flexibleMatch =
          normalizedArtist.includes(normalizedQuery) ||
          normalizedSong.includes(normalizedQuery) ||
          normalizedGenre.includes(normalizedQuery) ||
          normalizedNote.includes(normalizedQuery);

        return directMatch || flexibleMatch;
      });
    }

    // Apply custom ordering if any entries have been reordered
    // Sort by timestamp in descending order (most recent first)
    if (this.customOrder.size > 0) {
      this.library.sort((a, b) => {
        const orderA = this.customOrder.get(a.id) ?? -Infinity;
        const orderB = this.customOrder.get(b.id) ?? -Infinity;
        return orderB - orderA; // Reverse order: newest first
      });
    }
  }

  /**
   * Render the viewer UI
   */
  private render(container: HTMLElement): void {
    container.innerHTML = `
      <div class="vinyl-viewer-widget">
        <style>
          .vinyl-viewer-widget {
            padding: 0;
            background: transparent;
            border: none;
            min-height: auto;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            pointer-events: auto;
            width: fit-content;
            margin-left: auto;
            --card-scale: var(--vinyl-widget-scale, 1);
            --card-width: calc(430px * var(--card-scale));
            --cover-size: calc(250px * var(--card-scale));
            --card-gap: calc(0.75rem * var(--card-scale));
            --font-scale: var(--card-scale);
          }

          .vinyl-viewer-widget h3 {
            display: none;
          }

          .vinyl-viewer-widget .library-grid {
            display: flex;
            flex-direction: column;
            gap: 0;
            height: 100%;
            overflow-y: scroll;
            overflow-x: hidden;
            scrollbar-width: none;
            position: relative;
            z-index: 1;
          }

          .vinyl-viewer-widget .library-grid::-webkit-scrollbar {
            display: none;
          }

          .vinyl-viewer-widget .album-card {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 0;
            background: transparent;
            border-radius: 2px;
            overflow: visible;
            border: none;
            cursor: default;
            width: var(--card-width, 430px);
            flex-shrink: 0;
            margin-bottom: var(--card-gap, 0.75rem);
            content-visibility: auto;
            contain-intrinsic-size: var(--card-width, 430px) calc(var(--cover-size, 250px) + 42px);
            transition: width 0.4s ease;
          }

          .vinyl-viewer-widget .album-main {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 0;
            width: 100%;
          }

          .vinyl-viewer-widget .album-card.swapping-out {
            transition: opacity 0.2s ease-out;
            position: fixed;
            z-index: 999;
            opacity: 0;
          }

          .focus-card-container {
            position: fixed;
            top: 20px;
            pointer-events: none;
            z-index: 10000;
          }

          .focus-card-cover-container {
            left: calc(52.5% - 350px);
            width: 250px;
          }

          .focus-card-info-container {
            left: calc(52.5% - 350px + 250px + 1rem);
            width: min(
              var(--vinyl-focus-info-max-width, calc(850px - 250px - 1rem)),
              calc(600px - 250px - 1rem)
            );
            max-width: min(
              var(--vinyl-focus-info-max-width, calc(850px - 250px - 1rem)),
              calc(600px - 250px - 1rem)
            );
            min-width: 0;
          }


          .focus-card-cover,
          .focus-card-info {
            pointer-events: auto;
            position: relative;
          }

          .focus-card-info {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            min-height: 250px;
            padding-bottom: 1.5rem;
          }

          .focus-card-info-container .hide-focus-btn {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 10001;
          }

          .focus-card-info-container:hover .hide-focus-btn {
            opacity: 1;
          }

          .focus-card-cover-container .album-cover-wrapper {
            position: relative;
            width: 250px;
            height: 250px;
            flex-shrink: 0;
            border-radius: 2px;
            overflow: visible;
            z-index: 20000;
          }

          .focus-card-cover-container .album-cover-wrapper::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: -50px;
            bottom: 0;
            z-index: -1;
          }

          .focus-card-info-container .album-info-container {
            position: relative;
            flex: 1;
            display: flex;
            flex-direction: row;
            gap: 1rem;
            align-items: center;
            min-height: 250px;
            z-index: 10000;
          }

          .focus-card-info-container .album-info-container .album-info {
            transition: transform 0.3s ease;
          }

          .focus-card-info-container.cover-hovered .album-info-container:not(.shift-disabled) .album-info {
            transform: translateX(50px);
          }

          .focus-card-info-container.cover-clicked .album-info-container .album-info {
            transform: none;
          }

          .focus-card-info-container .album-info-container.shift-disabled .album-info {
            transform: none !important;
          }

          .focus-card-cover-container .album-cover {
            width: 100%;
            height: 100%;
            object-fit: cover;
            background: #222;
            border: none;
            display: block;
            position: relative;
            z-index: 20001;
          }

          .focus-card-cover-container .plastic-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            pointer-events: none;
            mix-blend-mode: ${PLASTIC_OVERLAY_BLEND_MODE};
            border-radius: 2px;
            z-index: 20002;
            transition: transform 0.3s ease, opacity 0.3s ease;
          }

          .focus-card-info-container .album-info {
            padding: 0;
            display: flex;
            flex-direction: column;
            background: transparent;
            justify-content: center;
            min-width: 0;
            width: auto;
            flex: 0 0 150px;
            max-width: 160px;
            overflow: visible;
            position: relative;
            height: 100%;
            padding-bottom: 1.25rem;
            min-height: 250px;
          }

          .focus-card-info-container .album-artist,
          .focus-card-info-container .album-song {
            white-space: nowrap;
            overflow: visible;
            width: auto;
            position: relative;
          }

          .focus-card-info-container .album-artist {
            font-size: 0.7rem;
            color: #000;
            margin-bottom: 0.15rem;
            line-height: 1.1;
            font-weight: normal;
          }

          .focus-card-info-container .album-song {
            font-weight: 500;
            font-size: 0.8rem;
            color: #000;
            line-height: 1.1;
          }

          .focus-card-info-container .album-year {
            font-size: 0.65rem;
            color: #888;
            margin-top: 0.15rem;
            line-height: 1.1;
          }

          .focus-card-info-container .album-aspect-ratio {
            font-size: 0.65rem;
            color: #666;
            margin-top: 0.35rem;
            line-height: 1.1;
            display: none;
          }

          .focus-card-info-container .album-aspect-ratio.editing-enabled {
            padding: 2px 4px;
          }

          .vinyl-edit-mode .focus-card-info-container .album-aspect-ratio {
            display: block;
          }

          .focus-card-cover-container .owner-badge {
            position: absolute;
            top: 0.5rem;
            left: 0.5rem;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 0.2rem 0.5rem;
            font-size: 0.65rem;
            border-radius: 2px;
            z-index: 9;
            text-transform: lowercase;
            letter-spacing: 0.5px;
            opacity: 0;
            transition: opacity 0.2s;
          }

          .focus-card-cover-container:hover .owner-badge {
            opacity: 1;
          }

          .focus-card-cover-container .delete-btn {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background: rgba(220, 38, 38, 0.9);
            color: #fff;
            border: none;
            border-radius: 2px;
            padding: 0.3rem 0.6rem;
            font-size: 0.7rem;
            cursor: pointer;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            z-index: 10;
          }

          .vinyl-viewer-widget.edit-mode
            .focus-card-cover-container
            .delete-btn {
            opacity: 1 !important;
            pointer-events: auto !important;
          }

          .focus-card-cover-container .delete-btn:hover {
            background: rgba(153, 27, 27, 0.9);
          }

          .vinyl-viewer-widget .album-card.focused .album-main,
          .focus-card-cover-container .album-cover-container {
            position: relative;
            flex-shrink: 0;
            z-index: 1;
          }

          .focus-card-cover-container .album-cover-container {
            width: 100%;
          }

          .focus-card-info-container .album-note-right {
            flex-shrink: 0;
            max-width: 200px;
            margin-left: auto;
            word-wrap: break-word;
            overflow-wrap: break-word;
            overflow: hidden;
          }

          body.song-comments-hidden .focus-card-info-container .album-note-right {
            display: none;
          }

          .vinyl-viewer-widget .album-metadata {
            display: none;
          }

          .vinyl-viewer-widget .album-card.focused .album-metadata,
          .focus-card-info-container .album-metadata {
            display: block;
            padding: 0;
            font-size: 0.75rem;
            color: #555;
            line-height: 1.4;
            flex: 1;
            max-width: 200px;
          }

          .vinyl-viewer-widget .album-card.focused .album-metadata div,
          .focus-card-info-container .album-metadata div {
            margin-bottom: 0.3rem;
          }

          .focus-card-info-container .apply-changes-btn {
            position: absolute;
            bottom: 0.5rem;
            right: 0.5rem;
            padding: 0;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 0.75rem;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
            z-index: 10001;
          }

          .focus-card-info-container .apply-changes-btn.visible {
            opacity: 1;
            pointer-events: auto;
          }

          .vinyl-viewer-widget .album-card.focused .album-metadata strong,
          .focus-card-info-container .album-metadata strong {
            color: #000;
            font-weight: 600;
          }

          .vinyl-viewer-widget .album-genre {
            display: none;
          }

          .vinyl-viewer-widget .album-card.focused .album-genre {
            display: block;
            position: absolute;
            bottom: 0.5rem;
            left: 0.5rem;
            font-size: 0.7rem;
            color: #666;
            font-style: italic;
            max-width: 280px;
            z-index: 5;
            background: rgba(255, 255, 255, 0.9);
            padding: 0.2rem 0.4rem;
            border-radius: 2px;
          }

          .focus-card-info-container .album-genre {
            display: block;
            font-size: 0.65rem;
            color: #888;
            margin-top: 0.5rem;
            line-height: 1.1;
            font-style: italic;
            white-space: nowrap;
            overflow: visible;
            width: auto;
          }

          .focus-card-info-container .editable-field {
            outline: none;
            transition: background-color 0.2s, border 0.2s;
          }

          .focus-card-info-container .editable-field.editing-enabled {
            background-color: rgba(255, 255, 200, 0.3);
            border: 1px dashed #ccc;
            padding: 2px 4px;
            border-radius: 2px;
            cursor: text;
          }

          .focus-card-info-container .editable-field.editing-enabled:hover {
            background-color: rgba(255, 255, 200, 0.5);
          }

          .focus-card-info-container .editable-field.editing-enabled:focus {
            background-color: rgba(255, 255, 200, 0.6);
            border-color: #999;
          }

          .focus-card-info-container .empty-field {
            color: #999;
            font-style: italic;
            display: none;
          }

          .focus-card-info-container .empty-field.editing-enabled {
            display: block;
          }

          .focus-card-info-container .album-duration {
            position: absolute;
            bottom: 28px;
            left: 0;
            color: #888;
            font-size: 0.7rem;
            line-height: 1.1;
            opacity: 0;
            animation: fade-in-duration 0.5s ease-out 0.2s forwards;
          }

          .focus-card-info-container .album-note-right {
            margin-left: -5px;
          }



          @keyframes fade-in-focus {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes fade-in-duration {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          .vinyl-viewer-widget .album-card.focused:hover {
            transform: translateX(-50%);
          }

          .vinyl-viewer-widget .album-card:hover {
            transform: none;
            filter: none;
          }

          .vinyl-viewer-widget .album-card:active {
            transform: none;
          }

          .vinyl-viewer-widget .album-cover {
            width: 100%;
            height: 100%;
            object-fit: cover;
            background: #222;
            border: none;
            display: block;
          }

          .vinyl-viewer-widget .album-cover-wrapper {
            position: relative;
            width: var(--cover-size, 250px);
            height: var(--cover-size, 250px);
            flex-shrink: 0;
            border-radius: 2px;
            overflow: visible;
          }

          .vinyl-viewer-widget .plastic-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            pointer-events: none;
            mix-blend-mode: ${PLASTIC_OVERLAY_BLEND_MODE};
            border-radius: 2px;
          }

          .vinyl-viewer-widget .album-info {
            padding: 0 calc(0.5rem * var(--font-scale, 1));
            display: flex;
            flex-direction: column;
            background: transparent;
            justify-content: center;
            min-width: 0;
            width: calc(180px * var(--card-scale, 1));
            flex-shrink: 0;
            overflow: hidden;
          }

          .vinyl-viewer-widget .album-artist,
          .vinyl-viewer-widget .album-song {
            white-space: nowrap;
            overflow: hidden;
            width: 100%;
            position: relative;
            padding-bottom: 2px;
          }

          .vinyl-viewer-widget .album-artist {
            font-size: calc(0.7rem * var(--font-scale, 1));
            color: #000;
            margin-bottom: calc(-0.25rem * var(--font-scale, 1));
            line-height: 1.4;
            font-weight: normal;
          }

          .vinyl-viewer-widget .album-song {
            font-weight: 500;
            font-size: calc(0.8rem * var(--font-scale, 1));
            color: #000;
            line-height: 1.4;
          }

          .vinyl-viewer-widget .album-year {
            font-size: calc(0.65rem * var(--font-scale, 1));
            color: #888;
            margin-top: 0rem;
            line-height: 1.1;
          }

          /* Scrolling text animation on hover - only for overflowing text */
          @keyframes scroll-text {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-100%);
            }
          }

          .vinyl-viewer-widget .album-artist,
          .vinyl-viewer-widget .album-song {
            white-space: nowrap;
            overflow: hidden;
            width: 100%;
            position: relative;
          }

          /* Inner spans hold the scrolling content */
          .vinyl-viewer-widget .album-artist-text,
          .vinyl-viewer-widget .album-song-text {
            display: inline-block;
            padding-right: 3rem;
            will-change: transform;
          }

          /* Default state: no animation, text at start with transition - SONG ONLY */
          .vinyl-viewer-widget .album-song.overflowing .album-song-text,
          .vinyl-viewer-widget
            .album-song.overflowing
            .album-song-text[aria-hidden="true"] {
            animation: none;
            transform: translateX(0);
            transition: transform 0.3s ease-out;
          }

          /* Only run marquee when the card is hovered and text overflows - SONG ONLY */
          .vinyl-viewer-widget .album-card:hover .album-song.overflowing .album-song-text,
          .vinyl-viewer-widget
            .album-card:hover
            .album-song.overflowing
            .album-song-text[aria-hidden="true"] {
            animation: scroll-text 12s linear infinite;
            transition: none;
          }


          /* Smooth collapse so rows below "scroll up" into the gap */
          @keyframes fade-out-collapse {
            0% {
              opacity: 1;
              max-height: 250px;      /* approximate card height */
              margin: 0;
              padding: 0.5rem 0;
            }
            99% {
              opacity: 0;
              max-height: 0;
              margin: 0;
              padding: 0;
            }
            100% {
              opacity: 0;
              max-height: 0;
              margin: 0;
              padding: 0;
              display: none;
            }
          }

          .vinyl-viewer-widget .album-card.deleting {
            animation: fade-out-collapse 800ms ease-in-out forwards !important;
            overflow: hidden;
            pointer-events: none;
          }


          /* Insertion animation for new albums */
          /* Simple fade in and expand */
          @keyframes slide-in-expand {
            0% {
              opacity: 0;
              max-height: 0;
            }
            100% {
              opacity: 1;
              max-height: 280px;      /* Final card height */
            }
          }

          .vinyl-viewer-widget .album-card.inserting {
            animation: slide-in-expand 1500ms ease-out forwards !important;
            overflow: hidden !important;
            z-index: 10;
            position: relative;
          }

          /* Optional: stagger text fade-in so you see the "empty space" then content */
          .vinyl-viewer-widget .album-card.inserting .album-info {
            animation: fade-in-text 1000ms ease-out 1000ms forwards !important;
            opacity: 0;
          }

          @keyframes fade-in-text {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }

          .vinyl-viewer-widget .empty-state {
            display: none;
          }

          .vinyl-viewer-widget .album-count {
            display: none;
          }

          .vinyl-viewer-widget .album-card {
            position: relative;
          }

          .vinyl-viewer-widget .delete-btn {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background: rgba(220, 38, 38, 0.9);
            color: #fff;
            border: none;
            border-radius: 2px;
            padding: 0.3rem 0.6rem;
            font-size: 0.7rem;
            cursor: pointer;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            z-index: 10;
          }

          .vinyl-viewer-widget.edit-mode .delete-btn {
            opacity: 1 !important;
            pointer-events: auto !important;
          }

          .vinyl-viewer-widget .delete-btn:hover {
            background: rgba(153, 27, 27, 0.9);
          }

          .vinyl-viewer-widget .filter-controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: calc(1rem * var(--font-scale, 1));
            gap: 0;
            position: sticky;
            top: 0;
            background: transparent;
            z-index: 100;
            padding: calc(0.5rem * var(--font-scale, 1)) 0;
            width: var(--card-width, 430px);
            max-width: var(--card-width, 430px);
            font-size: calc(0.85rem * var(--font-scale, 1));
            transition: width 0.35s ease, max-width 0.35s ease,
              flex-direction 0.35s ease, gap 0.35s ease;
          }

          /* Hide album text when focus card is compact (left) */
          body.focus-card-compact .vinyl-viewer-widget .album-info {
            display: none !important;
          }

          body.focus-card-compact .vinyl-viewer-widget .album-metadata {
            display: none !important;
          }

          body.focus-card-compact .vinyl-viewer-widget .album-card {
            width: var(--cover-size, 250px) !important;
          }

          body.focus-card-compact .vinyl-viewer-widget .filter-controls {
            width: var(--cover-size, 250px) !important;
            max-width: var(--cover-size, 250px) !important;
            flex-direction: column;
            align-items: stretch;
            gap: calc(0.4rem * var(--font-scale, 1));
          }

          body.focus-card-compact .vinyl-viewer-widget .filter-buttons {
            gap: calc(0.3rem * var(--font-scale, 1)) !important;
            width: 100%;
            justify-content: flex-start;
            flex-wrap: wrap;
          }

          body.focus-card-compact .vinyl-viewer-widget .search-container {
            width: 100%;
          }

          .vinyl-viewer-widget .filter-btn {
            /* Uses centralized .vinyl-hyperlink styles from main.ts */
            display: inline-block;
            vertical-align: baseline;
            line-height: 1.2;
            font-size: calc(0.85rem * var(--font-scale, 1)) !important;
          }

          .vinyl-viewer-widget .filter-btn.active {
            color: var(--vinyl-link-hover-color);
          }

          .vinyl-viewer-widget .sort-container {
            position: relative;
            display: inline-block;
            vertical-align: baseline;
          }

          .vinyl-viewer-widget .sort-container .filter-btn {
            vertical-align: baseline;
            line-height: 1;
          }

          .vinyl-viewer-widget .sort-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            background: #f7f7f2;
            border: 1px solid #ddd;
            margin-top: calc(0.25rem * var(--font-scale, 1));
            min-width: calc(120px * var(--font-scale, 1));
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            z-index: 1000;
            opacity: 0;
            transform: translateY(4px);
            pointer-events: none;
            transition: opacity 0.15s ease, transform 0.15s ease;
          }

          .vinyl-viewer-widget .sort-dropdown.is-open {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
          }

          .vinyl-viewer-widget .sort-option {
            padding: calc(0.5rem * var(--font-scale, 1)) calc(1rem * var(--font-scale, 1));
            cursor: pointer;
            font-size: calc(0.85rem * var(--font-scale, 1));
            transition: background 0.2s;
          }

          .vinyl-viewer-widget .sort-option:hover {
            background: #f5f5f5;
          }

          .vinyl-viewer-widget .search-container {
            display: flex;
            align-items: center;
            gap: 0.3rem;
            flex: 1;
            min-width: 0;
            position: relative;
            top: 1px;
          }

          .vinyl-viewer-widget .search-label {
            font-size: calc(0.85rem * var(--font-scale, 1));
            color: var(--vinyl-link-color);
            text-shadow: var(--vinyl-link-text-shadow);
            -webkit-font-smoothing: none;
            -moz-osx-font-smoothing: grayscale;
            flex-shrink: 0;
          }

          .vinyl-viewer-widget .search-input {
            padding: 0;
            border: none;
            background: transparent;
            font-size: calc(0.85rem * var(--font-scale, 1));
            font-family: inherit;
            flex: 1;
            min-width: calc(60px * var(--font-scale, 1));
            -webkit-font-smoothing: none;
            -moz-osx-font-smoothing: grayscale;
            line-height: 1;
            vertical-align: baseline;
            text-decoration: underline;
            text-underline-offset: 1px;
          }

          .vinyl-viewer-widget .filter-buttons {
            display: flex;
            gap: 0.5rem;
            flex-shrink: 0;
            align-items: baseline;
            transition: gap 0.35s ease, flex-wrap 0.35s ease,
              justify-content 0.35s ease, width 0.35s ease;
          }

          .vinyl-viewer-widget .search-input::placeholder {
            color: transparent;
          }

          .vinyl-viewer-widget .search-input:focus {
            outline: none;
            border-bottom-color: #000;
          }

          .vinyl-viewer-widget .clear-search-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: calc(1rem * var(--font-scale, 1));
            line-height: 1;
            color: #666;
            padding: 0;
            display: none;
          }

          .vinyl-viewer-widget .clear-search-btn.visible {
            display: inline;
          }

          .vinyl-viewer-widget .clear-search-btn:hover {
            color: #000;
          }

          .vinyl-viewer-widget .owner-badge {
            position: absolute;
            top: 0.5rem;
            left: 0.5rem;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 0.2rem 0.5rem;
            font-size: 0.65rem;
            border-radius: 2px;
            z-index: 9;
            text-transform: lowercase;
            letter-spacing: 0.5px;
            opacity: 0;
            transition: opacity 0.2s;
          }

          .vinyl-viewer-widget .album-card:hover .owner-badge {
            opacity: 1;
          }
        </style>

        <div class="filter-controls">
          <div class="search-container">
            <span class="search-label">search:</span>
            <input
              type="text"
              id="vinyl-search-input"
              class="search-input"
            >
            <button id="vinyl-clear-search-btn" class="clear-search-btn">×</button>
          </div>
          <div class="filter-buttons">
            <div class="sort-container">
              <button id="vinyl-sort-btn" class="filter-btn vinyl-hyperlink">sort</button>
              <div id="vinyl-sort-dropdown" class="sort-dropdown">
                <div class="sort-option" data-category="artist">artist</div>
                <div class="sort-option" data-category="genre">genre</div>
                <div class="sort-option" data-category="year">year</div>
              </div>
            </div>
            <button id="vinyl-filter-btn" class="filter-btn vinyl-hyperlink">show personal only</button>
            <button id="vinyl-jump-top-btn" class="filter-btn vinyl-hyperlink">to top</button>
            <button id="vinyl-edit-btn" class="filter-btn vinyl-hyperlink">edit</button>
          </div>
        </div>
        <div class="library-grid" id="vinyl-viewer-grid"></div>
      </div>
    `;

    this.renderGrid();
    this.attachFilterListener();
  }

  /**
   * Render the album grid with smooth circular scrolling
   */
  private renderGrid(): void {
    const gridContainer = document.getElementById("vinyl-viewer-grid");

    if (!gridContainer) {
      console.error("[renderGrid] Grid container not found!");
      return;
    }

    console.log("[renderGrid] Grid container:", gridContainer);
    console.log(
      "[renderGrid] Grid container overflow-y:",
      window.getComputedStyle(gridContainer).overflowY,
    );
    console.log(
      "[renderGrid] Grid container height:",
      window.getComputedStyle(gridContainer).height,
    );
    console.log(
      "[renderGrid] Grid container scrollHeight:",
      gridContainer.scrollHeight,
    );

    if (this.library.length === 0) {
      gridContainer.innerHTML = "";
      return;
    }

    this.scrollContainer = gridContainer;

    // Initial render
    this.updateVisibleItems();
    this.attachCardListeners();

    // Add scroll position capping to prevent over-scroll lag
    const scrollingContainer = document.getElementById("vinyl-library-viewer");
    if (scrollingContainer) {
      scrollingContainer.addEventListener(
        "scroll",
        () => {
          if (scrollingContainer.scrollTop < 0) {
            scrollingContainer.scrollTop = 0;
          }
        },
        { passive: false },
      );
    }
  }

  /**
   * Update visible items rendering
   */
  private updateVisibleItems(): void {
    if (!this.scrollContainer || this.library.length === 0) return;

    let itemsHtml = "";

    // Render all library items
    this.library.forEach((entry, index) => {
      const isOwner = entry.isOwnerEntry || false;
      const canDelete = !isOwner || this.config.isAdmin;
      const artistName = entry.artistName || "Unknown Artist";
      const songName = entry.songName || entry.note || "Unknown Song";
      const plasticOverlay = generatePlasticOverlay(entry.id);

      const genre = entry.genre || "";
      const releaseYear = entry.releaseYear || "";
      const note = entry.note || "";

      itemsHtml += `
            <div class="album-card" data-entry-id="${entry.id}" data-index="${index}">
              <div class="album-main">
                <div class="album-cover-wrapper">
                  <img
                    src="${this.getImageWithFallback(entry.imageUrl)}"
                    alt="${this.escapeHtml(songName)}"
                    class="album-cover"
                    loading="lazy"
                    decoding="async"
                  >
                  ${plasticOverlay}
                  ${genre ? `<div class="album-genre">${this.escapeHtml(genre)}</div>` : ""}
                </div>
                ${isOwner ? '<div class="owner-badge"> jonny\'s pick</div>' : ""}
                ${canDelete ? `<button class="delete-btn" data-entry-id="${entry.id}" data-is-owner="${isOwner}" title="Delete from collection">×</button>` : ""}
                <div class="album-info">
                  <div class="album-artist">
                    <span class="album-artist-text">${this.escapeHtml(artistName)}</span>
                  </div>
                  <div class="album-song">
                    <span class="album-song-text">${this.escapeHtml(songName)}</span>
                  </div>
                  ${releaseYear ? `<div class="album-year" style="margin-left:0.5px;">${this.escapeHtml(releaseYear)}</div>` : ""}
                </div>
                <div class="album-metadata">
                  ${note ? `<div>${this.escapeHtml(note)}</div>` : ""}
                </div>
              </div>
            </div>
          `;
    });

    // Only update if content actually changed to avoid unnecessary re-renders
    const currentHTML = this.scrollContainer.innerHTML;
    if (currentHTML !== itemsHtml) {
      this.scrollContainer.innerHTML = itemsHtml;
    }

    // Check for text overflow and mark overflowing elements
    this.markOverflowingText(this.scrollContainer);
    // Re-check overflow on hover (handles late-loaded assets/fonts)
    this.scrollContainer.querySelectorAll(".album-card").forEach((card) => {
      card.addEventListener("mouseenter", () => {
        this.markOverflowingText(card);
      });
    });
  }

  /**
   * Mark text elements that overflow their container and add duplicate for scrolling
   * Only applies to song titles, not artist names
   */
  private markOverflowingText(root: ParentNode = document): void {
    // Only check song elements, not artist elements
    const songElements = root.querySelectorAll(
      ".vinyl-viewer-widget .album-song",
    );

    songElements.forEach((element) => {
      const el = element as HTMLElement;
      const textSpan = el.querySelector(".album-song-text") as HTMLElement;

      if (!textSpan) return;

      // Add a threshold to prevent slight overflows from triggering scrolling
      // Only mark as overflowing if text is at least 10px wider than container
      const overflowThreshold = 20;
      const isOverflowing = el.scrollWidth > el.clientWidth + overflowThreshold;

      if (isOverflowing) {
        el.classList.add("overflowing");

        // Add duplicate text for seamless scrolling if not already present
        if (el.childElementCount === 1) {
          const duplicate = textSpan.cloneNode(true) as HTMLElement;
          duplicate.setAttribute("aria-hidden", "true");
          el.appendChild(duplicate);
        }
      } else {
        el.classList.remove("overflowing");

        // Remove duplicate if present
        if (el.childElementCount > 1) {
          const duplicate = el.children[1];
          duplicate.remove();
        }
      }
    });
  }

  /**
   * Show the currently focused card (public method for show focus button)
   */
  public showFocusCard(): void {
    if (!this.focusedEntryId) return;

    const entry = this.library.find((e) => e.id === this.focusedEntryId);
    if (entry) {
      const fadeDelayMs = 150;
      const fadeDurationMs = 400;
      this.renderFocusCard(entry);
      this.showFocusCardUI(fadeDelayMs);
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("focus-visibility-change", {
            detail: { visible: true },
          }),
        );
      }, fadeDelayMs + fadeDurationMs);
    }
  }

  /**
   * Fade in the focus card UI containers (called during camera animation)
   * @param delayMs - Delay in milliseconds before showing the card (0 = immediate, 150ms = early during animation)
   */
  public showFocusCardUI(delayMs: number = 150): void {
    const focusCoverContainer = document.getElementById(
      "vinyl-focus-card-cover-root",
    );
    const focusInfoContainer = document.getElementById(
      "vinyl-focus-card-info-root",
    );
    if (!focusCoverContainer || !focusInfoContainer) return;

    const containers = [focusCoverContainer, focusInfoContainer];

    setTimeout(() => {
      requestAnimationFrame(() => {
        containers.forEach((container) => {
          // Force reflow
          void container.offsetHeight;
          // Now enable transition and fade to opacity 1
          container.style.transition = "opacity 0.4s ease-out";
          container.style.opacity = "1";
        });
      });
    }, delayMs);
  }

  /**
   * Show the focus card immediately without fade-in
   */
  public showFocusCardUIImmediate(): void {
    const focusCoverContainer = document.getElementById(
      "vinyl-focus-card-cover-root",
    );
    const focusInfoContainer = document.getElementById(
      "vinyl-focus-card-info-root",
    );
    if (!focusCoverContainer || !focusInfoContainer) return;

    const containers = [focusCoverContainer, focusInfoContainer];
    containers.forEach((container) => {
      container.style.transition = "none";
      container.style.opacity = "1";
    });
  }

  /**
   * Render the focus card in the dedicated container
   */
  public renderFocusCard(entry: ExtendedEntry): void {
    if (this.focusCardCleanup) {
      this.focusCardCleanup();
      this.focusCardCleanup = null;
    }

    const focusCoverContainer = document.getElementById(
      "vinyl-focus-card-cover-root",
    );
    const focusInfoContainer = document.getElementById(
      "vinyl-focus-card-info-root",
    );
    if (!focusCoverContainer || !focusInfoContainer) return;

    // Note: Camera position change is now handled in main.ts after vinyl callback is registered
    // This ensures the callback fires even if camera is already at target position

    // Hide the "show focus" button since we're showing the focus card
    const showFocusBtn = document.getElementById("vinyl-show-focus-btn");
    if (showFocusBtn) {
      showFocusBtn.style.display = "none";
    }

    const isOwner = entry.isOwnerEntry || false;
    const canDelete = !isOwner || this.config.isAdmin;
    const canEdit = canDelete; // Same permission as delete
    const artistName = entry.artistName || "Unknown Artist";
    const songName = entry.songName || entry.note || "Unknown Song";
    const plasticOverlay = generatePlasticOverlay(entry.id);

    const genre = entry.genre || "";
    const releaseYear = entry.releaseYear || "";
    const note = entry.note || "";
    const aspectRatio =
      entry.aspectRatio !== undefined ? String(entry.aspectRatio) : "";

    const containers = [focusCoverContainer, focusInfoContainer];
    // Set initial opacity to 0 without transition
    containers.forEach((container) => {
      container.style.transition = "none";
      container.style.opacity = "0";
    });

    const coverHtml = `
      <div class="focus-card-cover" data-entry-id="${entry.id}">
        <div class="album-cover-container">
          <div class="album-cover-wrapper">
            <img
              src="${this.getImageWithFallback(entry.imageUrl)}"
              alt="${this.escapeHtml(songName)}"
              class="album-cover"
            >
            ${plasticOverlay}
          </div>
          ${isOwner ? '<div class="owner-badge">Owner</div>' : ""}
          ${
            canDelete
              ? `<button class="delete-btn" data-entry-id="${entry.id}" data-is-owner="${isOwner}" title="Delete from collection">×</button>`
              : ""
          }
        </div>
      </div>
    `;

    const noteMarkup = note
      ? `<div class="album-metadata album-note-right">
            <div class="${canEdit ? "editable-field" : ""}" ${canEdit ? 'contenteditable="false"' : ""} data-field="note">${this.escapeHtml(note)}</div>
          </div>`
      : canEdit
        ? `<div class="album-metadata album-note-right">
            <div class="editable-field empty-field" contenteditable="false" data-field="note">Add note</div>
          </div>`
        : "";

    const durationMarkup = entry.duration
      ? `<div class="album-duration">${this.formatDuration(entry.duration)}</div>`
      : "";

    const infoHtml = `
      <div class="focus-card-info" data-entry-id="${entry.id}">
        <button class="hide-focus-btn vinyl-hyperlink">hide focus</button>
        <div class="album-info-container">
          <div class="album-info">
            <div class="album-artist">
              <span class="album-artist-text ${canEdit ? "editable-field" : ""}" ${canEdit ? 'contenteditable="false"' : ""} data-field="artistName">${this.escapeHtml(artistName)}</span>
            </div>
            <div class="album-song">
              <span class="album-song-text ${canEdit ? "editable-field" : ""}" ${canEdit ? 'contenteditable="false"' : ""} data-field="songName">${this.escapeHtml(songName)}</span>
            </div>
            ${
              releaseYear
                ? `<div class="album-year ${canEdit ? "editable-field" : ""}" ${canEdit ? 'contenteditable="false"' : ""} data-field="releaseYear" style="margin-left:0.5px;">${this.escapeHtml(releaseYear)}</div>`
                : canEdit
                  ? `<div class="album-year editable-field empty-field" contenteditable="false" data-field="releaseYear" style="margin-left:0.5px;">Add year</div>`
                  : ""
            }
            ${
              genre
                ? `<div class="album-genre ${canEdit ? "editable-field" : ""}" ${canEdit ? 'contenteditable="false"' : ""} data-field="genre">${this.escapeHtml(genre)}</div>`
                : canEdit
                  ? `<div class="album-genre editable-field empty-field" contenteditable="false" data-field="genre">Add genre</div>`
                  : ""
            }
            ${
              canEdit
                ? aspectRatio
                  ? `<div class="album-aspect-ratio editable-field" contenteditable="false" data-field="aspectRatio" style="margin-left:0.5px;">aspect ratio: ${this.escapeHtml(aspectRatio)}</div>`
                  : `<div class="album-aspect-ratio editable-field empty-field" contenteditable="false" data-field="aspectRatio" style="margin-left:0.5px;">Add aspect ratio</div>`
                : ""
            }
          </div>
          ${noteMarkup}
        </div>
        ${durationMarkup}
        ${
          canEdit
            ? `<button class="apply-changes-btn vinyl-hyperlink">apply changes</button>`
            : ""
        }
      </div>
    `;

    focusCoverContainer.innerHTML = coverHtml;
    focusInfoContainer.innerHTML = infoHtml;
    this.focusedEntryVideoId = entry.youtubeId || null;
    this.applyFocusCardTurntableState();

    // Store the entry ID for use in click handler to check if it matches turntable vinyl
    const focusedEntryVideoId = this.focusedEntryVideoId;

    // Don't dispatch visibility change immediately - let the camera animation complete first
    // The vinyl will be made visible by the camera animation callback in main.ts
    // This prevents the vinyl from flashing during the focus card fade-in

    const plasticOverlayElement = focusCoverContainer.querySelector(
      ".plastic-overlay",
    ) as HTMLElement | null;
    const plasticOverlayBaseTransform =
      plasticOverlayElement?.style.transform || "";
    const plasticOverlayBaseOpacity = plasticOverlayElement
      ? plasticOverlayElement.style.opacity ||
        window.getComputedStyle(plasticOverlayElement).opacity ||
        "1"
      : "1";
    const setPlasticOverlayShift = (shift: number) => {
      if (!plasticOverlayElement) return;
      if (
        !plasticOverlayElement.style.transition ||
        !plasticOverlayElement.style.transition.includes("transform")
      ) {
        plasticOverlayElement.style.transition =
          "transform 0.3s ease, opacity 0.3s ease";
      }
      const base = plasticOverlayBaseTransform.trim();
      const shiftTransform = shift !== 0 ? `translateX(${shift}px)` : "";
      const separator = shiftTransform && base ? " " : "";
      plasticOverlayElement.style.transform = `${shiftTransform}${separator}${base}`;
    };

    let isCoverHoverActive = false;
    let isCoverClickActive = false;
    let coverClickTimeoutId: number | null = null;
    let plasticOverlayFadeTimeout: number | null = null;
    let isPlasticLocked = false;
    const updatePlasticOverlayState = () => {
      const shift = isPlasticLocked ? -250 : isCoverHoverActive ? -50 : 0;
      setPlasticOverlayShift(shift);
      if (plasticOverlayFadeTimeout !== null) {
        window.clearTimeout(plasticOverlayFadeTimeout);
        plasticOverlayFadeTimeout = null;
      }
      if (plasticOverlayElement) {
        const targetOpacity =
          isPlasticLocked || isCoverClickActive
            ? "0"
            : plasticOverlayBaseOpacity || "1";
        if (isCoverClickActive || isPlasticLocked) {
          plasticOverlayFadeTimeout = window.setTimeout(() => {
            if (plasticOverlayElement) {
              plasticOverlayElement.style.opacity = targetOpacity;
            }
            plasticOverlayFadeTimeout = null;
          }, 350);
        } else {
          plasticOverlayElement.style.opacity = targetOpacity;
        }
      }
    };

    const dispatchCoverHoverEvent = (hovered: boolean) => {
      window.dispatchEvent(
        new CustomEvent("focus-cover-hover", { detail: { hovered } }),
      );
    };

    const dispatchCoverClickEvent = (active: boolean) => {
      window.dispatchEvent(
        new CustomEvent("focus-cover-click", { detail: { active } }),
      );
    };

    updatePlasticOverlayState();
    dispatchCoverHoverEvent(false);
    dispatchCoverClickEvent(false);

    // Keep containers at opacity 0 for now - they will be shown after camera animation completes
    // by calling showFocusCardUI()

    // Attach delete button listener if present
    const deleteBtn = focusCoverContainer.querySelector(".delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const entryId = (deleteBtn as HTMLElement).getAttribute(
          "data-entry-id",
        );
        const isOwner =
          (deleteBtn as HTMLElement).getAttribute("data-is-owner") === "true";
        if (entryId) {
          this.handleDelete(entryId, isOwner);
        }
      });
    }

    // Attach album cover hover listener to shift vinyl (using wrapper for extended hitbox)
    const albumCoverWrapper = focusCoverContainer.querySelector(
      ".album-cover-wrapper",
    ) as HTMLElement | null;
    if (albumCoverWrapper) {
      const toggleCoverHover = (isHovered: boolean) => {
        // Don't allow hover effects if this vinyl is currently playing on turntable
        const isFocusVinylOnTurntable =
          this.isVinylOnTurntable &&
          !!this.focusedEntryVideoId &&
          !!this.turntableVideoId &&
          this.focusedEntryVideoId === this.turntableVideoId;

        if (
          isCoverClickActive ||
          isCoverHoverActive === isHovered ||
          isFocusVinylOnTurntable
        ) {
          return;
        }
        isCoverHoverActive = isHovered;
        focusInfoContainer.classList.toggle("cover-hovered", isHovered);
        focusCoverContainer.classList.toggle("cover-hovered", isHovered);
        updatePlasticOverlayState();
        dispatchCoverHoverEvent(isHovered);
      };

      const setCoverClickState = (active: boolean, emitEvent = true) => {
        if (isCoverClickActive === active) {
          return;
        }
        if (active && isCoverHoverActive) {
          isCoverHoverActive = false;
          focusInfoContainer.classList.remove("cover-hovered");
          focusCoverContainer.classList.remove("cover-hovered");
          dispatchCoverHoverEvent(false);
        }
        if (active) {
          isPlasticLocked = true;
        }
        isCoverClickActive = active;
        focusInfoContainer.classList.toggle("cover-clicked", active);
        focusCoverContainer.classList.toggle("cover-clicked", active);
        updatePlasticOverlayState();
        if (emitEvent) {
          dispatchCoverClickEvent(active);
        }

        if (coverClickTimeoutId !== null) {
          window.clearTimeout(coverClickTimeoutId);
          coverClickTimeoutId = null;
        }
        if (active) {
          coverClickTimeoutId = window.setTimeout(() => {
            coverClickTimeoutId = null;
            // Only reset if vinyl is not currently being dragged
            if (!(window as any).VINYL_DRAG_ACTIVE) {
              setCoverClickState(false);
            }
          }, 3000);
        }

        if (!active) {
          if (albumCoverWrapper.matches(":hover")) {
            toggleCoverHover(true);
          } else {
            toggleCoverHover(false);
          }
        }
      };

      const handleCoverClickToggle = () => {
        setCoverClickState(!isCoverClickActive);
      };

      const handleExternalClickReset = () => {
        setCoverClickState(false, false);
      };
      window.addEventListener(
        "focus-cover-click-reset",
        handleExternalClickReset,
      );
      const cleanupHandlers: (() => void)[] = [];
      cleanupHandlers.push(() => {
        window.removeEventListener(
          "focus-cover-click-reset",
          handleExternalClickReset,
        );
      });
      this.focusCardCleanup = () => {
        if (coverClickTimeoutId !== null) {
          window.clearTimeout(coverClickTimeoutId);
          coverClickTimeoutId = null;
        }
        cleanupHandlers.forEach((fn) => fn());
        cleanupHandlers.length = 0;
        this.focusCardCleanup = null;
      };

      albumCoverWrapper.addEventListener("mouseenter", () => {
        toggleCoverHover(true);
      });
      albumCoverWrapper.addEventListener("mouseleave", () => {
        toggleCoverHover(false);
      });
      albumCoverWrapper.addEventListener("click", () => {
        // Check if focus vinyl matches turntable vinyl by comparing video IDs
        const getTurntableVinylState = (window as any).getTurntableVinylState;

        let shouldIgnoreClick = false;
        if (getTurntableVinylState && focusedEntryVideoId) {
          const turntableVinyl = getTurntableVinylState();

          // If turntable has a vinyl and it matches the focus card's video ID, ignore the click
          if (turntableVinyl?.selection?.videoId === focusedEntryVideoId) {
            shouldIgnoreClick = true;
          }
        }

        if (!shouldIgnoreClick) {
          handleCoverClickToggle();
        }
      });

      // Update cursor based on clickability
      const updateCursorState = () => {
        const getTurntableVinylState = (window as any).getTurntableVinylState;
        let isClickable = true;

        if (getTurntableVinylState && focusedEntryVideoId) {
          const turntableVinyl = getTurntableVinylState();
          if (turntableVinyl?.selection?.videoId === focusedEntryVideoId) {
            isClickable = false;
          }
        }

        albumCoverWrapper.style.cursor = isClickable ? "pointer" : "default";
      };

      updateCursorState();
      albumCoverWrapper.addEventListener("mouseenter", updateCursorState);
      albumCoverWrapper.addEventListener("mouseover", updateCursorState);
    }

    // Attach hide focus button listener
    const hideFocusBtn = focusInfoContainer.querySelector(".hide-focus-btn");
    if (hideFocusBtn) {
      hideFocusBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isCoverHoverActive = false;
        isCoverClickActive = false;
        updatePlasticOverlayState();
        dispatchCoverHoverEvent(false);
        dispatchCoverClickEvent(false);
        window.dispatchEvent(
          new CustomEvent("focus-visibility-change", {
            detail: { visible: false },
          }),
        );
        if (this.focusCardCleanup) {
          this.focusCardCleanup();
        }

        // Fade out animation
        containers.forEach((container) => {
          container.style.transition = "opacity 0.15s ease";
          container.style.opacity = "0";
        });

        setTimeout(() => {
          if (this.focusCardCleanup) {
            this.focusCardCleanup();
          }
          focusCoverContainer.innerHTML = "";
          focusInfoContainer.innerHTML = "";
          focusInfoContainer.classList.remove("cover-hovered");
          focusCoverContainer.classList.remove("cover-hovered");
          focusInfoContainer.classList.remove("cover-clicked");
          focusCoverContainer.classList.remove("cover-clicked");
          isPlasticLocked = false;
          if (coverClickTimeoutId !== null) {
            window.clearTimeout(coverClickTimeoutId);
            coverClickTimeoutId = null;
          }
          containers.forEach((container) => {
            container.style.opacity = "1";
          });
          // DON'T clear focusedEntryId - we need it to show the card again

          // Show the "show focus" button
          const showFocusBtn = document.getElementById("vinyl-show-focus-btn");
          if (showFocusBtn) {
            showFocusBtn.style.display = "inline";
          }
        }, 80);
      });
    }

    // Setup editable fields
    if (canEdit) {
      this.setupEditableFields(focusInfoContainer, entry);
    }
  }

  /**
   * Setup editable fields for focus card
   */
  private setupEditableFields(
    container: HTMLElement,
    entry: ExtendedEntry,
  ): void {
    const editableFields = container.querySelectorAll(".editable-field");

    // Get apply button
    const applyBtn = container.querySelector(".apply-changes-btn");

    // Listen for edit mode changes
    const updateEditableState = () => {
      const isEditMode = this.isEditMode;
      editableFields.forEach((field) => {
        (field as HTMLElement).contentEditable = isEditMode ? "true" : "false";
        if (isEditMode) {
          field.classList.add("editing-enabled");
        } else {
          field.classList.remove("editing-enabled");
        }
      });

      // Show/hide apply button based on edit mode
      if (applyBtn) {
        if (isEditMode) {
          applyBtn.classList.add("visible");
        } else {
          applyBtn.classList.remove("visible");
        }
      }
    };

    // Initial state
    updateEditableState();

    // Watch for edit mode changes globally
    const observer = new MutationObserver(() => {
      updateEditableState();
    });
    const widgetContainer = document.querySelector(".vinyl-viewer-widget");
    if (widgetContainer) {
      observer.observe(widgetContainer, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    // Clear placeholder text when field is focused
    editableFields.forEach((field) => {
      field.addEventListener("focus", () => {
        const text = (field as HTMLElement).textContent?.trim() || "";
        // Check if this is a placeholder (starts with "Add ")
        if (text.startsWith("Add ")) {
          (field as HTMLElement).textContent = "";
        }
      });
    });

    // Add apply button handler
    if (applyBtn) {
      applyBtn.addEventListener("click", async () => {
        const updatedEntry = { ...entry };
        let hasChanges = false;

        // Collect all changes from editable fields
        editableFields.forEach((field) => {
          const fieldName = (field as HTMLElement).getAttribute("data-field");
          const newValue = (field as HTMLElement).textContent?.trim() || "";

          if (!fieldName) return;

          // Don't save if it's still placeholder text
          if (newValue.startsWith("Add ")) return;

          // Parse aspect ratio field
          let valueToSave: string | number | undefined = newValue;
          if (fieldName === "aspectRatio") {
            // Extract just the number from "aspect ratio: X" or allow direct number input
            const cleanValue = newValue.replace(/aspect ratio:\s*/i, "").trim();
            if (cleanValue === "") {
              valueToSave = undefined; // Clear the aspect ratio
            } else {
              let parsed: number;
              // Handle formats like "16:9", "4:3", "16/9", "4/3"
              if (cleanValue.includes(":")) {
                const [width, height] = cleanValue
                  .split(":")
                  .map((s) => parseFloat(s.trim()));
                if (!isNaN(width) && !isNaN(height) && height > 0) {
                  parsed = width / height;
                } else {
                  console.warn("Invalid aspect ratio format:", cleanValue);
                  return; // Skip invalid values
                }
              } else if (cleanValue.includes("/")) {
                const [width, height] = cleanValue
                  .split("/")
                  .map((s) => parseFloat(s.trim()));
                if (!isNaN(width) && !isNaN(height) && height > 0) {
                  parsed = width / height;
                } else {
                  console.warn("Invalid aspect ratio format:", cleanValue);
                  return; // Skip invalid values
                }
              } else {
                // Direct decimal number
                parsed = parseFloat(cleanValue);
                if (isNaN(parsed) || parsed <= 0) {
                  console.warn("Invalid aspect ratio value:", cleanValue);
                  return; // Skip invalid values
                }
              }
              valueToSave = parsed;
            }
          }

          // Check if value changed
          if ((updatedEntry as any)[fieldName] !== valueToSave) {
            (updatedEntry as any)[fieldName] = valueToSave;
            hasChanges = true;
            console.log(`Changed ${fieldName} to:`, valueToSave);
          }
        });

        if (!hasChanges) {
          console.log("No changes to apply");
          return;
        }

        // Save to appropriate storage
        if (
          entry.isOwnerEntry &&
          this.config.apiUrl &&
          this.config.adminToken
        ) {
          // Save to backend
          await this.updateOwnerEntry(updatedEntry);
        } else {
          // Save to localStorage
          this.updateVisitorEntry(updatedEntry);
        }

        console.log("✓ Changes applied successfully");

        // Update the entry reference
        Object.assign(entry, updatedEntry);

        // If aspect ratio was changed and this is the focused entry, update the player live
        if (
          hasChanges &&
          updatedEntry.aspectRatio !== undefined &&
          this.focusedEntryId === entry.id
        ) {
          // Dispatch event to update aspect ratio live
          const aspectRatioEvent = new CustomEvent("update-aspect-ratio", {
            detail: { aspectRatio: updatedEntry.aspectRatio },
          });
          window.dispatchEvent(aspectRatioEvent);
        }
      });
    }
  }

  /**
   * Update owner entry in backend
   */
  private async updateOwnerEntry(entry: ExtendedEntry): Promise<void> {
    if (!this.config.apiUrl || !this.config.adminToken) return;

    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/library/${entry.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.adminToken}`,
          },
          body: JSON.stringify(entry),
        },
      );

      if (response.ok) {
        console.log("✓ Entry updated in backend");
        // Refresh owner library
        this.ownerLibrary = await fetchOwnerLibrary(this.config.apiUrl);
        // Recreate blob URLs after fetching from backend
        await this.recreateBlobUrls();
        this.mergeLibraries();
      } else {
        console.error("Failed to update entry:", await response.text());
      }
    } catch (error) {
      console.error("Error updating entry:", error);
    }
  }

  /**
   * Update visitor entry in localStorage
   */
  private updateVisitorEntry(entry: ExtendedEntry): void {
    const library = loadVisitorLibrary();
    const index = library.findIndex((e) => e.id === entry.id);

    if (index !== -1) {
      library[index] = entry;
      localStorage.setItem("visitorLibrary", JSON.stringify(library));
      this.visitorLibrary = library;
      this.mergeLibraries();
      console.log("✓ Entry updated in localStorage");
    }
  }

  /**
   * Attach event listeners to album cards
   */
  private attachCardListeners(): void {
    // Album card click handler - load video and focus card
    const albumCards = document.querySelectorAll(
      ".vinyl-viewer-widget .album-card",
    );
    albumCards.forEach((card) => {
      // Add pointer cursor on hover
      card.addEventListener("mouseenter", () => {
        const albumCoverWrapper = card.querySelector(
          ".album-cover-wrapper",
        ) as HTMLElement;
        if (albumCoverWrapper) {
          albumCoverWrapper.style.cursor = "pointer";
        }
      });

      card.addEventListener("click", (e) => {
        // Only trigger on album cover or its children (not the whole card)
        const target = e.target as HTMLElement;
        const albumCoverWrapper = card.querySelector(
          ".album-cover-wrapper",
        ) as HTMLElement;
        if (!albumCoverWrapper?.contains(target)) {
          return;
        }

        // Get the entry-id for the new card
        const entryId = (card as HTMLElement).getAttribute("data-entry-id");

        // Track the focused entry ID
        this.focusedEntryId = entryId;

        // Update custom order immediately so the list reorders right away
        // But only if NOT in sorted mode - keep sorted order when sorted
        if (entryId && !this.sortState.category) {
          this.customOrder.set(entryId, Date.now());
          this.savePersistedViewerState();
          this.mergeLibraries();
          this.updateVisibleItems();
          this.attachCardListeners();
        }

        const entry = this.library.find((e) => e.id === entryId);
        if (entry) {
          // Render the focus card in the separate container immediately
          this.renderFocusCard(entry);

          window.dispatchEvent(
            new CustomEvent("load-vinyl-song", {
              detail: {
                entryId: entry.id,
                videoId: entry.youtubeId,
                artistName: entry.artistName,
                songName: entry.songName,
                aspectRatio: entry.aspectRatio,
                imageUrl: entry.imageUrl,
                originalImageUrl: entry.originalImageUrl,
                releaseId: entry.releaseId,
              },
            }),
          );
        }
      });
    });

    const deleteButtons = document.querySelectorAll(
      ".vinyl-viewer-widget .delete-btn",
    );
    deleteButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const entryId = (btn as HTMLElement).getAttribute("data-entry-id");
        const isOwner =
          (btn as HTMLElement).getAttribute("data-is-owner") === "true";
        if (entryId) {
          this.handleDelete(entryId, isOwner);
        }
      });
    });
  }

  /**
   * Attach listener to filter button
   */
  private attachFilterListener(): void {
    const filterBtn = document.getElementById("vinyl-filter-btn");
    if (filterBtn) {
      filterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.showVisitorOnly = !this.showVisitorOnly;
        filterBtn.textContent = this.showVisitorOnly
          ? "show whole library"
          : "show personal only";

        // Ensure the active class is properly set
        if (this.showVisitorOnly) {
          filterBtn.classList.add("active");
        } else {
          filterBtn.classList.remove("active");
        }

        this.mergeLibraries();
        this.updateVisibleItems();
        this.attachCardListeners();
      });
    }

    const jumpTopBtn = document.getElementById("vinyl-jump-top-btn");
    if (jumpTopBtn) {
      jumpTopBtn.addEventListener("click", () => {
        const scrollingContainer = document.getElementById(
          "vinyl-library-viewer",
        );
        if (scrollingContainer) {
          scrollingContainer.scrollTo({
            top: 0,
            behavior: "smooth",
          });
        }
      });
    }

    const searchInput = document.getElementById(
      "vinyl-search-input",
    ) as HTMLInputElement;
    const clearSearchBtn = document.getElementById("vinyl-clear-search-btn");

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        this.searchQuery = searchInput.value;
        this.mergeLibraries();
        this.updateVisibleItems();
        this.attachCardListeners();

        // Show/hide clear button
        if (clearSearchBtn) {
          if (this.searchQuery.trim()) {
            clearSearchBtn.classList.add("visible");
          } else {
            clearSearchBtn.classList.remove("visible");
          }
        }
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener("click", () => {
        this.searchQuery = "";
        if (searchInput) {
          searchInput.value = "";
        }
        clearSearchBtn.classList.remove("visible");
        this.mergeLibraries();
        this.updateVisibleItems();
        this.attachCardListeners();
      });
    }

    const sortBtn = document.getElementById("vinyl-sort-btn");
    const sortDropdown = document.getElementById("vinyl-sort-dropdown");

    if (sortBtn && sortDropdown) {
      // Toggle dropdown or cycle sort direction
      sortBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        if (this.sortState.category === null) {
          // No category selected - show dropdown
          sortDropdown.classList.toggle("is-open");
        } else {
          // Category selected - toggle direction or reset
          if (this.sortState.direction === "asc") {
            this.sortState.direction = "desc";
            this.applySorting();
            this.updateSortButtonText();
            this.savePersistedViewerState();
          } else {
            // Reset to no sort
            this.sortState = { category: null, direction: "asc" };
            this.customOrder.clear();
            this.mergeLibraries();
            this.updateVisibleItems();
            this.attachCardListeners();
            this.updateSortButtonText();
            this.savePersistedViewerState();
          }
        }
      });

      // Handle dropdown option selection
      sortDropdown.querySelectorAll(".sort-option").forEach((option) => {
        option.addEventListener("click", (e) => {
          e.stopPropagation();
          const category = (option as HTMLElement).getAttribute(
            "data-category",
          ) as "artist" | "genre" | "year";
          this.sortState = { category, direction: "asc" };
          sortDropdown.classList.remove("is-open");
          this.applySorting();
          this.updateSortButtonText();
          this.savePersistedViewerState();
        });
      });

      // Close dropdown when clicking outside
      document.addEventListener("click", () => {
        sortDropdown.classList.remove("is-open");
      });
    }

    this.updateSortButtonText();

    const editBtn = document.getElementById("vinyl-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        this.toggleEditMode();
        editBtn.textContent = this.isEditMode ? "edit on" : "edit";
      });
    }
  }

  // Commented out unused search functionality - can be re-enabled later
  // private _searchLibrary(query: string): void {
  //   const lowerQuery = query.toLowerCase();
  //   const filtered = this.library.filter((entry) => {
  //     const artist = (entry.artistName || "").toLowerCase();
  //     const song = (entry.songName || "").toLowerCase();
  //     return artist.includes(lowerQuery) || song.includes(lowerQuery);
  //   });
  //
  //   if (filtered.length === 0) {
  //     alert("No results found");
  //     return;
  //   }
  //
  //   // Scroll to first result
  //   const firstResult = filtered[0];
  //   const cards = document.querySelectorAll(
  //     `.vinyl-viewer-widget .album-card[data-entry-id="${firstResult.id}"]`,
  //   );
  //   if (cards.length > 0) {
  //     cards[0].scrollIntoView({ behavior: "smooth", block: "center" });
  //   }
  // }

  /**
   * Apply current sort state to library
   */
  private applySorting(): void {
    if (!this.sortState.category) return;

    const direction = this.sortState.direction === "asc" ? 1 : -1;

    switch (this.sortState.category) {
      case "artist":
        this.library.sort(
          (a, b) =>
            direction * (a.artistName || "").localeCompare(b.artistName || ""),
        );
        break;
      case "genre":
        this.library.sort(
          (a, b) => direction * (a.genre || "").localeCompare(b.genre || ""),
        );
        break;
      case "year":
        this.library.sort(
          (a, b) =>
            direction *
            (b.releaseYear || "").localeCompare(a.releaseYear || ""),
        );
        break;
    }

    this.updateVisibleItems();
    this.attachCardListeners();
  }

  /**
   * Update sort button text to show current sort state
   */
  private updateSortButtonText(): void {
    const sortBtn = document.getElementById("vinyl-sort-btn");
    if (!sortBtn) return;

    if (this.sortState.category === null) {
      sortBtn.textContent = "sort";
    } else {
      const arrow = this.sortState.direction === "asc" ? "▲" : "▼";
      sortBtn.textContent = `sort: ${this.sortState.category} ${arrow}`;
    }
  }

  /**
   * Handle deletion of an entry
   */
  private async handleDelete(entryId: string, isOwner: boolean): Promise<void> {
    const entry = this.library.find((e) => e.id === entryId);
    if (!entry) return;

    // Skip confirmation if in edit mode
    if (!this.isEditMode) {
      // Use fallback values for display
      const artistName = entry.artistName || "Unknown Artist";
      const songName = entry.songName || entry.note || "Unknown Song";

      const collectionType = isOwner
        ? "backend collection"
        : "your local collection";
      const confirmed = confirm(
        `Delete "${songName}" by ${artistName} from ${collectionType}?`,
      );
      if (!confirmed) return;
    }

    // Save scroll position before deletion
    const scrollPosBefore = this.scrollContainer?.scrollTop || 0;

    // Trigger fade out animation on all cards with this entry ID
    const cards = document.querySelectorAll(
      `.vinyl-viewer-widget .album-card[data-entry-id="${entryId}"]`,
    );
    cards.forEach((card) => card.classList.add("deleting"));

    const DELETION_ANIMATION_MS = 2000;

    // Wait for animation to complete before actually removing
    await new Promise((resolve) => setTimeout(resolve, DELETION_ANIMATION_MS));

    if (isOwner) {
      // Delete from backend owner collection
      if (!this.config.apiUrl) {
        alert("API URL not configured");
        return;
      }

      try {
        const success = await deleteOwnerEntry(
          this.config.apiUrl,
          entryId,
          this.config.adminToken,
        );

        if (success) {
          // Reload owner library
          this.ownerLibrary = await fetchOwnerLibrary(this.config.apiUrl);
          this.mergeLibraries();

          // Don't manually remove - the animation's display:none at 100% handles it
          // The cards are now invisible and take up no space in the layout

          // Restore scroll position to maintain view
          if (this.scrollContainer) {
            this.scrollContainer.scrollTop = scrollPosBefore;
          }

          // Tell other widgets to update, but skip re-rendering this one
          this.suppressNextLibraryUpdateEvent = true;
          window.dispatchEvent(new CustomEvent("vinyl-library-updated"));

          console.log("✓ Entry deleted from backend collection");
        } else {
          alert("Failed to delete entry from backend");
        }
      } catch (error) {
        console.error("Error deleting owner entry:", error);
        alert("Error deleting entry. Check console for details.");
      }
    } else {
      // Remove from localStorage (visitor entries)
      if (removeVisitorLink(entryId)) {
        // Update visitor library and re-merge
        this.visitorLibrary = loadVisitorLibrary();
        this.mergeLibraries();

        // Don't manually remove - the animation's display:none at 100% handles it
        // The cards are now invisible and take up no space in the layout

        // Restore scroll position to maintain view
        if (this.scrollContainer) {
          this.scrollContainer.scrollTop = scrollPosBefore;
        }

        //  Tell other widgets to update, but skip re-rendering this one
        this.suppressNextLibraryUpdateEvent = true;
        window.dispatchEvent(new CustomEvent("vinyl-library-updated"));

        console.log("✓ Entry deleted from your local collection");
      }
    }
  }

  /**
   * Cache duration in localStorage by videoId
   */
  private cacheDuration(videoId: string, duration: number): void {
    try {
      const cache = this.getDurationCache();
      cache[videoId] = duration;
      localStorage.setItem("videoDurationCache", JSON.stringify(cache));
      console.log(
        `[cacheDuration] Cached duration for ${videoId}: ${duration}s`,
      );
    } catch (error) {
      console.warn("[cacheDuration] Failed to cache duration:", error);
    }
  }

  /**
   * Get cached duration for a videoId
   */
  private getCachedDuration(videoId: string): number | null {
    try {
      const cache = this.getDurationCache();
      return cache[videoId] || null;
    } catch (error) {
      console.warn("[getCachedDuration] Failed to get cached duration:", error);
      return null;
    }
  }

  /**
   * Get the entire duration cache from localStorage
   */
  private getDurationCache(): Record<string, number> {
    try {
      const cached = localStorage.getItem("videoDurationCache");
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      console.warn("[getDurationCache] Failed to parse duration cache:", error);
      return {};
    }
  }

  private applyFocusCardTurntableState(): void {
    const infoContainer = document.getElementById("vinyl-focus-card-info-root");
    if (!infoContainer) {
      return;
    }
    const isFocusVinylOnTurntable =
      this.isVinylOnTurntable &&
      !!this.focusedEntryVideoId &&
      !!this.turntableVideoId &&
      this.focusedEntryVideoId === this.turntableVideoId;
    infoContainer.classList.toggle(
      "vinyl-on-turntable",
      isFocusVinylOnTurntable,
    );
    const albumInfoContainer = infoContainer.querySelector(
      ".album-info-container",
    );
    if (albumInfoContainer) {
      albumInfoContainer.classList.toggle(
        "shift-disabled",
        isFocusVinylOnTurntable,
      );
    }
  }

  private watchTurntableStateUpdates(): void {
    window.addEventListener("focus-vinyl-turntable-state", (event) => {
      const detail = (
        event as CustomEvent<{
          onTurntable: boolean;
          turntableVideoId?: string;
        }>
      ).detail;
      this.isVinylOnTurntable = Boolean(detail?.onTurntable);
      this.turntableVideoId =
        detail?.turntableVideoId && detail.turntableVideoId !== ""
          ? detail.turntableVideoId
          : null;
      this.applyFocusCardTurntableState();
    });
  }

  /**
   * Watch for video duration updates from the player
   */
  private watchVideoDurationUpdates(): void {
    window.addEventListener("video-duration-loaded", ((event: CustomEvent) => {
      const { videoId, duration } = event.detail;
      console.log(
        `[vinylLibraryViewer] Received duration for video ${videoId}: ${duration}s`,
      );

      // Save duration to a separate localStorage cache indexed by videoId
      this.cacheDuration(videoId, duration);

      // Update the entry in both libraries
      const visitorEntry = this.visitorLibrary.find(
        (e) => e.youtubeId === videoId,
      );
      if (visitorEntry) {
        visitorEntry.duration = String(duration);
        saveVisitorLibrary(this.visitorLibrary);
        console.log(`[vinylLibraryViewer] Updated visitor entry with duration`);
      }

      const ownerEntry = this.ownerLibrary.find((e) => e.youtubeId === videoId);
      if (ownerEntry) {
        ownerEntry.duration = String(duration);
        console.log(
          `[vinylLibraryViewer] Updated owner entry with duration (cached locally)`,
        );
      }

      // Refresh the display if this is the focused entry
      if (this.focusedEntryId) {
        const focusedEntry = this.library.find(
          (e) => e.id === this.focusedEntryId,
        );
        if (focusedEntry && focusedEntry.youtubeId === videoId) {
          focusedEntry.duration = String(duration);

          // Just update the duration text in the existing DOM instead of re-rendering
          const focusInfoContainer = document.getElementById(
            "vinyl-focus-card-info-root",
          );
          if (focusInfoContainer) {
            const infoCard =
              focusInfoContainer.querySelector(".focus-card-info");
            if (infoCard) {
              // Remove any existing duration elements first to prevent duplicates
              const existingDurations =
                infoCard.querySelectorAll(".album-duration");
              existingDurations.forEach((el) => el.remove());

              // Create and insert duration element at the bottom of the card
              const durationDiv = document.createElement("div");
              durationDiv.className = "album-duration";
              durationDiv.textContent = `${this.formatDuration(duration)}`;

              infoCard.appendChild(durationDiv);

              console.log(
                `[vinylLibraryViewer] Inserted duration: ${this.formatDuration(duration)} at bottom of card`,
                durationDiv,
              );
            }
          }
        }
      }
    }) as EventListener);
  }

  /**
   * Watch for changes in localStorage to update the viewer
   */
  private watchStorageChanges(): void {
    window.addEventListener("storage", (event) => {
      if (event.key === "visitorLibrary") {
        this.visitorLibrary = loadVisitorLibrary();
        this.mergeLibraries();
        this.updateVisibleItems();
        this.attachCardListeners();
      }
    });

    // Also listen for custom events dispatched by the widget
    window.addEventListener("vinyl-library-updated", async (event: Event) => {
      // 🔹 Skip the event we just fired from this instance during delete
      if (this.suppressNextLibraryUpdateEvent) {
        this.suppressNextLibraryUpdateEvent = false;
        return;
      }

      const customEvent = event as CustomEvent;
      const isNewAddition = customEvent.detail?.isNewAddition;
      const newEntryId = customEvent.detail?.entryId;
      const newEntry = customEvent.detail?.newEntry;

      // 🔹 Capture scroll so re-render doesn’t cause a jump
      const scrollPos = this.scrollContainer?.scrollTop ?? 0;

      this.visitorLibrary = loadVisitorLibrary();

      // For new additions, optimistically add to owner library if provided
      if (isNewAddition && newEntry && newEntry.isOwnerEntry === true) {
        console.log(
          "[vinyl-library-updated] Optimistically adding new entry to owner library",
        );
        // Check if it already exists to avoid duplicates
        const exists = this.ownerLibrary.some((e) => e.id === newEntry.id);
        if (!exists) {
          this.ownerLibrary.unshift(newEntry);
          console.log(
            `[vinyl-library-updated] Owner library now has ${this.ownerLibrary.length} entries`,
          );
        }
      }

      // Still reload from API in background for non-new additions
      if (this.config.apiUrl && !isNewAddition) {
        try {
          this.ownerLibrary = await fetchOwnerLibrary(this.config.apiUrl);
        } catch (error) {
          console.error("Failed to reload owner library:", error);
        }
      }

      // Recreate blob URLs after reloading libraries
      await this.recreateBlobUrls();

      // If this is a new addition, insert at visible middle position
      console.log(
        `[vinyl-library-updated] isNewAddition=${isNewAddition}, newEntryId=${newEntryId}`,
      );

      if (isNewAddition && newEntryId) {
        console.log(
          `[vinyl-library-updated] Calling mergeLibraries with insertAtTop="${newEntryId}"`,
        );
        // Give new entry the highest timestamp so it stays at the top when custom order is applied
        this.customOrder.set(newEntryId, Date.now());
        this.savePersistedViewerState();
        this.mergeLibraries(newEntryId);
      } else {
        console.log(
          `[vinyl-library-updated] Calling mergeLibraries without insertion parameter`,
        );
        this.mergeLibraries();
      }

      // Log where the new entry ended up in the library
      if (isNewAddition && newEntryId) {
        const index = this.library.findIndex((e) => e.id === newEntryId);
        console.log(
          `[vinyl-library-updated] New entry is at index ${index} of ${this.library.length} total entries`,
        );
      }

      // Re-render the entire list
      this.updateVisibleItems();

      // Handle new insertion: scroll to it and animate
      if (isNewAddition && newEntryId) {
        // Use double requestAnimationFrame to ensure DOM is fully painted
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const cards = document.querySelectorAll(
              `.vinyl-viewer-widget .album-card[data-entry-id="${newEntryId}"]`,
            );
            console.log(
              `[vinyl-library-updated] Found ${cards.length} cards with ID ${newEntryId}`,
            );

            if (cards.length > 0) {
              // Scroll to the middle instance (carousel set 1 of 3)
              const middleCard = cards[1] || cards[0];
              console.log(`[vinyl-library-updated] Scrolling to card`);

              middleCard.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });

              // Add animation class to all instances
              cards.forEach((card) => {
                card.classList.add("inserting");
              });
              console.log(
                `[vinyl-library-updated] Added inserting class to ${cards.length} cards`,
              );

              // Clear after animation completes
              setTimeout(() => {
                cards.forEach((card) => {
                  card.classList.remove("inserting");
                });
              }, 1000);
            }
          });
        });
      } else {
        // Restore scroll to keep viewport stable when not inserting
        if (this.scrollContainer) {
          this.scrollContainer.scrollTop = scrollPos;
        }
      }

      this.attachCardListeners();
    });
  }

  /**
   * Refresh the viewer
   */
  public async refresh(): Promise<void> {
    this.visitorLibrary = loadVisitorLibrary();

    // Reload owner library from API if configured
    if (this.config.apiUrl) {
      try {
        this.ownerLibrary = await fetchOwnerLibrary(this.config.apiUrl);
      } catch (error) {
        console.error("Failed to reload owner library:", error);
      }
    }

    // Recreate blob URLs after reloading libraries
    await this.recreateBlobUrls();

    this.mergeLibraries();
    this.updateVisibleItems();
    this.attachCardListeners();
  }

  /**
   * Get image URL with fallback
   */
  private getImageWithFallback(imageUrl: string | null): string {
    // Use the imageUrl directly if it exists (including blob URLs)
    // Blob URLs created by recreateBlobUrls are fresh and valid
    if (imageUrl) return imageUrl;

    // No imageUrl, return placeholder
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3Ctext x="100" y="100" text-anchor="middle" dy=".3em" fill="%23999" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Format duration from seconds to MM:SS or HH:MM:SS
   */
  private formatDuration(seconds: string | number): string {
    const totalSeconds =
      typeof seconds === "string" ? parseInt(seconds, 10) : seconds;
    if (isNaN(totalSeconds)) return "";

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    }
  }

  /**
   * Toggle edit mode - shows/hides delete buttons
   */
  private toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
    const widget = document.querySelector(".vinyl-viewer-widget");
    console.log(
      "Toggle edit mode:",
      this.isEditMode,
      "Widget found:",
      !!widget,
    );
    if (widget) {
      widget.classList.toggle("edit-mode", this.isEditMode);
      console.log("Widget classes:", widget.className);
      console.log(
        "Delete buttons found:",
        document.querySelectorAll(".delete-btn").length,
      );
    }
    document.body?.classList.toggle("vinyl-edit-mode", this.isEditMode);
  }
}
