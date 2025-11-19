import {
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  MathUtils,
  Object3D,
} from "three";
import { getContrastTextColor } from "./colorUtils";

export type LabelTextures = { sideA: CanvasTexture; sideB: CanvasTexture };
export type LabelApplicationOptions = {
  scale: number;
  padding: number;
  offsetX: number;
  offsetY: number;
};

const defaultLabelOptions: LabelApplicationOptions = {
  scale: 1,
  padding: 0.1,
  offsetX: 0,
  offsetY: 0,
};

const LABEL_RENDER_ORDER = 420;
const LABEL_POLYGON_OFFSET_FACTOR = -0.45;
const LABEL_POLYGON_OFFSET_UNITS = -0.35;

export type LabelVisualOptions = {
  background: string;
  fontFamily: string;
  accent: string;
  textColor?: string; // Color for title/text (auto-determined if not set)
  scalingAggression?: number;
  // vertical for titles
  title1YOffset?: number;
  title2YOffset?: number;
  title3YOffset?: number;
  // horizontal offset for side/rpm from center (nub)
  sideXOffset?: number;
  title1?: string;
  title2?: string;
  title3?: string;
  sideLabel?: string;
  rpmLabel?: string;
};

export function createDefaultLabelVisuals(): LabelVisualOptions {
  return {
    background: "#f6e2f1",
    fontFamily: '"Space Grotesk", "Inter", sans-serif',
    accent: "#202022",
    scalingAggression: 1,
    title1YOffset: -0.2,
    title2YOffset: 0.2,
    title3YOffset: 0.3,
    sideXOffset: 0.23,
    title1: "Unknown Artist",
    title2: "Untitled Track",
    title3: "",
    sideLabel: "SIDE A",
    rpmLabel: "33 1/3",
  };
}

export function createLabelTextures(
  visuals: LabelVisualOptions = createDefaultLabelVisuals(),
): LabelTextures {
  const base = createLabelTexture(visuals);
  const clone = base.clone();
  clone.needsUpdate = true;
  return {
    sideA: base,
    sideB: clone,
  };
}

function fitTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  baseSize: number,
  fontFamily: string,
  maxWidth: number,
  weight = "700",
  aggressiveness = 1,
) {
  let size = baseSize;
  ctx.font = `${weight} ${size}px ${fontFamily}`;
  const width = ctx.measureText(text).width;
  if (width <= maxWidth) return size;

  const ratio = maxWidth / width;
  size = Math.floor(size * Math.pow(ratio, aggressiveness));
  ctx.font = `${weight} ${size}px ${fontFamily}`;
  return size;
}

export function createLabelTexture(
  visuals: LabelVisualOptions = createDefaultLabelVisuals(),
  size = 1024,
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create label texture context.");

  const {
    background,
    fontFamily,
    textColor,
    scalingAggression = 1,
    title1YOffset = -0.2,
    title2YOffset = 0.2,
    title3YOffset = 0.3,
    sideXOffset = 0.23,
    title1 = "Unknown Artist",
    title2 = "Untitled Track",
    title3 = "",
    sideLabel = "SIDE A",
    rpmLabel = "33 1/3",
  } = visuals;

  context.fillStyle = background;
  context.fillRect(0, 0, size, size);

  const center = size / 2;
  const maxTextWidth = size * 0.75;

  // Determine text color based on background if not explicitly set
  const finalTextColor = textColor || getContrastTextColor(background);

  // titles (centered vertically around nub)
  context.fillStyle = finalTextColor;
  context.textBaseline = "middle";

  const baseTitleSize = size * 0.1;

  const title1Size = fitTextToWidth(
    context,
    title1,
    baseTitleSize,
    fontFamily,
    maxTextWidth,
    "800",
    scalingAggression,
  );
  context.textAlign = "center";
  context.font = `800 ${title1Size}px ${fontFamily}`;
  context.fillText(title1, center, center + size * title1YOffset);

  const title2Size = fitTextToWidth(
    context,
    title2,
    baseTitleSize,
    fontFamily,
    maxTextWidth,
    "800",
    scalingAggression,
  );
  context.font = `800 ${title2Size}px ${fontFamily}`;
  context.fillText(title2, center, center + size * title2YOffset);

  if (title3 && title3.trim().length > 0) {
    const title3Size = fitTextToWidth(
      context,
      title3,
      baseTitleSize * 0.92,
      fontFamily,
      maxTextWidth,
      "600",
      scalingAggression,
    );
    context.font = `600 ${title3Size}px ${fontFamily}`;
    context.fillText(title3, center, center + size * title3YOffset);
  }

  // SIDE A on the left of nub
  const sideText = sideLabel;
  const sideFont = size * 0.045;
  // const sideFont = fitTextToWidth(
  //   context,
  //   sideText,
  //   baseSideFont,
  //   fontFamily,
  //   size * 0.3,
  //   "600",
  //   scalingAggression,
  // );
  context.font = `600 ${sideFont}px ${fontFamily}`;
  context.textAlign = "right";
  context.fillText(sideText, center - size * sideXOffset, center);

  // RPM on the right of nub
  const rpmText = rpmLabel;
  const rpmFont = size * 0.05;
  // const rpmFont = fitTextToWidth(
  //   context,
  //   rpmText,
  //   baseRpmFont,
  //   fontFamily,
  //   size * 0.3,
  //   "600",
  //   scalingAggression,
  // );
  context.font = `600 ${rpmFont}px ${fontFamily}`;
  context.textAlign = "left";
  context.fillText(rpmText, center + size * sideXOffset, center);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function applyLabelTextures(
  model: Object3D,
  textures: LabelTextures,
  options: LabelApplicationOptions = defaultLabelOptions,
  visuals: LabelVisualOptions = createDefaultLabelVisuals(),
) {
  const targets: {
    material: MeshStandardMaterial & { clearcoat?: number };
    avgV: number;
    mesh: Mesh;
  }[] = [];

  model.traverse((child) => {
    if (!("isMesh" in child) || !(child as Mesh).isMesh) return;

    const meshChild = child as Mesh;
    const materials = Array.isArray(meshChild.material)
      ? meshChild.material
      : [meshChild.material];

    materials.forEach((material) => {
      if (!material) return;

      const name = (material.name || "").toLowerCase();
      const targetMaterial = material as MeshStandardMaterial & {
        clearcoat?: number;
      };

      if (name.includes("backsticker")) {
        targetMaterial.map = null;
        targetMaterial.color?.set(visuals.background);
        targetMaterial.roughness = 0.55;
        targetMaterial.metalness = 0.08;
        if ("clearcoat" in targetMaterial) targetMaterial.clearcoat = 0;
        targetMaterial.needsUpdate = true;
        return;
      }

      if (
        !name.includes("label") &&
        !name.includes("sticker") &&
        !name.includes("center")
      )
        return;

      const uvAttr = meshChild.geometry.attributes?.uv;
      let avgV = 0;
      if (uvAttr) {
        let sum = 0;
        for (let i = 0; i < uvAttr.count; i++) sum += uvAttr.getY(i);
        avgV = sum / uvAttr.count;
      }

      targets.push({ material: targetMaterial, avgV, mesh: meshChild });
    });
  });

  if (!targets.length) return;

  targets.sort((a, b) => a.avgV - b.avgV);
  targets.forEach((entry) => {
    const texture = textures.sideA;
    remapLabelUVs(entry.mesh, options);
    entry.material.map = texture;
    entry.material.color?.set("#ffffff");
    entry.material.roughness = 0.55;
    entry.material.metalness = 0.08;
    if ("clearcoat" in entry.material) entry.material.clearcoat = 0;
    entry.material.polygonOffset = true;
    entry.material.polygonOffsetFactor = LABEL_POLYGON_OFFSET_FACTOR;
    entry.material.polygonOffsetUnits = LABEL_POLYGON_OFFSET_UNITS;
    entry.material.needsUpdate = true;
    entry.mesh.renderOrder = Math.max(
      entry.mesh.renderOrder ?? 0,
      LABEL_RENDER_ORDER,
    );
  });
}

function remapLabelUVs(
  mesh: Mesh,
  options: LabelApplicationOptions = defaultLabelOptions,
) {
  const geometry = mesh.geometry;
  const uvAttr = geometry.attributes?.uv;
  if (!uvAttr) return;

  const original: Float32Array =
    geometry.userData._labelOriginalUVs ||
    (geometry.userData._labelOriginalUVs = new Float32Array(uvAttr.array));

  let minU = Infinity,
    maxU = -Infinity,
    minV = Infinity,
    maxV = -Infinity;

  for (let i = 0; i < uvAttr.count; i++) {
    const u = original[i * 2];
    const v = original[i * 2 + 1];
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  const width = Math.max(maxU - minU, 1e-4);
  const height = Math.max(maxV - minV, 1e-4);
  const span = Math.max(width, height);
  const centerU = (minU + maxU) / 2;
  const centerV = (minV + maxV) / 2;
  const padding = Math.min(Math.max(options.padding, 0), 0.45);
  const scale = Math.min(Math.max(options.scale, 0.05), 10);
  const offsetX = MathUtils.clamp(options.offsetX, -0.4, 0.4);
  const offsetY = MathUtils.clamp(options.offsetY, -0.4, 10);

  for (let i = 0; i < uvAttr.count; i++) {
    const u = original[i * 2];
    const v = original[i * 2 + 1];

    const normalizedU = (u - centerU) / span + 0.5;
    const normalizedV = 1 - ((v - centerV) / span + 0.5);
    const scaledU = 0.5 + (normalizedU - 0.5) * scale + offsetX * 0.5;
    const scaledV = 0.5 + (normalizedV - 0.5) * scale + offsetY * 0.5;
    const insetU = MathUtils.clamp(
      padding + scaledU * (1 - padding * 2),
      padding,
      1 - padding,
    );
    const insetV = MathUtils.clamp(
      padding + scaledV * (1 - padding * 2),
      padding,
      1 - padding,
    );

    uvAttr.setXY(i, insetU, insetV);
  }

  uvAttr.needsUpdate = true;
}
