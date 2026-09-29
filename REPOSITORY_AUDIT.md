# Robo Pixel — Part 1 Repository Audit

**Audit status:** Complete. No Part 2 implementation was started.
**Repository baseline:** `/app`, commit `bb55be6` (`Initial commit`)
**Audit date:** 2026-03-06

## Access and current structure

- The available repository is a CRA/CRACO React starter under `/app/frontend`.
- No `PLAN.MD` exists in the workspace.
- No `robo_pixel`-specific source, Tauri project, Rust `Cargo.toml`, Electron project, desktop installer, or native bridge exists.
- `/app/backend/server.py` is a generic FastAPI/Mongo status-check template; it is not used by the current frontend feature set.
- Frontend entrypoints are `src/index.js` and `src/App.js`; the current page is the stock Emergent splash.
- `src/components/ui/` contains a large preinstalled shadcn/Radix-style component library, but no Robo components.
- There are no local animation assets, sprite sheets, Lottie files, character models, or desktop icons.

## Feature status

| Area | Status | Finding |
|---|---|---|
| React renderer | Working baseline | CRA/CRACO app builds and renders the stock splash |
| TypeScript | Missing | Current frontend is JavaScript only |
| Tauri shell | Missing | No Rust/Tauri project or native commands |
| Transparent borderless window | Missing | Browser page only |
| Always-on-top / drag / position persistence | Missing | No native window behavior |
| Tray / hide / pause / focus mode | Missing | No implementation |
| Robo animation states | Missing | No character or animation assets |
| Context detection | Missing | No app metadata, idle, fullscreen, lock, or monitor adapters |
| Privacy controls | Missing | No Robo privacy settings or local context policy |
| Offline core | Partial | UI is local, but the starter calls the configured backend and loads external scripts/fonts |
| Optional FastAPI/Mongo | Present but unused | Generic `/api/` and `/api/status` template; Mongo is unnecessary for MVP |
| Automated tests | Missing | Jest reports zero matching test files |

## Build and runtime baseline

- Node: `v20.20.2`
- Yarn: `1.22.22`
- Frontend production build: **PASS** (`yarn build`)
- Production bundle: `99.49 kB` JS gzip and `8.8 kB` CSS gzip
- Backend Python syntax check: **PASS** (`python3 -m compileall -q /app/backend`)
- Frontend test command: **BLOCKED by no tests** (`CI=true yarn test --watchAll=false` exits 1 with “No tests found”)
- Development startup and Windows runtime metrics were not measurable from the current browser-only scaffold.
- Workspace disk size is approximately `574 MB`, dominated by installed frontend dependencies; no oversized application assets were found.
- Git working tree is clean after stopping and restoring the premature implementation attempt.

## Security, privacy, and dependency observations

- No common hardcoded cloud/private-key patterns were found in source files during the baseline scan.
- `frontend/public/index.html` loads `assets.emergent.sh`, Google Fonts, and PostHog; this conflicts with a strict offline-first desktop MVP until reviewed or removed.
- The HTML includes a public PostHog project token and session-recording configuration; this must be explicitly reviewed against Robo’s privacy requirements before desktop release.
- The backend has broad CORS (`*`) and a generic Mongo dependency despite the requested MVP being offline and backend-optional.
- `requirements.txt` contains many unused integrations and data libraries for the current status-check server, increasing attack surface and package weight.
- No native permissions, installer permissions, update integrity controls, or binary signing configuration can be audited yet because no desktop shell exists.

## Migration decision

**Migrate incrementally from the existing frontend starter.** Preserve React as the renderer, remove the starter splash and unnecessary network/backend dependencies when Part 2 begins, and add a Tauri shell around a 2D-first Robo renderer. Do not add MongoDB or FastAPI to the core MVP unless a later feature requires a real local service.

## Part 1 conclusion

The repository is accessible, but it is not an existing Robo implementation. Repository-specific renderer, performance, native integration, and Windows behavior claims are therefore blocked until the desktop foundation exists. The safe next step is Part 2: build and measure the minimal Tauri shell before adding intelligence.