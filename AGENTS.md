# Repository Guidelines

## Project Structure & Modules
- `src/main.ts`: Obsidian plugin entry (commands, activation).
- `src/settings.ts`: Settings UI and persistence.
- `src/terminal/`: Terminal implementation
  - `terminal-view.ts`, `xterm-manager.ts`, `pty-manager.ts`, `shell-manager.ts`.
- Build outputs at repo root: `main.js`, `styles.css`, `manifest.json`, `pty-host.js` (copied by build), plus `versions.json` for compatibility.

## Build, Test, and Dev Commands
- `npm install --ignore-scripts`: Fast setup without native builds (recommended for most dev).
- `npm run dev`: Watch build with esbuild; rebuilds on change.
- `npm run build`: Type-checks (`tsc`) then creates a production bundle.
- `npx tsc -noEmit`: Type check only.
- Test in Obsidian by copying `main.js`, `manifest.json`, `styles.css` (and `node-pty` binaries if locally compiled) to `<vault>/.obsidian/plugins/code-unblock-terminal/`.

## Coding Style & Naming
- Language: TypeScript (strict). `noImplicitAny`, `strictNullChecks` enabled.
- Indentation: 2 spaces; max 120 cols; prefer early returns.
- Filenames: kebab-case (`pty-manager.ts`, `xterm-manager.ts`).
- Naming: `CamelCase` classes, `camelCase` variables/functions, `SCREAMING_SNAKE_CASE` constants.
- Imports: keep Obsidian/xterm/node-pty as explicit externals (see `esbuild.config.mjs`). Avoid circular deps between managers.

## Testing Guidelines
- No automated tests yet for Phase 1. Validate via manual scenarios in Obsidian (open/close panel, resize, switch shells, theme changes, settings persistence). Use the checklist in `CODE_REVIEW_FIXES.md`.
- Run `npx tsc -noEmit` before pushing to catch type regressions.

## Commit & Pull Requests
- Commits: concise, imperative subject; reference scope (e.g., `terminal: fix resize race`).
- Releases: use `npm version {patch|minor|major}`. Do NOT edit versions by hand. This updates `manifest.json`/`versions.json`, stages files, commits, and tags.
- PRs: include description, linked issues, user-facing notes, and screenshots/console output for UI or error changes. Add validation steps to reproduce.

## Security & Configuration
- Native module: `node-pty` is platform-specific; local compilation is optional. Prefer `--ignore-scripts` unless you need to test PTY locally.
- Don’t commit `node_modules/` or platform binaries. Keep secrets out of code and logs.

## Agent Notes
- Keep module boundaries intact; avoid moving files without need.
- When changing build/test commands or versions, update `DEVELOPMENT.md` accordingly.
