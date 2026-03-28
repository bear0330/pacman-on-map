# Pac-Man on Map

🟡 A tribute remake inspired by **Ms. PAC-Maps**, Google's April Fools' Pac-Man on Google Maps.  
I built this project for my 5-year-old son to enjoy.

This project turns real streets into a playable Pac-Man board. Pick a neighborhood, generate a road maze, and play directly on top of the map.

## What It Does

- 🗺️ Generates a playable Pac-Man layout from real road data
- 👻 Spawns ghosts, pellets, power pellets, scoring, and lives
- 🌏 Supports **English** and **Traditional Chinese**
- 📍 Lets you search places or load optional preset addresses
- 🎵 Uses built-in synthesized arcade-style audio in the browser

## Demo Flow

1. Move the map to an area you want to play.
2. Click `Generate Road Maze`.
3. Press `Play`.
4. Use `Arrow Keys` or `WASD`.

## Tech Stack

- `Vite`
- `TypeScript`
- `MapLibre GL JS`
- `OpenStreetMap` raster tiles
- `Overpass API` + `Nominatim`
- `Vitest`

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

Production files are generated into `dist/`.

## Deployment

This is a **static frontend app**. No custom backend server is required.

You can deploy `dist/` to:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- Any static hosting or CDN

Note: the app fetches road and geocoding data directly from public services in the browser, so client-side network access is required.

## Optional Preset Addresses

If `public/addresses.txt` exists, the app will load preset places into a dropdown.  
If the file is missing, the UI simply hides that option.

Supported formats:

```text
Label
Label|Search Query
Label|lat|lng
```

## Project Structure

```text
src/data        Overpass, Nominatim, preset loading
src/generator   Road-to-maze generation
src/game        Pac-Man rules, ghosts, collisions, scoring
src/render      Canvas overlay rendering
src/map         MapLibre setup and viewport control
src/i18n.ts     UI translations
```

## Testing

```bash
npm run test
```

Current tests cover road clipping, map generation, collisions, scoring chains, and win/loss flow.

## Notes

- This is a fan-made tribute project.
- It is not affiliated with or endorsed by Google, Namco, or Bandai Namco.
- The project avoids bundling original Pac-Man commercial assets.

If this little remake makes one kid smile on a random street corner somewhere in the world, it did its job.
