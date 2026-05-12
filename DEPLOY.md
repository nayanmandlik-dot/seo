# Deployment Guide — Vercel (frontend) + Render (backend)

This project is a full-stack app and cannot be deployed to GitHub alone. GitHub
only hosts the source code; we deploy the **backend to Render** and the
**frontend to Vercel**, both triggered automatically from pushes to GitHub.

## 1. Commit and push the deployment configs

This branch adds:

- [.gitignore](.gitignore) — keeps `node_modules`, `.env`, generated reports out of git
- [render.yaml](render.yaml) — Render Blueprint for the backend
- [frontend/vercel.json](frontend/vercel.json) — Vercel config for the SPA
- [.env.example](.env.example) and [frontend/.env.example](frontend/.env.example) — env var documentation

Before deploying, **remove the committed `node_modules` folders** that are
currently in git:

```bash
git rm -r --cached node_modules backend/node_modules frontend/node_modules
git add .gitignore render.yaml frontend/vercel.json .env.example frontend/.env.example
git add frontend/src/api.js frontend/src/hooks/useAuditStream.js DEPLOY.md
git commit -m "Add Vercel + Render deployment configs"
git push origin main
```

## 2. Deploy the backend to Render

1. Sign in at https://render.com with GitHub.
2. **New +** → **Blueprint** → select the `nayanmandlik-dot/seo` repository.
3. Render reads [render.yaml](render.yaml) and proposes the
   `seo-audit-backend` Web Service. Click **Apply**.
4. After the first build kicks off, open the service → **Environment** and add:
   - `PAGESPEED_API_KEY` — your Google PageSpeed Insights key
     (get one at https://developers.google.com/speed/docs/insights/v5/get-started)
   - `SAFE_BROWSING_API_KEY` — *(optional)*
5. Wait for the build to finish (it installs Playwright + Chromium; first build
   takes ~5–8 min). When it goes green, note the public URL — something like
   `https://seo-audit-backend.onrender.com`.
6. Verify: open `https://<your-backend>.onrender.com/api/health` → expect
   `{"ok":true}`.

### Render free-tier caveats

- **512MB RAM** — heavy crawls of >100 pages may OOM. Upgrade to Starter ($7/mo)
  for serious use.
- **Spins down after 15min idle** — first request after idle takes ~30s.
- **No persistent disk** — reports live in `/tmp` and disappear on restart.
  Add a Render Disk (paid) or switch to S3 storage if you need persistence.

## 3. Deploy the frontend to Vercel

1. Sign in at https://vercel.com with GitHub.
2. **Add New… → Project** → import the `nayanmandlik-dot/seo` repository.
3. In the import screen, set **Root Directory** to `frontend`. Vercel will
   auto-detect Vite from [frontend/vercel.json](frontend/vercel.json).
4. Expand **Environment Variables** and add:
   - `VITE_API_BASE` = `https://<your-backend>.onrender.com/api`
     (use the URL from step 2.5 above, including `/api` at the end)
5. Click **Deploy**. After ~1 min you get a URL like
   `https://seo-<hash>.vercel.app`.

## 4. Verify end-to-end

1. Open the Vercel URL.
2. Paste a small site (e.g. `https://example.com`).
3. Click **Start Audit** and watch the live log feed.
   - If the log shows `[seo-audit] queue mode: memory` in Render logs, that's
     expected (Redis is disabled).
   - If you see CORS errors in the browser console, the backend URL in
     `VITE_API_BASE` is wrong — re-check step 3.4 and redeploy.

## 5. Auto-deploy on push

Both Vercel and Render are now wired to `main`:

- Push to `main` → Vercel rebuilds the frontend
- Push to `main` → Render rebuilds the backend

That's the whole "deploy through GitHub" loop.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vercel build fails: `command not found: vite` | Wrong root dir | Set Root Directory = `frontend` in Vercel project settings |
| Frontend loads but API calls 404 | `VITE_API_BASE` not set or missing `/api` suffix | Re-set in Vercel env vars, then **Redeploy** (env vars only apply to new builds) |
| Render build fails on `playwright install` | Free-tier disk too small for both Playwright + Puppeteer | Upgrade to Starter, or set `PUPPETEER_SKIP_DOWNLOAD=true` and switch PDF export to Playwright |
| `[unhandledRejection] connect ECONNREFUSED 127.0.0.1:6379` in Render logs | Bull trying to reach Redis | Already mitigated by `DISABLE_REDIS=1`; warning is harmless if mode is `memory` |
| Audit hangs at "queued" | Backend OOM during Playwright launch | Check Render metrics; upgrade plan or reduce `MAX_CONCURRENT_PAGES` |

## Alternative: skip Render, run backend elsewhere

If Render's free tier is too constrained, the same backend runs on:

- **Railway** — point at `backend/` as root, same build/start commands
- **Fly.io** — use `fly launch` in `backend/`, supports Docker
- **A VM (DigitalOcean droplet, EC2)** — `git clone`, `npm install`, `npx playwright install`, `pm2 start server.js`

In all cases, the only change is `VITE_API_BASE` in Vercel.
