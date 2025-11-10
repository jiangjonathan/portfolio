import type { VideoMetadata } from "./youtube";
import type { LabelVisualOptions } from "./labels";

type MetadataControllerDeps = {
  labelVisuals: LabelVisualOptions;
  onVisualsUpdated: () => void;
};

export type MetadataController = {
  applyMetadata: (metadata: VideoMetadata | null, force?: boolean) => void;
  loadSupplementalLabelMetadata: () => Promise<void>;
};

export function createMetadataController({
  labelVisuals,
  onVisualsUpdated,
}: MetadataControllerDeps): MetadataController {
  let metadataLocked = false;

  const applyMetadata = (metadata: VideoMetadata | null, force = false) => {
    if (!metadata) return;
    if (metadataLocked && !force) {
      return;
    }

    const nextArtist = metadata.artist?.trim() || "Unknown Artist";
    const nextSong = metadata.song?.trim() || "Untitled Track";
    const nextAlbum = metadata.album?.trim() ?? "";

    if (
      labelVisuals.title1 === nextArtist &&
      labelVisuals.title2 === nextSong &&
      (labelVisuals.title3 ?? "") === nextAlbum
    ) {
      return;
    }

    labelVisuals.title1 = nextArtist;
    labelVisuals.title2 = nextSong;
    labelVisuals.title3 = nextAlbum;
    if (force) {
      metadataLocked = true;
    }
    onVisualsUpdated();
  };

  const loadSupplementalLabelMetadata = () =>
    fetch("/track-info.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("No supplemental metadata");
        }
        return response.json() as Promise<Partial<VideoMetadata>>;
      })
      .then((data) => {
        applyMetadata(
          {
            artist: data.artist ?? "",
            song: data.song ?? "",
            album: data.album ?? "",
          },
          true,
        );
      })
      .catch(() => {});

  return {
    applyMetadata,
    loadSupplementalLabelMetadata,
  };
}

export function extractYouTubeVideoId(source: string): string | null {
  if (!source) return null;
  const trimmed = source.trim();
  const idPattern = /^[a-zA-Z0-9_-]{11}$/;
  if (idPattern.test(trimmed)) {
    return trimmed;
  }
  const ensureProtocol = (value: string) =>
    value.startsWith("http://") || value.startsWith("https://")
      ? value
      : `https://${value}`;
  try {
    const normalized = ensureProtocol(trimmed);
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./i, "");
    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (host === "youtu.be" && pathSegments.length) {
      const candidate = pathSegments[0];
      return idPattern.test(candidate) ? candidate : null;
    }
    if (
      host === "youtube.com" ||
      host === "music.youtube.com" ||
      host === "m.youtube.com"
    ) {
      const queryId = url.searchParams.get("v");
      if (queryId && idPattern.test(queryId)) {
        return queryId;
      }
      if (pathSegments.length) {
        const last = pathSegments[pathSegments.length - 1];
        return idPattern.test(last) ? last : null;
      }
    }
  } catch {
    // fall through to null
  }
  return null;
}
