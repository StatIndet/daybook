# AGENTS.md

## Project Overview

`daybook` is a minimalist static blog generator for Go and HTML beginners. The project is currently in the **Maintenance and Refactoring Phase**. The architecture has been migrated to a fully standalone CLI model.

## Standalone Architecture

**CRITICAL**: `StatIndet/daybook` is the Daybook CLI source repository. It is **NOT** a blog vault. There is no `content/` folder, no root `daybook.yaml`, and no Cloudflare Pages Functions in this repository. 

The directory structure is strictly separated into source code and embedded assets:

* `assets/ts/`: First-party TypeScript source code.
* `internal/embedded/`: The root directory for embedded templates and static assets.
  * `internal/embedded/templates/`: Go HTML templates (`layouts/`, `pages/`, `partials/`).
  * `internal/embedded/static/css/`: Global CSS and page-specific styles.
  * `internal/embedded/static/js/`: **Generated** JavaScript files.
  * `internal/embedded/static/vendor/`: **Generated** third-party runtime assets (Fonts, KaTeX, Waline).
* `cmd/daybook/`: The CLI entry point.
* `internal/`: Core Go application logic.

### User Vaults
The CLI operates on a user's Vault, which is an external working directory independent of this repository. A user vault contains `daybook.yaml` and `notes/`. 
The `daybook build` command reads the current working directory as the vault and outputs to `public/`.

## Development Guidelines

### Frontend & Vendors
* **Do not directly modify files in `internal/embedded/static/js/`.** Modify `assets/ts/*.ts` and run `npm run build:js`.
* **Do not directly modify files in `internal/embedded/static/vendor/`.** npm packages in `package.json` are the single source of truth. Updates to vendors should be done by bumping npm versions and running `npm run build:vendor`.
* Release builds will strictly rebuild vendor assets from `node_modules`.

### Workflow
When making changes, follow this pipeline:
1. Source code changes (Go, TS, HTML, CSS).
2. `npm run build:js` or `npm run build:vendor` if applicable.
3. `go build` to verify compilation.
4. Run `./scripts/check.sh` to perform integrity checks and a temporary external vault smoke test.

### Protected Layout & Design
The UI/UX is considered stable. Do not modify the existing UI layout, View Transitions, side navigation, persistent logos, or typography unless explicitly requested by the user. Ensure CSS modifications only target the specific components intended.

### Cloudflare Deployment
Cloudflare deployment is a concern of the user's vault and output deployment workflow, not this source repository. There is no longer a Cloudflare Pages Functions architecture embedded within the Daybook source tree.

## Commit & PR Rules
* Provide clean, logical commits.
* Make sure `npm ci && npm run typecheck && npm run build:js && npm run build:vendor` pass locally before pushing.
* `check.sh` is the definitive gating script for PRs and local validation.
