import {
  BoxGeometry,
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  Euler,
} from "three";
import type { Object3D, WebGLRenderer } from "three";

export const BUSINESS_CARD_PAGE = "business_card";
export const BUSINESS_CARD_WIDTH = 18;
export const BUSINESS_CARD_HEIGHT = 10;
export const BUSINESS_CARD_THICKNESS = 0.15;
export const BUSINESS_CARD_FOCUS_TARGET = new Vector3(0, 6, 0);
export const BUSINESS_CARD_CAMERA_YAW = 0;
export const BUSINESS_CARD_CAMERA_PITCH = 25;
export const BUSINESS_CARD_CAMERA_ZOOM = 1.6;

export const PLACEHOLDER_SIZE = 10;
export const PLACEHOLDER_SCENES = [
  {
    id: "placeholder_A",
    geometry: "box" as const,
    color: 0xff2d2d,
    position: new Vector3(-45, -5, -40),
  },
  {
    id: "placeholder_B",
    geometry: "sphere" as const,
    color: 0x2454ff,
    position: new Vector3(-30, -5, -60),
  },
] as const;

export const PORTFOLIO_SCENE_CONFIGS = [
  {
    id: "portfolio",
    glbUrl: "/portfolio.glb",
    rotation: new Euler(0, Math.PI * 0.25, 0),
    focusOffset: new Vector3(0, 12, 0),
  },
] as const;

export const PORTFOLIO_CAMERA_TARGET_OFFSET = new Vector3(0, 12, 0);
export const PORTFOLIO_COVER_ORDER = 250;
export const PORTFOLIO_PAPER_ORDER = 200;
export const PORTFOLIO_TEXT_ORDER = 300;
export const PORTFOLIO_COVER_KEYS = ["cover"];
export const PORTFOLIO_PAPER_KEYS = ["whitepaper", "backpaper"];
export const PORTFOLIO_TEXT_KEYS = ["text"];
export const PORTFOLIO_COVER_OFFSET = -2;
export const PORTFOLIO_COVER_UNITS = -1.2;
export const PORTFOLIO_PAPER_OFFSET = -1;
export const PORTFOLIO_PAPER_UNITS = -0.6;
export const PORTFOLIO_TEXT_OFFSET = -2.8;
export const PORTFOLIO_TEXT_UNITS = -1.6;

export function createBusinessCardTexture(
  renderer: WebGLRenderer,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1152;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to acquire canvas context for business card.");
  }

  context.fillStyle = "#fdf9f3";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "#ded3ca";
  context.lineWidth = canvas.height * 0.012;
  context.beginPath();
  context.moveTo(canvas.width * 0.08, canvas.height * 0.3);
  context.lineTo(canvas.width * 0.92, canvas.height * 0.3);
  context.stroke();

  context.fillStyle = "#221f1c";
  context.textBaseline = "middle";
  context.font = `600 ${canvas.height * 0.09}px "Space Grotesk", "Inter", sans-serif`;
  context.textAlign = "left";
  context.fillText("123 123 1234", canvas.width * 0.08, canvas.height * 0.18);

  context.textAlign = "center";
  context.font = `700 ${canvas.height * 0.2}px "Space Grotesk", "Inter", sans-serif`;
  context.fillText("Jonathan JIANG", canvas.width / 2, canvas.height * 0.54);

  context.font = `500 ${canvas.height * 0.09}px "Space Grotesk", "Inter", sans-serif`;
  context.fillText(
    "jonathanrsjiang@icloud.com",
    canvas.width / 2,
    canvas.height * 0.82,
  );

  const texture = new CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

export function createBusinessCardMesh(
  renderer: WebGLRenderer,
  circlePosition: Vector3,
): Mesh {
  const geometry = new BoxGeometry(
    BUSINESS_CARD_WIDTH, // X axis - card width
    BUSINESS_CARD_THICKNESS, // Y axis - card thickness (vertical/height)
    BUSINESS_CARD_HEIGHT, // Z axis - card length/depth
  );
  const frontTexture = createBusinessCardTexture(renderer);
  const faceMaterial = new MeshStandardMaterial({
    map: frontTexture,
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0.08,
  });
  faceMaterial.polygonOffset = true;
  faceMaterial.polygonOffsetFactor = -0.6;
  faceMaterial.polygonOffsetUnits = -0.6;

  const backMaterial = new MeshStandardMaterial({
    color: 0xf5f0ea,
    roughness: 0.55,
    metalness: 0.04,
  });
  const edgeMaterial = new MeshStandardMaterial({
    color: 0xe6ddd4,
    roughness: 0.65,
    metalness: 0.03,
  });

  const materials = [
    edgeMaterial.clone(), // right
    edgeMaterial.clone(), // left
    faceMaterial, // top (front face of card)
    backMaterial, // bottom (back face of card)
    edgeMaterial.clone(), // front edge
    edgeMaterial.clone(), // back edge
  ];

  const cardMesh = new Mesh(geometry, materials);
  cardMesh.castShadow = true;
  cardMesh.receiveShadow = true;
  cardMesh.name = BUSINESS_CARD_PAGE;

  cardMesh.position.copy(circlePosition);
  cardMesh.rotation.y = Math.PI * -0.19;
  cardMesh.rotation.x = Math.PI * 0;
  cardMesh.rotation.z = Math.PI * 0; // Flat on the ground

  return cardMesh;
}

export function createPlaceholderMesh(
  config: (typeof PLACEHOLDER_SCENES)[number],
  circlePosition: Vector3,
): Mesh {
  const geometry =
    config.geometry === "box"
      ? new BoxGeometry(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)
      : new SphereGeometry(PLACEHOLDER_SIZE / 2, 32, 16);
  const material = new MeshStandardMaterial({ color: config.color });
  const mesh = new Mesh(geometry, material);
  mesh.position.copy(circlePosition);
  mesh.name = config.id;
  return mesh;
}

export function prioritizePortfolioCoverRendering(
  model: Object3D,
  onCoverFound?: (mesh: Mesh) => void,
): void {
  model.traverse((child) => {
    if (!("isMesh" in child) || !(child as Mesh).isMesh) {
      return;
    }
    const mesh = child as Mesh;
    const name = mesh.name.toLowerCase();
    if (PORTFOLIO_TEXT_KEYS.some((key) => name.includes(key))) {
      setMeshRenderPriority(
        mesh,
        PORTFOLIO_TEXT_ORDER,
        PORTFOLIO_TEXT_OFFSET,
        PORTFOLIO_TEXT_UNITS,
      );
    } else if (PORTFOLIO_COVER_KEYS.some((key) => name.includes(key))) {
      setMeshRenderPriority(
        mesh,
        PORTFOLIO_COVER_ORDER,
        PORTFOLIO_COVER_OFFSET,
        PORTFOLIO_COVER_UNITS,
      );
      if (onCoverFound) {
        onCoverFound(mesh);
      }
    } else if (PORTFOLIO_PAPER_KEYS.some((key) => name.includes(key))) {
      setMeshRenderPriority(
        mesh,
        PORTFOLIO_PAPER_ORDER,
        PORTFOLIO_PAPER_OFFSET,
        PORTFOLIO_PAPER_UNITS,
      );
    }
  });
}

function setMeshRenderPriority(
  mesh: Mesh,
  order: number,
  factor: number,
  units: number,
): void {
  mesh.renderOrder = Math.max(mesh.renderOrder, order);
  applyPolygonOffsetToMaterials(mesh, factor, units);
}

function applyPolygonOffsetToMaterials(
  mesh: Mesh,
  factor: number,
  units: number,
): void {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  materials.forEach((material) => {
    if (!material) {
      return;
    }
    material.polygonOffset = true;
    material.polygonOffsetFactor = factor;
    material.polygonOffsetUnits = units;
    material.needsUpdate = true;
  });
}
