import {
  BufferAttribute,
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
const VINYL_POLYGON_OFFSET_FACTOR = -1.2;
const VINYL_POLYGON_OFFSET_UNITS = 0;

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

      updateGrooveMaterial(material, texture);
    });
    applyVinylRenderBias(mesh);
  });
}

function applyVinylRenderBias(mesh: Mesh) {
  mesh.renderOrder = Math.max(mesh.renderOrder, VINYL_RENDER_ORDER);
  applyPolygonOffsetToMaterials(
    mesh,
    VINYL_POLYGON_OFFSET_FACTOR,
    VINYL_POLYGON_OFFSET_UNITS,
  );
}

function applyPolygonOffsetToMaterials(
  mesh: Mesh,
  factor: number,
  units: number,
) {
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

function updateGrooveMaterial(material: Material, texture: Texture) {
  const normalized = material.name.toLowerCase();
  if (normalized !== "grooves" && normalized !== "no grooves") {
    return;
  }

  const physicalMaterial = material as MeshStandardMaterial & {
    normalScale?: Vector2;
    clearcoat?: number;
    clearcoatRoughness?: number;
  };

  physicalMaterial.color?.set("#050505");
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
