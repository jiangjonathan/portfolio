/**
 * Frontend module for managing visitor's personal vinyl library
 * Stored locally in browser's localStorage
 */

export interface VisitorEntry {
  id: string;
  youtubeId: string;
  artistName: string;
  songName: string;
  imageUrl: string; // Link to cover art (iTunes, Spotify, or YouTube thumbnail)
  note: string;
  addedAt: string;
  releaseId?: string; // MusicBrainz release ID for cached covers
  aspectRatio?: number; // Video aspect ratio (16/9, 4/3, 1, etc.)
}

const STORAGE_KEY = "visitorLibrary";

/**
 * Extract YouTube video ID from various URL formats or return raw ID
 */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();

  // Pattern 1: youtube.com/watch?v=VIDEO_ID
  const watchMatch = trimmed.match(
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
  );
  if (watchMatch) return watchMatch[1];

  // Pattern 2: youtu.be/VIDEO_ID
  const shortMatch = trimmed.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // Pattern 3: youtube.com/embed/VIDEO_ID
  const embedMatch = trimmed.match(
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  );
  if (embedMatch) return embedMatch[1];

  // Pattern 4: Raw VIDEO_ID (11 characters)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Load visitor library from localStorage
 */
export function loadVisitorLibrary(): VisitorEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to load visitor library:", error);
    return [];
  }
}

/**
 * Save visitor library to localStorage
 */
export function saveVisitorLibrary(entries: VisitorEntry[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch (error) {
    console.error("Failed to save visitor library:", error);
    return false;
  }
}

/**
 * Add a new YouTube link to visitor's library with full metadata
 * @param youtubeLink YouTube URL or raw video ID
 * @param artistName Artist name
 * @param songName Song name
 * @param imageUrl Cover art image URL
 * @param note Optional note about the entry
 * @param releaseId Optional MusicBrainz release ID for cached covers
 * @returns The created entry if successful, null otherwise
 */
export function addVisitorLink(
  youtubeLink: string,
  artistName: string,
  songName: string,
  imageUrl: string,
  note: string = "",
  releaseId?: string,
  aspectRatio?: number,
): VisitorEntry | null {
  const youtubeId = extractYouTubeId(youtubeLink);

  if (!youtubeId) {
    console.error("Invalid YouTube URL or ID");
    return null;
  }

  const newEntry: VisitorEntry = {
    id: crypto.randomUUID(),
    youtubeId,
    artistName,
    songName,
    imageUrl,
    note,
    addedAt: new Date().toISOString(),
    releaseId,
    aspectRatio,
  };

  const library = loadVisitorLibrary();
  library.push(newEntry);

  if (saveVisitorLibrary(library)) {
    return newEntry;
  }

  return null;
}

/**
 * Remove an entry from visitor's library (local)
 */
export function removeVisitorLink(entryId: string): boolean {
  const library = loadVisitorLibrary();
  const filtered = library.filter((entry) => entry.id !== entryId);

  if (filtered.length === library.length) {
    return false; // Entry not found
  }

  return saveVisitorLibrary(filtered);
}

/**
 * Delete an entry from the owner's library via API
 */
export async function deleteOwnerEntry(
  apiUrl: string,
  entryId: string,
  adminToken?: string,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add Authorization header if admin token is provided
    if (adminToken) {
      headers["Authorization"] = `Bearer ${adminToken}`;
    }

    const response = await fetch(`${apiUrl}/api/library/${entryId}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error("Failed to delete entry:", error);
    return false;
  }
}

/**
 * Clear all visitor library entries
 */
export function clearVisitorLibrary(): boolean {
  return saveVisitorLibrary([]);
}

/**
 * Fetch owner's library from the API
 * @param apiUrl Base URL of the API (e.g., 'https://your-worker.workers.dev')
 */
export async function fetchOwnerLibrary(
  apiUrl: string,
): Promise<VisitorEntry[]> {
  try {
    const response = await fetch(`${apiUrl}/api/library`);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    return data.entries || [];
  } catch (error) {
    console.error("Failed to fetch owner library:", error);
    return [];
  }
}

/**
 * Add entry to owner's library via API (admin only)
 */
export async function addToOwnerLibrary(
  apiUrl: string,
  youtubeId: string,
  artistName: string,
  songName: string,
  imageUrl: string,
  note: string,
  adminToken?: string,
  genre?: string,
  releaseYear?: string,
  releaseId?: string,
  aspectRatio?: number,
): Promise<VisitorEntry | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add Authorization header if admin token is provided
    if (adminToken) {
      headers["Authorization"] = `Bearer ${adminToken}`;
    }

    const requestBody: Record<string, any> = {
      youtubeId,
      artistName,
      songName,
      imageUrl,
      note,
    };

    // Add optional genre and releaseYear if provided
    if (genre) {
      requestBody.genre = genre;
    }
    if (releaseYear) {
      requestBody.releaseYear = releaseYear;
    }
    if (releaseId) {
      requestBody.releaseId = releaseId;
    }
    if (aspectRatio !== undefined) {
      requestBody.aspectRatio = aspectRatio;
    }

    const response = await fetch(`${apiUrl}/api/library`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }

    const data = await response.json();
    return data.entry || null;
  } catch (error) {
    console.error("Failed to add to owner library:", error);
    throw error;
  }
}
