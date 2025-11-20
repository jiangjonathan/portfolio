import type { PortfolioPapersManager } from "./portfolioPapers";

export function createPapersDebugUI(
  _manager: PortfolioPapersManager,
  container: HTMLElement,
): void {
  const debugPanel = document.createElement("div");
  debugPanel.id = "papers-debug-panel";
  debugPanel.style.cssText = `
    position: fixed;
    top: 1rem;
    left: 1rem;
    width: 300px;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    border: 1px solid #66f;
    border-radius: 8px;
    font-family: monospace;
    font-size: 13px;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  `;

  const title = document.createElement("div");
  title.textContent = "Page Rotation Debug";
  title.style.cssText = `
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 0.5rem;
    color: #66f;
  `;

  const RAD_TO_DEG = 180 / Math.PI;

  // Create axis control helper
  const createAxisControl = (axis: string, color: string) => {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.5rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const label = document.createElement("label");
    label.textContent = `${axis}-Axis`;
    label.style.cssText = `
      font-weight: bold;
      color: ${color};
    `;

    const valueDisplay = document.createElement("div");
    valueDisplay.textContent = "0.00 rad (0°)";
    valueDisplay.style.cssText = `
      font-size: 11px;
      color: #aaa;
    `;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "-3.14159";
    slider.max = "3.14159";
    slider.step = "0.01";
    slider.value = "0";
    slider.style.cssText = `
      width: 100%;
      cursor: pointer;
      margin-top: 0.25rem;
    `;

    header.appendChild(label);
    header.appendChild(valueDisplay);
    container.appendChild(header);
    container.appendChild(slider);

    return { container, slider, valueDisplay };
  };

  const xControl = createAxisControl("X", "#ff5555");
  const yControl = createAxisControl("Y", "#55ff55");
  const zControl = createAxisControl("Z", "#5555ff");

  const resetButton = document.createElement("button");
  resetButton.textContent = "Reset All to 0";
  resetButton.style.cssText = `
    padding: 8px 12px;
    background: rgba(100, 100, 255, 0.3);
    color: #fff;
    border: 1px solid #66f;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    transition: background 0.15s;
    margin-top: 0.5rem;
  `;
  resetButton.onmouseover = () => {
    resetButton.style.background = "rgba(100, 100, 255, 0.5)";
  };
  resetButton.onmouseout = () => {
    resetButton.style.background = "rgba(100, 100, 255, 0.3)";
  };

  const updateDisplay = () => {
    const xRad = parseFloat(xControl.slider.value);
    const yRad = parseFloat(yControl.slider.value);
    const zRad = parseFloat(zControl.slider.value);

    const xDeg = xRad * RAD_TO_DEG;
    const yDeg = yRad * RAD_TO_DEG;
    const zDeg = zRad * RAD_TO_DEG;

    xControl.valueDisplay.textContent = `${xRad.toFixed(2)} rad (${xDeg.toFixed(0)}°)`;
    yControl.valueDisplay.textContent = `${yRad.toFixed(2)} rad (${yDeg.toFixed(0)}°)`;
    zControl.valueDisplay.textContent = `${zRad.toFixed(2)} rad (${zDeg.toFixed(0)}°)`;

    // Debug rotation control temporarily disabled
    // const currentPaperId = manager.getCurrentPaperId();
    // if (currentPaperId) {
    //   manager.setPageRotation(currentPaperId, xRad, yRad, zRad);
    // }
  };

  xControl.slider.addEventListener("input", updateDisplay);
  yControl.slider.addEventListener("input", updateDisplay);
  zControl.slider.addEventListener("input", updateDisplay);

  resetButton.addEventListener("click", () => {
    xControl.slider.value = "0";
    yControl.slider.value = "0";
    zControl.slider.value = "0";
    updateDisplay();
  });

  debugPanel.appendChild(title);
  debugPanel.appendChild(xControl.container);
  debugPanel.appendChild(yControl.container);
  debugPanel.appendChild(zControl.container);
  debugPanel.appendChild(resetButton);

  container.appendChild(debugPanel);

  // Initial update
  updateDisplay();
}
