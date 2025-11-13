# Setup & Running Vinyl Library Worker

## Prerequisites

- Node.js (v16+)
- Cloudflare account
- `wrangler` CLI (v4.47+)

## Step 1: Install Dependencies

```bash
cd /path/to/worker
npm install
```

This installs `wrangler` locally (already in `package.json`).

## Step 2: Authenticate with Cloudflare

```bash
wrangler login
```

This opens a browser to authorize Wrangler with your Cloudflare account.

## Step 3: Create KV Namespace

```bash
wrangler kv namespace create LIBRARY
```

You'll get output like:
```
✨ Success!
To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
[[kv_namespaces]]
binding = "LIBRARY"
id = "92ce731f967a4d2b97c2362627c889f7"
```

**Copy that ID** and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "LIBRARY"
id = "92ce731f967a4d2b97c2362627c889f7"  # ← Paste your ID here
```

## Step 4: Set Admin Token Secret

```bash
wrangler secret put ADMIN_TOKEN
```

When prompted, enter a secure token (no input echo):

```
? Enter the secret text: your-super-secret-token-here-make-it-long-and-random
✨ Success! Uploaded secret ADMIN_TOKEN
```

For local development, also create a `.env` file (NOT committed to git):

```bash
echo 'ADMIN_TOKEN=your-super-secret-token-here-make-it-long-and-random' > .env
```

## Step 5: Run Locally

```bash
npm run dev
```

Output will show something like:
```
⛅️ wrangler 4.47.0
───────────────────
Using vars defined in .env
Your Worker has access to the following bindings:
Binding            Resource        Mode
env.LIBRARY        KV Namespace    local
env.ADMIN_TOKEN    Environment Variable

⎔ Starting local server...
[wrangler:info] Ready on http://localhost:57053
```

The port is random each time. Check the output for your URL.

## Testing Your Worker

In another terminal, test the endpoints:

```bash
# Get library (empty initially)
curl http://localhost:57053/api/library

# Add an entry (requires token from .env)
curl -X POST http://localhost:57053/api/library \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-super-secret-token-here-make-it-long-and-random" \
  -d '{"youtubeId": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "note": "Test"}'

# Check it's there
curl http://localhost:57053/api/library
```

## Step 6: Deploy to Production

```bash
npm run deploy
```

Output:
```
✨ Built successfully, deployed to:
https://vinyl-library-worker.YOUR_SUBDOMAIN.workers.dev
```

After deployment, test with your production URL:

```bash
curl https://vinyl-library-worker.YOUR_SUBDOMAIN.workers.dev/api/library

curl -X POST https://vinyl-library-worker.YOUR_SUBDOMAIN.workers.dev/api/library \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-super-secret-token-here-make-it-long-and-random" \
  -d '{"youtubeId": "dQw4w9WgXcQ", "note": "Test"}'
```

## Useful Wrangler Commands

```bash
# View KV namespaces
wrangler kv namespace list

# View KV data in a namespace
wrangler kv key list --namespace-id=92ce731f967a4d2b97c2362627c889f7

# View specific key
wrangler kv key get entries --namespace-id=92ce731f967a4d2b97c2362627c889f7

# Delete a key
wrangler kv key delete entries --namespace-id=92ce731f967a4d2b97c2362627c889f7

# Tail logs (real-time)
wrangler tail

# View deployment history
wrangler deployments list

# Rollback to previous version
wrangler rollback
```

## Project Structure

```
worker/
├── src/
│   └── index.ts          # Worker code
├── wrangler.toml         # Configuration (update with your IDs)
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── .env                  # Local secrets (NOT committed)
├── SETUP.md              # This file
├── README.md             # API documentation
└── QUICK_START.md        # Quick reference
```

## Environment Variables vs Secrets

**Variables** (in `wrangler.toml`) - visible in code:
```toml
[vars]
SOME_PUBLIC_URL = "https://example.com"
```

**Secrets** (via `wrangler secret put`) - hidden from code:
```bash
wrangler secret put ADMIN_TOKEN
```

For this project, `ADMIN_TOKEN` is a secret (sensitive), so always use `wrangler secret put`.

## Troubleshooting

### "Unknown arguments: kv:namespace, create, LIBRARY"

Make sure you're in the worker directory and using the correct syntax:
```bash
cd /path/to/worker
wrangler kv namespace create LIBRARY  # NOT with quotes or colons
```

### "Could not find module..."

Make sure you ran `npm install` in the `worker` directory.

### "Invalid namespace ID"

Re-check your `wrangler.toml` - the ID from `wrangler kv namespace create` must match exactly.

### "Not authorized"

Run `wrangler login` again to refresh your credentials.

### Local dev not working

- Kill the dev server: `Ctrl+C`
- Clear cache: `rm -rf .wrangler`
- Restart: `npm run dev`

### Can't connect to KV locally

Make sure your `.env` file has the correct `ADMIN_TOKEN` and your `wrangler.toml` has the correct namespace ID.

## Next Steps

1. Deploy your worker to production with `npm run deploy`
2. Update `example-frontend.html` with your deployed Worker URL
3. Host the HTML file on your website
4. Start adding and sharing vinyl tracks!
