---
name: run-app-eleitoral
description: Build, run, and drive the Painel Eleitoral DF 2026 web app (Vite + vanilla JS + Google Maps + Supabase). Use when asked to start the app, take a screenshot of it, log in as a test user, run its Playwright tests, or interact with its tabs (Mapa, RAs, Dashboard, OKRs, Agenda, Check-in).
---

Painel Eleitoral is a Vite-served static web app (no backend of its own —
Supabase is the API). For agent/automated use, start the Vite dev server
then drive a headless Chromium against it via the REPL driver at
`.claude/skills/run-app-eleitoral/driver.mjs` (`chromium-cli` is not
installed in this environment, so this driver replaces it — same idea,
project-specific commands).

All paths below are relative to `app_eleitoral/` (the unit root — the git
repo root is one level up, at `Painel Eleição/`).

## Prerequisites

Node.js + npm (already present). No OS packages needed — Playwright's
Chromium runs headless with no display server required (this is a plain
Chromium page, not Electron, so no `xvfb` involved).

```bash
npm install
npx playwright install chromium   # only if node_modules/@playwright/test has no browsers cached yet
```

`.env.local` at the unit root must have `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY` — without these the
OKR/Agenda/Check-in tabs render a "não configurado" message instead of
loading data (map tiles/POI layers work regardless, they're static JSON).

## Build

Not required to run the app (Vite serves source directly in dev mode).
Verified working if you need a production bundle:

```bash
npm run build   # → dist/. ~250ms. Emits 2 harmless warnings about
                 # zonas_data.js/app.js not having type="module" — expected,
                 # they're loaded as classic scripts on purpose.
```

## Run (agent path)

Start the dev server in the background, poll until it responds, then pipe
commands to the driver:

```bash
npm run dev > /tmp/vite-dev.log 2>&1 &
timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null 2>&1; do sleep 1; done'

node .claude/skills/run-app-eleitoral/driver.mjs <<'EOF'
launch
switch-tab okr
login admin.teste@example.com Teste@2026
ss 01-logged-in
console --errors
quit
EOF
```

Screenshots land in `/tmp/shots/` (override with `SCREENSHOT_DIR`; on
Windows this resolves to `<current-drive>:\tmp\shots\`, e.g. `D:\tmp\shots\`
if your shell's cwd is on D:). Point the driver at a different URL with
`APP_URL` (default `http://localhost:5173`).

Stop the dev server when done — npm doesn't forward signals to the Vite
child process, so killing `$!` alone won't free the port:

```bash
# Linux/macOS:
lsof -ti:5173 -sTCP:LISTEN | xargs -r kill
# Windows (Git Bash), no lsof — find the PID from netstat and taskkill it:
netstat -ano | grep ':5173.*LISTENING'   # note the PID in the last column
taskkill //PID <pid> //F
```

### Driver commands

| command | what it does |
|---|---|
| `launch` | open headless Chromium, navigate to `APP_URL`, wait for the nav bar |
| `ss [name]` | screenshot → `<SHOT_DIR>/<name>.png` |
| `click <css-sel>` | `page.click()` |
| `click-text <text>` | click first button/link/`[role=button]` matching text |
| `fill <css-sel> <text>` | fill an input (rest of the line after the selector is the value) |
| `type <text>` / `press <key>` | keyboard input |
| `wait <css-sel>` | wait up to 10s for a selector |
| `eval <js-expr>` | evaluate in page context, prints JSON |
| `text [css-sel]` | print `innerText` (whole `body` if no selector) |
| `switch-tab <map\|ra\|dashboard\|okr\|agenda\|checkin>` | calls `window.switchTab()` directly — more reliable than clicking, works even if the tab bar is scrolled off-screen |
| `login <email> <password>` | switches to the OKR tab, fills `#okr-login-email`/`#okr-login-password`, clicks "Entrar"; no-ops if already logged in |
| `console [--errors]` | dump collected console/pageerror messages (`--errors` filters to just errors) |
| `quit` | close the browser, exit |

Commands run **strictly sequentially** — the driver awaits each one before
reading the next line, so a heredoc of many commands (as above) is safe.

## Run (human path)

```bash
npm run dev   # → http://localhost:5173, Ctrl-C to stop
```

## Test

```bash
npx playwright test
```

Verified result: **9 passed, 1 known-failing** —
`tests/visual-layers.spec.js:206` ("Aba OKRs carrega sem erros — com ou
sem Supabase configurado") asserts the OKR tab shows a "não configurado"
message, but this project's `.env.local` has real Supabase credentials
configured, so the tab loads live data instead. This is a stale test
assumption, not a regression — confirmed by `git stash`-ing all app
changes and re-running: same single failure. Don't try to "fix" it by
changing app code.

---

## Gotchas

- **A 404 from `*.supabase.co/rest/v1/<table>` means the table isn't in
  Supabase's PostgREST schema cache — i.e. the migration for that table
  was never actually run against this Supabase project**, not a bug in
  the driver or the app. Confirmed live: `areas`, `area_volunteers`,
  `checkins`, and even `prazos_eleitorais` (an earlier, unrelated
  feature) all 404 right now, even though their `CREATE TABLE` /
  `CREATE POLICY` statements are committed in `supabase/schema.sql`. The
  project has no migrations folder — `schema.sql` is meant to be pasted
  into the Supabase SQL Editor by hand, and that step has been missed
  for at least two features. If you see 404s on a REST call for a table
  you know exists in `schema.sql`, check with the user whether it was
  actually applied before debugging the frontend.
- **`readline`'s `'line'` event does not wait for an `async` handler to
  finish** before firing the next one. A driver built with
  `rl.on('line', async line => {...})` sends every heredoc line's
  handler racing in parallel — `ss`/`switch-tab` fire (and fail with
  "launch first") before `launch` has actually finished launching
  Chromium. Fix: use `for await (const line of rl) { await handle(line);
  }` (async iterator), which genuinely serializes.
- **No `tmux` in this Windows/Git Bash environment** (also no `apt-get`,
  no `xvfb`, no `lsof`). The electron.md-style advice to wrap a REPL
  driver in tmux doesn't apply here — piping a heredoc straight into
  `node driver.mjs <<'EOF' ... EOF` works fine instead, since Chromium
  (unlike Electron) never touches the Node process's stdin. If you're
  ever on a Linux box with tmux available, wrapping still works the same
  way as any other REPL driver.
- **`npm run dev &` orphans on Ctrl-C/kill `$!`.** npm's wrapper process
  doesn't forward signals to the Vite child it spawns. Find the real PID
  via the port (`netstat`/`lsof`) and kill that, not the npm wrapper PID.
- **Login succeeding ≠ `is_super_admin: true`.** The auth box will show
  "🚪 Sair" and a name even for a freshly-signed-up user with no role —
  role labels ("⭐ Nível Estratégico" vs "👤 Leitura (Transparência)")
  come from a separate `public.profiles.is_super_admin` flag and
  `product_team`/`area_volunteers` rows, not from auth success. Don't
  read "logged in" off the screenshot as "logged in as admin."

## Troubleshooting

- **`ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`**: the
  driver script was run from outside `app_eleitoral/` (or copied
  elsewhere) — Node ESM resolves `node_modules` relative to the script's
  own path, not `cwd`. Run it via a path under `app_eleitoral/` where
  `node_modules/playwright` actually exists.
- **`EADDRINUSE` on `npm run dev`**: a previous dev server is still
  bound to 5173. Kill it first (see "Run (agent path)" above) before
  relaunching.
- **Driver hangs after `launch`**: check `/tmp/vite-dev.log` — if the
  dev server itself never became ready, `page.goto()` will eventually
  time out at 30s rather than hang forever, but a dead server is the
  usual cause.
