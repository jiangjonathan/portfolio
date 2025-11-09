/**
 * Reference implementation of the concentric groove normal-map generator used at runtime.
 */
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  MathUtils,
} from "three";

const UV_SPAN = 10;
const DISC_RADIUS = 2.6;
const RING_COUNT = 240;
const GROOVE_WIDTH = 0.22;
const GROOVE_DEPTH = 1;
const SEPARATOR_INTERVAL = 48;
const SEPARATOR_WIDTH_MULTIPLIER = 2.5;
const SEPARATOR_DEPTH = 0.45;
const INNER_LABEL_GUARD = 0.35;
const BASE_CENTERS = [
  { u: 2.5, v: 2.5 },
  { u: 2.5, v: 7.5 },
];
const SAMPLE_OFFSETS = [0.15, 0.5, 0.85];
const NORMAL_STRENGTH = 1.85;

export function createVinylNormalMapReference(size = 6144) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to acquire 2D context for groove texture.");
  }

  const heightField = new Float32Array(size * size);

  const hash = (value: number) =>
    Math.abs(Math.sin(value * 127.1 + 311.7) * 43758.5453) % 1;

  const sampleHeight = (px: number, py: number) => {
    const uCoord = (px / size) * UV_SPAN;
    const vCoord = (1 - py / size) * UV_SPAN;

    let minDistance = Infinity;
    let closestCenterIndex = 0;
    let closestCenter = { u: BASE_CENTERS[0].u, v: BASE_CENTERS[0].v };
    BASE_CENTERS.forEach((center, index) => {
      const vOffset = Math.round((vCoord - center.v) / UV_SPAN) * UV_SPAN;
      const effectiveV = center.v + vOffset;
      const du = uCoord - center.u;
      const dv = vCoord - effectiveV;
      const distance = Math.sqrt(du * du + dv * dv);
      if (distance < minDistance) {
        minDistance = distance;
        closestCenter = { u: center.u, v: effectiveV };
        closestCenterIndex = index;
      }
    });

    if (minDistance > DISC_RADIUS) {
      return 0;
    }

    const radiusNorm = Math.min(minDistance / DISC_RADIUS, 1);
    if (radiusNorm < INNER_LABEL_GUARD) {
      return SEPARATOR_DEPTH;
    }

    const radialVariation =
      0.02 * Math.sin(radiusNorm * 80 + closestCenter.u) +
      0.013 * Math.sin(radiusNorm * 200 + closestCenter.v);
    const warpedRadius = MathUtils.clamp(radiusNorm + radialVariation, 0, 1);
    const angle = Math.atan2(
      vCoord - closestCenter.v,
      uCoord - closestCenter.u,
    );
    const rotationNoiseRaw =
      0.08 * Math.sin(angle * 16 + closestCenter.u * 7) +
      0.03 * Math.sin(radiusNorm * 180 + closestCenter.v * 11) +
      (hash(Math.floor(radiusNorm * RING_COUNT) + closestCenter.u * 17) - 0.5) *
        0.15;
    const maxNoiseOffset = GROOVE_WIDTH * 0.18;
    const rotationNoise = MathUtils.clamp(
      rotationNoiseRaw,
      -maxNoiseOffset,
      maxNoiseOffset,
    );

    const basePosition = warpedRadius * RING_COUNT;
    const trackIndex = Math.floor(basePosition);
    const isSeparator = trackIndex % SEPARATOR_INTERVAL === 0;
    const positionForPhase = basePosition + (isSeparator ? 0 : rotationNoise);
    const groovePhase = ((positionForPhase % 1) + 1) % 1;

    if (isSeparator) {
      const separatorWidth = GROOVE_WIDTH * SEPARATOR_WIDTH_MULTIPLIER;
      return groovePhase < separatorWidth ? SEPARATOR_DEPTH : 0;
    }

    const trackVariation =
      0.65 +
      hash(
        trackIndex * 19.19 +
          closestCenter.v * 23.3 +
          closestCenterIndex * 11.17,
      ) *
        0.55;
    const effectiveGrooveWidth = GROOVE_WIDTH * trackVariation;

    if (groovePhase >= effectiveGrooveWidth) {
      return 0;
    }

    const local = groovePhase / effectiveGrooveWidth;
    const triangle = 1 - Math.abs(local * 2 - 1);
    return triangle * GROOVE_DEPTH;
  };

  const sampleCount = SAMPLE_OFFSETS.length ** 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let accum = 0;
      for (const oy of SAMPLE_OFFSETS) {
        for (const ox of SAMPLE_OFFSETS) {
          const sampleX = Math.min(size - 1, x + ox);
          const sampleY = Math.min(size - 1, y + oy);
          accum += sampleHeight(sampleX, sampleY);
        }
      }
      heightField[y * size + x] = accum / sampleCount;
    }
  }

  const imageData = context.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const left = heightField[y * size + Math.max(x - 1, 0)];
      const right = heightField[y * size + Math.min(x + 1, size - 1)];
      const top = heightField[Math.max(y - 1, 0) * size + x];
      const bottom = heightField[Math.min(y + 1, size - 1) * size + x];

      const dx = (right - left) * NORMAL_STRENGTH;
      const dy = (bottom - top) * NORMAL_STRENGTH;
      const dz = 1;
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

      const nx = dx / length;
      const ny = dy / length;
      const nz = dz / length;

      const dataIndex = index * 4;
      data[dataIndex] = (nx * 0.5 + 0.5) * 255;
      data[dataIndex + 1] = (ny * 0.5 + 0.5) * 255;
      data[dataIndex + 2] = (nz * 0.5 + 0.5) * 255;
      data[dataIndex + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = LinearSRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;

  return texture;
}
