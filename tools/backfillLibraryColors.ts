import { Buffer } from "node:buffer";
import fetch from "node-fetch";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const FALLBACK_BACKGROUND_COLOR = "#1a1a1a";

interface LibraryEntryRecord {
  id: string;
  youtubeId: string;
  artistName: string;
  songName: string;
  imageUrl?: string;
  originalImageUrl?: string;
  releaseId?: string;
  labelColor?: string;
  vinylColor?: string | null;
}

const COVER_CANVAS_SIZE = 100;

function getArg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv.length > index + 1) {
    return process.argv[index + 1];
  }
  return undefined;
}

function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, "");
}

async function fetchLibraryEntries(
  apiUrl: string,
): Promise<LibraryEntryRecord[]> {
  const baseUrl = normalizeBaseUrl(apiUrl);
  const response = await fetch(`${baseUrl}/api/library`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch entries: ${response.status} ${response.statusText}`,
    );
  }
  const payload = await response.json();
  return payload.entries || [];
}

async function patchEntryColors(
  apiUrl: string,
  adminToken: string,
  entryId: string,
  labelColor: string,
  vinylColor: string | null,
): Promise<void> {
  const baseUrl = normalizeBaseUrl(apiUrl);
  const response = await fetch(`${baseUrl}/api/library/${entryId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      labelColor,
      vinylColor,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to update entry ${entryId}: ${response.status} ${response.statusText} ${body}`,
    );
  }
}

function resolveCoverUrl(entry: LibraryEntryRecord): string {
  if (entry.releaseId && entry.originalImageUrl) {
    return entry.originalImageUrl;
  }
  if (entry.imageUrl) {
    if (entry.imageUrl.startsWith("blob:") && entry.originalImageUrl) {
      return entry.originalImageUrl;
    }
    return entry.imageUrl;
  }
  return `https://img.youtube.com/vi/${entry.youtubeId}/maxresdefault.jpg`;
}

async function loadCoverImageData(url: string): Promise<Uint8ClampedArray> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load cover ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const { data, width, height } = decodeImageBuffer(buffer);
  return downscaleImage(data, width, height);
}

function decodeImageBuffer(buffer: Buffer): {
  data: Uint8Array;
  width: number;
  height: number;
} {
  if (isJpeg(buffer)) {
    const decoded = jpeg.decode(buffer, { useTArray: true });
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  }

  if (isPng(buffer)) {
    const png = PNG.sync.read(buffer);
    return { data: png.data, width: png.width, height: png.height };
  }

  throw new Error("Unsupported image format; only JPEG/PNG are supported");
}

function downscaleImage(
  source: Uint8Array,
  srcWidth: number,
  srcHeight: number,
): Uint8ClampedArray {
  const dest = new Uint8ClampedArray(COVER_CANVAS_SIZE * COVER_CANVAS_SIZE * 4);
  const xRatio = Math.max(srcWidth / COVER_CANVAS_SIZE, 1);
  const yRatio = Math.max(srcHeight / COVER_CANVAS_SIZE, 1);

  for (let y = 0; y < COVER_CANVAS_SIZE; y++) {
    const srcY = Math.min(Math.floor(y * yRatio), srcHeight - 1);
    for (let x = 0; x < COVER_CANVAS_SIZE; x++) {
      const srcX = Math.min(Math.floor(x * xRatio), srcWidth - 1);
      const srcIndex = (srcY * srcWidth + srcX) * 4;
      const destIndex = (y * COVER_CANVAS_SIZE + x) * 4;
      dest[destIndex] = source[srcIndex];
      dest[destIndex + 1] = source[srcIndex + 1];
      dest[destIndex + 2] = source[srcIndex + 2];
      dest[destIndex + 3] = source[srcIndex + 3];
    }
  }

  return dest;
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function calculateVibrance(r: number, g: number, b: number): number {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const l = (max + min) / 2;

  if (max === min) {
    return 0;
  }

  const s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  const luminanceWeight = 1 - Math.abs(l - 0.5) * 2;
  return s * luminanceWeight;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbToHslNormalized(
  r: number,
  g: number,
  b: number,
): { s: number; l: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const l = (max + min) / 2;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  }

  return { s, l };
}

function getColorLuminance(hexColor: string): number {
  const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
  if (!rgb) return 0.5;

  const values = [1, 2, 3].map((index) => parseInt(rgb[index], 16) / 255);
  return (
    0.2126 *
      (values[0] <= 0.03928
        ? values[0] / 12.92
        : Math.pow((values[0] + 0.055) / 1.055, 2.4)) +
    0.7152 *
      (values[1] <= 0.03928
        ? values[1] / 12.92
        : Math.pow((values[1] + 0.055) / 1.055, 2.4)) +
    0.0722 *
      (values[2] <= 0.03928
        ? values[2] / 12.92
        : Math.pow((values[2] + 0.055) / 1.055, 2.4))
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function isGrayscaleColor(
  hexColor: string,
  saturationThreshold: number = 0.12,
): boolean {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return false;
  const { s } = rgbToHslNormalized(rgb.r, rgb.g, rgb.b);
  return s < saturationThreshold;
}

function isDarkColor(
  hexColor: string,
  luminanceThreshold: number = 0.01,
): boolean {
  return getColorLuminance(hexColor) < luminanceThreshold;
}

function deriveVinylColorFromAlbumColor(albumColor: string): string | null {
  if (!albumColor || !hexToRgb(albumColor) || isGrayscaleColor(albumColor)) {
    return null;
  }
  if (isDarkColor(albumColor)) {
    return null;
  }
  return albumColor;
}

function extractVibrantColorFromData(data: Uint8ClampedArray): string {
  let bestColor = "#e0e0e0";
  let bestVibrance = -1;

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 128) continue;
    const brightness = (r + g + b) / 3;
    if (brightness > 240 || brightness < 15) continue;

    const vibrance = calculateVibrance(r, g, b);
    if (vibrance > bestVibrance) {
      bestVibrance = vibrance;
      bestColor = rgbToHex(r, g, b);
    }
  }

  return bestColor;
}

function extractDominantColorFromData(data: Uint8ClampedArray): string {
  const colorMap = new Map<
    string,
    { count: number; r: number; g: number; b: number }
  >();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 128) continue;

    const bucketR = Math.floor(r / 32) * 32;
    const bucketG = Math.floor(g / 32) * 32;
    const bucketB = Math.floor(b / 32) * 32;
    const key = `${bucketR},${bucketG},${bucketB}`;

    const existing = colorMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      colorMap.set(key, { count: 1, r: bucketR, g: bucketG, b: bucketB });
    }
  }

  let bestColor = "#e0e0e0";
  let bestScore = -1;
  let fallbackMostCommon = "#e0e0e0";
  let fallbackMaxCount = 0;

  for (const colorData of colorMap.values()) {
    const { r, g, b, count } = colorData;
    const { s, l } = rgbToHslNormalized(r, g, b);
    const brightness = (r + g + b) / 3;
    const hex = rgbToHex(r, g, b);

    if (count > fallbackMaxCount) {
      fallbackMaxCount = count;
      fallbackMostCommon = hex;
    }

    if ((l < 0.12 && s < 0.25) || (l > 0.92 && s < 0.1)) {
      continue;
    }

    const darknessPenalty = l < 0.08 ? 0.15 : l < 0.18 ? 0.4 : 1;
    const lightnessPenalty = l > 0.9 ? 0.2 : l > 0.82 ? 0.5 : 1;
    const grayscalePenalty = s < 0.08 ? 0.2 : s < 0.15 ? 0.55 : 1;
    const balancedLightnessBoost = 0.6 + Math.max(0, 0.6 - Math.abs(l - 0.5));
    const saturationBoost = 0.6 + s * 0.8;
    const brightnessGuard = brightness < 18 || brightness > 238 ? 0.35 : 1;

    const score =
      count *
      saturationBoost *
      balancedLightnessBoost *
      darknessPenalty *
      lightnessPenalty *
      grayscalePenalty *
      brightnessGuard;

    if (score > bestScore) {
      bestScore = score;
      bestColor = hex;
    }
  }

  return bestScore > 0 ? bestColor : fallbackMostCommon;
}

async function computeEntryColors(
  entry: LibraryEntryRecord,
): Promise<{ labelColor: string; vinylColor: string | null }> {
  try {
    const coverUrl = resolveCoverUrl(entry);
    const imageData = await loadCoverImageData(coverUrl);
    const labelColor = extractVibrantColorFromData(imageData);
    const dominantColor = extractDominantColorFromData(imageData);
    const vinylColor = deriveVinylColorFromAlbumColor(dominantColor);
    return { labelColor, vinylColor };
  } catch (error) {
    console.warn(
      `[backfill] Failed to compute colors for ${entry.artistName} - ${entry.songName}:`,
      error,
    );
    return { labelColor: FALLBACK_BACKGROUND_COLOR, vinylColor: null };
  }
}

async function main(): Promise<void> {
  const apiUrl =
    getArg("api-url") ??
    process.env.API_URL ??
    process.env.VINYL_API_URL ??
    process.env.WORKER_API_URL;
  const adminToken =
    getArg("admin-token") ??
    process.env.ADMIN_TOKEN ??
    process.env.VINYL_ADMIN_TOKEN;

  if (!apiUrl || !adminToken) {
    console.error(
      "Missing required parameters. Provide --api-url and --admin-token or set API_URL/ADMIN_TOKEN env vars.",
    );
    process.exit(1);
  }

  const entries = await fetchLibraryEntries(apiUrl);
  console.log(`Fetched ${entries.length} entries from ${apiUrl}`);

  for (const entry of entries) {
    const needsColors =
      entry.labelColor === undefined || entry.vinylColor === undefined;
    if (!needsColors) {
      continue;
    }

    console.log(`Computing colors for ${entry.artistName} - ${entry.songName}`);
    const { labelColor, vinylColor } = await computeEntryColors(entry);
    await patchEntryColors(
      apiUrl,
      adminToken,
      entry.id,
      labelColor,
      vinylColor,
    );
    console.log(`Updated ${entry.id} with ${labelColor} / ${vinylColor}`);
  }
}

main().catch((error) => {
  console.error("Backfill script failed:", error);
  process.exit(1);
});
