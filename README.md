# SCRAM

Real-life hide-and-seek. Runners hide, hunters chase, the phone referees.

Live web build: https://scram-kappa.vercel.app

## What's here

An Expo Router app (iOS, Android and web) with real multiplayer: friends join from their own phones with a six-character code, and each phone shares its GPS during the round.

- **Your name** (stored on the device)
- **Host**: place the zone on the map and set zone size, round length, ping interval, head start and an optional shrinking zone
- **Join** with a six-character code
- **Lobby**: pick Hunter, Runner or Random; teams must be balanced before the host can start
- **Game**: hunters see ping snapshots on a dark map, runners see their team live, plus zone-shrink warnings, Team Radio chat and tag confirmation
- **Results** and **Play again** for the host
- **Practice with bots**: the whole game on one phone; `src/game/sim.ts` plays the others and `DEMO_SPEED` speeds up the clock

## Backend

Convex (project `scram`). The schema is in `convex/schema.ts` and all game rules in `convex/game.ts`. Phones subscribe to `game.state`, which only returns what that player is allowed to see, and update live. Pings, the end of the round and the out-of-zone check run on Convex's scheduler.

- `npx convex dev` runs against your dev deployment (written to `.env.local`)
- `npx convex deploy` pushes the functions to production (`wary-bandicoot-758`), which the app uses by default
- Point the app elsewhere with `EXPO_PUBLIC_CONVEX_URL`

Maps use Esri's light and dark gray canvas tiles with attribution.

Not done yet: location while the phone is locked (needs a native build with background location), push notifications, and email sign-in.

## Run it

```bash
npm install
npx expo start        # then press i, a or w
```

## Project layout

- `src/app/` — screens (Expo Router)
- `src/components/` — UI kit, stylized map, SCRAM wordmark
- `src/game/` — the shared game interface, practice engine and simulator
- `src/online/` — Convex client, GPS and the online engine
- `convex/` — backend schema and game functions
- `src/theme.ts` — colors and fonts from scramhideandseek.com

## Deploy

Vercel builds the web version using `vercel.json` on every push to `main`. Backend changes go out separately with `npx convex deploy`. `scripts/fetch-assets.mjs` downloads the Archivo fonts and the logo if they're missing.
