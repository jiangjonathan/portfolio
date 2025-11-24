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

  // Animation state
  private isAnimating = false;
  private isAnimatingViewDirection = false;
  private animationStartTarget = new Vector3();
  private animationEndTarget = new Vector3();
  private animationStartAzimuth = 0;
  private animationEndAzimuth = 0;
  private animationStartPolar = 0;
  private animationEndPolar = 0;
  private animationProgress = 0;
  private animationDuration = 0.6; // seconds
  private animationCompleteCallbacks: Array<() => void> = [];

  // Rotation memory for animated return
  private savedAzimuth: number | null = null;
  private savedPolar: number | null = null;
  private savedTarget = new Vector3();

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

  setViewDirection(direction: Vector3, animate = false) {
    if (animate) {
      this.animateViewDirection(direction);
    } else {
      this.frameDirection.copy(direction).normalize();
      this.updateOrbitFromDirection();
      this.updateCameraPosition();
    }
  }

  private animateViewDirection(direction: Vector3) {
    // Store current and target orbit angles for animation
    const targetDirection = new Vector3().copy(direction).normalize();
    const targetY = Math.max(-1, Math.min(1, targetDirection.y));
    const targetPolar = Math.asin(targetY);
    const targetAzimuth = Math.atan2(targetDirection.x, targetDirection.z);

    // Start animation
    this.isAnimating = true;
    this.isAnimatingViewDirection = true;
    this.animationProgress = 0;
    this.animationStartAzimuth = this.orbitAzimuth;
    this.animationStartPolar = this.orbitPolar;
    this.animationEndAzimuth = targetAzimuth;
    this.animationEndPolar = targetPolar;
  }

  setZoomFactor(factor: number) {
    this.zoomFactor = Math.max(0.2, Math.min(5, factor));
    this.updateCameraPosition();
  }

  getZoomFactor() {
    return this.zoomFactor;
  }

  getCameraDistance() {
    const zoomScalar = 1 / this.zoomFactor;
    return this.fitDistance * this.frameOffset * zoomScalar;
  }

  setCameraDistance(distance: number) {
    if (distance <= 0) {
      return;
    }
    const zoomScalar = 1 / this.zoomFactor;
    if (zoomScalar <= 0 || this.fitDistance <= 0) {
      return;
    }
    this.frameOffset = Math.max(0.01, distance / zoomScalar / this.fitDistance);
    this.updateCameraPosition();
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

  pan(deltaX: number, deltaY: number) {
    // Calculate pan vectors based on camera orientation
    const right = new Vector3();
    const up = new Vector3(0, 1, 0);

    // Get the camera's right vector (perpendicular to look direction and up)
    right
      .crossVectors(this.camera.getWorldDirection(new Vector3()), up)
      .normalize();

    // Recalculate up to be perpendicular to both direction and right
    up.crossVectors(
      right,
      this.camera.getWorldDirection(new Vector3()),
    ).normalize();

    // Apply pan translation to target
    right.multiplyScalar(deltaX);
    up.multiplyScalar(deltaY);

    this.target.add(right).add(up);
    this.updateCameraPosition();
  }

  getOrbitAngles() {
    return { azimuth: this.orbitAzimuth, polar: this.orbitPolar };
  }

  /**
   * Set polar angle with smooth animation
   */
  setPolarAngle(targetPolarDegrees: number, animate = true) {
    const targetPolarRadians = (targetPolarDegrees * Math.PI) / 180;

    if (animate) {
      // Check if already at target angle (within small threshold)
      const angleDiff = Math.abs(this.orbitPolar - targetPolarRadians);
      if (angleDiff < 0.001) {
        // Already at target angle, immediately notify completion
        this.notifyAnimationComplete();
      } else {
        this.isAnimating = true;
        this.isAnimatingViewDirection = true;
        this.animationProgress = 0;
        this.animationStartAzimuth = this.orbitAzimuth;
        this.animationStartPolar = this.orbitPolar;
        this.animationEndAzimuth = this.orbitAzimuth; // Keep azimuth the same
        this.animationEndPolar = targetPolarRadians;
      }
    } else {
      this.orbitPolar = targetPolarRadians;
      this.updateDirectionFromOrbit();
      this.updateCameraPosition();
      this.notifyAnimationComplete();
    }
  }

  /**
   * Save current rotation and target position before user starts rotating
   */
  saveRotationState() {
    this.savedAzimuth = this.orbitAzimuth;
    this.savedPolar = this.orbitPolar;
    this.savedTarget.copy(this.target);
    console.log(
      `[CameraRig] Saved state: azimuth=${this.savedAzimuth}, polar=${this.savedPolar}, target=(${this.savedTarget.x.toFixed(2)}, ${this.savedTarget.y.toFixed(2)}, ${this.savedTarget.z.toFixed(2)})`,
    );
  }

  /**
   * Restore to saved rotation and target position with animation
   */
  restoreRotationState() {
    if (this.savedAzimuth === null || this.savedPolar === null) {
      console.warn("[CameraRig] No saved rotation state to restore");
      return;
    }

    console.log(
      `[CameraRig] Restoring to saved state: azimuth=${this.savedAzimuth}, polar=${this.savedPolar}, target=(${this.savedTarget.x.toFixed(2)}, ${this.savedTarget.y.toFixed(2)}, ${this.savedTarget.z.toFixed(2)})`,
    );

    // Start animation to the saved state (both position and rotation)
    this.isAnimating = true;
    this.isAnimatingViewDirection = true;
    this.animationProgress = 0;
    this.animationStartAzimuth = this.orbitAzimuth;
    this.animationStartPolar = this.orbitPolar;
    this.animationEndAzimuth = this.savedAzimuth;
    this.animationEndPolar = this.savedPolar;
    this.animationStartTarget.copy(this.target);
    this.animationEndTarget.copy(this.savedTarget);
  }

  /**
   * Clear the saved rotation state
   */
  clearRotationState() {
    this.savedAzimuth = null;
    this.savedPolar = null;
  }

  getTarget() {
    return this.target;
  }

  setLookTarget(newTarget: Vector3, animate = true) {
    if (animate) {
      // Check if already at target (within small threshold)
      const distance = this.target.distanceTo(newTarget);
      if (distance < 0.001) {
        // Already at target, immediately notify completion
        this.notifyAnimationComplete();
      } else {
        this.animateTo(newTarget);
      }
    } else {
      this.target.copy(newTarget);
      this.updateCameraPosition();
    }
  }

  private animateTo(newTarget: Vector3) {
    this.isAnimating = true;
    this.animationProgress = 0;
    this.animationStartTarget.copy(this.target);
    this.animationEndTarget.copy(newTarget);
  }

  updateAnimation(deltaTime: number) {
    if (!this.isAnimating) {
      return;
    }

    this.animationProgress += deltaTime / this.animationDuration;

    if (this.animationProgress >= 1) {
      this.animationProgress = 1;
      this.isAnimating = false;
    }

    // Easing function: ease-out cubic for smooth deceleration
    const easeProgress = 1 - Math.pow(1 - this.animationProgress, 3);

    // Interpolate target position
    this.target.lerpVectors(
      this.animationStartTarget,
      this.animationEndTarget,
      easeProgress,
    );

    // Interpolate view direction (orbit angles) only if animating view direction
    if (this.isAnimatingViewDirection) {
      this.orbitAzimuth =
        this.animationStartAzimuth +
        (this.animationEndAzimuth - this.animationStartAzimuth) * easeProgress;
      this.orbitPolar =
        this.animationStartPolar +
        (this.animationEndPolar - this.animationStartPolar) * easeProgress;

      // Update frame direction from interpolated angles
      this.updateDirectionFromOrbit();
    }

    this.updateCameraPosition();

    // Clear view direction animation flag when done
    if (this.animationProgress >= 1) {
      this.isAnimatingViewDirection = false;
      this.notifyAnimationComplete();
    }
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

  private notifyAnimationComplete() {
    const callbacks = [...this.animationCompleteCallbacks];
    this.animationCompleteCallbacks = []; // Clear callbacks after copying
    callbacks.forEach((cb) => cb());
  }

  onAnimationComplete(callback: () => void) {
    this.animationCompleteCallbacks.push(callback);
  }
}
