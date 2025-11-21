import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
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
  const ambientLight = new AmbientLight(0xffffff, 0.6);

  const keyLight = new DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(5, 8, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 4096;
  keyLight.shadow.mapSize.height = 4096;
  keyLight.shadow.camera.left = -70;
  keyLight.shadow.camera.right = 70;
  keyLight.shadow.camera.top = 70;
  keyLight.shadow.camera.bottom = -70;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 100;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.01;

  const fillLight = new DirectionalLight(0xb4c7e7, 0.7);
  fillLight.position.set(-8, 4, -4);
  fillLight.castShadow = true;
  fillLight.shadow.mapSize.width = 2048;
  fillLight.shadow.mapSize.height = 2048;
  fillLight.shadow.camera.left = -70;
  fillLight.shadow.camera.right = 70;
  fillLight.shadow.camera.top = 70;
  fillLight.shadow.camera.bottom = -70;
  fillLight.shadow.camera.near = 0.5;
  fillLight.shadow.camera.far = 100;
  fillLight.shadow.bias = -0.0005;

  const rimLight = new PointLight(0xfff5dc, 1.2, 15);
  rimLight.position.set(0, 3, 5);
  rimLight.castShadow = true;
  rimLight.shadow.mapSize.width = 1024;
  rimLight.shadow.mapSize.height = 1024;
  rimLight.shadow.camera.near = 0.1;
  rimLight.shadow.camera.far = 20;
  rimLight.shadow.bias = -0.0005;

  return { ambientLight, keyLight, fillLight, rimLight };
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = 1; // PCFShadowMap for soft shadows
  return renderer;
}

export function createCameraRig() {
  return new CameraRig();
}

export function createGroundPlane() {
  // Create an invisible ground plane that receives shadows
  const groundGeometry = new PlaneGeometry(200, 200);
  const groundMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0,
  });
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
