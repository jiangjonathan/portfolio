import { extractYouTubeVideoId } from "../utils/metadata";
import { extractDominantColor } from "../utils/colorUtils";

export interface YouTubeMetadataWithColor {
  videoId: string;
  title: string;
  thumbnail: string;
  dominantColor: string;
}

/**
 * Fetches oEmbed metadata for a YouTube video
 */
export async function fetchYouTubeOEmbed(
  videoId: string,
): Promise<YouTubeMetadataWithColor> {
  const endpoint = "https://www.youtube.com/oembed";
  const params = new URLSearchParams({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    format: "json",
  });

  const response = await fetch(`${endpoint}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch oEmbed data: ${response.statusText}`);
  }

  const data = await response.json();

  // Extract thumbnail URL (use the highest quality available)
  let thumbnailUrl = data.thumbnail_url || "";
  if (!thumbnailUrl && data.video_id) {
    // Fallback to standard YouTube thumbnail
    thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }

  // Extract dominant color from thumbnail
  const dominantColor = thumbnailUrl
    ? await extractDominantColor(thumbnailUrl)
    : "#e0e0e0";

  return {
    videoId,
    title: data.title || "Untitled",
    thumbnail: thumbnailUrl,
    dominantColor,
  };
}

export interface YouTubeURLInputOptions {
  onVideoChange?: (metadata: YouTubeMetadataWithColor) => void;
  onError?: (error: Error) => void;
}

/**
 * Creates a YouTube URL input UI component
 */
export function createYouTubeURLInput(
  options: YouTubeURLInputOptions = {},
): HTMLDivElement {
  const { onVideoChange, onError } = options;

  const container = document.createElement("div");
  container.className = "youtube-url-input-container";
  Object.assign(container.style, {
    position: "fixed",
    top: "1.5rem",
    right: "1.5rem",
    zIndex: "999",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    fontFamily: '"Space Grotesk", "Inter", sans-serif',
  });

  // Label
  const label = document.createElement("label");
  label.textContent = "YouTube URL:";
  Object.assign(label.style, {
    fontSize: "0.75rem",
    fontWeight: "600",
    color: "#202022",
    display: "block",
    marginBottom: "0.2rem",
  });

  // Input field
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Paste YouTube URL or video ID...";
  Object.assign(input.style, {
    padding: "0.5rem",
    fontSize: "0.85rem",
    border: "1px solid #d0d0d0",
    borderRadius: "4px",
    fontFamily: '"Space Grotesk", "Inter", monospace',
    width: "280px",
    boxSizing: "border-box",
  });

  // Error message
  const errorMessage = document.createElement("div");
  Object.assign(errorMessage.style, {
    fontSize: "0.7rem",
    color: "#c1121f",
    minHeight: "1rem",
    display: "none",
  });

  // Loading indicator
  const loadingIndicator = document.createElement("div");
  Object.assign(loadingIndicator.style, {
    fontSize: "0.7rem",
    color: "#666",
    minHeight: "1rem",
    display: "none",
  });

  // Handle input submission
  const handleSubmit = async (urlOrId: string) => {
    if (!urlOrId.trim()) {
      errorMessage.style.display = "none";
      return;
    }

    try {
      errorMessage.style.display = "none";
      loadingIndicator.style.display = "block";
      loadingIndicator.textContent = "Loading...";

      // Extract video ID from URL or use as-is
      const videoId = extractYouTubeVideoId(urlOrId);
      if (!videoId) {
        throw new Error("Invalid YouTube URL or video ID");
      }

      // Fetch oEmbed metadata and dominant color
      const metadata = await fetchYouTubeOEmbed(videoId);

      loadingIndicator.style.display = "none";

      if (onVideoChange) {
        onVideoChange(metadata);
      }
    } catch (error) {
      loadingIndicator.style.display = "none";
      const err = error instanceof Error ? error : new Error(String(error));
      errorMessage.textContent = err.message;
      errorMessage.style.display = "block";
      if (onError) {
        onError(err);
      }
    }
  };

  // Submit on Enter key
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSubmit(input.value);
    }
  });

  // Submit button
  const submitButton = document.createElement("button");
  submitButton.textContent = "Load Video";
  Object.assign(submitButton.style, {
    padding: "0.5rem 1rem",
    fontSize: "0.8rem",
    fontWeight: "600",
    backgroundColor: "#202022",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontFamily: '"Space Grotesk", "Inter", sans-serif',
    transition: "background-color 0.2s",
  });

  submitButton.addEventListener("mouseover", () => {
    submitButton.style.backgroundColor = "#333";
  });

  submitButton.addEventListener("mouseout", () => {
    submitButton.style.backgroundColor = "#202022";
  });

  submitButton.addEventListener("click", () => {
    handleSubmit(input.value);
  });

  // Append elements
  const inputGroup = document.createElement("div");
  Object.assign(inputGroup.style, {
    display: "flex",
    gap: "0.5rem",
  });
  inputGroup.append(input, submitButton);

  container.append(label, inputGroup, errorMessage, loadingIndicator);

  return container;
}
