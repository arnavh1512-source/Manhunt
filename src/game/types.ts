export type Role = "hunter" | "runner";
export type RoleChoice = Role | "random";

export interface Settings {
  zoneMeters: number; // diameter
  roundMin: number;
  pingMin: number;
  headStartMin: number;
  shrink: boolean;
}

/** Position in metres from the zone centre (x east, y south). */
export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string;
  isYou?: boolean;
  choice: RoleChoice;
  role?: Role;
  ready: boolean;
  pos: Point;
  tagged: boolean;
}

export interface Ping {
  playerId: string;
  pos: Point;
  at: number; // game seconds
}

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  at: number;
}

export type Phase = "lobby" | "scatter" | "hunt" | "over";

export const LIMITS = {
  zoneMeters: { min: 400, max: 3000, step: 20 },
  roundMin: { min: 10, max: 180, step: 5 },
  pingMin: { min: 1, max: 30, step: 1 },
  headStartMin: { min: 0, max: 15, step: 1 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  zoneMeters: 840,
  roundMin: 45,
  pingMin: 5,
  headStartMin: 3,
  shrink: false,
};
