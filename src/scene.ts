import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  LinearSRGBColorSpace,
  PointLight,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
} from "three";
import { CameraRig } from "./cameraRig";

export function createScene() {
  const scene = new Scene();
  scene.background = null; // Transparent background
  return scene;
}

export function createLights() {
  const ambientLight = new AmbientLight(0xffffff, 0.9);
  const keyLight = new DirectionalLight(0xffffff, 1.25);
  keyLight.position.set(2.5, 3.5, 3.5);

  const fillLight = new DirectionalLight(0xcad7ff, 0.55);
  fillLight.position.set(-3, 2, -2);

  const rimLight = new PointLight(0xfff5dc, 0.8, 10);
  rimLight.position.set(0, 1.2, 2.5);

  return { ambientLight, keyLight, fillLight, rimLight };
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  return renderer;
}

export function createCameraRig() {
  return new CameraRig();
}

export function loadTextures(renderer: WebGLRenderer) {
  const textureLoader = new TextureLoader();
  const vinylNormalTexture = textureLoader.load("/vinyl-normal.png");
  vinylNormalTexture.colorSpace = LinearSRGBColorSpace;
  vinylNormalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { vinylNormalTexture };
}
