import { Box3, Object3D, PerspectiveCamera, Vector3 } from "three";

export class CameraRig {
  camera: PerspectiveCamera;
  private target = new Vector3(0, 0.15, 0);
  // Default camera orientation (yaw = 0°, pitch = 45° downward).
  // Edit this vector to change the startup view.
  private frameDirection = new Vector3(
    0,
    Math.sin((45 * Math.PI) / 180),
    Math.cos((45 * Math.PI) / 180),
  ).normalize();
  private orbitAzimuth = 0;
  private orbitPolar = 0;
  private boundingBox = new Box3();
  private size = new Vector3();
  private center = new Vector3();
  private desiredPosition = new Vector3();
  private framedObject: Object3D | null = null;
  private frameOffset = 1.4;
  private zoomFactor = 1.35;
  private fitDistance = 4;

  constructor() {
    this.camera = new PerspectiveCamera(45, 1, 0.01, 500);
    this.updateOrbitFromDirection();
    this.updateCameraPosition();
  }

  handleResize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  frameObject(object: Object3D, offset = 1.4) {
    this.framedObject = object;
    this.frameOffset = offset;
    this.updateFitMetrics();
    this.updateCameraPosition();
  }

  setViewDirection(direction: Vector3) {
    this.frameDirection.copy(direction).normalize();
    this.updateOrbitFromDirection();
    this.updateCameraPosition();
  }

  setZoomFactor(factor: number) {
    this.zoomFactor = Math.max(0.2, Math.min(5, factor));
    this.updateCameraPosition();
  }

  getZoomFactor() {
    return this.zoomFactor;
  }

  refit() {
    if (!this.framedObject) {
      return;
    }
    this.updateFitMetrics();
    this.updateCameraPosition();
  }

  orbit(deltaAzimuth: number, deltaPolar: number) {
    const polarLimit = Math.PI / 2 - 0.05;
    this.orbitAzimuth += deltaAzimuth;
    this.orbitPolar = Math.max(
      -polarLimit,
      Math.min(polarLimit, this.orbitPolar + deltaPolar),
    );
    this.updateDirectionFromOrbit();
    this.updateCameraPosition();
  }

  getOrbitAngles() {
    return { azimuth: this.orbitAzimuth, polar: this.orbitPolar };
  }

  setLookTarget(newTarget: Vector3) {
    this.target.copy(newTarget);
    this.updateCameraPosition();
  }

  private updateFitMetrics() {
    if (!this.framedObject) {
      return;
    }

    this.boundingBox.setFromObject(this.framedObject);
    this.boundingBox.getSize(this.size);
    this.boundingBox.getCenter(this.center);

    const maxDim = Math.max(this.size.x, this.size.y, this.size.z) || 1;
    const fov = (this.camera.fov * Math.PI) / 180;
    this.fitDistance = maxDim / (2 * Math.tan(fov / 2));
    this.target.copy(this.center);
  }

  private updateCameraPosition() {
    const zoomScalar = 1 / this.zoomFactor;
    this.desiredPosition
      .copy(this.frameDirection)
      .multiplyScalar(this.fitDistance * this.frameOffset * zoomScalar)
      .add(this.target);

    this.camera.position.copy(this.desiredPosition);
    this.camera.lookAt(this.target);
  }

  private updateOrbitFromDirection() {
    const y = Math.max(-1, Math.min(1, this.frameDirection.y));
    this.orbitPolar = Math.asin(y);
    this.orbitAzimuth = Math.atan2(
      this.frameDirection.x,
      this.frameDirection.z,
    );
  }

  private updateDirectionFromOrbit() {
    const cosPolar = Math.cos(this.orbitPolar);
    this.frameDirection
      .set(
        Math.sin(this.orbitAzimuth) * cosPolar,
        Math.sin(this.orbitPolar),
        Math.cos(this.orbitAzimuth) * cosPolar,
      )
      .normalize();
  }
}
