/**
 * Vinyl Library Viewer Widget
 * Displays visitor's personal collection in a beautiful grid with album covers
 */

import {
  loadVisitorLibrary,
  removeVisitorLink,
  fetchOwnerLibrary,
  deleteOwnerEntry,
  type VisitorEntry,
} from "./visitorLibrary";

import { initializeCache, recreateBlobUrlIfNeeded } from "./albumCoverCache";
import {
  generatePlasticOverlay,
  PLASTIC_OVERLAY_BLEND_MODE,
} from "./plasticOverlay";

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

  // Carousel/infinite scroll properties
  private scrollContainer: HTMLElement | null = null;
  private carouselItems: ExtendedEntry[] = []; // Duplicated list for seamless looping
  private itemHeight: number = 292; // 280px card + 12px gap
  private isResettingScroll: boolean = false;

  private suppressNextLibraryUpdateEvent: boolean = false;

  constructor(config: ViewerConfig) {
    this.config = config;
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
        console.log("📚 Fetching owner library from:", this.config.apiUrl);
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
      console.warn("⚠️ No apiUrl configured for viewer");
      this.ownerLibrary = [];
    }

    console.log("Visitor library:", this.visitorLibrary.length, "entries");

    // Recreate blob URLs for cached covers in both libraries
    await this.recreateBlobUrls();

    // Merge and mark libraries
    this.mergeLibraries();
    console.log("📦 Merged library:", this.library.length, "total entries");

    // Render viewer
    this.render(container);

    // Watch for changes in localStorage
    this.watchStorageChanges();
  }

  /**
   * Recreate blob URLs for all entries that have cached covers
   */
  private async recreateBlobUrls(): Promise<void> {
    console.log("[recreateBlobUrls] Processing owner library...");

    await Promise.all(
      this.ownerLibrary.map(async (entry) => {
        console.log(
          `[Owner Entry] id: ${entry.id}, releaseId: ${entry.releaseId}, imageUrl: ${entry.imageUrl}`,
        );

        if (entry.releaseId) {
          const newUrl = await recreateBlobUrlIfNeeded(
            entry.imageUrl,
            entry.releaseId,
          );
          console.log(
            `[Owner Entry] Updated imageUrl from ${entry.imageUrl} to ${newUrl}`,
          );
          entry.imageUrl = newUrl;
        } else {
          console.log(`[Owner Entry] No releaseId, skipping`);
        }
      }),
    );

    console.log("[recreateBlobUrls] Processing visitor library...");

    await Promise.all(
      this.visitorLibrary.map(async (entry) => {
        console.log(
          `[Visitor Entry] id: ${entry.id}, releaseId: ${entry.releaseId}, imageUrl: ${entry.imageUrl}`,
        );

        if (entry.releaseId) {
          const newUrl = await recreateBlobUrlIfNeeded(
            entry.imageUrl,
            entry.releaseId,
          );
          console.log(
            `[Visitor Entry] Updated imageUrl from ${entry.imageUrl} to ${newUrl}`,
          );
          entry.imageUrl = newUrl;
        } else {
          console.log(`[Visitor Entry] No releaseId, skipping`);
        }
      }),
    );

    console.log("[recreateBlobUrls] Done!");
  }

  /**
   * Merge owner and visitor libraries, marking each entry's source
   * If insertAtVisibleMiddle is provided, insert new entry at middle of visible area
   */
  private mergeLibraries(insertAtVisibleMiddle?: string): void {
    const ownerEntries: ExtendedEntry[] = this.ownerLibrary.map((entry) => ({
      ...entry,
      isOwnerEntry: true,
    }));

    const visitorEntries: ExtendedEntry[] = this.visitorLibrary.map(
      (entry) => ({
        ...entry,
        isOwnerEntry: false,
      }),
    );

    let combinedEntries: ExtendedEntry[];

    // If we have an entry ID to insert at visible middle
    if (insertAtVisibleMiddle && this.scrollContainer) {
      // First get all entries in their default order
      const allEntries = [...ownerEntries, ...visitorEntries];
      console.log(
        `[mergeLibraries] Total entries before insertion: ${allEntries.length}`,
      );
      console.log(
        `[mergeLibraries] Owner entries: ${ownerEntries.length}, Visitor entries: ${visitorEntries.length}`,
      );

      // Find the new entry
      const newEntry = allEntries.find((e) => e.id === insertAtVisibleMiddle);
      console.log(
        `[mergeLibraries] Found new entry:`,
        newEntry ? `yes (id: ${newEntry.id})` : "NO",
      );

      if (newEntry) {
        // Remove the new entry from the list
        const allOtherEntries = allEntries.filter(
          (e) => e.id !== insertAtVisibleMiddle,
        );
        console.log(
          `[mergeLibraries] Other entries after removing new: ${allOtherEntries.length}`,
        );

        // Calculate middle visible index based on OLD library length
        const scrollTop = this.scrollContainer.scrollTop;
        const visibleHeight =
          this.scrollContainer.getBoundingClientRect().height;

        // Use the OLD library to calculate position (before adding new entry)
        const oldLibraryLength = allOtherEntries.length;
        const oneSetHeight = oldLibraryLength * this.itemHeight;

        // Get the scroll position within the middle set (set 1 of 3)
        const middleSetStart = oneSetHeight;
        const middleSetEnd = oneSetHeight * 2;

        let adjustedScroll: number;
        if (scrollTop < middleSetStart) {
          // In first set, use first set position
          adjustedScroll = scrollTop;
        } else if (scrollTop >= middleSetEnd) {
          // In third set, use third set position minus 2 sets
          adjustedScroll = scrollTop - oneSetHeight * 2;
        } else {
          // In middle set, use middle set position minus 1 set
          adjustedScroll = scrollTop - oneSetHeight;
        }

        const visibleMiddleIndex = Math.floor(
          (adjustedScroll + visibleHeight / 2) / this.itemHeight,
        );

        console.log(
          `[mergeLibraries] scrollTop=${scrollTop}, visibleHeight=${visibleHeight}`,
        );
        console.log(
          `[mergeLibraries] oldLibraryLength=${oldLibraryLength}, oneSetHeight=${oneSetHeight}`,
        );
        console.log(
          `[mergeLibraries] adjustedScroll=${adjustedScroll}, itemHeight=${this.itemHeight}`,
        );
        console.log(
          `[mergeLibraries] Calculated visibleMiddleIndex=${visibleMiddleIndex} of ${oldLibraryLength} total entries`,
        );

        // Insert at the middle visible index
        const insertIndex = Math.max(
          0,
          Math.min(visibleMiddleIndex, allOtherEntries.length),
        );
        console.log(`[mergeLibraries] Final insertIndex=${insertIndex}`);

        combinedEntries = [
          ...allOtherEntries.slice(0, insertIndex),
          newEntry,
          ...allOtherEntries.slice(insertIndex),
        ];

        console.log(
          `[mergeLibraries] Combined entries after insertion: ${combinedEntries.length}`,
        );
        console.log(
          `[mergeLibraries] New entry is now at index: ${combinedEntries.findIndex((e) => e.id === insertAtVisibleMiddle)}`,
        );
      } else {
        // Fallback if entry not found
        combinedEntries = [...ownerEntries, ...visitorEntries];
      }
    } else {
      // Default behavior: combine both, owner entries first
      combinedEntries = [...ownerEntries, ...visitorEntries];
    }

    // If filter is active, show only visitor entries
    if (this.showVisitorOnly) {
      this.library = combinedEntries.filter((e) => !e.isOwnerEntry);
    } else {
      this.library = combinedEntries;
    }

    // Update carousel items when library changes
    if (this.library.length > 0) {
      this.carouselItems = [...this.library, ...this.library, ...this.library];
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
          }

          .vinyl-viewer-widget .library-grid::-webkit-scrollbar {
            display: none;
          }

          .vinyl-viewer-widget .album-card {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 0;
            background: transparent;
            border-radius: 2px;
            overflow: visible;
            transition: none;
            border: none;
            cursor: default;
            width: 430px;
            flex-shrink: 0;
            margin-bottom: 0.75rem;
            content-visibility: auto;
            contain-intrinsic-size: 430px 292px;
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
            width: 250px;
            height: 250px;
            flex-shrink: 0;
            border-radius: 2px;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
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
            padding: 0 0.5rem;
            display: flex;
            flex-direction: column;
            background: transparent;
            justify-content: center;
            min-width: 0;
            width: 180px;
            flex-shrink: 0;
            overflow: hidden;
          }

          .vinyl-viewer-widget .album-artist,
          .vinyl-viewer-widget .album-song {
            white-space: nowrap;
            overflow: hidden;
            width: 100%;
            position: relative;
          }

          .vinyl-viewer-widget .album-artist {
            font-size: 0.7rem;
            color: #000;
            margin-bottom: 0.15rem;
            line-height: 1.1;
            font-weight: normal;
          }

          .vinyl-viewer-widget .album-song {
            font-weight: 500;
            font-size: 0.8rem;
            color: #000;
            line-height: 1.1;
          }

          /* Scrolling text animation on hover - only for overflowing text */
          @keyframes scroll-text {
            0% { transform: translateX(0); }
            100% { transform: translateX(calc(-50% - 1rem)); }
          }

          .vinyl-viewer-widget .album-artist-text,
          .vinyl-viewer-widget .album-song-text {
            display: inline-block;
            padding-right: 2rem;
          }

          /* Only animate if text is overflowing (controlled by JS) */
          .vinyl-viewer-widget .album-card:hover .album-artist.overflowing,
          .vinyl-viewer-widget .album-card:hover .album-song.overflowing {
            animation: scroll-text 10s linear infinite;
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
            animation: fade-out-collapse 2000ms ease-in-out forwards !important;
            overflow: hidden;
            pointer-events: none;
          }


          /* Insertion animation for new albums */
          /* New entry: reserve space, then fade the cover in */
          @keyframes slide-in-expand {
            0% {
              opacity: 0;
              max-height: 0;
              margin-top: 0;
              margin-bottom: 0;
              padding-top: 0;
              padding-bottom: 0;
            }
            50% {
              opacity: 0;
              max-height: 400px;      /* Expand to push cards up */
              margin-top: -150px;     /* Pull up to overlap above */
              margin-bottom: -100px;  /* Pull card below up */
              padding-top: 0.5rem;
              padding-bottom: 0.5rem;
            }
            100% {
              opacity: 1;
              max-height: 280px;      /* Final card height */
              margin-top: 0;
              margin-bottom: 0.75rem; /* Final gap */
              padding-top: 0.5rem;
              padding-bottom: 0.5rem;
            }
          }

          .vinyl-viewer-widget .album-card.inserting {
            animation: slide-in-expand 2500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
            overflow: visible !important;
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
            transition: opacity 0.2s;
            z-index: 10;
          }

          .vinyl-viewer-widget .album-card:hover .delete-btn {
            opacity: 1;
          }

          .vinyl-viewer-widget .delete-btn:hover {
            background: rgba(153, 27, 27, 0.9);
          }

          .vinyl-viewer-widget .filter-controls {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 1rem;
            gap: 0.5rem;
            position: sticky;
            top: 0;
            background: #f7f7f7;
            z-index: 100;
            padding: 0.5rem 0;
          }

          .vinyl-viewer-widget .filter-btn {
            /* Uses centralized .vinyl-hyperlink styles from main.ts */
          }

          .vinyl-viewer-widget .filter-btn.active {
            color: var(--vinyl-link-hover-color);
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
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0;
            transition: opacity 0.2s;
          }

          .vinyl-viewer-widget .album-card:hover .owner-badge {
            opacity: 1;
          }
        </style>

        <div class="filter-controls">
          <button id="vinyl-filter-btn" class="filter-btn vinyl-hyperlink">show mine only</button>
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

    // Create carousel items: 3x copies for seamless wrapping (minimal memory)
    this.carouselItems = [...this.library, ...this.library, ...this.library];

    // Initial render
    this.updateVisibleItems();
    this.attachCardListeners();

    // The actual scrolling happens on the parent container
    const scrollingContainer = document.getElementById("vinyl-library-viewer");

    if (scrollingContainer) {
      // Listen for scroll on the ACTUAL scrolling element
      scrollingContainer.addEventListener(
        "scroll",
        () => {
          console.log("[scroll event] Scroll event fired");
          this.handleInfiniteScroll();
        },
        { passive: true },
      );
      console.log(
        "[renderGrid] Scroll event listener attached to #vinyl-library-viewer",
      );
    } else {
      console.error("[renderGrid] #vinyl-library-viewer not found!");
    }

    // Start at middle set, a few items before the first item for better circular scrolling
    const oneSetHeight = this.library.length * this.itemHeight;

    if (scrollingContainer) {
      // Scroll to a position that shows the correct view (adjust offset as needed)
      const offset = this.itemHeight * 4; // Start 4 items up from middle set start
      const startScrollPosition = oneSetHeight - offset;
      scrollingContainer.scrollTop = startScrollPosition;
      console.log(
        `[renderGrid] Set initial scroll position: ${startScrollPosition}`,
      );
    }
  }

  /**
   * Handle infinite scroll by detecting when we've scrolled too far
   * and resetting to the middle section invisibly
   */
  private handleInfiniteScroll(): void {
    if (
      !this.scrollContainer ||
      this.library.length === 0 ||
      this.isResettingScroll
    )
      return;

    // Get the actual scrolling container
    const actualScrollContainer = document.getElementById(
      "vinyl-library-viewer",
    );
    if (!actualScrollContainer) return;

    const oneSetHeight = this.library.length * this.itemHeight;
    const scrollTop = actualScrollContainer.scrollTop;
    const scrollHeight = actualScrollContainer.scrollHeight;
    const clientHeight = actualScrollContainer.clientHeight;

    // Calculate thresholds for wrapping - trigger earlier to prevent reaching actual bottom
    const bottomThreshold = scrollHeight - clientHeight - this.itemHeight * 2;
    const topThreshold = this.itemHeight * 2;

    console.log(
      `[handleInfiniteScroll] scrollTop=${scrollTop}, topThreshold=${topThreshold}, bottomThreshold=${bottomThreshold}, scrollHeight=${scrollHeight}`,
    );

    // If scrolled near bottom, jump back to middle
    if (scrollTop > bottomThreshold) {
      console.log(
        `[handleInfiniteScroll] NEAR BOTTOM - Jumping back to middle`,
      );
      this.isResettingScroll = true;
      const newScrollTop = scrollTop - oneSetHeight;
      actualScrollContainer.scrollTop = newScrollTop;
      console.log(
        `[handleInfiniteScroll] Jumped from ${scrollTop} to ${newScrollTop}`,
      );
      requestAnimationFrame(() => {
        this.isResettingScroll = false;
      });
    }
    // If scrolled near top, jump forward to middle
    else if (scrollTop < topThreshold) {
      console.log(
        `[handleInfiniteScroll] NEAR TOP - Jumping forward to middle`,
      );
      this.isResettingScroll = true;
      const newScrollTop = scrollTop + oneSetHeight;
      actualScrollContainer.scrollTop = newScrollTop;
      console.log(
        `[handleInfiniteScroll] Jumped from ${scrollTop} to ${newScrollTop}`,
      );
      requestAnimationFrame(() => {
        this.isResettingScroll = false;
      });
    }
  }

  /**
   * Update visible items rendering
   */
  private updateVisibleItems(): void {
    if (!this.scrollContainer || this.library.length === 0) return;

    // Ensure carousel items are up to date with 3x duplication
    this.carouselItems = [...this.library, ...this.library, ...this.library];

    let itemsHtml = "";

    // Render all carousel items (duplicates create seamless loop)
    this.carouselItems.forEach((entry, index) => {
      const isOwner = entry.isOwnerEntry || false;
      const canDelete = !isOwner || this.config.isAdmin;
      const artistName = entry.artistName || "Unknown Artist";
      const songName = entry.songName || entry.note || "Unknown Song";
      const plasticOverlay = generatePlasticOverlay();

      itemsHtml += `
      <div class="album-card" data-entry-id="${entry.id}" data-index="${index % this.library.length}">
        <div class="album-cover-wrapper">
          <img
            src="${this.getImageWithFallback(entry.imageUrl)}"
            alt="${this.escapeHtml(songName)}"
            class="album-cover"
            loading="lazy"
          >
          ${plasticOverlay}
        </div>
        ${isOwner ? '<div class="owner-badge">Owner</div>' : ""}
        ${canDelete ? `<button class="delete-btn" data-entry-id="${entry.id}" data-is-owner="${isOwner}" title="Delete from collection">×</button>` : ""}
        <div class="album-info">
          <div class="album-artist">
            <span class="album-artist-text">${this.escapeHtml(artistName)}</span>
          </div>
          <div class="album-song">
            <span class="album-song-text">${this.escapeHtml(songName)}</span>
          </div>
        </div>
      </div>
    `;
    });

    this.scrollContainer.innerHTML = itemsHtml;

    // Check for text overflow and mark overflowing elements
    this.markOverflowingText();
  }

  /**
   * Mark text elements that overflow their container and add duplicate for scrolling
   */
  private markOverflowingText(): void {
    const artistElements = document.querySelectorAll(
      ".vinyl-viewer-widget .album-artist",
    );
    const songElements = document.querySelectorAll(
      ".vinyl-viewer-widget .album-song",
    );

    [...artistElements, ...songElements].forEach((element) => {
      const el = element as HTMLElement;
      const textSpan = el.querySelector(
        ".album-artist-text, .album-song-text",
      ) as HTMLElement;

      if (!textSpan) return;

      // Check if content is wider than container
      if (el.scrollWidth > el.clientWidth) {
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
   * Attach event listeners to album cards
   */
  private attachCardListeners(): void {
    // Album card click handler - load video
    const albumCards = document.querySelectorAll(
      ".vinyl-viewer-widget .album-card",
    );
    albumCards.forEach((card) => {
      card.addEventListener("click", (e) => {
        // Don't trigger if clicking the delete button
        if ((e.target as HTMLElement).classList.contains("delete-btn")) {
          return;
        }
        const entryId = (card as HTMLElement).getAttribute("data-entry-id");
        const entry = this.library.find((e) => e.id === entryId);
        if (entry) {
          window.dispatchEvent(
            new CustomEvent("load-vinyl-song", {
              detail: {
                videoId: entry.youtubeId,
                artistName: entry.artistName,
                songName: entry.songName,
                aspectRatio: entry.aspectRatio,
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
      filterBtn.addEventListener("click", () => {
        this.showVisitorOnly = !this.showVisitorOnly;
        filterBtn.textContent = this.showVisitorOnly
          ? "Show All"
          : "Show Mine Only";
        filterBtn.classList.toggle("active", this.showVisitorOnly);
        this.mergeLibraries();
        this.updateVisibleItems();
        this.attachCardListeners();
      });
    }
  }

  /**
   * Handle deletion of an entry
   */
  private async handleDelete(entryId: string, isOwner: boolean): Promise<void> {
    const entry = this.library.find((e) => e.id === entryId);
    if (!entry) return;

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

      // 🔹 Capture scroll so re-render doesn’t cause a jump
      const scrollPos = this.scrollContainer?.scrollTop ?? 0;

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

      // If this is a new addition, insert at visible middle position
      console.log(
        `[vinyl-library-updated] isNewAddition=${isNewAddition}, newEntryId=${newEntryId}`,
      );

      if (isNewAddition && newEntryId) {
        console.log(
          `[vinyl-library-updated] Calling mergeLibraries with insertAtVisibleMiddle="${newEntryId}"`,
        );
        // Don't set the flag yet - we'll set it after render
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
              }, 2500);
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
    if (imageUrl) return imageUrl;
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
}
