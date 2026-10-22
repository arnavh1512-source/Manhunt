import { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";

// The deployment URL is public; every game function checks the player's secret.
export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? "https://CONVEX_DEPLOYMENT.convex.cloud";

export const convex = new ConvexReactClient(CONVEX_URL);

export interface Session {
  gameId: string;
  code: string;
  playerId: string;
  secret: string;
}

const MESSAGES: Record<string, string> = {
  game_not_found: "No game with that code is waiting to start.",
  game_full: "That game is full.",
  need_name: "Add your name first.",
  not_host: "Only the host can do that.",
  not_in_game: "You’re no longer in this game.",
  no_zone: "Place the zone on the map first.",
  need_3_players: "Need at least 3 players.",
  too_many_hunters: "Too many hunters for this many players.",
  need_a_hunter: "Someone needs to hunt.",
  need_a_runner: "Someone needs to run.",
  not_all_ready: "Waiting for everyone to tap “I’m ready”.",
};

export function errorText(e: unknown) {
  if (e instanceof ConvexError && typeof e.data === "string") return MESSAGES[e.data] ?? "Something went wrong. Try again.";
  return "Couldn’t reach the game server. Check your connection.";
}
