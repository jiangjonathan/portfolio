/**
 * IndexedDB cache for album covers
 * Stores cover art images to avoid repeated fetches from Cover Art Archive
 */

const DB_NAME = "vinylLibraryDB";
const DB_VERSION = 1;
const STORE_NAME = "albumCovers";

interface CachedCover {
  releaseId: string;
  url: string;
  blob: Blob;
  cachedAt: number;
}

let db: IDBDatabase | null = null;

/**
 * Initialize the IndexedDB database
 */
export async function initializeCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log("IndexedDB initialized successfully");
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "releaseId",
        });
        // Create index for faster queries by URL
        store.createIndex("url", "url", { unique: false });
        store.createIndex("cachedAt", "cachedAt", { unique: false });
        console.log("Created IndexedDB object store for album covers");
      }
    };
  });
}

/**
 * Get a cached album cover by release ID
 */
export async function getCachedCover(
  releaseId: string,
): Promise<string | null> {
  if (!db) {
    console.warn("Database not initialized");
    return null;
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(releaseId);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        const result = request.result as CachedCover | undefined;
        console.log(
          `Cache lookup for ${releaseId}:`,
          result ? "found" : "not found",
        );

        if (result && result.blob) {
          console.log(
            `Blob info: size=${result.blob.size}, type=${result.blob.type}`,
          );
          try {
            // Create a fresh blob URL each time (blob URLs are temporary)
            const objectUrl = URL.createObjectURL(result.blob);
            console.log(
              `✓ Created blob URL for cached release ${releaseId}: ${objectUrl}`,
            );
            resolve(objectUrl);
          } catch (error) {
            console.error(`✗ Error creating blob URL for ${releaseId}:`, error);
            resolve(null);
          }
        } else {
          console.log(`✗ No valid blob found for ${releaseId}`);
          resolve(null);
        }
      };
    } catch (error) {
      console.error("Error reading from cache:", error);
      reject(error);
    }
  });
}

/**
 * Cache an album cover by fetching from URL and storing the blob
 */
export async function cacheAlbumCover(
  releaseId: string,
  coverUrl: string,
): Promise<string> {
  if (!db) {
    console.warn("Database not initialized, returning original URL");
    return coverUrl;
  }

  try {
    // Fetch the image
    const response = await fetch(coverUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch cover: ${response.statusText}`);
    }

    const blob = await response.blob();

    // Validate blob
    if (!blob || blob.size === 0) {
      console.error("Invalid blob received for", releaseId);
      return coverUrl;
    }

    console.log(`Fetched cover blob: ${blob.size} bytes, type: ${blob.type}`);

    // Store in IndexedDB
    return new Promise((resolve, reject) => {
      const transaction = db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const cachedCover: CachedCover = {
        releaseId,
        url: coverUrl,
        blob,
        cachedAt: Date.now(),
      };

      const request = store.put(cachedCover);

      request.onerror = () => {
        console.error("Error caching cover:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        // Return object URL for immediate use
        try {
          const objectUrl = URL.createObjectURL(blob);
          console.log(
            `✓ Cached album cover for release ${releaseId}: ${objectUrl}`,
          );
          resolve(objectUrl);
        } catch (error) {
          console.error(
            `✗ Error creating blob URL after caching ${releaseId}:`,
            error,
          );
          // Fallback to original URL if blob URL creation fails
          resolve(coverUrl);
        }
      };
    });
  } catch (error) {
    console.error("Error caching album cover:", error);
    // Fall back to original URL if caching fails
    return coverUrl;
  }
}

/**
 * Get or cache an album cover (checks cache first, fetches if not found)
 */
export async function getOrCacheAlbumCover(
  releaseId: string,
  coverUrl: string,
): Promise<string> {
  try {
    // Check cache first
    const cached = await getCachedCover(releaseId);
    if (cached) {
      console.log(`Using cached cover for release ${releaseId}: ${cached}`);
      return cached;
    }

    // Not in cache, fetch and cache it
    console.log(`Cover not in cache, fetching for release ${releaseId}`);
    const blobUrl = await cacheAlbumCover(releaseId, coverUrl);
    console.log(`[getOrCacheAlbumCover] Returning blob URL: ${blobUrl}`);
    return blobUrl;
  } catch (error) {
    console.error("Error in getOrCacheAlbumCover:", error);
    // Fallback to original URL if anything fails
    return coverUrl;
  }
}

/**
 * Clear all cached covers
 */
export async function clearCache(): Promise<void> {
  if (!db) {
    console.warn("Database not initialized");
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log("Album cover cache cleared");
        resolve();
      };
    } catch (error) {
      console.error("Error clearing cache:", error);
      reject(error);
    }
  });
}

/**
 * Delete a specific cached cover by release ID
 */
export async function deleteCachedCover(releaseId: string): Promise<void> {
  if (!db) {
    console.warn("Database not initialized");
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(releaseId);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log(`Deleted cached cover for release ${releaseId}`);
        resolve();
      };
    } catch (error) {
      console.error("Error deleting cached cover:", error);
      reject(error);
    }
  });
}

/**
 * Clean up unused cached covers based on a list of currently used image URLs
 * Deletes any cached covers that are not in the provided list
 */
export async function cleanupUnusedCovers(
  usedImageUrls: string[],
): Promise<number> {
  if (!db) {
    console.warn("Database not initialized");
    return 0;
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const getAllRequest = store.getAll();

      getAllRequest.onerror = () => {
        reject(getAllRequest.error);
      };

      getAllRequest.onsuccess = () => {
        const allCovers = getAllRequest.result as CachedCover[];
        let deletedCount = 0;

        // Check each cached cover to see if it's still being used
        allCovers.forEach((cover) => {
          // Check if this cover URL (or its blob URL) is in the used list
          const isUsed = usedImageUrls.some((url) => {
            // Match either the original URL or check if it's a blob URL for this release
            return url === cover.url || url.includes(cover.releaseId);
          });

          if (!isUsed) {
            // Delete this cover as it's no longer used
            store.delete(cover.releaseId);
            deletedCount++;
            console.log(
              `Cleaned up unused cover for release ${cover.releaseId}`,
            );
          }
        });

        console.log(`Cache cleanup: removed ${deletedCount} unused covers`);
        resolve(deletedCount);
      };
    } catch (error) {
      console.error("Error cleaning up cache:", error);
      reject(error);
    }
  });
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalCovers: number;
  oldestCover: number;
  newestCover: number;
}> {
  if (!db) {
    return { totalCovers: 0, oldestCover: 0, newestCover: 0 };
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        const covers = request.result as CachedCover[];
        if (covers.length === 0) {
          resolve({ totalCovers: 0, oldestCover: 0, newestCover: 0 });
        } else {
          const timestamps = covers.map((c) => c.cachedAt);
          resolve({
            totalCovers: covers.length,
            oldestCover: Math.min(...timestamps),
            newestCover: Math.max(...timestamps),
          });
        }
      };
    } catch (error) {
      console.error("Error getting cache stats:", error);
      reject(error);
    }
  });
}

/**
 * Recreate blob URL from cached data if the image URL is a stale blob URL
 * This is used when loading library entries that have blob URLs stored
 * @param imageUrl The stored image URL (might be a blob URL or regular URL)
 * @param releaseId The MusicBrainz release ID
 * @returns Fresh blob URL or original URL if not cached/not applicable
 */
export async function recreateBlobUrlIfNeeded(
  imageUrl: string,
  releaseId?: string,
): Promise<string> {
  console.log(
    `[recreateBlobUrlIfNeeded] imageUrl: ${imageUrl}, releaseId: ${releaseId}`,
  );

  // If no release ID, can't recreate from cache
  if (!releaseId) {
    console.log(`No releaseId provided, returning original URL`);
    return imageUrl;
  }

  // Check if the URL is a blob URL (starts with "blob:")
  const isBlobUrl = imageUrl.startsWith("blob:");

  if (isBlobUrl) {
    console.log(
      `✓ Detected stale blob URL for ${releaseId}, recreating from cache...`,
    );

    // Try to get fresh blob URL from cache
    const freshBlobUrl = await getCachedCover(releaseId);

    if (freshBlobUrl) {
      console.log(
        `✓ Recreated blob URL from cache for ${releaseId}: ${freshBlobUrl}`,
      );
      return freshBlobUrl;
    } else {
      console.warn(
        `✗ Could not recreate blob URL for ${releaseId}, blob not in cache`,
      );
      // Blob URL is stale and we don't have it in cache
      // Return a placeholder or the stale URL (will fail to load)
      return imageUrl;
    }
  }

  // Not a blob URL but we have a releaseId, check if it's in cache anyway
  console.log(
    `Not a blob URL, but has releaseId - checking cache for ${releaseId}`,
  );
  const cachedUrl = await getCachedCover(releaseId);

  if (cachedUrl) {
    console.log(`✓ Found cached cover for ${releaseId}: ${cachedUrl}`);
    return cachedUrl;
  }

  // Not a blob URL and not in cache, return as-is
  console.log(`Not in cache, returning original URL: ${imageUrl}`);
  return imageUrl;
}
