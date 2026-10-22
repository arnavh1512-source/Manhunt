import type { LocationStatus } from "../online/location";
import type { LatLng } from "../online/geo";
import type { ChatMessage, Phase, Ping, Player, Role, RoleChoice, Settings } from "./types";

export interface Alert {
  id: number;
  title: string;
  body: string;
}

/** What every screen reads and calls, whether the game is online or practice. */
export interface Game {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Real-world centre of the zone; null in practice mode, which uses a drawn map. */
  zoneCenter: LatLng | null;
  setZoneCenter: (c: LatLng) => void;
  locationStatus: LocationStatus | null;
  /** Ask for this phone's location (the host screen needs it before a game exists). */
  wantLocation: () => void;

  code: string | null;
  isHost: boolean;
  phase: Phase;
  players: Player[];
  you: Player | undefined;
  /** Game seconds since "Let's go". Scatter runs first, then the hunt. */
  t: number;
  pings: Ping[];
  chat: ChatMessage[];
  winner: Role | null;
  alert: Alert | null;
  tagPrompt: boolean;

  headStartS: number;
  roundS: number;
  huntS: number;
  zoneR: number;
  headStartLeft: number;
  roundLeft: number;
  nextPingIn: number;
  shrinkIn: number | null;
  runners: Player[];
  hunters: Player[];
  liveOutside: string[];

  /** Each returns an error message, or null when it worked. */
  hostGame: () => Promise<string | null>;
  joinGame: (code: string) => Promise<string | null>;
  start: () => Promise<string | null>;
  rematch: () => Promise<string | null>;
  chooseRole: (choice: RoleChoice) => void;
  setReady: (ready: boolean) => void;
  sendChat: (text: string) => void;
  dismissAlert: () => void;
  confirmTagged: () => void;
  denyTagged: () => void;
  reportTag: () => void;
  leave: () => void;
}
