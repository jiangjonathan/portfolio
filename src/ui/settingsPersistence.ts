type SettingsPersistenceDeps = {
  coloredVinylsCheckbox: HTMLInputElement;
  sfxCheckbox: HTMLInputElement;
  songCommentsCheckbox: HTMLInputElement;
  cameraModeSelect: HTMLInputElement;
  onColoredVinylsChange: (enabled: boolean) => void;
  onSfxChange: (enabled: boolean) => void;
  onSongCommentsChange: (enabled: boolean) => void;
  onCameraModeChange: (mode: string) => void;
};

type SettingsState = {
  coloredVinylsEnabled?: boolean;
  sfxEnabled?: boolean;
  songCommentsEnabled?: boolean;
  cameraMode?: string;
};

const STORAGE_KEY = "vinylSettings";

const loadSettings = (): SettingsState => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {};
    }
    const parsed = JSON.parse(stored) as SettingsState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("[settingsPersistence] Failed to load settings:", error);
    return {};
  }
};

const saveSettings = (state: SettingsState) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[settingsPersistence] Failed to save settings:", error);
  }
};

export const setupSettingsPersistence = (deps: SettingsPersistenceDeps) => {
  const state: SettingsState = loadSettings();
  let isInitializing = true;

  if (typeof state.coloredVinylsEnabled === "boolean") {
    deps.coloredVinylsCheckbox.checked = state.coloredVinylsEnabled;
  }
  if (typeof state.sfxEnabled === "boolean") {
    deps.sfxCheckbox.checked = state.sfxEnabled;
  }
  if (typeof state.songCommentsEnabled === "boolean") {
    deps.songCommentsCheckbox.checked = state.songCommentsEnabled;
  }
  if (typeof state.cameraMode === "string") {
    deps.cameraModeSelect.value = state.cameraMode;
  }

  deps.coloredVinylsCheckbox.addEventListener("change", () => {
    const enabled = deps.coloredVinylsCheckbox.checked;
    deps.onColoredVinylsChange(enabled);
    if (!isInitializing) {
      state.coloredVinylsEnabled = enabled;
      saveSettings(state);
    }
  });

  deps.sfxCheckbox.addEventListener("change", () => {
    const enabled = deps.sfxCheckbox.checked;
    deps.onSfxChange(enabled);
    if (!isInitializing) {
      state.sfxEnabled = enabled;
      saveSettings(state);
    }
  });

  deps.songCommentsCheckbox.addEventListener("change", () => {
    const enabled = deps.songCommentsCheckbox.checked;
    deps.onSongCommentsChange(enabled);
    if (!isInitializing) {
      state.songCommentsEnabled = enabled;
      saveSettings(state);
    }
  });

  deps.cameraModeSelect.addEventListener("change", () => {
    const mode = deps.cameraModeSelect.value;
    deps.onCameraModeChange(mode);
    if (!isInitializing) {
      state.cameraMode = mode;
      saveSettings(state);
    }
  });

  deps.coloredVinylsCheckbox.dispatchEvent(
    new Event("change", { bubbles: true }),
  );
  deps.sfxCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
  deps.songCommentsCheckbox.dispatchEvent(
    new Event("change", { bubbles: true }),
  );
  deps.cameraModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  isInitializing = false;
};
