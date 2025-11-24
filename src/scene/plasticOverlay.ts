/**
 * Plastic Overlay Utility
 * Manages random plastic texture overlays for vinyl album cards
 */

// Available plastic texture variants
const PLASTIC_TEXTURES = [
  "plastics/plastic1.png",
  "plastics/plastic2.png",
  "plastics/plastic3.png",
  "plastics/plastic4.png",
  "plastics/plastic5.png",
  "plastics/plastic6.png",
  "plastics/plastic7.png",
  "plastics/plastic8.png",
  "plastics/plastic9.png",
  "plastics/plastic10.png",
];

// Rotation options for variation (degrees)
const ROTATION_OPTIONS = [0, 90, 180, 270];

// Mirror options for variation (flip horizontal or vertical, or none)
const MIRROR_OPTIONS = [
  "", // no mirror
  "scaleX(-1)", // flip horizontal
  "scaleY(-1)", // flip vertical
];

// Overlay strength (0.0 to 1.0) - adjust this to control brightness/intensity
export const PLASTIC_OVERLAY_OPACITY = 1;

// Blend mode for plastic overlay - options: "normal", "multiply", "overlay", "soft-light", "hard-light"
export const PLASTIC_OVERLAY_BLEND_MODE = "normal";

/**
 * Get random plastic texture variant
 */
function getRandomPlasticTexture(): string {
  const randomIndex = Math.floor(Math.random() * PLASTIC_TEXTURES.length);
  return PLASTIC_TEXTURES[randomIndex];
}

/**
 * Get random rotation angle for the plastic overlay
 */
function getRandomRotation(): number {
  const randomIndex = Math.floor(Math.random() * ROTATION_OPTIONS.length);
  return ROTATION_OPTIONS[randomIndex];
}

/**
 * Get random mirror transformation for the plastic overlay
 */
function getRandomMirror(): string {
  const randomIndex = Math.floor(Math.random() * MIRROR_OPTIONS.length);
  return MIRROR_OPTIONS[randomIndex];
}

// Cache to store consistent plastic overlays per entry ID
const plasticOverlayCache = new Map<string, string>();

/**
 * Generate plastic overlay HTML element with random texture, rotation, and mirroring
 * Uses consistent overlay for each entry ID
 * @param entryId - Unique identifier for the entry
 * @returns HTML string for the plastic overlay
 */
export function generatePlasticOverlay(entryId: string): string {
  // Check if we already have a cached overlay for this entry
  if (plasticOverlayCache.has(entryId)) {
    return plasticOverlayCache.get(entryId)!;
  }

  // Generate new overlay
  const texture = getRandomPlasticTexture();
  const rotation = getRandomRotation();
  const mirror = getRandomMirror();
  const textureUrl = `/${texture}`;

  // Combine rotation and mirror transforms
  const transforms = [`rotate(${rotation}deg)`, mirror]
    .filter(Boolean)
    .join(" ");

  const overlayHTML = `
    <div class="plastic-overlay" style="background-image: url('${textureUrl}'); transform: ${transforms}; opacity: ${PLASTIC_OVERLAY_OPACITY};" title="Plastic texture overlay">
    </div>
  `;

  // Cache it
  plasticOverlayCache.set(entryId, overlayHTML);

  return overlayHTML;
}

/**
 * Get CSS class names for animation sync
 * (plastics will inherit parent's animation classes)
 */
export function getPlasticOverlayClasses(): string {
  return "plastic-overlay-wrapper";
}
