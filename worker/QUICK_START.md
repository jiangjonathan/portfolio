# Quick Start Guide

## Current Setup ✅

Your Cloudflare Worker is ready to use!

**Local Development URL:** `http://localhost:57053`  
**KV Namespace ID:** `92ce731f967a4d2b97c2362627c889f7`  
**Admin Token:** `my-super-secret-vinyl-token-12345` (in `.env`)

## Running the Worker Locally

The worker is currently running. If you need to restart it:

```bash
cd /Users/jonathanjiang/portfolio/worker
npm run dev
```

It will start on a random port (check output for the URL).

## Test Commands

### Get all library entries (public)
```bash
curl http://localhost:57053/api/library
```

### Add a new entry (requires admin token)
```bash
curl -X POST http://localhost:57053/api/library \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-super-secret-vinyl-token-12345" \
  -d '{"youtubeId": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "note": "Your note here"}'
```

### Supported YouTube URL formats
- Full URL: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- Short URL: `https://youtu.be/dQw4w9WgXcQ`
- Embed URL: `https://www.youtube.com/embed/dQw4w9WgXcQ`
- Raw ID: `dQw4w9WgXcQ`

## Deploy to Production

When ready, deploy to Cloudflare:

```bash
cd /Users/jonathanjiang/portfolio/worker
npm run deploy
```

This will give you a production URL like:
```
https://vinyl-library-worker.YOUR_SUBDOMAIN.workers.dev
```

Then update your frontend's API URL in `example-frontend.html` or your site.

## Frontend Integration

The `example-frontend.html` file has an interactive UI with:
- Add links to your personal library (stored in localStorage)
- View the owner's library from the API
- Embedded YouTube players
- Copy tracks from owner's library to yours

To use it:
1. Update the API URL in the configuration section
2. Open it in your browser
3. Start adding YouTube links!

## Key Files

- `src/index.ts` - Worker code
- `wrangler.toml` - Configuration
- `.env` - Local admin token (NOT committed to git)
- `package.json` - Dependencies
- `example-frontend.html` - UI frontend
- `SETUP.md` - Detailed setup guide
- `README.md` - API documentation
