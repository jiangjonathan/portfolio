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

  private scrollContainer: HTMLElement | null = null;
  private itemHeight: number = 292; // 280px card + 12px gap

  private suppressNextLibraryUpdateEvent: boolean = false;
  private customOrder: Map<string, number> = new Map(); // Session-based custom ordering

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

    // Apply custom ordering if any entries have been reordered
    if (this.customOrder.size > 0) {
      this.library.sort((a, b) => {
        const orderA = this.customOrder.get(a.id) ?? Infinity;
        const orderB = this.customOrder.get(b.id) ?? Infinity;
        return orderA - orderB;
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
            flex-direction: column;
            align-items: flex-start;
            gap: 0;
            background: transparent;
            border-radius: 2px;
            overflow: visible;
            border: none;
            cursor: default;
            width: 430px;
            flex-shrink: 0;
            margin-bottom: 0.75rem;
            content-visibility: auto;
            contain-intrinsic-size: 430px 292px;
          }

          .vinyl-viewer-widget .album-main {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 0;
            width: 100%;
          }

          .vinyl-viewer-widget .album-card.swapping-out {
            transition: opacity 0.4s ease-out;
            position: fixed;
            z-index: 999;
            opacity: 0;
          }

          .vinyl-viewer-widget .album-card.focused {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            width: 600px;
            animation: fade-in-focus 0.4s ease-out forwards;
            flex-direction: row;
            gap: 1rem;
          }

          .vinyl-viewer-widget .album-metadata {
            display: none;
          }

          .vinyl-viewer-widget .album-card.focused .album-metadata {
            display: block;
            padding: 0.5rem;
            font-size: 0.75rem;
            color: #555;
            line-height: 1.4;
          }

          .vinyl-viewer-widget .album-card.focused .album-metadata div {
            margin-bottom: 0.3rem;
          }

          .vinyl-viewer-widget .album-card.focused .album-metadata strong {
            color: #000;
            font-weight: 600;
          }

          @keyframes fade-in-focus {
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
            width: 250px;
            height: 250px;
            flex-shrink: 0;
            border-radius: 2px;
            // box-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
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

          .vinyl-viewer-widget .album-year {
            font-size: 0.65rem;
            color: #888;
            margin-top: 0.15rem;
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
          <button id="vinyl-jump-top-btn" class="filter-btn vinyl-hyperlink">jump to top</button>
          <button id="vinyl-search-btn" class="filter-btn vinyl-hyperlink">search</button>
          <button id="vinyl-sort-btn" class="filter-btn vinyl-hyperlink">sort</button>
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
                  ${releaseYear ? `<div class="album-year" style="margin-left:0.5px;">${this.escapeHtml(releaseYear)}</div>` : ""}
                </div>
                <div class="album-metadata">
                  ${genre ? `<div><strong>Genre:</strong> ${this.escapeHtml(genre)}</div>` : ""}
                  ${note ? `<div>${this.escapeHtml(note)}</div>` : ""}
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
    // Album card click handler - load video and focus card
    const albumCards = document.querySelectorAll(
      ".vinyl-viewer-widget .album-card",
    );
    albumCards.forEach((card) => {
      card.addEventListener("click", (e) => {
        // Don't trigger if clicking the delete button
        if ((e.target as HTMLElement).classList.contains("delete-btn")) {
          return;
        }

        // Get the entry-id for the new card
        const entryId = (card as HTMLElement).getAttribute("data-entry-id");

        // Move this card to the front of the custom order
        if (entryId) {
          this.customOrder.set(entryId, Date.now());
          this.mergeLibraries();
          this.updateVisibleItems();
          this.attachCardListeners();
        }

        // Remove focus from all focused cards (including duplicates in carousel)
        const previouslyFocused = document.querySelectorAll(
          ".vinyl-viewer-widget .album-card.focused",
        );

        // Fade out old card and fade in new card
        previouslyFocused.forEach((c) => {
          (c as HTMLElement).classList.add("swapping-out");
          setTimeout(() => {
            (c as HTMLElement).classList.remove("focused");
            (c as HTMLElement).classList.remove("swapping-out");
          }, 400);
        });

        // Get all duplicate cards with the new entry and add focus to all of them
        const allMatchingCards = document.querySelectorAll(
          `.vinyl-viewer-widget .album-card[data-entry-id="${entryId}"]`,
        );
        allMatchingCards.forEach((c) => {
          (c as HTMLElement).classList.add("focused");
        });

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

    const searchBtn = document.getElementById("vinyl-search-btn");
    if (searchBtn) {
      searchBtn.addEventListener("click", () => {
        const query = prompt("Search by artist or song name:");
        if (query) {
          this.searchLibrary(query);
        }
      });
    }

    const sortBtn = document.getElementById("vinyl-sort-btn");
    if (sortBtn) {
      sortBtn.addEventListener("click", () => {
        const sortOption = prompt(
          "Sort by:\n1. Artist (A-Z)\n2. Genre\n3. Release Year\n4. Reset to default\n\nEnter 1, 2, 3, or 4:",
        );
        if (sortOption) {
          this.sortLibrary(sortOption);
        }
      });
    }
  }

  /**
   * Search the library by artist or song name
   */
  private searchLibrary(query: string): void {
    const lowerQuery = query.toLowerCase();
    const filtered = this.library.filter((entry) => {
      const artist = (entry.artistName || "").toLowerCase();
      const song = (entry.songName || "").toLowerCase();
      return artist.includes(lowerQuery) || song.includes(lowerQuery);
    });

    if (filtered.length === 0) {
      alert("No results found");
      return;
    }

    // Scroll to first result
    const firstResult = filtered[0];
    const cards = document.querySelectorAll(
      `.vinyl-viewer-widget .album-card[data-entry-id="${firstResult.id}"]`,
    );
    if (cards.length > 0) {
      cards[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /**
   * Sort the library by different criteria
   */
  private sortLibrary(option: string): void {
    switch (option) {
      case "1":
        this.library.sort((a, b) =>
          (a.artistName || "").localeCompare(b.artistName || ""),
        );
        break;
      case "2":
        this.library.sort((a, b) =>
          (a.genre || "").localeCompare(b.genre || ""),
        );
        break;
      case "3":
        this.library.sort((a, b) =>
          (b.releaseYear || "").localeCompare(a.releaseYear || ""),
        );
        break;
      case "4":
        this.customOrder.clear();
        this.mergeLibraries();
        this.updateVisibleItems();
        this.attachCardListeners();
        return;
      default:
        alert("Invalid option");
        return;
    }

    this.updateVisibleItems();
    this.attachCardListeners();
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
