import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  LinearSRGBColorSpace,
  Mesh,
  PCFShadowMap,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
} from "three";
import { CameraRig } from "../camera/cameraRig";

// Lighting state for fullscreen transitions
type LightingState = {
  ambientIntensity: number;
  keyIntensity: number;
  fillIntensity: number;
};

const NORMAL_LIGHTING: LightingState = {
  ambientIntensity: 0.5,
  keyIntensity: 1.5,
  fillIntensity: 0.7,
};

const DARK_MODE_LIGHTING: LightingState = {
  ambientIntensity: 0.25,
  keyIntensity: 0.9,
  fillIntensity: 0.35,
};

const FULLSCREEN_LIGHTING: LightingState = {
  ambientIntensity: 0,
  keyIntensity: 0.3,
  fillIntensity: 0.1,
};

const FULLSCREEN_HOVER_LIGHTING: LightingState = {
  ambientIntensity: 0.5,
  keyIntensity: 1.5,
  fillIntensity: 0,
};

class LightingAnimator {
  private currentState: LightingState;
  private targetState: LightingState;
  private transitionSpeed: number;
  private ambientLight: AmbientLight;
  private keyLight: DirectionalLight;
  private fillLight: DirectionalLight;

  constructor(
    ambientLight: AmbientLight,
    keyLight: DirectionalLight,
    fillLight: DirectionalLight,
  ) {
    this.ambientLight = ambientLight;
    this.keyLight = keyLight;
    this.fillLight = fillLight;
    this.currentState = { ...NORMAL_LIGHTING };
    this.targetState = { ...NORMAL_LIGHTING };
    this.transitionSpeed = 0.05; // Default transition speed
  }

  setTargetState(state: LightingState, fast: boolean = false): void {
    this.targetState = { ...state };
    this.transitionSpeed = fast ? 0.15 : 0.05;
  }

  update(): void {
    const speed = this.transitionSpeed;

    this.currentState.ambientIntensity +=
      (this.targetState.ambientIntensity - this.currentState.ambientIntensity) *
      speed;
    this.currentState.keyIntensity +=
      (this.targetState.keyIntensity - this.currentState.keyIntensity) * speed;
    this.currentState.fillIntensity +=
      (this.targetState.fillIntensity - this.currentState.fillIntensity) *
      speed;

    this.ambientLight.intensity = this.currentState.ambientIntensity;
    this.keyLight.intensity = this.currentState.keyIntensity;
    this.fillLight.intensity = this.currentState.fillIntensity;
  }
}

export {
  LightingAnimator,
  NORMAL_LIGHTING,
  DARK_MODE_LIGHTING,
  FULLSCREEN_LIGHTING,
  FULLSCREEN_HOVER_LIGHTING,
};

export function createScene() {
  const scene = new Scene();
  scene.background = null; // Transparent background
  return scene;
}

export function createLights() {
  const ambientLight = new AmbientLight(0xffffff, 0.5);

  const keyLight = new DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(-19, 38, 7);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.left = -80;
  keyLight.shadow.camera.right = 80;
  keyLight.shadow.camera.top = 80;
  keyLight.shadow.camera.bottom = -80;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 150;
  keyLight.shadow.bias = -0.001;
  keyLight.shadow.normalBias = 0.02;

  const fillLight = new DirectionalLight(0xffffff, 0.7);
  fillLight.position.set(7, 20, -19);
  fillLight.castShadow = false;

  return { ambientLight, keyLight, fillLight };
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  return renderer;
}

export function createCameraRig() {
  return new CameraRig();
}

export function createGroundPlane() {
  // Create an invisible ground plane that receives shadows
  const groundGeometry = new PlaneGeometry(200, 200);
  const groundMaterial = new ShadowMaterial();
  groundMaterial.opacity = 0.3;
  const groundPlane = new Mesh(groundGeometry, groundMaterial);
  groundPlane.rotation.x = -Math.PI / 2; // Rotate to be horizontal
  groundPlane.position.y = 0;
  groundPlane.receiveShadow = true;
  return groundPlane;
}

export function loadTextures(renderer: WebGLRenderer) {
  const textureLoader = new TextureLoader();
  const vinylNormalTexture = textureLoader.load("/vinyl-normal.png");
  vinylNormalTexture.colorSpace = LinearSRGBColorSpace;
  vinylNormalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { vinylNormalTexture };
}
