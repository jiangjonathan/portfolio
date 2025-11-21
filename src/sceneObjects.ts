import {
  BoxGeometry,
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  Euler,
  SRGBColorSpace,
} from "three";
import type { Object3D, WebGLRenderer } from "three";

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

export type UVRect = {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
};

let businessCardEmailUV: UVRect = {
  minU: 0,
  maxU: 0,
  minV: 0,
  maxV: 0,
};
let businessCardLinkedInUV: UVRect = {
  minU: 0,
  maxU: 0,
  minV: 0,
  maxV: 0,
};
let businessCardGitHubUV: UVRect = {
  minU: 0,
  maxU: 0,
  minV: 0,
  maxV: 0,
};
export type BusinessCardContact = "email" | "linkedin" | "github";
type ContactLayout = {
  startX: number;
  width: number;
  y: number;
  font: number;
};
let businessCardContactLayouts: Record<
  BusinessCardContact,
  ContactLayout
> | null = null;
let businessCardBaseImageData: ImageData | null = null;
let businessCardTextureContext: CanvasRenderingContext2D | null = null;
let businessCardTexture: CanvasTexture | null = null;
let businessCardHighlight: BusinessCardContact | null = null;

export const getBusinessCardEmailUV = () => businessCardEmailUV;
export const getBusinessCardLinkedInUV = () => businessCardLinkedInUV;
export const getBusinessCardGitHubUV = () => businessCardGitHubUV;

export const BUSINESS_CARD_EMAIL_URI = "mailto:jonathanrsjiang@icloud.com";
export const BUSINESS_CARD_LINKEDIN_URL =
  "https://www.linkedin.com/in/jonathanrsjiang";
export const BUSINESS_CARD_GITHUB_URL = "https://github.com/jiangjonathan";

function drawEmbossedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  align: CanvasTextAlign = "center",
  baseline: CanvasTextBaseline = "middle",
) {
  const H = ctx.canvas.height;
  const offset = H * 0.002; // very subtle

  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.font = `${fontSize}px "Garamond", "Times New Roman", serif`;

  // highlight (top-left)
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fillText(text, x - offset, y - offset);

  // shadow (bottom-right)
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillText(text, x + offset, y + offset);

  // main ink
  ctx.fillStyle = "#181515";
  ctx.fillText(text, x, y);

  // reset
  ctx.shadowColor = "transparent";
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const drawBusinessCardBackground = (ctx: CanvasRenderingContext2D) => {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#fffdf8");
  grad.addColorStop(1, "#fef7ef");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(0, 0, W, H);
};

const drawBusinessCardGrain = (ctx: CanvasRenderingContext2D) => {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const image = ctx.getImageData(0, 0, W, H);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);
};

const drawBusinessCardText = (ctx: CanvasRenderingContext2D) => {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  drawEmbossedText(ctx, "647 408 3030", W * 0.07, H * 0.1, H * 0.048, "left");
  const firstName = "JONATHAN";
  const lastName = "JIANG";
  const firstLetter = firstName[0];
  const restOfFirstName = firstName.slice(1);
  const nameY = H * 0.5;
  const firstLetterFont = H * 0.0625;
  const restOfFirstNameFont = H * 0.05;
  const lastNameFont = firstLetterFont;
  ctx.font = `${firstLetterFont}px "Garamond", "Times New Roman", serif`;
  const firstWidth = ctx.measureText(firstLetter).width;
  ctx.font = `${restOfFirstNameFont}px "Garamond", "Times New Roman", serif`;
  const restWidth = ctx.measureText(restOfFirstName).width;
  ctx.font = `${lastNameFont}px "Garamond", "Times New Roman", serif`;
  const lastWidth = ctx.measureText(lastName).width;
  const gap = W * 0.015;
  const nameStartX = W * 0.5 - (firstWidth + restWidth + lastWidth + gap) / 2;
  drawEmbossedText(
    ctx,
    firstLetter,
    nameStartX,
    nameY,
    firstLetterFont,
    "left",
    "alphabetic",
  );
  drawEmbossedText(
    ctx,
    restOfFirstName,
    nameStartX + firstWidth,
    nameY,
    restOfFirstNameFont,
    "left",
    "alphabetic",
  );
  drawEmbossedText(
    ctx,
    lastName,
    nameStartX + firstWidth + restWidth + gap,
    nameY,
    lastNameFont,
    "left",
    "alphabetic",
  );
};

const drawBusinessCardContacts = (ctx: CanvasRenderingContext2D) => {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const emailText = "EMAIL jonathanrsjiang@icloud.com";
  const linkedinText = "LINKEDIN jonathanrsjiang";
  const githubText = "GITHUB jiangjonathan";
  const contactY = H * 0.92;
  const emailFont = H * 0.038;
  const linkedinFont = H * 0.038;
  const githubFont = H * 0.038;
  ctx.font = `${emailFont}px "Garamond", "Times New Roman", serif`;
  const emailWidth = ctx.measureText(emailText).width;
  ctx.font = `${linkedinFont}px "Garamond", "Times New Roman", serif`;
  const linkedinWidth = ctx.measureText(linkedinText).width;
  ctx.font = `${githubFont}px "Garamond", "Times New Roman", serif`;
  const githubWidth = ctx.measureText(githubText).width;
  const contactGap = W * 0.02;
  const contactStartX =
    W * 0.5 - (emailWidth + linkedinWidth + githubWidth + contactGap * 2) / 2;
  drawEmbossedText(
    ctx,
    emailText,
    contactStartX,
    contactY,
    emailFont,
    "left",
    "alphabetic",
  );
  drawEmbossedText(
    ctx,
    linkedinText,
    contactStartX + emailWidth + contactGap,
    contactY,
    linkedinFont,
    "left",
    "alphabetic",
  );
  drawEmbossedText(
    ctx,
    githubText,
    contactStartX + emailWidth + linkedinWidth + contactGap * 2,
    contactY,
    githubFont,
    "left",
    "alphabetic",
  );
  const emailTopY = contactY - emailFont * 0.6;
  const emailBottomY = contactY + emailFont * 0.6;
  businessCardEmailUV = {
    minU: clamp01(contactStartX / W),
    maxU: clamp01((contactStartX + emailWidth) / W),
    minV: clamp01(1 - emailBottomY / H),
    maxV: clamp01(1 - emailTopY / H),
  };
  const linkedinStartX = contactStartX + emailWidth + contactGap;
  const linkedinTopY = contactY - linkedinFont * 0.6;
  const linkedinBottomY = contactY + linkedinFont * 0.6;
  businessCardLinkedInUV = {
    minU: clamp01(linkedinStartX / W),
    maxU: clamp01((linkedinStartX + linkedinWidth) / W),
    minV: clamp01(1 - linkedinBottomY / H),
    maxV: clamp01(1 - linkedinTopY / H),
  };
  const githubStartX =
    contactStartX + emailWidth + linkedinWidth + contactGap * 2;
  const githubTopY = contactY - githubFont * 0.6;
  const githubBottomY = contactY + githubFont * 0.6;
  businessCardGitHubUV = {
    minU: clamp01(githubStartX / W),
    maxU: clamp01((githubStartX + githubWidth) / W),
    minV: clamp01(1 - githubBottomY / H),
    maxV: clamp01(1 - githubTopY / H),
  };
  businessCardContactLayouts = {
    email: {
      startX: contactStartX,
      width: emailWidth,
      y: contactY,
      font: emailFont,
    },
    linkedin: {
      startX: linkedinStartX,
      width: linkedinWidth,
      y: contactY,
      font: linkedinFont,
    },
    github: {
      startX: githubStartX,
      width: githubWidth,
      y: contactY,
      font: githubFont,
    },
  };
};

const drawBusinessCardTextureBase = (ctx: CanvasRenderingContext2D) => {
  drawBusinessCardBackground(ctx);
  drawBusinessCardGrain(ctx);
  drawBusinessCardText(ctx);
  drawBusinessCardContacts(ctx);
};

/* main texture */

export function createBusinessCardTexture(
  renderer: WebGLRenderer,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1782;
  canvas.height = 1152;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Failed to acquire canvas context.");

  drawBusinessCardTextureBase(ctx);
  businessCardTextureContext = ctx;
  businessCardBaseImageData = ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const texture = new CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy?.() ?? 1;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  businessCardTexture = texture;
  return texture;
}

export const setBusinessCardContactHighlight = (
  highlight: BusinessCardContact | null,
) => {
  if (
    !businessCardTextureContext ||
    !businessCardBaseImageData ||
    !businessCardTexture ||
    businessCardHighlight === highlight
  ) {
    return;
  }
  businessCardTextureContext.putImageData(businessCardBaseImageData, 0, 0);
  if (highlight && businessCardContactLayouts) {
    const layout = businessCardContactLayouts[highlight];
    const underlineY = layout.y + layout.font * 0.2;
    const underlineHeight = layout.font * 0.05;
    businessCardTextureContext.fillStyle = "rgba(20, 20, 20, 0.75)";
    businessCardTextureContext.fillRect(
      layout.startX,
      underlineY,
      layout.width,
      underlineHeight,
    );
  }
  businessCardHighlight = highlight;
  businessCardTexture.needsUpdate = true;
};

export const BUSINESS_CARD_PAGE = "business_card";
export const BUSINESS_CARD_WIDTH = 8.5;
export const BUSINESS_CARD_HEIGHT = 5.5;
export const BUSINESS_CARD_THICKNESS = 0.1;
export const BUSINESS_CARD_FOCUS_TARGET = new Vector3(0, 6, 0);
export const BUSINESS_CARD_CAMERA_YAW = 0;
export const BUSINESS_CARD_CAMERA_PITCH = 25;
export const BUSINESS_CARD_CAMERA_ZOOM = 2;

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
    color: 0xfdf7ee,
    roughness: 0.92,
    metalness: 0,
  });
  faceMaterial.polygonOffset = true;
  faceMaterial.polygonOffsetFactor = -0.6;
  faceMaterial.polygonOffsetUnits = -0.6;

  const backMaterial = new MeshStandardMaterial({
    color: 0xf5f0ea,
    roughness: 0.88,
    metalness: 0.0,
  });
  const edgeMaterial = new MeshStandardMaterial({
    color: 0xe6ddd4,
    roughness: 0.65,
    metalness: 0.1,
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
  cardMesh.rotation.y = Math.PI * 0.19;
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
  // Raise placeholder so its center is not inside the ground (y=0)
  // For box: raise by half the height (PLACEHOLDER_SIZE / 2)
  // For sphere: raise by radius (PLACEHOLDER_SIZE / 2)
  mesh.position.y += PLACEHOLDER_SIZE / 2;
  mesh.name = config.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function prioritizePortfolioCoverRendering(
  model: Object3D,
  onCoverFound?: (mesh: Mesh) => void,
  onWhitepaperFound?: (mesh: Mesh) => void,
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
      // Disable shadow receiving on papers to prevent z-fighting
      mesh.receiveShadow = false;
      // Check if this is the whitepaper specifically
      if (name.includes("whitepaper") && onWhitepaperFound) {
        onWhitepaperFound(mesh);
      }
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
