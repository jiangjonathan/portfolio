import type { CameraRig } from "./cameraRig";
import type { ScenePage } from "./pageNavigation";
import { CAMERA_ORBIT_SENSITIVITY, PAN_SENSITIVITY } from "./config";

export interface CameraOrbitState {
  isOrbiting: boolean;
  pointerId: number;
  lastX: number;
  lastY: number;
  mode: ScenePage | null;
}

export interface CameraPanState {
  isPanning: boolean;
  pointerId: number;
  lastX: number;
  lastY: number;
}

export class CameraControlsManager {
  private orbitState: CameraOrbitState = {
    isOrbiting: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
    mode: null,
  };

  private panState: CameraPanState = {
    isPanning: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
  };

  private cameraRig: CameraRig;
  private canvas: HTMLCanvasElement;
  private getActivePage: () => ScenePage;
  private isPageTransitionActive: () => boolean;

  constructor(
    cameraRig: CameraRig,
    canvas: HTMLCanvasElement,
    getActivePage: () => ScenePage,
    isPageTransitionActive: () => boolean,
  ) {
    this.cameraRig = cameraRig;
    this.canvas = canvas;
    this.getActivePage = getActivePage;
    this.isPageTransitionActive = isPageTransitionActive;
  }

  startOrbit(event: PointerEvent): void {
    const activePage = this.getActivePage();
    if (
      (activePage !== "turntable" && activePage !== "home") ||
      this.isPageTransitionActive()
    ) {
      return;
    }
    this.orbitState.isOrbiting = true;
    this.orbitState.pointerId = event.pointerId;
    this.orbitState.lastX = event.clientX;
    this.orbitState.lastY = event.clientY;
    this.orbitState.mode = activePage;

    if (activePage === "turntable") {
      this.cameraRig.saveRotationState();
    }

    this.canvas.setPointerCapture(event.pointerId);
  }

  handleOrbitMove(event: PointerEvent): boolean {
    const activePage = this.getActivePage();
    if (
      (activePage !== "turntable" && activePage !== "home") ||
      this.isPageTransitionActive() ||
      !this.orbitState.isOrbiting ||
      event.pointerId !== this.orbitState.pointerId
    ) {
      return false;
    }
    const deltaX = event.clientX - this.orbitState.lastX;
    const deltaY = event.clientY - this.orbitState.lastY;
    this.orbitState.lastX = event.clientX;
    this.orbitState.lastY = event.clientY;
    const allowPolar = this.orbitState.mode === "turntable";
    this.cameraRig.orbit(
      deltaX * CAMERA_ORBIT_SENSITIVITY,
      allowPolar ? deltaY * CAMERA_ORBIT_SENSITIVITY : 0,
    );
    return true;
  }

  endOrbit(event: PointerEvent): void {
    if (
      !this.orbitState.isOrbiting ||
      event.pointerId !== this.orbitState.pointerId
    ) {
      return;
    }
    this.orbitState.isOrbiting = false;
    this.orbitState.pointerId = -1;

    if (this.orbitState.mode === "turntable") {
      this.cameraRig.restoreRotationState();
    }

    this.orbitState.mode = null;

    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignore fallback
    }
  }

  startPan(event: PointerEvent): void {
    const activePage = this.getActivePage();
    if (activePage !== "turntable" || this.isPageTransitionActive()) {
      return;
    }
    this.panState.isPanning = true;
    this.panState.pointerId = event.pointerId;
    this.panState.lastX = event.clientX;
    this.panState.lastY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  }

  handlePanMove(event: PointerEvent): boolean {
    const activePage = this.getActivePage();
    if (
      activePage !== "turntable" ||
      this.isPageTransitionActive() ||
      !this.panState.isPanning ||
      event.pointerId !== this.panState.pointerId
    ) {
      return false;
    }
    const deltaX = event.clientX - this.panState.lastX;
    const deltaY = event.clientY - this.panState.lastY;
    this.panState.lastX = event.clientX;
    this.panState.lastY = event.clientY;

    const zoomScale = 1 / this.cameraRig.getZoomFactor();
    this.cameraRig.pan(
      -deltaX * PAN_SENSITIVITY * zoomScale,
      deltaY * PAN_SENSITIVITY * zoomScale,
    );
    return true;
  }

  endPan(event: PointerEvent): void {
    if (
      !this.panState.isPanning ||
      event.pointerId !== this.panState.pointerId
    ) {
      return;
    }
    this.panState.isPanning = false;
    this.panState.pointerId = -1;
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignore fallback
    }
  }
}
