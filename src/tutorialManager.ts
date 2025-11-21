/**
 * Tutorial Manager
 * Manages the tutorial overlay and tracks user actions
 */

type TutorialAction =
  | "click-song"
  | "click-album-cover"
  | "drag-vinyl"
  | "start-player"
  | "drag-tonearm"
  | "toggle-fullscreen"
  | "press-add-button";

interface TutorialState {
  completed: TutorialAction[];
  dismissed: boolean;
}

export class TutorialManager {
  private container: HTMLElement;
  private closeBtn: HTMLElement | null = null;
  private state: TutorialState;
  private storageKey = "vinyl-tutorial-state";

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Tutorial container #${containerId} not found`);
    }
    this.container = container;
    this.state = this.loadState();
  }

  /**
   * Initialize the tutorial
   */
  init(): void {
    // Don't show tutorial if it was dismissed
    if (this.state.dismissed) {
      return;
    }

    this.render();
    this.attachEventListeners();
    this.show();
  }

  /**
   * Render the tutorial content
   */
  private render(): void {
    const instructions = [
      {
        action: "click-song" as TutorialAction,
        text: "- click on a song to focus it",
      },
      {
        action: "click-album-cover" as TutorialAction,
        text: "- click the album cover of the focused song to open the vinyl",
      },
      {
        action: "drag-vinyl" as TutorialAction,
        text: "- drag the vinyl near the turntable and let go",
      },
      {
        action: "start-player" as TutorialAction,
        text: "- click the start button or press [space] to start/stop the turntable",
      },
      {
        action: "drag-tonearm" as TutorialAction,
        text: "- drag the tonearm onto the vinyl to start playing / scrub media",
      },
      {
        action: "toggle-fullscreen" as TutorialAction,
        text: "- when player is active, [F] to toggle fullscreen",
      },
      {
        action: "press-add-button" as TutorialAction,
        text: "- press the + sign below to add a song",
      },
      { action: null, text: "enjoy" },
    ];

    const instructionsHtml = instructions
      .map(({ action, text }) => {
        const completed = action && this.state.completed.includes(action);
        const className = completed
          ? "tutorial-step completed"
          : "tutorial-step";
        return `<div class="${className}">${text}</div>`;
      })
      .join("");

    this.container.innerHTML = `
      <style>
        #vinyl-tutorial {
          position: relative;
        }

        #vinyl-tutorial .tutorial-close-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background: transparent;
          border: none;
          font-size: 1.2rem;
          cursor: pointer;
          color: #666;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s, color 0.2s;
          padding: 0;
          line-height: 1;
        }

        #vinyl-tutorial:hover .tutorial-close-btn {
          opacity: 1;
        }

        #vinyl-tutorial .tutorial-close-btn:hover {
          color: #000;
        }

        #vinyl-tutorial .tutorial-step {
          margin-bottom: 8px;
          opacity: 1;
          transition: opacity 0.3s, text-decoration 0.3s;
        }

        #vinyl-tutorial .tutorial-step.completed {
          text-decoration: line-through;
          opacity: 0.5;
        }

        #vinyl-tutorial .tutorial-step:last-child {
          margin-bottom: 0;
          font-style: italic;
        }
      </style>
      <button class="tutorial-close-btn" id="tutorial-close-btn">×</button>
      ${instructionsHtml}
    `;

    this.closeBtn = this.container.querySelector("#tutorial-close-btn");
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => {
        this.dismiss();
      });
    }

    // Listen for tutorial action events
    window.addEventListener("tutorial-action", ((event: CustomEvent) => {
      const action = event.detail?.action as TutorialAction;
      if (action) {
        this.markActionCompleted(action);
      }
    }) as EventListener);

    // Listen for specific events to track actions
    this.setupActionTracking();
  }

  /**
   * Setup tracking for various user actions
   */
  private setupActionTracking(): void {
    // Track clicking on a song (focus card shown)
    window.addEventListener("load-vinyl-song", () => {
      this.markActionCompleted("click-song");
    });

    // Track clicking on album cover (only when it activates, not deactivates)
    window.addEventListener("focus-cover-click", ((event: CustomEvent) => {
      // Only mark complete when the click activates (active: true), not when it deactivates
      if (event.detail?.active === true) {
        this.markActionCompleted("click-album-cover");
      }
    }) as EventListener);

    // Track vinyl drag (when vinyl is placed on turntable)
    window.addEventListener("focus-vinyl-turntable-state", ((
      event: CustomEvent,
    ) => {
      if (event.detail?.onTurntable) {
        this.markActionCompleted("drag-vinyl");
      }
    }) as EventListener);

    // Track start/stop button or spacebar
    document.addEventListener("keydown", (event) => {
      if (event.code === "Space" || event.key === " ") {
        const target = event.target as HTMLElement;
        const isTyping =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;
        if (!isTyping) {
          this.markActionCompleted("start-player");
        }
      }
      if (event.key === "f" || event.key === "F") {
        const target = event.target as HTMLElement;
        const isTyping =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;
        if (!isTyping) {
          this.markActionCompleted("toggle-fullscreen");
        }
      }
    });

    // Track tonearm dragging (we'll need to add this event to the turntable controller)
    window.addEventListener("tonearm-drag-start", () => {
      this.markActionCompleted("drag-tonearm");
    });
  }

  /**
   * Mark an action as completed
   */
  private markActionCompleted(action: TutorialAction): void {
    if (this.state.completed.includes(action)) {
      return;
    }

    this.state.completed.push(action);
    this.saveState();
    this.render();
    this.attachEventListeners();

    // Check if all actions are completed
    const allActions: TutorialAction[] = [
      "click-song",
      "click-album-cover",
      "drag-vinyl",
      "start-player",
      "drag-tonearm",
      "toggle-fullscreen",
      "press-add-button",
    ];

    const allCompleted = allActions.every((a) =>
      this.state.completed.includes(a),
    );

    if (allCompleted) {
      // Fade out and auto-dismiss after a short delay
      setTimeout(() => {
        this.container.style.transition = "opacity 1s ease-out";
        this.container.style.opacity = "0";

        // Actually dismiss after fade completes
        setTimeout(() => {
          this.dismiss();
        }, 1000);
      }, 2000);
    }
  }

  /**
   * Show the tutorial
   */
  private show(): void {
    this.container.style.display = "block";
  }

  /**
   * Dismiss the tutorial permanently
   */
  private dismiss(): void {
    this.container.style.display = "none";
    this.state.dismissed = true;
    this.saveState();
  }

  /**
   * Load state from localStorage
   */
  private loadState(): TutorialState {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.warn("Failed to load tutorial state:", error);
    }
    return { completed: [], dismissed: false };
  }

  /**
   * Save state to localStorage
   */
  private saveState(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.warn("Failed to save tutorial state:", error);
    }
  }

  /**
   * Reset the tutorial (for testing)
   */
  reset(): void {
    this.state = { completed: [], dismissed: false };
    this.saveState();
    this.render();
    this.attachEventListeners();
    this.show();
  }
}
