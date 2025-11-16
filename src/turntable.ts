import type { Camera, Object3D } from "three";
import { Raycaster, Vector2 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mediaTimeToYaw } from "./media";
import { clampValue, updatePointer } from "./utils";

export interface TurntableControllerOptions {
  camera: Camera;
  canvas: HTMLCanvasElement;
  getZoomFactor: () => number;
  onScrub?: (seconds: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onRateChange?: (rate: number) => void;
}

export class TurntableController {
  private camera: Camera;
  private canvas: HTMLCanvasElement;
  private getZoomFactor: () => number;
  private onScrub?: (seconds: number) => void;
  private onPlay?: () => void;
  private onPause?: () => void;
  private onRateChange?: (rate: number) => void;

  private raycaster = new Raycaster();
  private pointerNDC = new Vector2();

  private platterMesh: Object3D | null = null;
  private pulleyMesh: Object3D | null = null;
  private startStopButton: Object3D | null = null;
  private startStopRestY = 0;
  private startStopOffset = 0;
  private startStopTarget = 0;
  private speedSlide: Object3D | null = null;
  private speedSlideBaseX = 0;
  private speedSlideBaseY = 0;
  private speedSlideBaseZ = 0;
  private speedSlideOffset = 0;
  private speedSlideTarget = 0;

  private tonearmMount: Object3D | null = null;
  private tonearm: Object3D | null = null;

  // state
  private isDraggingTonearm = false;
  private tonearmDragLastX = 0;
  private tonearmHomeRotation = 0;
  private tonearmBaseRotation = 0;
  private tonearmRestPitch = 0;
  private tonearmPitchDownDir = -1;
  private isHoveringTonearm = false;
  private tonearmPlayTime = 0;
  private playingSound = false;
  private startOn = false;
  private autoReturn = false;
  private vinylPresent = true;

  private currentRpm = 33 + 1 / 3;
  private readonly RPM_SLOW = 33 + 1 / 3;
  private readonly RPM_FAST = 45;
  private readonly PULLEY_RATIO = 31.1 / 6.12;
  private angularSpeed = this.rpmToAngularSpeed(this.currentRpm);
  private platterAngularVelocity = 0;
  private readonly VELOCITY_RESPONSE = 0.08;
  private lastAngularStep = 0;

  // constants copied from main
  private readonly TONEARM_MIN_YAW = (-33.33 * Math.PI) / 180;
  private readonly TONEARM_MAX_YAW = (10 * Math.PI) / 180;
  private readonly TONEARM_PLAY_YAW_THRESHOLD = (-15 * Math.PI) / 180;
  private readonly TONEARM_DRAG_SENSITIVITY = 0.012;
  private readonly TONEARM_RETURN_RATE = 0.04;
  private readonly TONEARM_PLAY_LERP = 0.02;
  private readonly TONEARM_PLAY_EPSILON = 0.01;
  private readonly TONEARM_HOVER_OFFSET = 0.06;
  private readonly TONEARM_YAW_WOBBLE = 0.004;
  private readonly TONEARM_PITCH_WOBBLE = 0.005;
  private readonly TONEARM_WOBBLE_SPEED = 4;
  private readonly TONEARM_PLAY_OFFSET = 0.066; // 0.066 Default
  private readonly SPEED_SLIDE_TRAVEL = -2.1; // -2.1 Default
  private readonly START_STOP_PRESS = -0.175;
  private mediaDuration = 0;
  private mediaPlaybackRate = 1;
  private mediaCurrentTime = 0;

  constructor(turntable: Object3D, options: TurntableControllerOptions) {
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.getZoomFactor = options.getZoomFactor;
    this.onScrub = options.onScrub;
    this.onPlay = options.onPlay;
    this.onPause = options.onPause;
    this.onRateChange = options.onRateChange;

    this.platterMesh = turntable.getObjectByName("Platter") ?? null;
    this.pulleyMesh = turntable.getObjectByName("Pulley") ?? null;
    this.startStopButton = turntable.getObjectByName("button") ?? null;
    this.speedSlide = turntable.getObjectByName("speedslide") ?? null;
    this.tonearmMount = turntable.getObjectByName("Mount") ?? null;
    this.tonearm =
      (this.tonearmMount?.getObjectByName("Tonearm") as Object3D) ??
      turntable.getObjectByName("Tonearm") ??
      turntable.getObjectByName("Tonearm Tip") ??
      null;

    if (this.startStopButton) {
      this.startStopRestY = this.startStopButton.position.y;
    }
    if (this.speedSlide) {
      this.speedSlideBaseX = this.speedSlide.position.x;
      this.speedSlideBaseY = this.speedSlide.position.y;
      this.speedSlideBaseZ = this.speedSlide.position.z;
    }
    if (this.tonearmMount) {
      this.tonearmBaseRotation = clampValue(
        this.tonearmMount.rotation.y,
        this.TONEARM_MIN_YAW,
        this.TONEARM_MAX_YAW,
      );
      this.tonearmHomeRotation = this.tonearmBaseRotation;
    }
    if (this.tonearm) {
      this.tonearmRestPitch = this.tonearm.rotation.x;
      this.tonearmPitchDownDir = this.tonearmRestPitch >= 0 ? -1 : 1;
    }
  }

  setMediaDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 1) {
      return;
    }
    this.mediaDuration = seconds;
    this.mediaCurrentTime = clampValue(
      this.mediaCurrentTime,
      0,
      this.mediaDuration,
    );
  }

  handlePointerDown(e: PointerEvent): boolean {
    if (!updatePointer(e, this.pointerNDC, this.canvas)) return false;
    // Start/Stop
    if (this.hit(this.startStopButton)) {
      this.toggleStart();
      this.pressStartStop();
      return true;
    }
    // Speed slide
    if (this.hit(this.speedSlide)) {
      this.toggleSpeed();
      return true;
    }
    // Tonearm
    if (this.hit(this.tonearm)) {
      if (this.playingSound) {
        this.playingSound = false;
        this.onPause?.();
      }
      this.isDraggingTonearm = true;
      this.autoReturn = false;
      this.tonearmDragLastX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
      return true;
    }
    return false;
  }

  handlePointerMove(e: PointerEvent): boolean {
    updatePointer(e, this.pointerNDC, this.canvas);
    if (this.isDraggingTonearm) {
      const dx = e.clientX - this.tonearmDragLastX;
      this.tonearmDragLastX = e.clientX;
      const sens = this.TONEARM_DRAG_SENSITIVITY / this.getZoomFactor();
      this.tonearmBaseRotation = clampValue(
        this.tonearmBaseRotation + dx * sens,
        this.TONEARM_MIN_YAW,
        this.TONEARM_MAX_YAW,
      );
      this.scrubVideoToCurrentYaw();
      return true;
    }
    // hover state
    this.isHoveringTonearm = this.hit(this.tonearm);
    return false;
  }

  handlePointerUp(e: PointerEvent): void {
    if (!this.isDraggingTonearm) return;
    this.isDraggingTonearm = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {}
    // Snap to sweet spot if close (−15° to −5° → snap to −15)
    const max = (-5 * Math.PI) / 180;
    const min = this.TONEARM_PLAY_YAW_THRESHOLD; // −15°
    if (this.tonearmBaseRotation <= max && this.tonearmBaseRotation >= min) {
      this.tonearmBaseRotation = min - 0.0005;
    }
    if (this.isTonearmOverVinyl()) {
      this.scrubVideoToCurrentYaw();
    }
  }

  update(delta: number) {
    this.tonearmPlayTime += delta;

    // Spin-up / spin-down
    const targetVel = this.startOn ? -this.angularSpeed : 0;
    this.platterAngularVelocity +=
      (targetVel - this.platterAngularVelocity) * this.VELOCITY_RESPONSE;
    this.lastAngularStep = this.platterAngularVelocity * delta;
    this.platterMesh?.rotateY(this.lastAngularStep);
    this.pulleyMesh?.rotateY(this.lastAngularStep * this.PULLEY_RATIO);

    // Start/Stop button easing
    this.startStopOffset +=
      (this.startStopTarget - this.startStopOffset) * 0.25;
    if (this.startStopButton) {
      this.startStopButton.position.y =
        this.startStopRestY + this.startStopOffset;
      this.startStopButton.updateMatrixWorld(true);
    }

    // Speed slide easing
    this.speedSlideOffset +=
      (this.speedSlideTarget - this.speedSlideOffset) * 0.2;
    if (this.speedSlide) {
      this.speedSlide.position.set(
        this.speedSlideBaseX,
        this.speedSlideBaseY,
        this.speedSlideBaseZ + this.speedSlideOffset,
      );
      this.speedSlide.updateMatrixWorld(true);
    }

    // Tonearm yaw/pitch
    if (this.tonearmMount && this.tonearm) {
      const inPlayableYaw =
        this.tonearmBaseRotation <= this.TONEARM_PLAY_YAW_THRESHOLD &&
        this.tonearmBaseRotation >= this.TONEARM_MIN_YAW;
      const inPlayWindow = inPlayableYaw && !this.isDraggingTonearm;
      const shouldDropNeedle =
        this.startOn &&
        inPlayWindow &&
        !this.isDraggingTonearm &&
        this.vinylPresent;
      const advanceMedia =
        this.startOn &&
        this.playingSound &&
        inPlayWindow &&
        this.vinylPresent &&
        this.mediaDuration > 0;

      if (advanceMedia) {
        this.setMediaCurrentTime(
          this.mediaCurrentTime + delta * this.mediaPlaybackRate,
        );
        this.tonearmBaseRotation = mediaTimeToYaw(
          this.mediaCurrentTime,
          this.TONEARM_PLAY_YAW_THRESHOLD,
          this.TONEARM_MIN_YAW,
          this.mediaDuration,
        );
        if (
          this.tonearmBaseRotation <= this.TONEARM_MIN_YAW + 1e-5 ||
          this.mediaCurrentTime >= this.mediaDuration - 1e-4
        ) {
          this.autoReturn = true;
          this.startOn = false;
          if (this.playingSound) {
            this.playingSound = false;
            this.onPause?.();
          }
        }
      } else if (
        !this.isDraggingTonearm &&
        (this.autoReturn || !inPlayableYaw)
      ) {
        this.tonearmBaseRotation +=
          (this.tonearmHomeRotation - this.tonearmBaseRotation) *
          this.TONEARM_RETURN_RATE;
        this.tonearmBaseRotation = clampValue(
          this.tonearmBaseRotation,
          this.TONEARM_MIN_YAW,
          this.TONEARM_MAX_YAW,
        );
        if (
          Math.abs(this.tonearmBaseRotation - this.tonearmHomeRotation) < 1e-4
        ) {
          this.autoReturn = false;
        }
      }

      const wobblePhase = this.tonearmPlayTime * this.TONEARM_WOBBLE_SPEED;
      const yawRender =
        this.tonearmBaseRotation +
        (advanceMedia ? this.TONEARM_YAW_WOBBLE * Math.sin(wobblePhase) : 0);
      this.tonearmMount.rotation.y +=
        (yawRender - this.tonearmMount.rotation.y) * 0.2;
      this.tonearmMount.rotation.y = clampValue(
        this.tonearmMount.rotation.y,
        this.TONEARM_MIN_YAW,
        this.TONEARM_MAX_YAW,
      );

      const desiredPitchDown =
        this.tonearmRestPitch +
        this.tonearmPitchDownDir * this.TONEARM_PLAY_OFFSET;
      const inPlayZone = shouldDropNeedle;

      let targetPitch = this.tonearmRestPitch;
      if (this.isHoveringTonearm && !inPlayZone) {
        targetPitch -= this.tonearmPitchDownDir * this.TONEARM_HOVER_OFFSET;
      }
      if (shouldDropNeedle) {
        targetPitch = desiredPitchDown;
      }
      const pitchRender =
        targetPitch +
        (advanceMedia
          ? this.tonearmPitchDownDir *
            this.TONEARM_PITCH_WOBBLE *
            Math.sin(wobblePhase + Math.PI / 2)
          : 0);
      this.tonearm.rotation.x +=
        (pitchRender - this.tonearm.rotation.x) * this.TONEARM_PLAY_LERP;

      const needleDown =
        Math.abs(this.tonearm.rotation.x - desiredPitchDown) <
        this.TONEARM_PLAY_EPSILON;

      if (shouldDropNeedle && needleDown && !this.playingSound) {
        this.playingSound = true;
        this.onPlay?.();
      } else if ((!shouldDropNeedle || !needleDown) && this.playingSound) {
        this.playingSound = false;
        this.onPause?.();
      }
    }
  }

  getAngularStep() {
    return this.lastAngularStep;
  }

  getTonearmYawDegrees() {
    return (this.tonearmBaseRotation * 180) / Math.PI;
  }

  isTonearmInPlayArea() {
    return (
      this.tonearmBaseRotation <= this.TONEARM_PLAY_YAW_THRESHOLD &&
      this.tonearmBaseRotation >= this.TONEARM_MIN_YAW
    );
  }

  isPlaying() {
    return this.playingSound;
  }

  liftNeedle() {
    if (!this.playingSound) {
      return;
    }
    this.playingSound = false;
    this.onPause?.();
  }

  pausePlayback() {
    if (!this.playingSound) {
      return;
    }
    this.playingSound = false;
    this.onPause?.();
  }

  setVinylPresence(present: boolean) {
    this.vinylPresent = present;
    if (!present && this.playingSound) {
      this.playingSound = false;
      this.onPause?.();
    }
  }

  returnTonearmHome() {
    this.autoReturn = false;
    this.tonearmBaseRotation = this.tonearmHomeRotation;
    this.setMediaCurrentTime(0, false);
  }

  resetState() {
    // Lift needle if playing
    if (this.playingSound) {
      this.playingSound = false;
      this.onPause?.();
    }
    // Stop the turntable
    this.startOn = false;
    // Return tonearm to home position
    this.tonearmBaseRotation = this.tonearmHomeRotation;
    // Reset media position to start
    this.setMediaCurrentTime(0, false);
  }

  toggleStartStop() {
    this.toggleStart();
    this.pressStartStop();
  }

  private toggleStart() {
    this.startOn = !this.startOn;
    if (!this.startOn && this.playingSound) {
      this.playingSound = false;
      this.onPause?.();
    }
    if (this.startOn && this.isTonearmOverVinyl()) {
      this.scrubVideoToCurrentYaw();
    }
  }

  private pressStartStop() {
    this.startStopTarget = this.START_STOP_PRESS;
    setTimeout(() => (this.startStopTarget = 0), 120);
  }

  private toggleSpeed() {
    const next =
      Math.abs(this.currentRpm - this.RPM_FAST) < 0.1
        ? this.RPM_SLOW
        : this.RPM_FAST;
    this.setSpeed(next);
  }

  private setSpeed(rpm: number) {
    this.currentRpm = rpm;
    this.angularSpeed = this.rpmToAngularSpeed(rpm);
    // move slide forward/back along Z
    this.speedSlideTarget =
      Math.abs(rpm - this.RPM_FAST) < 0.1 ? this.SPEED_SLIDE_TRAVEL : 0;
    const rate = Math.abs(rpm - this.RPM_FAST) < 0.1 ? 1.5 : 1.0;
    this.mediaPlaybackRate = rate;
    this.onRateChange?.(rate);
  }

  private rpmToAngularSpeed(rpm: number) {
    return (rpm / 60) * Math.PI * 2;
  }

  private hit(obj: Object3D | null) {
    if (!obj) return false;
    obj.parent?.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    return this.raycaster.intersectObject(obj, true).length > 0;
  }

  private scrubVideoToCurrentYaw() {
    const seconds = this.computeSecondsFromYaw(this.tonearmBaseRotation);
    this.setMediaCurrentTime(seconds, true);
  }

  private computeSecondsFromYaw(yaw: number) {
    const span = this.TONEARM_MIN_YAW - this.TONEARM_PLAY_YAW_THRESHOLD;
    if (!this.mediaDuration || span === 0) {
      return 0;
    }
    const progress = clampValue(
      (yaw - this.TONEARM_PLAY_YAW_THRESHOLD) / span,
      0,
      1,
    );
    return progress * this.mediaDuration;
  }

  private isTonearmOverVinyl() {
    return (
      this.tonearmBaseRotation <= this.TONEARM_PLAY_YAW_THRESHOLD &&
      this.tonearmBaseRotation >= this.TONEARM_MIN_YAW
    );
  }

  private setMediaCurrentTime(seconds: number, emit = false) {
    const clamped = clampValue(seconds, 0, this.mediaDuration);
    this.mediaCurrentTime = clamped;
    if (emit) {
      this.onScrub?.(clamped);
    }
  }
}

const turntableLoader = new GLTFLoader();

export function loadTurntableModel(): Promise<Object3D> {
  return new Promise((resolve, reject) => {
    turntableLoader.load(
      "/turntable.glb",
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => reject(error),
    );
  });
}
