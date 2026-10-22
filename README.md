# SCRAM

Real-life hide-and-seek. Runners hide, hunters chase, the phone referees.

Live web build: https://scram-kappa.vercel.app

## What's here

An Expo Router app (iOS, Android and web) covering the whole game flow:

- **Sign in** with an emailed code
- **Host**: place the zone on the map and set zone size, round length, ping interval, head start and an optional shrinking zone
- **Join** with a six-character code
- **Lobby**: pick Hunter, Runner or Random; teams must be balanced before the host can start
- **Game**: hunters see ping snapshots on a dark map, runners see their team live, plus zone-shrink warnings, Team Radio chat and tag confirmation
- **Results**

The other players are simulated by `src/game/sim.ts` so the app can be played on one device. `DEMO_SPEED` there speeds up the game clock (12× by default). Real multiplayer, GPS and email codes are not wired up yet.

## Run it

```bash
npm install
npx expo start        # then press i, a or w
```

## Project layout

- `src/app/` — screens (Expo Router)
- `src/components/` — UI kit, stylized map, SCRAM wordmark
- `src/game/` — game state, rules and the local simulator
- `src/theme.ts` — colors and fonts from scramhideandseek.com

## Deploy

Vercel builds the web version using `vercel.json`. `scripts/fetch-assets.mjs` downloads the Archivo fonts and the logo if they're missing.
