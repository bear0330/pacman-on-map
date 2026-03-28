# Repository Guidelines

## Project Structure & Module Organization
This is a Vite + TypeScript web app for a map-based Pac-Man prototype.

- `src/main.ts`: app bootstrap, UI wiring, game loop.
- `src/game/`: gameplay state and movement logic (`gameEngine.ts`, tests in `*.test.ts`).
- `src/generator/`: road-to-playable-map generation and pellet placement.
- `src/data/`: Overpass/Nominatim data access.
- `src/map/`: MapLibre setup and viewport helpers.
- `src/render/`: canvas rendering and effects.
- `src/audio/`: synthesized sound effects.
- `src/style.css`: app-wide styling.
- `public/` and `src/assets/`: static assets.

Keep new code near the owning module. Prefer colocated tests such as `src/game/foo.test.ts`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start the local Vite dev server.
- `npm run build`: type-check with `tsc` and create a production bundle.
- `npm run preview`: serve the built app locally.
- `npm run test`: run the Vitest suite once.

Typical workflow:

```bash
npm run dev
npm run test
npm run build
```

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation and semicolon-free style, matching the existing codebase.

- Use `camelCase` for variables/functions and `PascalCase` for classes/types.
- Keep files focused by feature (`gameEngine.ts`, `mapController.ts`).
- Prefer small private helpers over repeated inline logic.
- Follow existing naming for tests: `*.test.ts`.

No lint or formatter config is currently committed, so match surrounding code carefully.

## Testing Guidelines
Tests use `vitest`. Add or update tests for game logic, map generation, and data filtering whenever behavior changes.

- Place tests next to the source module.
- Name tests by behavior, for example: `it('wraps to the opposite side when moving out at the boundary')`.
- Run `npm run test` before submitting changes.

## Commit & Pull Request Guidelines
This repository currently has no commit history, so there is no established convention to mirror yet. Use short, imperative commit messages such as:

- `fix ghost collision on straight roads`
- `cache static canvas layers for smoother rendering`

For pull requests, include:

- a concise summary of behavior changes
- test/build results
- screenshots or short clips for UI/gameplay changes
- linked issue or task context when available

## Architecture Notes
The app has three main layers: road data ingestion, playable-map generation, and runtime rendering/gameplay. Favor changes that keep those layers separate rather than mixing fetch, generation, and render logic in one file.

## Agent-Specific Notes
When working as an AI or automation agent:

- Inspect the owning module before editing. Most changes belong in one of: `src/data/`, `src/generator/`, `src/game/`, or `src/render/`.
- Avoid mixing concerns in a single patch. For example, do not put Overpass fetch changes inside `gameEngine.ts`.
- Preserve the current separation between static rendering (`canvasRenderer.ts`) and runtime game state (`gameEngine.ts`).
- If you change gameplay behavior, update or add Vitest coverage in the matching `*.test.ts` file.
- Before finishing, run at least:

```bash
npm run build
npx vitest run src/game/gameEngine.test.ts src/generator/generatePlayableMap.test.ts src/data/overpass.test.ts
```

- For UI or feel changes, mention what should be verified manually in the browser, especially movement smoothness, collision behavior, pellet placement, and ghost pathing.
