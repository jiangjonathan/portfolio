/**
 * Calculates vibrance (saturation * luminance weight) of an RGB color
 * Higher vibrance = more "pop"
 */
function calculateVibrance(r: number, g: number, b: number): number {
  // Convert to HSL and calculate saturation
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const l = (max + min) / 2;

  if (max === min) {
    return 0; // achromatic (gray)
  }

  const s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);

  // Combine saturation with luminance preference (avoid very dark/light colors)
  const luminanceWeight = 1 - Math.abs(l - 0.5) * 2; // peaks at 0.5, 0 at extremes
  return s * luminanceWeight;
}

/**
 * Extracts the most vibrant color from an image (for labels)
 */
export function extractVibrantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, 100, 100);
        const imageData = ctx.getImageData(0, 0, 100, 100);
        const data = imageData.data;

        // Find the most vibrant color
        let bestColor = "#e0e0e0";
        let bestVibrance = -1;

        // Sample every 4th pixel to speed up processing
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // Skip transparent or near-white/black pixels
          if (a < 128) continue;
          const brightness = (r + g + b) / 3;
          if (brightness > 240 || brightness < 15) continue;

          const vibrance = calculateVibrance(r, g, b);
          if (vibrance > bestVibrance) {
            bestVibrance = vibrance;
            bestColor = rgbToHex(r, g, b);
          }
        }

        resolve(bestColor);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      console.warn(
        `[extractVibrantColor] CORS error loading ${imageUrl}, using fallback color`,
      );
      resolve("#b0b0b0");
    };

    img.src = imageUrl;
  });
}

/**
 * Extracts the dominant color from an image using area-weighted scoring (for vinyl body color)
 */
export function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, 100, 100);
        const imageData = ctx.getImageData(0, 0, 100, 100);
        const data = imageData.data;

        // Build color histogram
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

          // Quantize to reduce color space
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

        // Find color with highest area coverage
        let bestColor = "#e0e0e0";
        let bestScore = -1;
        let fallbackMostCommon = "#e0e0e0";
        let fallbackMaxCount = 0;

        for (const [, colorData] of colorMap) {
          const { r, g, b, count } = colorData;
          const { s, l } = rgbToHslNormalized(r, g, b);
          const brightness = (r + g + b) / 3;
          const hex = rgbToHex(r, g, b);

          // Track pure most-common as a safety fallback
          if (count > fallbackMaxCount) {
            fallbackMaxCount = count;
            fallbackMostCommon = hex;
          }

          // Drop near-black/near-white low-saturation buckets entirely so text
          // and borders don't drive the vinyl color.
          if ((l < 0.12 && s < 0.25) || (l > 0.92 && s < 0.1)) {
            continue;
          }

          // Penalize very dark/very light and very gray buckets so black text
          // or white backgrounds don't dominate the vinyl color.
          const darknessPenalty = l < 0.08 ? 0.15 : l < 0.18 ? 0.4 : 1;
          const lightnessPenalty = l > 0.9 ? 0.2 : l > 0.82 ? 0.5 : 1;
          const grayscalePenalty = s < 0.08 ? 0.2 : s < 0.15 ? 0.55 : 1;
          const balancedLightnessBoost =
            0.6 + Math.max(0, 0.6 - Math.abs(l - 0.5));
          const saturationBoost = 0.6 + s * 0.8;
          const brightnessGuard =
            brightness < 18 || brightness > 238 ? 0.35 : 1;

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

        resolve(bestScore > 0 ? bestColor : fallbackMostCommon);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      console.warn(
        `[extractDominantColor] CORS error loading ${imageUrl}, using fallback color`,
      );
      resolve("#b0b0b0");
    };

    img.src = imageUrl;
  });
}

/**
 * Converts RGB values to hex color string
 */
export function rgbToHex(r: number, g: number, b: number): string {
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

/**
 * Converts hex color string to RGB values
 */
export function hexToRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Calculates luminance of a color using WCAG formula
 * Returns a value between 0 (dark) and 1 (light)
 */
export function getColorLuminance(hexColor: string): number {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return 0.5;

  // WCAG luminance formula
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((val) => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Determines if white or black text is better for a background color
 * Returns "white" or "black"
 */
export function getContrastTextColor(
  backgroundColor: string,
): "#ffffff" | "#000000" {
  const luminance = getColorLuminance(backgroundColor);
  // Use white text for dark backgrounds, black for light backgrounds
  // Using WCAG 2.0 threshold for better contrast
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const GRAYSCALE_SATURATION_THRESHOLD = 0.12;
const DARK_LUMINANCE_THRESHOLD = 0.01;

function rgbToHslNormalized(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      default:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, l };
}

export function isGrayscaleColor(
  hexColor: string,
  saturationThreshold: number = GRAYSCALE_SATURATION_THRESHOLD,
): boolean {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return false;
  const { s } = rgbToHslNormalized(rgb.r, rgb.g, rgb.b);
  return s < saturationThreshold;
}

export function isDarkColor(
  hexColor: string,
  luminanceThreshold: number = DARK_LUMINANCE_THRESHOLD,
): boolean {
  return getColorLuminance(hexColor) < luminanceThreshold;
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgbNormalized(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  if (s === 0) {
    return { r: l, g: l, b: l };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3),
  };
}

export function deriveVinylColorFromBackground(
  backgroundColor: string,
  fallbackColor: string = "#050505",
): string {
  const sourceRgb = hexToRgb(backgroundColor);
  const fallbackRgb = hexToRgb(fallbackColor) ?? { r: 30, g: 64, b: 255 };
  const baseRgb = sourceRgb ?? fallbackRgb;
  const baseHsl = rgbToHslNormalized(baseRgb.r, baseRgb.g, baseRgb.b);
  const fallbackHsl = rgbToHslNormalized(
    fallbackRgb.r,
    fallbackRgb.g,
    fallbackRgb.b,
  );

  let hue = baseHsl.h;
  let saturation = baseHsl.s;
  let lightness = baseHsl.l;

  if (!sourceRgb || baseHsl.s < 0.2) {
    hue = (fallbackHsl.h * 0.75 + baseHsl.h * 0.25) % 1;
    saturation = clamp(0.5 + fallbackHsl.s * 0.3, 0.45, 0.85);
  } else {
    const hueOffset =
      getColorLuminance(backgroundColor || fallbackColor) > 0.45
        ? -0.035
        : 0.045;
    hue = (hue + hueOffset + 1) % 1;
    saturation = clamp(saturation * 1.2 + 0.02, 0.4, 0.86);
  }

  const luminance = getColorLuminance(
    sourceRgb ? backgroundColor : fallbackColor,
  );
  if (luminance > 0.7) {
    lightness = clamp(lightness - 0.35, 0.2, 0.42);
  } else if (luminance > 0.5) {
    lightness = clamp(lightness - 0.25, 0.22, 0.45);
  } else if (luminance < 0.2) {
    lightness = clamp(lightness + 0.12, 0.22, 0.5);
  } else {
    lightness = clamp(lightness - 0.12, 0.22, 0.45);
  }

  const adjusted = hslToRgbNormalized(hue, saturation, lightness);
  return rgbToHex(
    Math.round(adjusted.r * 255),
    Math.round(adjusted.g * 255),
    Math.round(adjusted.b * 255),
  );
}

export function deriveVinylColorFromAlbumColor(
  albumColor: string,
): string | null {
  // If the album art is effectively grayscale, don't color the vinyl
  if (!albumColor || !hexToRgb(albumColor) || isGrayscaleColor(albumColor)) {
    return null;
  }

  // Use the album tone directly so the vinyl matches the cover.
  if (isDarkColor(albumColor)) {
    return null;
  }

  return albumColor;
}
