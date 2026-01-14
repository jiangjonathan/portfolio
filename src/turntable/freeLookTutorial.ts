export type FreeLookTutorialAction = "rotate" | "pan" | "zoom";

type FreeLookTutorialState = {
  completed: FreeLookTutorialAction[];
  dismissed: boolean;
};

const FREE_LOOK_TUTORIAL_STORAGE_KEY = "free-look-tutorial-state";
const FREE_LOOK_TUTORIAL_ACTIONS: Array<{
  action: FreeLookTutorialAction;
  text: string;
}> = [
  {
    action: "rotate",
    text: "- right click + drag to rotate the camera",
  },
  {
    action: "pan",
    text: "- middle mouse click + drag to pan the camera",
  },
  {
    action: "zoom",
    text: "- scroll to zoom the camera",
  },
];

const loadFreeLookTutorialState = (): FreeLookTutorialState => {
  try {
    const stored = localStorage.getItem(FREE_LOOK_TUTORIAL_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn("Failed to load free-look tutorial state:", error);
  }
  return { completed: [], dismissed: false };
};

const saveFreeLookTutorialState = (state: FreeLookTutorialState) => {
  try {
    localStorage.setItem(
      FREE_LOOK_TUTORIAL_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch (error) {
    console.warn("Failed to save free-look tutorial state:", error);
  }
};

export const createFreeLookTutorialController = (
  container: HTMLDivElement | null,
) => {
  let state: FreeLookTutorialState = loadFreeLookTutorialState();

  const render = () => {
    if (!container) {
      return;
    }
    const stepsHtml = FREE_LOOK_TUTORIAL_ACTIONS.map(({ action, text }) => {
      const completed = state.completed.includes(action);
      const className = completed ? "tutorial-step completed" : "tutorial-step";
      return `<div class="${className}" data-action="${action}">${text}</div>`;
    }).join("");
    container.innerHTML = `
      <style>
        #free-look-tutorial {
          position: relative;
        }
        #free-look-tutorial .tutorial-close-btn {
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
        #free-look-tutorial:hover .tutorial-close-btn {
          opacity: 1;
        }
        #free-look-tutorial .tutorial-close-btn:hover {
          color: #000;
        }
        #free-look-tutorial .tutorial-step {
          margin-bottom: 8px;
          opacity: 1;
          transition: opacity 0.3s, text-decoration 0.3s;
        }
        #free-look-tutorial .tutorial-step.completed {
          text-decoration: line-through;
          opacity: 0.5;
        }
        #free-look-tutorial .tutorial-step:last-child {
          margin-bottom: 0;
        }
      </style>
      <button class="tutorial-close-btn" id="free-look-tutorial-close">
        ×
      </button>
      ${stepsHtml}
    `;
    const closeBtn = container.querySelector(
      "#free-look-tutorial-close",
    ) as HTMLButtonElement | null;
    closeBtn?.addEventListener("click", () => {
      state.dismissed = true;
      saveFreeLookTutorialState(state);
      setVisible(false);
    });
  };

  const markAction = (action: FreeLookTutorialAction) => {
    if (state.completed.includes(action)) {
      return;
    }
    state.completed.push(action);
    saveFreeLookTutorialState(state);
    render();
  };

  const setVisible = (visible: boolean) => {
    if (!container) {
      return;
    }
    if (visible && !state.dismissed) {
      render();
      container.style.display = "block";
      requestAnimationFrame(() => {
        container.style.opacity = "1";
        container.style.pointerEvents = "auto";
      });
    } else {
      container.style.opacity = "0";
      container.style.pointerEvents = "none";
      setTimeout(() => {
        if (container.style.opacity === "0") {
          container.style.display = "none";
        }
      }, 450);
    }
  };

  const reset = () => {
    state = { completed: [], dismissed: false };
    saveFreeLookTutorialState(state);
    render();

    if (container) {
      container.style.display = "block";
      void container.offsetHeight;
      container.style.opacity = "0";
      container.style.pointerEvents = "auto";
      setTimeout(() => {
        container.style.opacity = "1";
      }, 10);
    }

    console.log("Free-look tutorial reset");
  };

  window.addEventListener("free-look-action", (event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail?.action) {
      return;
    }
    markAction(detail.action as FreeLookTutorialAction);
  });

  return {
    setVisible,
    reset,
    isDismissed: () => state.dismissed,
  };
};
