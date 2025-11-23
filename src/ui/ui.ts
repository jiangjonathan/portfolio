export function createFpsDisplay(): {
  container: HTMLDivElement;
  fps: HTMLSpanElement;
} {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "absolute",
    top: "1rem",
    right: "1rem",
    padding: "0.35rem 0.9rem",
    borderRadius: "999px",
    background: "rgba(255, 255, 255, 0.85)",
    border: "1px solid #d0d0d0",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.8rem",
    fontWeight: "600",
    zIndex: "10",
  });

  const label = document.createElement("span");
  label.textContent = "FPS";

  const fps = document.createElement("span");
  fps.textContent = "--";

  container.append(label, fps);

  return { container, fps };
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

// label rotation controls removed per updated design
