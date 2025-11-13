/**
 * Plastic Overlay Utility
 * Manages random plastic texture overlays for vinyl album cards
 */

// Available plastic texture variants
const PLASTIC_TEXTURES = ["plastic1.png", "plastic3.png", "plastic4.png"];

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

/**
 * Generate plastic overlay HTML element with random texture, rotation, and mirroring
 * @returns HTML string for the plastic overlay
 */
export function generatePlasticOverlay(): string {
  const texture = getRandomPlasticTexture();
  const rotation = getRandomRotation();
  const mirror = getRandomMirror();
  const textureUrl = `/${texture}`;

  // Combine rotation and mirror transforms
  const transforms = [`rotate(${rotation}deg)`, mirror]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="plastic-overlay" style="background-image: url('${textureUrl}'); transform: ${transforms}; opacity: ${PLASTIC_OVERLAY_OPACITY};" title="Plastic texture overlay">
    </div>
  `;
}

/**
 * Get CSS class names for animation sync
 * (plastics will inherit parent's animation classes)
 */
export function getPlasticOverlayClasses(): string {
  return "plastic-overlay-wrapper";
}
