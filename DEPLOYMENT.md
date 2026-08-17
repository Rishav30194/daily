# Deployment — daily

GitHub Actions → GitHub Pages, public repo, project site.

| | |
|---|---|
| Repo | `daily` |
| URL | `https://<github-username>.github.io/daily/` |
| Vite `base` | `/daily/` |
| Manifest `start_url` / `scope` | `/daily/` |
| Trigger | push to `main` |
| Pages source | **GitHub Actions** (not "Deploy from a branch") |

Replace `<github-username>` throughout once the repo exists. These four path values must agree
exactly, trailing slash included. SPEC.md §9 calls this the silent-failure zone, and it is —
every failure here is silent, and the symptoms are listed in §5 below.

---

## 1. One-time setup

1. Create a **public** repo named `daily`. Public matters: Pages on private repos requires a paid
   plan, and there is nothing private in the app — the data never leaves the device.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.** If this is left on
   "Deploy from a branch", the workflow runs green and publishes nothing.
3. Push `main`. The first run creates the environment; approve it if prompted.

No secrets, no environment variables, no deploy keys. The workflow authenticates with OIDC via
`id-token: write`.

---

## 2. The workflow

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Let a running deploy finish; queue at most one after it.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test -- --run
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Notes on the choices:

- **`npm test` runs before `npm run build`.** The grading and carry rules are the product; a
  deploy that ships a broken rule is worse than no deploy.
- **`cancel-in-progress: false`.** Cancelling a Pages deploy mid-flight can leave the site
  partially published.
- **Two jobs.** `deploy-pages` needs its own job with the `github-pages` environment; merging them
  is a common cause of a permissions error that reads like an auth problem.
- **`npm ci`, not `npm install`.** Requires `package-lock.json` committed.

---

## 3. Config that must match

### `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/daily/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Daily',
        short_name: 'Daily',
        start_url: '/daily/',
        scope: '/daily/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
```

**`registerType: 'prompt'` is not negotiable.** `autoUpdate` can swap the app out mid-entry, and
the app is only ever open mid-entry. Registering nothing at all is worse — a stale app forever,
with no way to ship a fix.

### `index.html`

```html
<link rel="apple-touch-icon" sizes="180x180" href="/daily/apple-touch-icon.png" />
<meta name="theme-color" content="#ffffff" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

iOS does not read all icon sizes from the manifest. Without this tag the home-screen icon is a
screenshot of the page. The `href` is absolute and includes the base path — a bare
`/apple-touch-icon.png` resolves to the domain root and 404s on a project site.

---

## 4. Verification checklist

Run this after phase 0 and again before calling the project done. Every line is a real failure
mode, not a formality.

**Desktop**

- [ ] `https://<github-username>.github.io/daily/` loads — not a 404, not a blank page.
- [ ] DevTools → Network: **zero 404s**. Especially `/assets/*.js` and `*.css`.
- [ ] DevTools → Application → Manifest: no errors; `start_url` and `scope` both read `/daily/`.
- [ ] DevTools → Application → Service Workers: one worker, activated.
- [ ] Reload offline (DevTools → Network → Offline). The app still loads.

**iPhone**

- [ ] Safari → Share → Add to Home Screen. The icon is the real icon, not a page screenshot.
- [ ] Tapping the home-screen icon opens **standalone** — no address bar, no Safari toolbars.
- [ ] Enter a day, force-quit the app, reopen. The entry is still there.
- [ ] Push a visible change, redeploy, reopen. The update prompt appears; reloading picks it up.

If the app opens in a Safari tab with browser chrome, `scope` or `start_url` does not match `base`.
Fix it before building anything else.

---

## 5. Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Blank white page, 404s on every `/assets/*` | `base` missing or wrong | `base: '/daily/'` in `vite.config.ts` |
| 404 on the URL itself | Pages source still "Deploy from a branch" | Settings → Pages → Source: GitHub Actions |
| Workflow green, site never updates | Same as above | Same as above |
| Home-screen app opens in a browser tab | `scope`/`start_url` ≠ `base` | Make all three `/daily/`, reinstall to home screen |
| Home-screen icon is a page screenshot | `apple-touch-icon` link missing or path wrong | Absolute `/daily/apple-touch-icon.png` in `index.html` |
| Icon fine, splash wrong | `background_color` / `theme_color` unset | Set both in the manifest |
| Deploy fails on permissions | Missing `pages: write` / `id-token: write`, or one merged job | Copy §2 exactly |
| Old version keeps loading after deploy | Cached SW; prompt dismissed | Reopen the app and accept the prompt; last resort, delete and reinstall — **this wipes `localStorage`, so export first** |
| `npm ci` fails in CI | `package-lock.json` not committed | Commit it |

**Reinstalling the home-screen app deletes its `localStorage`.** There is no sync and no backup.
Export before any uninstall, reinstall, or "clear website data".

---

## 6. Rollback

The workflow deploys whatever is on `main`. To roll back, revert the commit and push:

```bash
git revert <sha>
git push origin main
```

Or re-run an older successful workflow run from the Actions tab. There is no separate deploy
artifact to restore and no state on the server — the only state is on the user's device, and a
rollback never touches it.

---

## 7. Local development

```bash
npm install
npm run dev            # http://localhost:5173/daily/  — note the base path
npm test
npm run build
npm run preview        # serves dist/ at the real base path
```

`npm run dev` serves under `/daily/` because of `base`. Hitting `http://localhost:5173/` bare
gives a 404 — that is correct, not a bug.

**The service worker only exists in a production build.** Test install, offline, and the update
prompt against `npm run preview` or the deployed site; `npm run dev` will never show them.

Dev and production are separate `localStorage` origins (`localhost:5173` vs `github.io`), so dev
entries never contaminate real data — and real data is never available in dev. Use export/import
to move a snapshot between them.
