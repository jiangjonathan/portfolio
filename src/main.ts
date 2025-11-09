import "./style.css";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  LinearSRGBColorSpace,
  Mesh,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Scene,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  ACESFilmicToneMapping,
  SRGBColorSpace,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { applyGrooveMaterial } from "./vinyl";
import {
  applyLabelTextures,
  createLabelTextures,
  type LabelApplicationOptions,
} from "./labels";

const root = document.getElementById("app");

if (!root) {
  throw new Error("Missing #app container.");
}

root.innerHTML = "";

const canvas = document.createElement("canvas");
canvas.id = "vinyl-viewer";
root.appendChild(canvas);

const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new Scene();
scene.background = new Color("#f7f7f2");

const camera = new PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(2, 1.2, 2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.15, 0);
controls.enableDamping = true;

const ambientLight = new AmbientLight(0xffffff, 0.9);
const keyLight = new DirectionalLight(0xffffff, 1.25);
keyLight.position.set(2.5, 3.5, 3.5);

const fillLight = new DirectionalLight(0xcad7ff, 0.55);
fillLight.position.set(-3, 2, -2);

const rimLight = new PointLight(0xfff5dc, 0.8, 10);
rimLight.position.set(0, 1.2, 2.5);

scene.add(ambientLight, keyLight, fillLight, rimLight);

const textureLoader = new TextureLoader();
const vinylNormalTexture = textureLoader.load("/vinyl-normal.png");
vinylNormalTexture.colorSpace = LinearSRGBColorSpace;
vinylNormalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const labelVisuals = {
  background: "#f6e2f1",
  gradientInner: "#fefefe",
  gradientOuter: "#dcdcdc",
  fontFamily: '"Space Grotesk", "Inter", sans-serif',
  accent: "#202022",
};
const labelTextures = createLabelTextures(labelVisuals);
labelTextures.sideA.anisotropy = renderer.capabilities.getMaxAnisotropy();
labelTextures.sideB.anisotropy = renderer.capabilities.getMaxAnisotropy();

let labelOptions: LabelApplicationOptions = {
  scale: 1,
  padding: 0,
  offsetX: 0,
  offsetY: 0,
};

const loader = new GLTFLoader();
loader.load(
  "/vinyl.glb",
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    logMaterialNames(model);
    applyGrooveMaterial(model, vinylNormalTexture);
    applyLabelTextures(model, labelTextures, labelOptions, labelVisuals);

    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());

    model.position.sub(center); // place model in the middle of the orbit controls target

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera.fov * Math.PI) / 180;
    const distance = maxDim / (2 * Math.tan(fov / 2));
    const offset = 1.4;

    camera.position.set(distance * offset, distance * 0.6, distance * offset);
    controls.update();
  },
  undefined,
  (error) => {
    console.error("Failed to load vinyl.glb", error);
  },
);

const setSize = () => {
  const width = root.clientWidth || window.innerWidth;
  const height = root.clientHeight || window.innerHeight;

  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

window.addEventListener("resize", setSize);
setSize();

const animate = () => {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
};

animate();

function logMaterialNames(model: Object3D) {
  const names = new Set<string>();
  model.traverse((child) => {
    if (!("isMesh" in child) || !(child as Mesh).isMesh) {
      return;
    }

    const mesh = child as Mesh;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    materials.forEach((material) => {
      if (!material) {
        return;
      }

      names.add(material.name || "(unnamed)");
    });
  });

  console.log("GLB materials:", Array.from(names));
}
