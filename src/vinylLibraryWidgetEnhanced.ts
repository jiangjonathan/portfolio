/**
 * Enhanced Vinyl Library Widget with Metadata Extraction
 * Integrates YouTube metadata extraction and album art fetching
 */

import {
  extractYouTubeId,
  addVisitorLink,
  fetchOwnerLibrary,
  deleteOwnerEntry,
  addToOwnerLibrary,
  type VisitorEntry,
} from "./visitorLibrary";

import {
  extractAndEnrichMetadata,
  fetchYouTubeMetadata,
} from "./youtubeMetadataExtractor";

interface WidgetConfig {
  apiUrl: string;
  containerId: string;
  compact?: boolean;
  isOwner?: boolean; // If true, shows note field for owner
  adminToken?: string; // Admin token for delete operations
}

export class EnhancedVinylLibraryWidget {
  private config: WidgetConfig;
  private ownerLibrary: VisitorEntry[] = [];
  private isLoading = false;

  constructor(config: WidgetConfig) {
    this.config = config;
  }

  /**
   * Initialize and render the widget
   */
  async init(): Promise<void> {
    const container = document.getElementById(this.config.containerId);
    if (!container) {
      console.error(`Container #${this.config.containerId} not found`);
      return;
    }

    // Render widget immediately (don't block on API call)
    if (this.config.compact) {
      this.renderCompact(container);
    } else {
      this.renderFull(container);
      // Only fetch owner's library for full mode (it displays the library)
      // Do it in background without blocking
      this.fetchAndRenderOwnerLibrary();
    }

    this.attachEventListeners();
  }

  /**
   * Fetch owner's library and update the display (async, non-blocking)
   */
  private async fetchAndRenderOwnerLibrary(): Promise<void> {
    try {
      this.ownerLibrary = await fetchOwnerLibrary(this.config.apiUrl);
      this.renderOwnerLibrary();
    } catch (error) {
      console.error("Failed to load owner library:", error);
    }
  }

  /**
   * Minimal widget - just the form
   */
  private renderCompact(container: HTMLElement): void {
    container.innerHTML = `
      <div class="vinyl-widget-enhanced-compact">
        <style>
          .vinyl-widget-enhanced-compact {
            padding: 0;
            background: transparent;
            border-radius: 0;
            border: none;
            max-width: 400px;
          }

          .vinyl-widget-enhanced-compact h3 {
            margin: 0 0 1rem 0;
            font-size: 0.95rem;
            color: #000;
            font-weight: normal;
            letter-spacing: 0.5px;
          }

          .vinyl-widget-enhanced-compact .form-group {
            margin-bottom: 1rem;
          }

          .vinyl-widget-enhanced-compact label {
            display: block;
            margin-bottom: 0.5rem;
            font-size: 0.8rem;
            color: #000;
            text-transform: none;
            letter-spacing: 0.5px;
            font-weight: normal;
          }

          .vinyl-widget-enhanced-compact input,
          .vinyl-widget-enhanced-compact textarea {
            width: 100%;
            padding: 0.5rem 0;
            background: transparent;
            border: none;
            border-bottom: 1px solid #000;
            border-radius: 0;
            color: #000;
            font-family: inherit;
            font-size: 0.9rem;
            box-sizing: border-box;
          }

          .vinyl-widget-enhanced-compact input::placeholder,
          .vinyl-widget-enhanced-compact textarea::placeholder {
            color: #999;
          }

          .vinyl-widget-enhanced-compact input:focus,
          .vinyl-widget-enhanced-compact textarea:focus {
            outline: none;
            border-bottom-color: #000;
            background: transparent;
          }

          .vinyl-widget-enhanced-compact textarea {
            resize: vertical;
            min-height: 50px;
          }

          .vinyl-widget-enhanced-compact button {
            /* Uses centralized .vinyl-hyperlink styles from main.ts */
            width: auto;
          }

          .vinyl-widget-enhanced-compact .status-message {
            padding: 0.75rem;
            border-radius: 0;
            margin-top: 1rem;
            font-size: 0.85rem;
            display: none;
            border: 1px solid #000;
            background: transparent;
            color: #000;
          }

          .vinyl-widget-enhanced-compact .status-message.show {
            display: block;
          }

          .vinyl-widget-enhanced-compact .status-message.success {
            background: transparent;
            color: #000;
            border-color: #000;
          }

          .vinyl-widget-enhanced-compact .status-message.error {
            background: transparent;
            color: #000;
            border-color: #000;
          }

          .vinyl-widget-enhanced-compact .status-message.loading {
            background: transparent;
            color: #000;
            border-color: #000;
          }
        </style>

        <h3>add to collection${this.config.isOwner ? " (admin)" : ""}</h3>

        <div class="form-group">
          <label for="vinyl-youtube-input">youtube link</label>
          <input
            type="text"
            id="vinyl-youtube-input"
            placeholder="Paste YouTube link here..."
          >
        </div>

        ${
          this.config.isOwner
            ? `
        <div class="form-group">
          <label for="vinyl-note-input">personal note (optional)</label>
          <textarea id="vinyl-note-input" placeholder="Your thoughts..."></textarea>
        </div>
        `
            : ""
        }

        <button id="vinyl-add-btn" class="vinyl-hyperlink">add to collection</button>
        <div id="vinyl-status" class="status-message"></div>
      </div>
    `;
  }

  /**
   * Full widget - form + owner's library
   */
  private renderFull(container: HTMLElement): void {
    container.innerHTML = `
      <div class="vinyl-widget-enhanced-full">
        <style>
          .vinyl-widget-enhanced-full {
            max-width: 900px;
          }

          .vinyl-widget-enhanced-full h2 {
            margin: 2rem 0 1rem 0;
            font-size: 1.5rem;
          }

          .vinyl-widget-enhanced-full .section {
            background: transparent;
            padding: 1.5rem 0;
            border-radius: 0;
            border: none;
            margin-bottom: 2rem;
          }

          .vinyl-widget-enhanced-full .section h3 {
            margin-top: 0;
            font-size: 1.1rem;
            border-bottom: none;
            padding-bottom: 0;
            margin-bottom: 1rem;
            color: #000;
            font-weight: normal;
          }

          .vinyl-widget-enhanced-full .form-group {
            margin-bottom: 1rem;
          }

          .vinyl-widget-enhanced-full label {
            display: block;
            margin-bottom: 0.5rem;
            font-size: 0.8rem;
            color: #000;
            text-transform: none;
            letter-spacing: 0.5px;
            font-weight: normal;
          }

          .vinyl-widget-enhanced-full input,
          .vinyl-widget-enhanced-full textarea {
            width: 100%;
            padding: 0.5rem 0;
            background: transparent;
            border: none;
            border-bottom: 1px solid #000;
            border-radius: 0;
            color: #000;
            font-family: inherit;
            box-sizing: border-box;
          }

          .vinyl-widget-enhanced-full input:focus,
          .vinyl-widget-enhanced-full textarea:focus {
            outline: none;
            border-bottom-color: #000;
            background: transparent;
          }

          .vinyl-widget-enhanced-full textarea {
            resize: vertical;
            min-height: 60px;
          }

          .vinyl-widget-enhanced-full button {
            /* Uses centralized .vinyl-hyperlink styles from main.ts */
          }

          .vinyl-widget-enhanced-full .status-message {
            padding: 0.75rem 0;
            border-radius: 0;
            margin-top: 1rem;
            font-size: 0.9rem;
            display: none;
            border: none;
            background: transparent;
            color: #000;
          }

          .vinyl-widget-enhanced-full .status-message.show {
            display: block;
          }

          .vinyl-widget-enhanced-full .status-message.success {
            background: transparent;
            color: #000;
            border: none;
          }

          .vinyl-widget-enhanced-full .status-message.error {
            background: transparent;
            color: #000;
            border: none;
          }

          .vinyl-widget-enhanced-full .status-message.loading {
            background: transparent;
            color: #000;
            border: none;
          }

          .vinyl-widget-enhanced-full .library-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 1.5rem;
          }

          .vinyl-widget-enhanced-full .library-item {
            background: transparent;
            border-radius: 0;
            border: none;
            overflow: hidden;
            transition: opacity 0.2s;
          }

          .vinyl-widget-enhanced-full .library-item:hover {
            border: none;
            opacity: 0.8;
          }

          .vinyl-widget-enhanced-full .library-item.owner {
            border: none;
          }

          .vinyl-widget-enhanced-full .library-item-cover {
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
            background: #e0e0e0;
          }

          .vinyl-widget-enhanced-full .library-item-info {
            padding: 0.5rem 0;
          }

          .vinyl-widget-enhanced-full .library-item-artist {
            font-size: 0.8rem;
            color: #000;
            margin: 0 0 0.25rem 0;
          }

          .vinyl-widget-enhanced-full .library-item-song {
            font-weight: normal;
            margin: 0;
            font-size: 0.95rem;
            line-height: 1.2;
            color: #000;
          }

          .vinyl-widget-enhanced-full .library-item-note {
            color: #666;
            font-size: 0.8rem;
            margin-top: 0.5rem;
          }

          .vinyl-widget-enhanced-full .empty-state {
            color: #000;
            text-align: center;
            padding: 2rem 1rem;
            font-size: 0.9rem;
          }

          .vinyl-widget-enhanced-full .library-item-delete {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background: rgba(220, 38, 38, 0.9);
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 0.35rem 0.7rem;
            font-size: 0.75rem;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s;
          }

          .vinyl-widget-enhanced-full .library-item:hover .library-item-delete {
            opacity: 1;
          }

          .vinyl-widget-enhanced-full .library-item-delete:hover {
            background: rgba(153, 27, 27, 0.9);
          }

          .vinyl-widget-enhanced-full .library-item {
            position: relative;
          }
        </style>

        <div class="section">
          <h3>add to your collection</h3>

          <div class="form-group">
            <label for="vinyl-youtube-input">youtube link</label>
            <input
              type="text"
              id="vinyl-youtube-input"
              placeholder="Paste YouTube link here..."
            >
          </div>

          ${
            this.config.isOwner
              ? `
          <div class="form-group">
            <label for="vinyl-note-input">personal note (optional)</label>
            <textarea id="vinyl-note-input" placeholder="Your thoughts..."></textarea>
          </div>
          `
              : ""
          }

          <button id="vinyl-add-btn" class="vinyl-hyperlink">add to collection</button>
          <div id="vinyl-status" class="status-message"></div>
        </div>

        <div class="section">
          <h3>owner's collection</h3>
          <div id="vinyl-owner-library" class="library-list"></div>
        </div>
      </div>
    `;

    this.renderOwnerLibrary();
  }

  /**
   * Render owner's library in a grid
   */
  private renderOwnerLibrary(): void {
    const container = document.getElementById("vinyl-owner-library");
    if (!container) return;

    if (!this.ownerLibrary.length) {
      container.innerHTML = '<div class="empty-state">No tracks yet</div>';
      return;
    }

    container.innerHTML = this.ownerLibrary
      .map(
        (entry) => `
      <div class="library-item owner" data-entry-id="${entry.id}">
        <img
          src="${this.getImageWithFallback(entry.imageUrl)}"
          alt="${entry.songName}"
          class="library-item-cover"
          style="width: 100%; aspect-ratio: 1; object-fit: cover; background: #1a1a1a;"
        >
        ${
          this.config.isOwner
            ? `<button class="library-item-delete" data-entry-id="${entry.id}">Delete</button>`
            : ""
        }
        <div class="library-item-info">
          <div class="library-item-artist">${this.escapeHtml(entry.artistName)}</div>
          <p class="library-item-song">${this.escapeHtml(entry.songName)}</p>
          ${entry.note ? `<div class="library-item-note">${this.escapeHtml(entry.note)}</div>` : ""}
        </div>
      </div>
    `,
      )
      .join("");

    // Attach delete event listeners if admin
    if (this.config.isOwner) {
      const deleteButtons = container.querySelectorAll(".library-item-delete");
      deleteButtons.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const entryId = (btn as HTMLElement).getAttribute("data-entry-id");
          if (entryId) {
            this.handleDeleteEntry(entryId);
          }
        });
      });
    }
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    const addBtn = document.getElementById("vinyl-add-btn");
    const youtubeInput = document.getElementById(
      "vinyl-youtube-input",
    ) as HTMLInputElement;
    const noteInput = this.config.isOwner
      ? (document.getElementById("vinyl-note-input") as HTMLTextAreaElement)
      : null;

    if (addBtn) {
      addBtn.addEventListener("click", () =>
        this.handleAddSong(youtubeInput, noteInput),
      );
    }

    // Allow Enter to submit (but not in textarea due to line breaks)
    if (youtubeInput) {
      youtubeInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && addBtn) {
          addBtn.click();
        }
      });
    }
  }

  /**
   * Main flow: Extract metadata, fetch album art, then add to library
   */
  private async handleAddSong(
    youtubeInput: HTMLInputElement,
    noteInput: HTMLTextAreaElement | null,
  ): Promise<void> {
    if (this.isLoading) return;

    const youtubeLink = youtubeInput?.value?.trim() || "";
    const note = noteInput?.value?.trim() || "";

    if (!youtubeLink) {
      this.showStatus("Please enter a YouTube link", "error");
      return;
    }

    // Extract video ID first
    const youtubeId = extractYouTubeId(youtubeLink);
    if (!youtubeId) {
      this.showStatus("Invalid YouTube URL or ID", "error");
      return;
    }

    this.isLoading = true;
    const addBtn = document.getElementById(
      "vinyl-add-btn",
    ) as HTMLButtonElement;
    if (addBtn) addBtn.disabled = true;

    try {
      this.showStatus("📥 Fetching video information...", "loading");

      // Step 1: Fetch YouTube metadata
      const ytMetadata = await fetchYouTubeMetadata(youtubeId);
      if (!ytMetadata) {
        throw new Error("Could not fetch YouTube metadata");
      }

      this.showStatus("🔎 Extracting metadata...", "loading");

      // Step 2: Extract and enrich metadata (with user prompts if needed)
      const enrichedMetadata = await extractAndEnrichMetadata(
        youtubeId,
        ytMetadata.title,
      );

      if (!enrichedMetadata) {
        this.showStatus("Cancelled", "error");
        return;
      }

      this.showStatus("💾 Saving to your collection...", "loading");

      // Step 3: Add to backend (admin) or localStorage (visitor)
      let entry = null;

      if (this.config.isOwner && this.config.adminToken) {
        // Admin mode: Add to backend KV
        entry = await addToOwnerLibrary(
          this.config.apiUrl,
          youtubeId,
          enrichedMetadata.artistName,
          enrichedMetadata.songName,
          enrichedMetadata.imageUrl,
          note,
          this.config.adminToken,
          enrichedMetadata.genre,
          enrichedMetadata.releaseYear,
        );
      } else {
        // Visitor mode: Add to localStorage
        entry = addVisitorLink(
          youtubeLink,
          enrichedMetadata.artistName,
          enrichedMetadata.songName,
          enrichedMetadata.imageUrl,
          note,
        );
      }

      if (entry) {
        const location = this.config.isOwner
          ? "backend collection"
          : "your local collection";
        this.showStatus(`✅ Added to ${location}!`, "success");
        youtubeInput.value = "";
        if (noteInput) noteInput.value = "";

        // Dispatch event for other widgets to listen to
        window.dispatchEvent(new CustomEvent("vinyl-library-updated"));

        // Clear status message after 2 seconds
        setTimeout(() => {
          const statusEl = document.getElementById("vinyl-status");
          if (statusEl) statusEl.classList.remove("show");
        }, 2000);
      } else {
        this.showStatus("Failed to save song", "error");
      }
    } catch (error) {
      console.error("Error adding song:", error);
      this.showStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      this.isLoading = false;
      if (addBtn) addBtn.disabled = false;
    }
  }

  /**
   * Handle deleting an entry from the owner's library
   */
  private async handleDeleteEntry(entryId: string): Promise<void> {
    if (!confirm("Are you sure you want to delete this entry?")) {
      return;
    }

    try {
      const success = await deleteOwnerEntry(
        this.config.apiUrl,
        entryId,
        this.config.adminToken,
      );

      if (success) {
        // Remove from local cache
        this.ownerLibrary = this.ownerLibrary.filter((e) => e.id !== entryId);

        // Re-render the library
        this.renderOwnerLibrary();

        // Dispatch event for other widgets to listen to
        window.dispatchEvent(new CustomEvent("vinyl-library-updated"));

        console.log("✓ Entry deleted successfully");
      } else {
        alert("Failed to delete entry. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting entry:", error);
      alert("Error deleting entry. Please try again.");
    }
  }

  /**
   * Show status message
   */
  private showStatus(
    message: string,
    type: "success" | "error" | "loading",
  ): void {
    const statusEl = document.getElementById("vinyl-status");
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = `status-message show ${type}`;
  }

  /**
   * Get image URL with fallback handling
   */
  private getImageWithFallback(imageUrl: string | null): string {
    if (imageUrl) return imageUrl;
    // Default placeholder if no image
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3Ctext x="100" y="100" text-anchor="middle" dy=".3em" fill="%23999" font-size="20"%3ENo Image%3C/text%3E%3C/svg%3E';
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
