/**
 * Migration script to convert old KV storage format to new format
 * Old: Single "entries" key with array of all entries
 * New: Individual "entry:{id}" keys for each entry
 *
 * Run with: npx wrangler dev --local --persist-to=./.wrangler/state migrate-kv-data.ts
 * Or deploy and run once: npx wrangler deploy migrate-kv-data.ts
 */

interface Env {
  LIBRARY: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Only allow migration via specific path
    if (url.pathname !== '/migrate') {
      return new Response('Migration endpoint. Use /migrate to run.', { status: 404 });
    }

    try {
      // Step 1: Get the old "entries" key
      const oldDataStr = await env.LIBRARY.get('entries');

      if (!oldDataStr) {
        return new Response('No old data found in "entries" key', { status: 404 });
      }

      const oldEntries = JSON.parse(oldDataStr);

      if (!Array.isArray(oldEntries)) {
        return new Response('Old data is not an array', { status: 400 });
      }

      console.log(`Found ${oldEntries.length} entries to migrate`);

      // Step 2: Write each entry to its own key
      const migrationPromises = oldEntries.map((entry: any) => {
        const key = `entry:${entry.id}`;
        return env.LIBRARY.put(key, JSON.stringify(entry));
      });

      await Promise.all(migrationPromises);

      // Step 3: Optionally delete the old "entries" key (commented out for safety)
      // await env.LIBRARY.delete('entries');

      return new Response(
        JSON.stringify({
          success: true,
          migrated: oldEntries.length,
          message: 'Migration complete! Old "entries" key still exists (delete manually if desired).'
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      console.error('Migration error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
};
