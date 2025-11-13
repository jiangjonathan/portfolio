/**
 * YouTube Metadata Extraction & Album Art Pipeline
 * 1. Extract YouTube metadata (title, artist, thumbnail)
 * 2. Prompt for missing artist name
 * 3. Fetch album art from MusicBrainz + Cover Art Archive (user selects from top 5)
 * 4. Return metadata with image URL (no storage needed)
 */

export interface SongMetadata {
  youtubeId: string;
  artistName: string;
  songName: string;
  imageUrl: string; // Link to cover art (YouTube thumbnail or MusicBrainz)
  youtubeTitle: string; // Original YouTube video title
  youtubeThumbUrl: string; // Fallback thumbnail
  genre?: string; // Music genre from MusicBrainz
  releaseYear?: string; // Release year from MusicBrainz
}

// ============================================================================
// MusicBrainz Album Art Search with User Selection
// ============================================================================

interface AlbumArtCandidate {
  releaseId: string;
  title: string;
  artist: string;
  date?: string;
  coverArtUrl: string | null;
  genre?: string;
  releaseYear?: string;
  tags?: Array<{ name: string; count: number }>;
}

async function fetchCoverArtForRelease(
  releaseId: string,
): Promise<string | null> {
  try {
    // Request 500x500 size for balanced quality and loading speed
    const releaseUrl = `https://coverartarchive.org/release/${releaseId}/front-500`;
    const releaseRes = await fetch(releaseUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    if (releaseRes.ok) return releaseUrl;

    // Fallback to full size if 500 not available
    const fullUrl = `https://coverartarchive.org/release/${releaseId}/front`;
    const fullRes = await fetch(fullUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    if (fullRes.ok) return fullUrl;
  } catch (error) {
    // Timeout or network error - ignore
    console.debug("Cover art fetch timeout for release:", releaseId);
  }
  return null;
}

async function searchMusicBrainz(
  songName: string,
  artistName: string,
): Promise<AlbumArtCandidate[]> {
  try {
    // Collect unique releases
    const releaseMap = new Map<string, AlbumArtCandidate>();

    // Helper function to search recordings
    const searchRecordings = async (artist: string) => {
      const query = `recording:"${songName}" AND artist:"${artist}"`;
      const url = `https://musicbrainz.org/ws/2/recording/?fmt=json&limit=20&query=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "vinyl-library/1.0",
        },
      });

      if (!response.ok) return;

      const data = await response.json();
      const recordings = data.recordings || [];

      for (const rec of recordings) {
        const releases = rec.releases || [];
        for (const release of releases) {
          if (releaseMap.has(release.id)) continue;

          const artistCredit = release["artist-credit"]?.[0];
          const artist =
            artistCredit?.name || artistCredit?.artist?.name || "Unknown";

          // Extract genre from tags
          const tags = release.tags || [];
          const genre = tags.length > 0 ? tags[0].name : undefined;

          // Extract year from date
          const releaseYear = release.date
            ? release.date.split("-")[0]
            : undefined;

          releaseMap.set(release.id, {
            releaseId: release.id,
            title: release.title,
            artist: artist,
            date: release.date,
            coverArtUrl: null, // Will be fetched later
            genre: genre,
            releaseYear: releaseYear,
            tags: tags,
          });

          // Limit to total 20 releases per search variant
          if (releaseMap.size >= 20) break;
        }
        if (releaseMap.size >= 20) break;
      }
    };

    // Helper function to search release groups
    const searchReleaseGroups = async (artist: string) => {
      try {
        const rgQuery = `release:"${songName}" AND artist:"${artist}"`;
        const rgUrl = `https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=10&query=${encodeURIComponent(rgQuery)}`;

        const rgResponse = await fetch(rgUrl, {
          headers: {
            "User-Agent": "vinyl-library/1.0",
          },
        });

        if (!rgResponse.ok) return;

        const rgData = await rgResponse.json();
        const releaseGroups = rgData["release-groups"] || [];

        // Fetch releases for all release groups in parallel (OPTIMIZED)
        const releaseGroupPromises = releaseGroups.map(async (rg: any) => {
          const rgId = rg.id;
          const releasesUrl = `https://musicbrainz.org/ws/2/release-group/${rgId}/releases?fmt=json&limit=10`;

          try {
            const releasesResponse = await fetch(releasesUrl, {
              headers: {
                "User-Agent": "vinyl-library/1.0",
              },
            });

            if (!releasesResponse.ok) return [];

            const releasesData = await releasesResponse.json();
            return releasesData.releases || [];
          } catch (error) {
            console.debug("Release fetch error:", error);
            return [];
          }
        });

        const allReleases = (await Promise.all(releaseGroupPromises)).flat();

        for (const release of allReleases) {
          if (releaseMap.has(release.id)) continue;
          if (releaseMap.size >= 30) break;

          const artistCredit = release["artist-credit"]?.[0];
          const artist =
            artistCredit?.name || artistCredit?.artist?.name || "Unknown";

          const tags = release.tags || [];
          const genre = tags.length > 0 ? tags[0].name : undefined;

          const releaseYear = release.date
            ? release.date.split("-")[0]
            : undefined;

          releaseMap.set(release.id, {
            releaseId: release.id,
            title: release.title,
            artist: artist,
            date: release.date,
            coverArtUrl: null,
            genre: genre,
            releaseYear: releaseYear,
            tags: tags,
          });
        }
      } catch (rgError) {
        console.debug("Release group search error:", rgError);
      }
    };

    // Parallelize all artist variation searches (OPTIMIZED)
    const artistWithFt = artistName.replace(/feat\./gi, "ft.");
    const artistWithFeat = artistName.replace(/ft\./gi, "feat.");

    const searchPromises = [];

    // Always search with original artist name
    searchPromises.push(searchRecordings(artistName));
    searchPromises.push(searchReleaseGroups(artistName));

    // Add ft. variation if different
    if (artistWithFt !== artistName) {
      searchPromises.push(searchRecordings(artistWithFt));
      searchPromises.push(searchReleaseGroups(artistWithFt));
    }

    // Add feat. variation if different from both original and ft.
    if (artistWithFeat !== artistName && artistWithFeat !== artistWithFt) {
      searchPromises.push(searchRecordings(artistWithFeat));
      searchPromises.push(searchReleaseGroups(artistWithFeat));
    }

    // Execute all searches in parallel
    await Promise.all(searchPromises);

    const candidates = Array.from(releaseMap.values());

    // Fetch cover art for all candidates in parallel (much faster)
    const coverArtPromises = candidates.map(async (candidate) => {
      candidate.coverArtUrl = await fetchCoverArtForRelease(
        candidate.releaseId,
      );
      return candidate;
    });

    await Promise.all(coverArtPromises);

    // Filter to only those with cover art AND matching artist
    // Note: Be lenient with artist matching - if we searched with featured artists,
    // accept results where just the main artist matches (since release-level credits
    // often don't include featured artists, only track-level credits do)
    const withCoverArt = candidates.filter((c) => {
      if (!c.coverArtUrl) return false;

      // If artist matches, accept it
      if (artistMatches(c.artist, artistName)) return true;

      // If we searched with featured artists but result doesn't have them,
      // check if at least the main artist matches
      const searchedMain = getMainArtist(normalizeArtistName(artistName));
      const resultMain = getMainArtist(normalizeArtistName(c.artist));

      return searchedMain === resultMain;
    });

    console.log(
      `${withCoverArt.length} results after artist filtering (searched for: "${artistName}")`,
    );

    // Deduplicate by album title to avoid showing multiple editions/versions
    // Keep first occurrence of each unique title
    const uniqueByTitle = new Map<string, AlbumArtCandidate>();
    withCoverArt.forEach((c) => {
      if (!uniqueByTitle.has(c.title)) {
        uniqueByTitle.set(c.title, c);
      }
    });

    // Return top 5 unique albums
    return Array.from(uniqueByTitle.values()).slice(0, 5);
  } catch (error) {
    console.error("MusicBrainz error:", error);
    return [];
  }
}

async function showAlbumArtPicker(
  candidates: AlbumArtCandidate[],
  songName: string,
  artistName: string,
): Promise<string | null | "not_found"> {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 20px;
      overflow-y: auto;
    `;

    const container = document.createElement("div");
    container.style.cssText = `
      max-width: 700px;
      width: 100%;
      color: #000;
    `;

    const title = document.createElement("h2");
    title.textContent = `Select Album Art`;
    title.style.cssText =
      "margin: 0 0 0.5rem 0; font-size: 1.1rem; font-weight: 500;";
    container.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.textContent = `${songName} — ${artistName}`;
    subtitle.style.cssText =
      "margin: 0 0 2rem 0; color: #666; font-size: 0.9rem;";
    container.appendChild(subtitle);

    if (candidates.length === 0) {
      const noResults = document.createElement("p");
      noResults.textContent = "No album art found.";
      noResults.style.cssText = "color: #666; margin-bottom: 1.5rem;";
      container.appendChild(noResults);

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "OK";
      closeBtn.style.cssText = `
        padding: 0.5rem 1rem;
        background: #000;
        color: #fff;
        border: none;
        cursor: pointer;
        font-size: 0.85rem;
      `;
      closeBtn.addEventListener("click", () => {
        modal.remove();
        resolve(null);
      });
      container.appendChild(closeBtn);
    } else {
      const grid = document.createElement("div");
      grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
      `;

      candidates.forEach((candidate) => {
        const card = document.createElement("div");
        card.style.cssText = `
          cursor: pointer;
          transition: opacity 0.15s;
        `;

        card.addEventListener("mouseenter", () => {
          card.style.opacity = "0.7";
        });

        card.addEventListener("mouseleave", () => {
          card.style.opacity = "1";
        });

        card.addEventListener("click", () => {
          modal.remove();
          resolve(candidate.coverArtUrl);
        });

        if (candidate.coverArtUrl) {
          const img = document.createElement("img");
          img.src = candidate.coverArtUrl;
          img.style.cssText = `
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
            margin-bottom: 0.5rem;
            border: 1px solid #ddd;
          `;
          card.appendChild(img);
        }

        const info = document.createElement("div");
        info.style.cssText = "font-size: 0.8rem; line-height: 1.3;";

        const albumTitle = document.createElement("div");
        albumTitle.textContent = candidate.title;
        albumTitle.style.cssText = "margin-bottom: 0.15rem; color: #000;";
        info.appendChild(albumTitle);

        const artist = document.createElement("div");
        artist.textContent = candidate.artist;
        artist.style.cssText = "color: #666; font-size: 0.75rem;";
        info.appendChild(artist);

        card.appendChild(info);
        grid.appendChild(card);
      });

      container.appendChild(grid);

      const skipLink = document.createElement("a");
      skipLink.textContent = "not found?";
      skipLink.style.cssText = `
        display: inline-block;
        color: var(--vinyl-link-color);
        text-decoration: underline;
        cursor: pointer;
        font-size: var(--vinyl-link-font-size);
        font-family: inherit;
        -webkit-font-smoothing: none;
        -moz-osx-font-smoothing: grayscale;
        text-shadow: var(--vinyl-link-text-shadow);
      `;
      skipLink.addEventListener("mouseenter", () => {
        skipLink.style.color = "var(--vinyl-link-hover-color)";
      });
      skipLink.addEventListener("mouseleave", () => {
        skipLink.style.color = "var(--vinyl-link-color)";
      });
      skipLink.addEventListener("click", (e) => {
        e.preventDefault();
        modal.remove();
        resolve("not_found");
      });
      container.appendChild(skipLink);
    }

    modal.appendChild(container);
    document.body.appendChild(modal);
  });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract featured artists from song name
 * Looks for patterns like "ft.", "feat.", "featuring", "&", "x", etc.
 * Returns the featured artist string if found
 */
function extractFeaturedArtist(songName: string): string | null {
  // Pattern matches: ft., feat., feat, featuring, &, x (with word boundaries)
  const featurePattern =
    /\b(?:ft\.?|feat\.?|featuring|&|x)\s+(.+?)(?:\s*$|\s*\(|\s*\[)/i;
  const match = songName.match(featurePattern);

  if (match && match[1]) {
    return match[1].trim();
  }

  return null;
}

/**
 * Remove featured artist portion from song name
 * Returns the clean song title without the "ft. Artist" part
 */
function removeFeaturedArtist(songName: string): string {
  // Pattern matches: ft., feat., feat, featuring, &, x and everything after
  const featurePattern =
    /\s*\b(?:ft\.?|feat\.?|featuring|&|x)\s+.+?(?:\s*$|\s*\(|\s*\[)/i;
  return songName.replace(featurePattern, "").trim();
}

/**
 * Normalize artist names by standardizing ft./feat. variations
 * "ft." and "feat." are normalized to "ft." for comparison
 */
function normalizeArtistName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      // Normalize "feat." and "featuring" to "ft."
      .replace(/\bfeat\./gi, "ft.")
      .replace(/\bfeaturing\b/gi, "ft.")
      // Remove extra whitespace
      .replace(/\s+/g, " ")
  );
}

/**
 * Extract main artist name (before any ft./feat./&/x)
 */
function getMainArtist(normalizedName: string): string {
  return normalizedName.split(/\s+(?:ft\.|&|x)\s+/)[0].trim();
}

/**
 * Check if a result artist matches the searched artist
 * Allows for partial matches and normalizes ft./feat. variations
 * E.g., "A$AP Rocky feat. Drake..." matches "A$AP Rocky ft. Drake..."
 */
function artistMatches(resultArtist: string, searchedArtist: string): boolean {
  const result = normalizeArtistName(resultArtist);
  const searched = normalizeArtistName(searchedArtist);

  // Exact match
  if (result === searched) return true;

  // Check if searched artist is in the result (handles "Oklou ft. Bladee" matching "Oklou")
  if (result.includes(searched)) return true;

  // Check if result artist is in the searched (handles reverse case)
  if (searched.includes(result)) return true;

  const resultMain = getMainArtist(result);
  const searchedMain = getMainArtist(searched);

  // Check if main artists match exactly
  if (resultMain === searchedMain) return true;

  // If we have featured artists, also check if any of them match the main artist
  // This prevents "A$AP Rocky" in a soundtrack from matching "A$AP Rocky ft. Drake"
  const resultHasFeature = result.includes(" ft. ");
  const searchedHasFeature = searched.includes(" ft. ");

  // If searched has features but result doesn't (or vice versa), be more strict
  // Require the main artist names to match
  if (resultHasFeature !== searchedHasFeature) {
    // Only match if one is clearly a simplified version of the other
    return resultMain === searchedMain;
  }

  // Both have features or both don't - require main artist match
  return resultMain === searchedMain;
}

/**
 * Extract basic metadata from YouTube video title
 * Attempts to parse "Artist - Song Name" format
 */
export function parseYoutubeTitle(title: string): {
  artistName: string | null;
  songName: string;
} {
  console.log("Parsing YouTube title:", title);

  // Remove common YouTube junk
  const cleaned = title
    .replace(/\[.*?\]/g, "") // [official video], [lyrics], etc
    .replace(/\(.*?\)/g, "") // (official), (lyrics), etc
    .replace(
      /official\s+video|official\s+audio|lyrics|lyric\s+video|audio\s+only|hd\s+video|music\s+video/gi,
      "",
    )
    .trim();

  console.log("Cleaned title:", cleaned);

  // Try to parse "Artist - Song" format
  // Handle both regular hyphen (-) and en dash (–) and em dash (—)
  const parts = cleaned.split(/[-–—]/).map((p) => p.trim());

  if (parts.length >= 2) {
    const artistName = parts[0];
    const songName = parts.slice(1).join(" - "); // Handle "Artist - Song - Remix" etc

    // Validate: artist and song should both have content
    if (artistName.length > 2 && songName.length > 2) {
      console.log("Parsed as Artist:", artistName, "Song:", songName);
      return { artistName, songName };
    }
  }

  // Fallback: use full cleaned title as song name
  console.log("Could not parse, using full title as song");
  return { artistName: null, songName: cleaned || title };
}

/**
 * Get YouTube video thumbnail URL
 */
export function getYouTubeThumbnail(youtubeId: string): string {
  // High quality thumbnail: maxresdefault > sddefault > hqdefault
  return `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
}

/**
 * Show form to user to confirm/edit metadata
 * Returns updated metadata or null if cancelled
 */
export async function promptUserForMetadata(
  parsed: ReturnType<typeof parseYoutubeTitle>,
  _youtubeId: string,
  youtubeThumbUrl: string,
  showSkip: boolean = false,
): Promise<
  | {
      artistName: string;
      songName: string;
    }
  | null
  | "skip"
> {
  return new Promise((resolve) => {
    // Create modal
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    modal.innerHTML = `
      <div style="
        background: transparent;
        border: none;
        padding: 2rem;
        max-width: 500px;
        width: 90%;
        color: #000;
      ">
        <h2 style="margin-top: 0; margin-bottom: 1.5rem; font-size: 1.1rem; font-weight: normal; letter-spacing: 0.5px;">
          CONFIRM SONG DETAILS
        </h2>

        <div style="margin-bottom: 1.5rem;">
          <img
            src="${youtubeThumbUrl}"
            alt="thumbnail"
            style="
              width: 100%;
              border: none;
              margin-bottom: 0;
              aspect-ratio: 16/9;
              object-fit: cover;
            "
          >
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="
            display: block;
            margin-bottom: 0.5rem;
            color: #000;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: normal;
          ">
            Artist Name *
          </label>
          <input
            id="vinyl-artist-input"
            type="text"
            placeholder="e.g., The Beatles"
            value="${parsed.artistName || ""}"
            style="
              width: 100%;
              padding: 0.5rem 0;
              background: transparent;
              border: none;
              border-bottom: 1px solid #000;
              color: #000;
              font-size: 0.9rem;
              box-sizing: border-box;
              font-family: inherit;
              outline: none;
            "
          >
        </div>

        <div style="margin-bottom: 1.5rem;">
          <label style="
            display: block;
            margin-bottom: 0.5rem;
            color: #000;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: normal;
          ">
            Song Name *
          </label>
          <input
            id="vinyl-song-input"
            type="text"
            placeholder="e.g., Let It Be"
            value="${parsed.songName}"
            style="
              width: 100%;
              padding: 0.5rem 0;
              background: transparent;
              border: none;
              border-bottom: 1px solid #000;
              color: #000;
              font-size: 0.9rem;
              box-sizing: border-box;
              font-family: inherit;
              outline: none;
            "
          >
        </div>

        <div style="display: flex; gap: 2rem; align-items: center;">
          ${
            showSkip
              ? `
          <a id="vinyl-skip-btn" style="
            color: var(--vinyl-link-color);
            text-decoration: underline;
            cursor: pointer;
            font-size: var(--vinyl-link-font-size);
            font-family: inherit;
            -webkit-font-smoothing: none;
            -moz-osx-font-smoothing: grayscale;
            text-shadow: var(--vinyl-link-text-shadow);
          ">
            skip
          </a>
          `
              : `
          <a id="vinyl-cancel-btn" style="
            color: var(--vinyl-link-color);
            text-decoration: underline;
            cursor: pointer;
            font-size: var(--vinyl-link-font-size);
            font-family: inherit;
            -webkit-font-smoothing: none;
            -moz-osx-font-smoothing: grayscale;
            text-shadow: var(--vinyl-link-text-shadow);
          ">
            cancel
          </a>
          `
          }
          <a id="vinyl-confirm-btn" style="
            color: var(--vinyl-link-color);
            text-decoration: underline;
            cursor: pointer;
            font-size: var(--vinyl-link-font-size);
            font-family: inherit;
            -webkit-font-smoothing: none;
            -moz-osx-font-smoothing: grayscale;
            text-shadow: var(--vinyl-link-text-shadow);
          ">
            ${showSkip ? "retry" : "confirm"}
          </a>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const artistInput = modal.querySelector(
      "#vinyl-artist-input",
    ) as HTMLInputElement;
    const songInput = modal.querySelector(
      "#vinyl-song-input",
    ) as HTMLInputElement;
    const confirmBtn = modal.querySelector(
      "#vinyl-confirm-btn",
    ) as HTMLAnchorElement;
    const cancelBtn = modal.querySelector(
      "#vinyl-cancel-btn",
    ) as HTMLAnchorElement | null;
    const skipBtn = modal.querySelector(
      "#vinyl-skip-btn",
    ) as HTMLAnchorElement | null;

    // Add hover effects - Windows link style (using CSS variables)
    if (cancelBtn) {
      cancelBtn.addEventListener("mouseenter", () => {
        cancelBtn.style.color = "var(--vinyl-link-hover-color)";
      });
      cancelBtn.addEventListener("mouseleave", () => {
        cancelBtn.style.color = "var(--vinyl-link-color)";
      });

      cancelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        modal.remove();
        resolve(null);
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener("mouseenter", () => {
        skipBtn.style.color = "var(--vinyl-link-hover-color)";
      });
      skipBtn.addEventListener("mouseleave", () => {
        skipBtn.style.color = "var(--vinyl-link-color)";
      });

      skipBtn.addEventListener("click", (e) => {
        e.preventDefault();
        modal.remove();
        resolve("skip");
      });
    }

    confirmBtn.addEventListener("mouseenter", () => {
      confirmBtn.style.color = "var(--vinyl-link-hover-color)";
    });
    confirmBtn.addEventListener("mouseleave", () => {
      confirmBtn.style.color = "var(--vinyl-link-color)";
    });

    confirmBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const artist = artistInput.value.trim();
      const song = songInput.value.trim();

      if (!artist || !song) {
        alert("Please fill in both artist and song name");
        return;
      }

      modal.remove();
      resolve({ artistName: artist, songName: song });
    });

    // Allow Enter to confirm
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Enter") confirmBtn.click();
      if (e.key === "Escape" && cancelBtn) cancelBtn.click();
    };

    artistInput.addEventListener("keypress", handleKeyPress);
    songInput.addEventListener("keypress", handleKeyPress);

    // Focus artist name if empty
    if (!parsed.artistName) {
      artistInput.focus();
    } else {
      songInput.focus();
    }
  });
}

/**
 * Main pipeline: Extract metadata and fetch album art
 */
export async function extractAndEnrichMetadata(
  youtubeId: string,
  youtubeTitle: string,
): Promise<SongMetadata | null> {
  // Step 1: Parse YouTube title
  const parsed = parseYoutubeTitle(youtubeTitle);
  const youtubeThumbUrl = getYouTubeThumbnail(youtubeId);

  // Step 2: Prompt if artist is missing
  let artistName = parsed.artistName;
  let songName = parsed.songName;

  if (!artistName) {
    const confirmed = await promptUserForMetadata(
      parsed,
      youtubeId,
      youtubeThumbUrl,
    );
    if (!confirmed || confirmed === "skip") {
      return null; // User cancelled or skipped
    }
    artistName = confirmed.artistName;
    songName = confirmed.songName;
  }

  // Step 3: Check if song has featured artists
  console.log(`Checking for featured artists in song: "${songName}"`);
  const featuredArtist = extractFeaturedArtist(songName);
  let candidates: AlbumArtCandidate[] = [];

  if (featuredArtist) {
    console.log(`✓ Detected featured artist: "${featuredArtist}"`);

    // Clean song name (remove featured artist part)
    const cleanSongName = removeFeaturedArtist(songName);
    console.log(`Clean song title: "${cleanSongName}"`);

    // OPTIMIZED: Only search with 2 variations (removed redundant artistWithFeature search)
    // The original searchMusicBrainz already handles ft./feat. variations internally
    console.log(`Searching MusicBrainz with:`);
    console.log(`  1. Song: "${songName}" + Artist: "${artistName}"`);
    console.log(`  2. Song: "${cleanSongName}" + Artist: "${artistName}"`);

    // Run both searches in parallel
    const [candidatesOriginalSong, candidatesCleanSong] = await Promise.all([
      searchMusicBrainz(songName, artistName),
      searchMusicBrainz(cleanSongName, artistName),
    ]);

    console.log(
      `Search results: ${candidatesOriginalSong.length} original song, ${candidatesCleanSong.length} clean song`,
    );

    // Merge results and remove duplicates based on releaseId
    const mergedMap = new Map<string, AlbumArtCandidate>();

    // Add results in order of priority
    candidatesOriginalSong.forEach((c) => mergedMap.set(c.releaseId, c));
    candidatesCleanSong.forEach((c) => {
      if (!mergedMap.has(c.releaseId)) {
        mergedMap.set(c.releaseId, c);
      }
    });

    // Return top 5 unique by title (deduplication already done in searchMusicBrainz)
    candidates = Array.from(mergedMap.values()).slice(0, 5);
    console.log(
      `✓ Merged candidates: ${candidates.length} total (showing top 5 unique albums)`,
    );
  } else {
    // No featured artist, search normally
    console.log(`No featured artist detected, searching normally`);
    candidates = await searchMusicBrainz(songName, artistName);
    console.log(`Search results: ${candidates.length} candidates`);
  }

  // Step 4: If no candidates found, prompt user to adjust artist/song names
  if (candidates.length === 0) {
    console.log(`No candidates found, prompting user to adjust names`);
    const retryPrompt = await promptUserForMetadata(
      { artistName, songName },
      youtubeId,
      youtubeThumbUrl,
      true, // show skip button
    );

    if (retryPrompt === "skip") {
      // User chose to skip, use YouTube thumbnail
      console.log(`User skipped MusicBrainz search, using YouTube thumbnail`);
      return {
        youtubeId,
        artistName,
        songName,
        imageUrl: youtubeThumbUrl,
        youtubeTitle,
        youtubeThumbUrl,
        genre: undefined,
        releaseYear: undefined,
      };
    } else if (retryPrompt) {
      // User adjusted names, retry search
      console.log(
        `Retrying search with: "${retryPrompt.artistName}" - "${retryPrompt.songName}"`,
      );
      artistName = retryPrompt.artistName;
      songName = retryPrompt.songName;

      // Retry search with adjusted names
      candidates = await searchMusicBrainz(songName, artistName);
      console.log(`Retry search results: ${candidates.length} candidates`);

      // If still no results after retry, use YouTube thumbnail
      if (candidates.length === 0) {
        console.log(`Still no results after retry, using YouTube thumbnail`);
        return {
          youtubeId,
          artistName,
          songName,
          imageUrl: youtubeThumbUrl,
          youtubeTitle,
          youtubeThumbUrl,
          genre: undefined,
          releaseYear: undefined,
        };
      }
    } else {
      // User cancelled
      return null;
    }
  }

  // Step 5: Let user pick from top 5 results
  let selectedCandidate: AlbumArtCandidate | null = null;
  let imageUrl: string | null = null;

  if (candidates.length > 0) {
    console.log(
      `Showing album art picker with ${candidates.length} candidates`,
    );
    // Find which candidate was selected by showing picker
    const pickerResult = await showAlbumArtPicker(
      candidates,
      songName,
      artistName,
    );

    console.log(`Picker result:`, pickerResult);

    if (pickerResult === "not_found") {
      // User clicked "not found?" - show confirm dialog to adjust names
      console.log(`User clicked "not found", prompting to adjust names`);
      const retryPrompt = await promptUserForMetadata(
        { artistName, songName },
        youtubeId,
        youtubeThumbUrl,
        true, // show skip button
      );

      if (retryPrompt === "skip") {
        // User chose to skip, use YouTube thumbnail
        console.log(`User skipped after "not found", using YouTube thumbnail`);
        return {
          youtubeId,
          artistName,
          songName,
          imageUrl: youtubeThumbUrl,
          youtubeTitle,
          youtubeThumbUrl,
          genre: undefined,
          releaseYear: undefined,
        };
      } else if (retryPrompt) {
        // User adjusted names, retry search
        console.log(
          `Retrying search after "not found" with: "${retryPrompt.artistName}" - "${retryPrompt.songName}"`,
        );
        artistName = retryPrompt.artistName;
        songName = retryPrompt.songName;

        // Retry search with adjusted names
        candidates = await searchMusicBrainz(songName, artistName);
        console.log(`Retry search results: ${candidates.length} candidates`);

        // If results found, show picker again
        if (candidates.length > 0) {
          const retryPickerResult = await showAlbumArtPicker(
            candidates,
            songName,
            artistName,
          );

          if (retryPickerResult && retryPickerResult !== "not_found") {
            imageUrl = retryPickerResult;
            selectedCandidate =
              candidates.find((c) => c.coverArtUrl === retryPickerResult) ||
              null;
          } else {
            // Use YouTube thumbnail if cancelled or not found again
            imageUrl = youtubeThumbUrl;
          }
        } else {
          // Still no results, use YouTube thumbnail
          imageUrl = youtubeThumbUrl;
        }
      } else {
        // User cancelled
        return null;
      }
    } else if (pickerResult) {
      imageUrl = pickerResult;
      // Find the candidate that matches this URL
      selectedCandidate =
        candidates.find((c) => c.coverArtUrl === pickerResult) || null;
      console.log(`Selected candidate:`, selectedCandidate);
    } else {
      console.log(`User cancelled or no image selected`);
    }
  }

  // Fallback to YouTube thumbnail if user cancels or no results
  if (!imageUrl) {
    console.log(`Using YouTube thumbnail as fallback`);
    imageUrl = youtubeThumbUrl;
  }

  // Extract genre and year from selected candidate
  let genre: string | undefined;
  let releaseYear: string | undefined;

  if (selectedCandidate) {
    genre = selectedCandidate.genre;
    releaseYear = selectedCandidate.date
      ? selectedCandidate.date.split("-")[0]
      : undefined;
  }

  return {
    youtubeId,
    artistName,
    songName,
    imageUrl,
    youtubeTitle,
    youtubeThumbUrl,
    genre,
    releaseYear,
  };
}

/**
 * Fetch YouTube metadata from oembed (public, no API key needed)
 * Returns title and video info
 */
export async function fetchYouTubeMetadata(youtubeId: string): Promise<{
  title: string;
  thumbnail_url: string;
  video_id: string;
} | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`,
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      title: data.title,
      thumbnail_url: data.thumbnail_url,
      video_id: youtubeId,
    };
  } catch (error) {
    console.error("YouTube oembed error:", error);
    return null;
  }
}
