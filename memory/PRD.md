# Robo Pixel PRD

## Original problem statement

Build Robo as a privacy-first Windows desktop companion following `ROBO_DEVELOP_AZ.MD`: audit the existing repository, establish a lightweight Tauri + React + TypeScript shell, use a 2D-first animated renderer, detect only low-cost application/activity metadata, provide pause/hide/focus controls, persist safe settings, degrade safely, remain offline, and validate performance, privacy, Windows behavior, and release readiness incrementally.

## Architecture decisions

- The available codebase is a CRA/CRACO React starter, not an existing Robo desktop app.
- Use incremental migration: keep React for the renderer and introduce Tauri only when Part 2 is authorized.
- Prefer a 2D renderer; defer 3D until it passes the documented performance and reliability gate.
- Keep the core offline and avoid FastAPI/MongoDB unless a future feature genuinely needs a local service.
- Treat the current external scripts, fonts, analytics, and generic backend as audit findings to resolve before an offline desktop release.

## Implemented

- Part 1 repository inventory and baseline audit.
- Production build verification.
- Backend syntax verification.
- Test-suite availability check.
- Security/privacy and dependency observations.
- Migration recommendation documented in `/app/REPOSITORY_AUDIT.md`.

## Prioritized backlog

### P0

- Build the transparent, borderless Tauri shell with non-activating behavior.
- Add drag handling, position persistence, reset-to-visible-monitor, hide/show, pause, tray controls, and single-instance protection.
- Remove starter analytics/network dependencies from the offline core.

### P1

- Replace the stock splash with a TypeScript 2D Robo renderer and fallback state API.
- Add animation states, reduced-motion behavior, focus mode, and safe local settings.
- Add unit/component/integration coverage for state priority, persistence, and shell commands.

### P2

- Add conservative Windows context adapters, multi-monitor/DPI hardening, startup, updater, installer, and long-run performance tests.
- Evaluate 3D only after the 2D baseline is stable and measured.

## Current stop point

Part 1 is complete. Do not begin Part 2 until explicitly requested.