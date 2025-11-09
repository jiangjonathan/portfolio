import { clampValue } from "./utils";

export function createZoomControls(): {
  container: HTMLDivElement;
  slider: HTMLInputElement;
  fps: HTMLSpanElement;
} {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "absolute",
    top: "1rem",
    right: "1rem",
    padding: "0.35rem 0.75rem",
    borderRadius: "999px",
    background: "rgba(255, 255, 255, 0.8)",
    border: "1px solid #d0d0d0",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    zIndex: "10",
  });

  const label = document.createElement("span");
  label.textContent = "Zoom";
  label.style.fontSize = "0.8rem";
  label.style.fontWeight = "600";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0.7";
  slider.max = "5";
  slider.step = "0.05";
  slider.value = "1.8";
  slider.style.width = "110px";

  const fps = document.createElement("span");
  fps.textContent = "-- fps";
  fps.style.fontSize = "0.8rem";
  fps.style.fontWeight = "600";
  fps.style.paddingLeft = "0.35rem";
  fps.style.borderLeft = "1px solid #d0d0d0";

  container.append(label, slider, fps);
  return { container, slider, fps };
}

export function createTonearmRotationDisplay(): {
  container: HTMLDivElement;
  setValue: (degrees: number | null) => void;
} {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "absolute",
    top: "1rem",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "0.35rem 0.75rem",
    borderRadius: "999px",
    background: "rgba(255, 255, 255, 0.8)",
    border: "1px solid #d0d0d0",
    display: "flex",
    gap: "0.35rem",
    fontSize: "0.8rem",
    fontWeight: "600",
    zIndex: "10",
  });

  const label = document.createElement("span");
  label.textContent = "Tonearm Yaw";

  const value = document.createElement("span");
  value.textContent = "--°";

  container.append(label, value);
  return {
    container,
    setValue: (degrees: number | null) => {
      value.textContent = degrees === null ? "--°" : `${degrees.toFixed(1)}°`;
    },
  };
}

export function createCameraInfoDisplay() {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "absolute",
    bottom: "1rem",
    right: "1rem",
    padding: "0.4rem 0.75rem",
    borderRadius: "0.75rem",
    background: "rgba(255, 255, 255, 0.85)",
    border: "1px solid #d0d0d0",
    fontSize: "0.8rem",
    fontWeight: "600",
    display: "flex",
    gap: "0.75rem",
    zIndex: "10",
  });

  const yawSpan = document.createElement("span");
  const pitchSpan = document.createElement("span");
  yawSpan.textContent = "Yaw --°";
  pitchSpan.textContent = "Pitch --°";
  container.append(yawSpan, pitchSpan);

  return {
    container,
    setValue: (yawDegrees: number, pitchDegrees: number) => {
      yawSpan.textContent = `Yaw ${yawDegrees.toFixed(1)}°`;
      pitchSpan.textContent = `Pitch ${pitchDegrees.toFixed(1)}°`;
    },
  };
}

export function createVinylRotationControls(
  onChange: (value: number) => void,
): {
  container: HTMLDivElement;
  slider: HTMLInputElement;
  numberInput: HTMLInputElement;
  setEnabled: (enabled: boolean) => void;
  setValue: (value: number) => void;
} {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "absolute",
    bottom: "1rem",
    left: "1rem",
    padding: "0.6rem 0.75rem",
    borderRadius: "0.75rem",
    background: "rgba(255, 255, 255, 0.85)",
    border: "1px solid #d0d0d0",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    zIndex: "10",
  });

  const label = document.createElement("span");
  label.textContent = "Label Rotation";
  label.style.fontSize = "0.8rem";
  label.style.fontWeight = "600";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "-180";
  slider.max = "180";
  slider.step = "1";
  slider.value = "0";
  slider.disabled = true;
  slider.style.width = "120px";

  const numberInput = document.createElement("input");
  numberInput.type = "number";
  numberInput.min = "-180";
  numberInput.max = "180";
  numberInput.step = "0.1";
  numberInput.value = "0";
  numberInput.disabled = true;
  numberInput.style.width = "65px";

  slider.addEventListener("input", () => {
    const value = parseFloat(slider.value);
    numberInput.value = slider.value;
    onChange(value);
  });

  numberInput.addEventListener("input", () => {
    const value = parseFloat(numberInput.value);
    if (Number.isNaN(value)) {
      return;
    }
    slider.value = clampValue(value, -180, 180).toString();
    onChange(parseFloat(slider.value));
  });

  container.append(label, slider, numberInput);

  return {
    container,
    slider,
    numberInput,
    setEnabled: (enabled: boolean) => {
      slider.disabled = numberInput.disabled = !enabled;
    },
    setValue: (value: number) => {
      const clamped = clampValue(value, -180, 180);
      slider.value = clamped.toString();
      numberInput.value = clamped.toString();
    },
  };
}

