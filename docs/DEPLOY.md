# Deploy

The public demo is a **static site on Vercel**. No server, no API key, nothing that sleeps.

It replays briefings pre-generated from the recorded NSE snapshot (`web/public/demo/`, built by `backend/scripts/build_static.py` with the same ranking code as the API). The window picker, as-of date and alert settings all work in the browser against that data. Live NSE fetching, any-ticker briefings and research run locally with `./run.sh` (see README).

## Steps

1. **Import:** vercel.com → Add New → Project → import the GitHub repo → set **Root Directory** to `web`. Leave the Vite preset defaults (build `npm run build`, output `dist`) and add no environment variables.
2. **Deploy.** Every push to `main` redeploys.

With no `VITE_API_BASE`, a production build runs in replay mode. That's the point: no key exists on any public host.

## Refresh the demo data

Run from a machine NSE allows, then commit and push:

```bash
cd backend && ../.venv/bin/python -m scripts.record_snapshots 21 && ../.venv/bin/python -m scripts.build_static
```

CI (`.github/workflows/ci.yml`) fails if `web/public/demo` is out of date with the snapshot and ranking code, or if a PDF, `.env` or sqlite file is tracked.

## Optional hosted API (not deployed)

`deploy/render/render.yaml` describes the API as a Render free web service. It isn't used by the demo. Render's free plan needs no card, but it sleeps after 15 minutes idle and takes about a minute to wake, and its disk resets on every restart. If you do use it, set `VITE_API_BASE` on Vercel to its URL and `CORS_ORIGINS` on Render to the Vercel URL. `PUBLIC_DEMO=true` keeps it in mock/recorded mode: don't add a key there.
