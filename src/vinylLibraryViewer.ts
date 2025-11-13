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

    // Merge and mark libraries
    this.mergeLibraries();
    console.log("📦 Merged library:", this.library.length, "total entries");

    // Render viewer
    this.render(container);

    // Watch for changes in localStorage
    this.watchStorageChanges();
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
          }

          .vinyl-viewer-widget .album-card {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 0.5rem;
            background: transparent;
            border-radius: 2px;
            overflow: visible;
            transition: none;
            border: none;
            cursor: default;
          }

          .vinyl-viewer-widget .album-card:hover {
            transform: none;
            filter: none;
          }

          .vinyl-viewer-widget .album-card:active {
            transform: none;
          }

          .vinyl-viewer-widget .album-cover {
            width: 256px;
            height: 256px;
            flex-shrink: 0;
            object-fit: cover;
            background: #222;
            border-radius: 2px;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
            border: none;
          }

          .vinyl-viewer-widget .album-info {
            padding: 0;
            flex: 1;
            display: flex;
            flex-direction: column;
            background: transparent;
            justify-content: center;
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
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
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
   * Render the album grid
   */
  private renderGrid(): void {
    const gridContainer = document.getElementById("vinyl-viewer-grid");

    if (!gridContainer) return;

    if (this.library.length === 0) {
      gridContainer.innerHTML = "";
      return;
    }

    gridContainer.innerHTML = this.library
      .map((entry) => {
        const isOwner = entry.isOwnerEntry || false;
        const canDelete = !isOwner || this.config.isAdmin;

        // Handle missing fields with fallbacks
        const artistName = entry.artistName || "Unknown Artist";
        const songName = entry.songName || entry.note || "Unknown Song";

        return `
      <div class="album-card" data-entry-id="${entry.id}">
        <img
          src="${this.getImageWithFallback(entry.imageUrl)}"
          alt="${this.escapeHtml(songName)}"
          class="album-cover"
          loading="lazy"
        >
        ${isOwner ? '<div class="owner-badge">Owner</div>' : ""}
        ${canDelete ? `<button class="delete-btn" data-entry-id="${entry.id}" data-is-owner="${isOwner}" title="Delete from collection">×</button>` : ""}
        <div class="album-info">
          <div class="album-artist">${this.escapeHtml(artistName)}</div>
          <div class="album-song">${this.escapeHtml(songName)}</div>
        </div>
      </div>
    `;
      })
      .join("");

    this.attachCardListeners();
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
        this.renderGrid();
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
          this.renderGrid();

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
        this.renderGrid();

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
        const gridContainer = document.getElementById("vinyl-viewer-grid");
        if (gridContainer) {
          this.renderGrid();
        }
      }
    });

    // Also listen for custom events dispatched by the widget
    window.addEventListener("vinyl-library-updated", async () => {
      this.visitorLibrary = loadVisitorLibrary();

      // Reload owner library from API if configured
      if (this.config.apiUrl) {
        try {
          this.ownerLibrary = await fetchOwnerLibrary(this.config.apiUrl);
        } catch (error) {
          console.error("Failed to reload owner library:", error);
        }
      }

      this.mergeLibraries();
      const gridContainer = document.getElementById("vinyl-viewer-grid");
      if (gridContainer) {
        this.renderGrid();
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

    this.mergeLibraries();
    const gridContainer = document.getElementById("vinyl-viewer-grid");
    if (gridContainer) {
      this.renderGrid();
    }
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
