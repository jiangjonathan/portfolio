import {
  BufferAttribute,
  Color,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
  Vector2,
} from "three";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const vinylLoader = new GLTFLoader();
const VINYL_RENDER_ORDER = 400;
export const DEFAULT_VINYL_COLOR = "#0f0f0f";
const UNCOLORED_GROOVE_COLOR = "#1a1a1a";
const UNCOLORED_OUTER_COLOR = "#2e2e2e";
const defaultVinylColor = new Color(DEFAULT_VINYL_COLOR);
const modelVinylMaterials = new WeakMap<Object3D, Set<MeshStandardMaterial>>();

export function loadVinylModel(normalTexture: Texture): Promise<Object3D> {
  return new Promise((resolve, reject) => {
    vinylLoader.load(
      "/vinyl.glb",
      (gltf) => {
        const model = gltf.scene;
        applyGrooveMaterial(model, normalTexture);
        enableVinylShadows(model);
        resolve(model);
      },
      undefined,
      (error) => reject(error),
    );
  });
}

export function enableVinylShadows(model: Object3D) {
  model.traverse((child) => {
    if ("isMesh" in child) {
      const mesh = child as Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
}

export function applyGrooveMaterial(model: Object3D, texture: Texture) {
  model.traverse((child) => {
    if (!("isMesh" in child) || !(child as Mesh).isMesh) {
      return;
    }

    const mesh = child as Mesh;
    ensureDiscUVs(mesh);
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    materials.forEach((material) => {
      if (!material) {
        return;
      }

      updateGrooveMaterial(material, texture, model);
    });
    applyVinylRenderBias(mesh);
  });
}

function trackVinylMaterial(
  material: MeshStandardMaterial,
  root: Object3D,
): void {
  let materials = modelVinylMaterials.get(root);
  if (!materials) {
    materials = new Set();
    modelVinylMaterials.set(root, materials);
  }
  if (materials.has(material)) {
    return;
  }
  materials.add(material);
  material.addEventListener?.("dispose", () => {
    const tracked = modelVinylMaterials.get(root);
    tracked?.delete(material);
    if (tracked && tracked.size === 0) {
      modelVinylMaterials.delete(root);
    }
  });
}

function applyVinylColorToMaterial(
  material: MeshStandardMaterial,
  color: Color,
): void {
  material.color?.copy(color);
  material.needsUpdate = true;
}

export function applyVinylColor(
  model: Object3D | null,
  colorHex?: string | null,
): void {
  if (!model) {
    return;
  }
  const materials = modelVinylMaterials.get(model);
  if (!materials || materials.size === 0) {
    return;
  }
  materials.forEach((mat) => {
    const style = resolveVinylStyleForMaterial(mat, colorHex);
    if (!style) {
      return;
    }
    applyVinylColorToMaterial(mat, style.color);
    if (style.roughness !== undefined) {
      mat.roughness = style.roughness;
    }
    if (style.metalness !== undefined) {
      mat.metalness = style.metalness;
    }
  });
}

function resolveVinylStyleForMaterial(
  material: MeshStandardMaterial,
  colorHex?: string | null,
): { color: Color; roughness?: number; metalness?: number } | null {
  const baseRoughness = 0.38;
  const baseMetalness = 0.45;
  const normalized = material.name.trim().toLowerCase();
  const color = new Color();

  if (colorHex) {
    try {
      color.set(colorHex);

      // If too dark, use uncolored vinyl instead
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      const DARKNESS_THRESHOLD = 0.03;

      if (hsl.l < DARKNESS_THRESHOLD) {
        // Too dark - use uncolored vinyl colors
        if (normalized === "grooves") {
          color.set(UNCOLORED_GROOVE_COLOR);
        } else {
          color.set(UNCOLORED_OUTER_COLOR);
        }
      }
    } catch {
      color.copy(defaultVinylColor);
    }

    // Return different roughness/metalness based on material type
    if (normalized === "grooves") {
      return {
        color,
        roughness: baseRoughness,
        metalness: baseMetalness,
      };
    } else {
      return {
        color,
        roughness: 0.8,
        metalness: 0.12,
      };
    }
  }

  if (normalized === "grooves") {
    color.set(UNCOLORED_GROOVE_COLOR);
    return {
      color,
      roughness: baseRoughness,
      metalness: baseMetalness,
    };
  }

  color.set(UNCOLORED_OUTER_COLOR);
  return {
    color,
    roughness: 0.8,
    metalness: 0.12,
  };
}

function applyVinylRenderBias(mesh: Mesh) {
  mesh.renderOrder = Math.max(mesh.renderOrder, VINYL_RENDER_ORDER);
  // Polygon offset disabled - let labels handle depth sorting
}

function ensureDiscUVs(mesh: Mesh) {
  const geometry = mesh.geometry;
  if (!geometry) {
    return;
  }

  if ("attributes" in geometry && geometry.attributes.uv) {
    return;
  }

  const positionAttr = geometry.attributes?.position;
  if (!positionAttr) {
    return;
  }

  let maxRadius = 0;
  for (let i = 0; i < positionAttr.count; i += 1) {
    const x = positionAttr.getX(i);
    const z = positionAttr.getZ(i);
    const radius = Math.sqrt(x * x + z * z);
    maxRadius = Math.max(maxRadius, radius);
  }

  if (maxRadius === 0) {
    maxRadius = 1;
  }

  const uvs = new Float32Array(positionAttr.count * 2);
  for (let i = 0; i < positionAttr.count; i += 1) {
    const x = positionAttr.getX(i);
    const z = positionAttr.getZ(i);
    const radius = Math.sqrt(x * x + z * z);
    const angle = Math.atan2(z, x);

    const u = (angle + Math.PI) / (Math.PI * 2);
    const v = MathUtils.clamp(radius / maxRadius, 0, 1);

    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.attributes.uv.needsUpdate = true;
}

function updateGrooveMaterial(
  material: Material,
  texture: Texture,
  root: Object3D,
) {
  const normalized = material.name.trim().toLowerCase();
  const isGrooveLayer = normalized === "grooves";
  const isOuterLayer =
    normalized === "no grooves" || normalized === "vinylouterblack";
  if (!isGrooveLayer && !isOuterLayer) {
    return;
  }

  material.name = isOuterLayer ? "VinylOuterblack" : "Grooves";

  const physicalMaterial = material as MeshStandardMaterial & {
    normalScale?: Vector2;
    clearcoat?: number;
    clearcoatRoughness?: number;
  };

  trackVinylMaterial(physicalMaterial, root);
  applyVinylColorToMaterial(physicalMaterial, defaultVinylColor);
  physicalMaterial.map = null;
  physicalMaterial.normalMap = texture;

  if (!physicalMaterial.normalScale) {
    physicalMaterial.normalScale = new Vector2(1, 1);
  }
  physicalMaterial.normalScale.setScalar(0.42);

  physicalMaterial.roughness = 0.38;
  physicalMaterial.metalness = 0.45;
  physicalMaterial.clearcoat = 0.68;
  physicalMaterial.clearcoatRoughness = 0.2;
  physicalMaterial.needsUpdate = true;
}
