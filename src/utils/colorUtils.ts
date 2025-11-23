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
 * Extracts the most vibrant color from an image (highest saturation)
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
        `[extractDominantColor] CORS error loading ${imageUrl}, using fallback color`,
      );
      // Return a neutral fallback color instead of rejecting
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
