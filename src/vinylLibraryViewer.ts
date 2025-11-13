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
  private currentScrollIndex: number = 0;
  private itemHeight: number = 292; // 280px card + 12px gap
  private isResettingScroll: boolean = false;

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
   */
  private mergeLibraries(): void {
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

    // Combine both, owner entries first
    this.library = [...ownerEntries, ...visitorEntries];

    // If filter is active, show only visitor entries
    if (this.showVisitorOnly) {
      this.library = visitorEntries;
    }

    // Update carousel items when library changes
    if (this.library.length > 0) {
      this.carouselItems = [...this.library, ...this.library, ...this.library];
    }

    // Reset scroll position when library changes
    if (this.scrollContainer) {
      this.scrollContainer.scrollTop = 0;
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
            gap: 0.75rem;
            max-height: 70vh;
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
            width: 450px;
            flex-shrink: 0;
          }

          .vinyl-viewer-widget .album-card:hover {
            transform: none;
            filter: none;
          }

          .vinyl-viewer-widget .album-card:active {
            transform: none;
          }

          .vinyl-viewer-widget .album-cover {
            width: 250px;
            height: 250px;
            flex-shrink: 0;
            object-fit: cover;
            background: #222;
            border-radius: 2px;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
            border: none;
          }

          .vinyl-viewer-widget .album-info {
            padding: 0 0.5rem;
            display: flex;
            flex-direction: column;
            background: transparent;
            justify-content: center;
            min-width: 0;
            width: 200px;
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
              margin-bottom: 0.75rem;
              padding-top: 0.5rem;    /* whatever your current paddings roughly are */
              padding-bottom: 0.5rem;
            }
            100% {
              opacity: 0;
              max-height: 0;
              margin-bottom: 0;
              padding-top: 0;
              padding-bottom: 0;
            }
          }

          .vinyl-viewer-widget .album-card.deleting {
            animation: fade-out-collapse 100ms ease-out forwards !important;
            overflow: hidden;         /* hide shrinking contents */
            pointer-events: none;
          }

          .vinyl-viewer-widget .album-card.deleting {
            animation: fade-out-collapse 1.5s ease-in-out forwards !important;
            pointer-events: none;
            overflow: hidden;
          }

          /* Insertion animation for new albums */
          @keyframes slide-in-expand {
            0% {
              opacity: 0;
              height: 0;
              margin-bottom: 0;
              transform: scale(0.1) translateX(-50px);
            }
            50% {
              opacity: 1;
              height: auto;
              margin-bottom: 0.75rem;
              transform: scale(1.2) translateX(0);
            }
            100% {
              opacity: 1;
              height: auto;
              margin-bottom: 0.75rem;
              transform: scale(1) translateX(0);
            }
          }

          .vinyl-viewer-widget .album-card.inserting {
            animation: slide-in-expand 4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
            overflow: hidden;
          }

          .vinyl-viewer-widget .album-card.inserting .album-info {
            animation: fade-in-text 1.5s ease-out 2s forwards !important;
            opacity: 0;
          }

          @keyframes fade-in-text {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
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

    if (!gridContainer) return;

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

    // Listen for scroll to handle wrapping invisibly
    gridContainer.addEventListener(
      "scroll",
      () => this.handleInfiniteScroll(),
      { passive: true },
    );

    // Start at middle of carousel so wrapping works symmetrically
    const oneSetHeight = this.library.length * this.itemHeight;
    setTimeout(() => {
      if (gridContainer) gridContainer.scrollTop = oneSetHeight;
    }, 0);
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

    const oneSetHeight = this.library.length * this.itemHeight;
    const scrollTop = this.scrollContainer.scrollTop;

    // If scrolled past 2/3 of the way, jump back to 1/3
    if (scrollTop > oneSetHeight * 1.5) {
      this.isResettingScroll = true;
      // Jump to same position in the middle copy
      this.scrollContainer.scrollTop = scrollTop - oneSetHeight;
      requestAnimationFrame(() => {
        this.isResettingScroll = false;
      });
    }
    // If scrolled before 1/3 of the way, jump to near the end
    else if (scrollTop < oneSetHeight * 0.5) {
      this.isResettingScroll = true;
      // Jump to same position in the last copy
      this.scrollContainer.scrollTop = scrollTop + oneSetHeight;
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

    let itemsHtml = "";

    // Render all carousel items (duplicates create seamless loop)
    this.carouselItems.forEach((entry, index) => {
      const isOwner = entry.isOwnerEntry || false;
      const canDelete = !isOwner || this.config.isAdmin;
      const artistName = entry.artistName || "Unknown Artist";
      const songName = entry.songName || entry.note || "Unknown Song";

      itemsHtml += `
      <div class="album-card" data-entry-id="${entry.id}" data-index="${index % this.library.length}">
        <img
          src="${this.getImageWithFallback(entry.imageUrl)}"
          alt="${this.escapeHtml(songName)}"
          class="album-cover"
          loading="lazy"
        >
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

    const DELETION_ANIMATION_MS = 2002;

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

          // Only remove the animated cards from DOM, don't re-render everything
          const cardsToRemove = document.querySelectorAll(
            `.vinyl-viewer-widget .album-card.deleting[data-entry-id="${entryId}"]`,
          );
          cardsToRemove.forEach((card) => card.remove());

          // Restore scroll position to maintain view
          if (this.scrollContainer) {
            this.scrollContainer.scrollTop = scrollPosBefore;
          }

          // Dispatch event so other widgets update
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

        // Only remove the animated cards from DOM, don't re-render everything
        const cardsToRemove = document.querySelectorAll(
          `.vinyl-viewer-widget .album-card.deleting[data-entry-id="${entryId}"]`,
        );
        cardsToRemove.forEach((card) => card.remove());

        // Restore scroll position to maintain view
        if (this.scrollContainer) {
          this.scrollContainer.scrollTop = scrollPosBefore;
        }

        // Dispatch event so other widgets update
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
      const customEvent = event as CustomEvent;
      const isNewAddition = customEvent.detail?.isNewAddition;
      const newEntryId = customEvent.detail?.entryId;

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

      // Trigger insertion animation for new additions
      if (isNewAddition && newEntryId) {
        requestAnimationFrame(() => {
          const cards = document.querySelectorAll(
            `.vinyl-viewer-widget .album-card[data-entry-id="${newEntryId}"]`,
          );
          cards.forEach((card) => card.classList.add("inserting"));
        });
      }
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
