# Maintenance scripts

## backfill_raw_thumbs.mjs
Regenerates real thumbnails for gallery RAW items stuck on placeholder tiles
(width IS NULL). Safe to re-run any time — it only touches rows that need it.

```bash
npm i --no-save sharp   # native dep, not part of the app bundle
SUPA_URL=<supabase url> SUPA_KEY=<service role key> node scripts/backfill_raw_thumbs.mjs
```
