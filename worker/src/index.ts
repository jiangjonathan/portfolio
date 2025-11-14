export interface Env {
  LIBRARY: KVNamespace;
  ADMIN_TOKEN: string;
}

export interface LibraryEntry {
  id: string;
  youtubeId: string;
  artistName: string;
  songName: string;
  imageUrl: string; // Link to cover art CoverArtArchive
  note: string;
  genre?: string; // Music genre from MusicBrainz
  releaseYear?: string; // Release year from MusicBrainz (YYYY format)
  releaseId?: string; // MusicBrainz release ID for caching
  aspectRatio?: number; // Video aspect ratio (16/9, 4/3, 1, etc.)
  originalImageUrl?: string; // Original image URL stored as fallback for stale blob URLs
  addedAt: string;
}

/**
 * Extract YouTube video ID from various URL formats or return raw ID
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - Raw VIDEO_ID
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
 * CORS headers for all responses
 */
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Admin-Token",
  };
}

/**
 * Handle GET /api/library - public endpoint
 */
async function handleGetLibrary(env: Env): Promise<Response> {
  try {
    const list = await env.LIBRARY.list({ prefix: "entry:" });
    const promises = list.keys.map((key) => env.LIBRARY.get(key.name));
    const values = await Promise.all(promises);
    const entries: LibraryEntry[] = values
      .map((value) => (value ? JSON.parse(value) : null))
      .filter((entry): entry is LibraryEntry => entry !== null);

    // Sort entries by addedAt date, newest first
    entries.sort(
      (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
    );

    return new Response(JSON.stringify({ entries }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch library" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }
}

/**
 * Verify admin authorization
 */
function verifyAdminAuth(request: Request, env: Env): Response | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid authorization header" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  }

  const token = authHeader.substring(7); // Remove "Bearer "
  if (token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: "Invalid admin token" }), {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }

  return null; // Auth successful
}

/**
 * Handle POST /api/library - owner-only endpoint
 */
async function handlePostLibrary(
  request: Request,
  env: Env,
): Promise<Response> {
  // Check authorization
  const authError = verifyAdminAuth(request, env);
  if (authError) return authError;

  // Parse request body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }

  const {
    youtubeId: rawYoutubeId,
    artistName,
    songName,
    imageUrl,
    note,
    genre,
    releaseYear,
    releaseId,
    aspectRatio,
    originalImageUrl,
  } = body;

  if (!rawYoutubeId || typeof rawYoutubeId !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing or invalid youtubeId field" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  }

  if (!artistName || typeof artistName !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing or invalid artistName field" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  }

  if (!songName || typeof songName !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing or invalid songName field" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  }

  if (!imageUrl || typeof imageUrl !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing or invalid imageUrl field" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  }

  // Extract YouTube ID
  const youtubeId = extractYouTubeId(rawYoutubeId);
  if (!youtubeId) {
    return new Response(
      JSON.stringify({ error: "Invalid YouTube URL or ID" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  }

  // Create new entry
  const newEntry: LibraryEntry = {
    id: crypto.randomUUID(),
    youtubeId,
    artistName,
    songName,
    imageUrl,
    note: note || "",
    genre: genre || undefined,
    releaseYear: releaseYear || undefined,
    releaseId: releaseId || undefined,
    aspectRatio: aspectRatio || undefined,
    originalImageUrl: originalImageUrl || imageUrl, // Store the original URL as fallback for blob URLs
    addedAt: new Date().toISOString(),
  };

  // Save the new entry under its own key
  try {
    await env.LIBRARY.put(`entry:${newEntry.id}`, JSON.stringify(newEntry));

    return new Response(JSON.stringify({ success: true, entry: newEntry }), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to save entry" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }
}

/**
 * Handle DELETE /api/library/:id - owner-only endpoint
 */
async function handleDeleteLibrary(
  entryId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  // Check authorization
  const authError = verifyAdminAuth(request, env);
  if (authError) return authError;

  if (!entryId) {
    return new Response(JSON.stringify({ error: "Missing entry ID" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }

  // Delete the entry from KV by its key
  try {
    await env.LIBRARY.delete(`entry:${entryId}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to delete entry" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }
}

/**
 * Handle PUT /api/library/:id - owner-only endpoint
 */
async function handlePutLibrary(
  entryId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  // Check authorization
  const authError = verifyAdminAuth(request, env);
  if (authError) return authError;

  if (!entryId) {
    return new Response(JSON.stringify({ error: "Missing entry ID" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }

  // Get existing entry
  const existingEntryJson = await env.LIBRARY.get(`entry:${entryId}`);
  if (!existingEntryJson) {
    return new Response(JSON.stringify({ error: "Entry not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }

  const existingEntry: LibraryEntry = JSON.parse(existingEntryJson);

  // Parse request body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }

  // Update entry with new values (keeping existing values if not provided)
  const updatedEntry: LibraryEntry = {
    ...existingEntry,
    artistName:
      body.artistName !== undefined
        ? body.artistName
        : existingEntry.artistName,
    songName:
      body.songName !== undefined ? body.songName : existingEntry.songName,
    imageUrl:
      body.imageUrl !== undefined ? body.imageUrl : existingEntry.imageUrl,
    note: body.note !== undefined ? body.note : existingEntry.note,
    genre: body.genre !== undefined ? body.genre : existingEntry.genre,
    releaseYear:
      body.releaseYear !== undefined
        ? body.releaseYear
        : existingEntry.releaseYear,
    releaseId:
      body.releaseId !== undefined ? body.releaseId : existingEntry.releaseId,
    aspectRatio:
      body.aspectRatio !== undefined
        ? body.aspectRatio
        : existingEntry.aspectRatio,
  };

  // Save updated entry
  try {
    await env.LIBRARY.put(`entry:${entryId}`, JSON.stringify(updatedEntry));

    return new Response(
      JSON.stringify({ success: true, entry: updatedEntry }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to update entry" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Route: GET /api/library
    if (url.pathname === "/api/library" && request.method === "GET") {
      return handleGetLibrary(env);
    }

    // Route: POST /api/library
    if (url.pathname === "/api/library" && request.method === "POST") {
      return handlePostLibrary(request, env);
    }

    // Route: DELETE /api/library/:id
    const deleteMatch = url.pathname.match(/^\/api\/library\/([^\/]+)$/);
    if (deleteMatch && request.method === "DELETE") {
      const entryId = deleteMatch[1];
      return handleDeleteLibrary(entryId, request, env);
    }

    // Route: PUT /api/library/:id
    const putMatch = url.pathname.match(/^\/api\/library\/([^\/]+)$/);
    if (putMatch && request.method === "PUT") {
      const entryId = putMatch[1];
      return handlePutLibrary(entryId, request, env);
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
    });
  },
};
