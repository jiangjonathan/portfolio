import {
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  MathUtils,
  Object3D,
} from "three";

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

export type LabelVisualOptions = {
  background: string;
  fontFamily: string;
  accent: string;
};

const defaultVisualOptions: LabelVisualOptions = {
  background: "#ffffff",
  fontFamily: '"Space Grotesk", "Inter", sans-serif',
  accent: "#202022",
};

export function createLabelTextures(
  visuals: LabelVisualOptions = defaultVisualOptions,
): LabelTextures {
  const base = createLabelTexture(visuals);
  const clone = base.clone();
  clone.needsUpdate = true;
  return {
    sideA: base,
    sideB: clone,
  };
}

export function createLabelTexture(
  visuals: LabelVisualOptions = defaultVisualOptions,
  size = 1024,
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create label texture context.");
  }

  // White background
  context.fillStyle = visuals.background;
  context.fillRect(0, 0, size, size);

  const center = size / 2;

  // Text styling
  context.fillStyle = visuals.accent;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const titleFont = size * 0.07;
  context.font = `700 ${titleFont}px ${visuals.fontFamily}`;
  context.fillText("KANYE WEST", center, center - size * 0.32);
  context.fillText(
    "MY BEAUTIFUL DARK TWISTED FANTASY",
    center,
    center - size * 0.18,
  );

  const sideFont = size * 0.05;
  context.font = `600 ${sideFont}px ${visuals.fontFamily}`;
  context.fillText("SIDE A", center, center + size * 0.08);

  const rpmFont = size * 0.045;
  context.font = `500 ${rpmFont}px ${visuals.fontFamily}`;
  context.fillText("33 1/3 RPM", center, center + size * 0.18);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;

  return texture;
}

export function applyLabelTextures(
  model: Object3D,
  textures: LabelTextures,
  options: LabelApplicationOptions = defaultLabelOptions,
  visuals: LabelVisualOptions = defaultVisualOptions,
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
    entry.material.needsUpdate = true;
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
