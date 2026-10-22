// Calls the SCRAM game functions in Supabase (see supabase/schema.sql).
// The publishable key is meant to ship in the app; every function checks the
// player's own secret, and the tables themselves aren't readable.
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://wbyuojkzkaembuxyoylb.supabase.co";
const KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? "sb_publishable_mWfLOaPI_quQXnUyMn3XjQ_IELkE_LU";

export interface Session {
  game_id: string;
  code: string;
  player_id: string;
  secret: string;
}

export interface ServerPlayer {
  id: string;
  name: string;
  choice: "hunter" | "runner" | "random";
  role: "hunter" | "runner" | null;
  ready: boolean;
  tagged: boolean;
  lat: number | null;
  lng: number | null;
  live_outside: boolean;
}

export interface ServerState {
  now: string;
  me: string;
  game: {
    id: string;
    code: string;
    status: "lobby" | "live" | "over";
    host_player: string;
    round: number;
    zone_lat: number | null;
    zone_lng: number | null;
    zone_m: number;
    round_min: number;
    ping_min: number;
    head_start_min: number;
    shrink: boolean;
    started_at: string | null;
    ended_at: string | null;
    winner: "hunter" | "runner" | null;
  };
  players: ServerPlayer[];
  last_ping: number;
  pings: { player_id: string; lat: number; lng: number; at: string }[];
  messages: { id: number; from: string; player_id: string; body: string; at: string }[];
}

const MESSAGES: Record<string, string> = {
  game_not_found: "No game with that code is waiting to start.",
  game_full: "That game is full.",
  not_host: "Only the host can do that.",
  not_in_game: "You’re no longer in this game.",
  no_zone: "Place the zone on the map first.",
  need_3_players: "Need at least 3 players.",
  too_many_hunters: "Too many hunters for this many players.",
  need_a_hunter: "Someone needs to hunt.",
  need_a_runner: "Someone needs to run.",
  not_all_ready: "Waiting for everyone to tap “I’m ready”.",
};

export class GameError extends Error {
  constructor(public code: string) {
    super(MESSAGES[code] ?? "Couldn’t reach the game server. Check your connection.");
  }
}

export async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch {
    throw new GameError("network");
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new GameError(body?.message ?? "network");
  return body as T;
}

export const api = {
  createGame: (name: string) => rpc<Session>("create_game", { p_name: name }),
  joinGame: (code: string, name: string) => rpc<Session>("join_game", { p_code: code, p_name: name }),
  updateSettings: (s: Session, settings: Record<string, unknown>) =>
    rpc("update_settings", { p_player: s.player_id, p_secret: s.secret, p_settings: settings }),
  setChoice: (s: Session, choice: string) => rpc("set_choice", { p_player: s.player_id, p_secret: s.secret, p_choice: choice }),
  setReady: (s: Session, ready: boolean) => rpc("set_ready", { p_player: s.player_id, p_secret: s.secret, p_ready: ready }),
  start: (s: Session) => rpc("start_game", { p_player: s.player_id, p_secret: s.secret }),
  updateLocation: (s: Session, lat: number, lng: number) =>
    rpc("update_location", { p_player: s.player_id, p_secret: s.secret, p_lat: lat, p_lng: lng }),
  confirmTag: (s: Session) => rpc("confirm_tag", { p_player: s.player_id, p_secret: s.secret }),
  sendMessage: (s: Session, body: string) => rpc("send_message", { p_player: s.player_id, p_secret: s.secret, p_body: body }),
  leave: (s: Session) => rpc("leave_game", { p_player: s.player_id, p_secret: s.secret }),
  rematch: (s: Session) => rpc("rematch", { p_player: s.player_id, p_secret: s.secret }),
  state: (s: Session, afterMessage: number) =>
    rpc<ServerState>("get_state", { p_player: s.player_id, p_secret: s.secret, p_after_message: afterMessage }),
};
