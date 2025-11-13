# Vinyl Library Worker

Cloudflare Worker backend for managing a personal vinyl library with YouTube links.

## Features

- **Public GET `/api/library`**: Returns all stored vinyl entries
- **Owner-only POST `/api/library`**: Add new entries (requires Bearer token authentication)
- **YouTube ID extraction**: Accepts various YouTube URL formats or raw video IDs
- **KV storage**: Persistent data storage using Cloudflare KV

## Setup

### 1. Install Dependencies

```bash
cd worker
npm install
```

### 2. Create KV Namespace

```bash
wrangler kv namespace create LIBRARY
```

This will output a namespace ID. Copy it and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "LIBRARY"
id = "92ce731f967a4d2b97c2362627c889f7"  # Replace with your actual ID
```

### 3. Set Admin Token Secret

```bash
wrangler secret put ADMIN_TOKEN
```

Enter a secure token when prompted (e.g., a randomly generated UUID or long string).

### 4. Deploy

```bash
npm run deploy
```

Your worker will be deployed to `https://vinyl-library-worker.YOUR_SUBDOMAIN.workers.dev`

## Development

Run locally with:

```bash
npm run dev
```

For local development, wrangler automatically creates a preview KV namespace. Just run `npm run dev` and it will work with the namespace ID from `wrangler.toml`.

## API Endpoints

### GET /api/library

**Public endpoint** - Returns all library entries

```bash
curl https://vinyl-library-worker.YOUR_SUBDOMAIN.workers.dev/api/library
```

**Response:**
```json
{
  "entries": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "youtubeId": "dQw4w9WgXcQ",
      "note": "Classic track",
      "addedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### POST /api/library

**Owner-only endpoint** - Add a new entry (requires Bearer token)

```bash
curl -X POST https://vinyl-library-worker.YOUR_SUBDOMAIN.workers.dev/api/library \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "youtubeId": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "note": "Classic track"
  }'
```

**Accepted YouTube formats:**
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- `https://youtu.be/dQw4w9WgXcQ`
- `https://www.youtube.com/embed/dQw4w9WgXcQ`
- `dQw4w9WgXcQ` (raw video ID)

**Response:**
```json
{
  "success": true,
  "entry": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "youtubeId": "dQw4w9WgXcQ",
    "note": "Classic track",
    "addedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

## Frontend Integration

The visitor library module (`src/visitorLibrary.ts`) provides functions for managing a visitor's personal library in localStorage:

### Import

```typescript
import {
  loadVisitorLibrary,
  saveVisitorLibrary,
  addVisitorLink,
  removeVisitorLink,
  fetchOwnerLibrary
} from './visitorLibrary';
```

### Usage Examples

```typescript
// Add a visitor's link
const entry = addVisitorLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'My favorite');

// Load visitor's library
const visitorEntries = loadVisitorLibrary();

// Fetch owner's library from API
const ownerEntries = await fetchOwnerLibrary('https://vinyl-library-worker.YOUR_SUBDOMAIN.workers.dev');

// Remove an entry
removeVisitorLink('entry-id-here');
```

## Error Handling

The API returns appropriate HTTP status codes:

- `200` - Success (GET)
- `201` - Created (POST)
- `400` - Bad request (invalid YouTube URL, missing fields)
- `401` - Unauthorized (missing auth header)
- `403` - Forbidden (invalid token)
- `404` - Not found (unknown route)
- `500` - Server error

## CORS

CORS is enabled for all origins (`*`). For production, consider restricting to your domain:

```typescript
'Access-Control-Allow-Origin': 'https://yourwebsite.com'
```

## Security Notes

- Store `ADMIN_TOKEN` as a Cloudflare secret (never commit to version control)
- Use a strong, randomly generated token
- Consider implementing rate limiting for the POST endpoint
- For production, restrict CORS to your specific domain
