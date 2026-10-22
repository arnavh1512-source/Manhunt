// Local stand-in for the multiplayer backend. It plays the other phones in the
// lobby so every screen can be exercised on one device. Replace with real
// sync (Convex) and device GPS when wiring up the backend.
import type { ChatMessage, Ping, Player, Point, Role, RoleChoice, Settings } from "./types";

/** Game seconds that pass per real second. 1 = real time. */
export const DEMO_SPEED = 12;

export const TAG_DISTANCE_M = 12;
export const OUTSIDE_GRACE_S = 30;
export const SHRINK_WARNING_S = 60;

const FRIENDS = ["Priya", "Mia", "Jonah", "Aki", "Sam"];

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeCode() {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function friend(i: number, zone: number): Player {
  const name = FRIENDS[i % FRIENDS.length];
  const choices: RoleChoice[] = ["runner", "hunter", "random", "runner", "random"];
  return {
    id: `p-${name.toLowerCase()}`,
    name,
    choice: choices[i % choices.length],
    ready: false,
    pos: randomIn(zone * 0.15),
    tagged: false,
  };
}

export function randomIn(r: number): Point {
  const a = Math.random() * Math.PI * 2;
  const d = Math.sqrt(Math.random()) * r;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
}

export function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A hiding spot for a runner, well away from the centre where hunters wait. */
export function hidingSpot(zoneR: number): Point {
  const a = Math.random() * Math.PI * 2;
  const d = zoneR * (0.45 + Math.random() * 0.45);
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
}

/** Hunters allowed for a player count: 1 up to half the lobby. */
export function hunterRange(n: number) {
  return { min: 1, max: Math.max(1, Math.floor(n / 2)) };
}

/** Teams are balanced when hunters fit the range and every team is non-empty. */
export function teamCheck(players: Player[]) {
  const n = players.length;
  const hunters = players.filter((p) => p.choice === "hunter").length;
  const runners = players.filter((p) => p.choice === "runner").length;
  const random = n - hunters - runners;
  const { min, max } = hunterRange(n);
  const ok = n >= 3 && hunters <= max && runners <= n - min && hunters + random >= min && runners + random >= 1;
  let reason = "";
  if (n < 3) reason = `Need at least 3 players (${n} here).`;
  else if (hunters > max) reason = `Too many hunters. With ${n} players: ${min} to ${max}.`;
  else if (!ok) reason = "Someone needs to hunt.";
  return { ok, reason, min, max };
}

/** Random fills whichever team is short. */
export function assignRoles(players: Player[]): Player[] {
  const n = players.length;
  const { min, max } = hunterRange(n);
  let hunters = players.filter((p) => p.choice === "hunter").length;
  const target = Math.min(max, Math.max(min, Math.round(n / 3)));
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const roles = new Map<string, Role>();
  for (const p of shuffled) {
    if (p.choice !== "random") roles.set(p.id, p.choice);
    else if (hunters < target) {
      roles.set(p.id, "hunter");
      hunters++;
    } else roles.set(p.id, "runner");
  }
  return players.map((p) => ({ ...p, role: roles.get(p.id), tagged: false }));
}

/** Move one simulated player for dt game seconds. */
export function step(p: Player, dt: number, zoneR: number, target?: Point, pace = 1): Point {
  const speed = (p.role === "hunter" ? 2.0 : 2.4) * pace; // m/s, a jog
  let dx: number;
  let dy: number;
  if (target) {
    const d = Math.max(1, dist(p.pos, target));
    dx = ((target.x - p.pos.x) / d) * speed * dt;
    dy = ((target.y - p.pos.y) / d) * speed * dt;
  } else {
    const a = Math.random() * Math.PI * 2;
    dx = Math.cos(a) * speed * dt * 0.7;
    dy = Math.sin(a) * speed * dt * 0.7;
  }
  let next = { x: p.pos.x + dx, y: p.pos.y + dy };
  const r = Math.hypot(next.x, next.y);
  if (r > zoneR * 0.95) next = { x: (next.x / r) * zoneR * 0.9, y: (next.y / r) * zoneR * 0.9 };
  return next;
}

export function snapshot(players: Player[], at: number): Ping[] {
  return players.filter((p) => p.role === "runner" && !p.tagged).map((p) => ({ playerId: p.id, pos: p.pos, at }));
}

/** Zone radius at a given hunt time, shrinking by 15% at each quarter of the round. */
export function zoneRadiusAt(settings: Settings, huntS: number) {
  const r0 = settings.zoneMeters / 2;
  if (!settings.shrink) return r0;
  const quarter = (settings.roundMin * 60) / 4;
  const shrinks = Math.min(3, Math.floor(huntS / quarter));
  return r0 * Math.pow(0.85, shrinks);
}

export function nextShrinkAt(settings: Settings, huntS: number) {
  if (!settings.shrink) return null;
  const quarter = (settings.roundMin * 60) / 4;
  const n = Math.floor(huntS / quarter) + 1;
  return n <= 3 ? n * quarter : null;
}

const RADIO: Record<"hunter" | "runner", { at: number; text: string }[]> = {
  runner: [
    { at: 20, text: "Split up. I'll take the park." },
    { at: 200, text: "Hunter just crossed the canal 👀" },
    { at: 420, text: "Who brought the snacks?" },
  ],
  hunter: [
    { at: 30, text: "Cover the canal." },
    { at: 260, text: "Two of them were near Fig St last ping." },
    { at: 500, text: "Who brought the snacks?" },
  ],
};

export function scriptedRadio(team: Role, fromNames: string[], prevS: number, nowS: number): Omit<ChatMessage, "id">[] {
  if (fromNames.length === 0) return [];
  return RADIO[team]
    .filter((m) => m.at > prevS && m.at <= nowS)
    .map((m, i) => ({ from: fromNames[i % fromNames.length], text: m.text, at: m.at }));
}

export function clock(s: number) {
  const t = Math.max(0, Math.ceil(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m).padStart(2, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function ago(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} ago`;
}
