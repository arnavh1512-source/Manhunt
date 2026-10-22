// Practice mode: the simulator in ./sim plays everyone else on this phone.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Alert, Game } from "./engine";
import {
  DEMO_SPEED,
  OUTSIDE_GRACE_S,
  SHRINK_WARNING_S,
  TAG_DISTANCE_M,
  assignRoles,
  dist,
  friend,
  hidingSpot,
  makeCode,
  nextShrinkAt,
  randomIn,
  scriptedRadio,
  snapshot,
  step,
  zoneRadiusAt,
} from "./sim";
import { DEFAULT_SETTINGS, type ChatMessage, type Phase, type Ping, type Player, type Point, type Role, type RoleChoice, type Settings } from "./types";

interface GameState {
  settings: Settings;
  code: string | null;
  isHost: boolean;
  phase: Phase;
  players: Player[];
  /** Game seconds since "Let's go". Scatter runs first, then the hunt. */
  t: number;
  pings: Ping[];
  lastPingAt: number | null;
  chat: ChatMessage[];
  outsideSince: Record<string, number>;
  winner: Role | null;
  alert: Alert | null;
  tagPrompt: boolean;
  /** After "No, still free", don't ask again until this game second. */
  tagQuietUntil: number;
}

const initial: GameState = {
  settings: DEFAULT_SETTINGS,
  code: null,
  isHost: false,
  phase: "lobby",
  players: [],
  t: 0,
  pings: [],
  lastPingAt: null,
  chat: [],
  outsideSince: {},
  winner: null,
  alert: null,
  tagPrompt: false,
  tagQuietUntil: 0,
};

const YOU_ID = "you";
const noop = () => {};
const hideouts = new Map<string, Point>();
let alertSeq = 0;

export function useSimEngine(): Game {
  const [s, setS] = useState<GameState>(initial);
  const startWall = useRef<number | null>(null);
  const joinTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const you = s.players.find((p) => p.id === YOU_ID);
  const headStartS = s.settings.headStartMin * 60;
  const roundS = s.settings.roundMin * 60;
  const huntS = Math.max(0, s.t - headStartS);

  const updateSettings = useCallback((patch: Partial<Settings>) => setS((p) => ({ ...p, settings: { ...p.settings, ...patch } })), []);

  // Friends trickle into the lobby like real phones joining.
  const fillLobby = useCallback((count: number) => {
    joinTimers.current.forEach(clearTimeout);
    joinTimers.current = Array.from({ length: count }, (_, i) =>
      setTimeout(() => {
        setS((p) => {
          const f = friend(i, p.settings.zoneMeters);
          if (p.phase !== "lobby" || p.players.some((x) => x.id === f.id)) return p;
          return { ...p, players: [...p.players, f] };
        });
        setTimeout(() => setS((p) => ({ ...p, players: p.players.map((x) => (x.id === friend(i, 0).id ? { ...x, ready: true } : x)) })), 1500);
      }, 700 + i * 900),
    );
  }, []);

  const me = (choice: RoleChoice = "random"): Player => ({ id: YOU_ID, name: "You", isYou: true, choice, ready: false, pos: { x: 0, y: 0 }, tagged: false });

  const hostGame = useCallback(async () => {
    setS((p) => ({ ...initial, settings: p.settings, code: makeCode(), isHost: true, players: [me()] }));
    fillLobby(4);
    return null;
  }, [fillLobby]);

  const joinGame = useCallback(
    async (code: string) => {
      setS((p) => ({ ...initial, settings: p.settings, code: code.toUpperCase(), isHost: false, players: [me()] }));
      fillLobby(5);
      return null;
    },
    [fillLobby],
  );

  const chooseRole = useCallback(
    (choice: RoleChoice) => setS((p) => ({ ...p, players: p.players.map((x) => (x.id === YOU_ID ? { ...x, choice, ready: false } : x)) })),
    [],
  );
  const setReady = useCallback(
    (ready: boolean) => setS((p) => ({ ...p, players: p.players.map((x) => (x.id === YOU_ID ? { ...x, ready } : x)) })),
    [],
  );

  const start = useCallback(async () => {
    joinTimers.current.forEach(clearTimeout);
    startWall.current = Date.now();
    setS((p) => {
      const r = p.settings.zoneMeters / 2;
      const players = assignRoles(p.players).map((x) => ({ ...x, pos: x.role === "hunter" ? randomIn(r * 0.1) : randomIn(r * 0.2) }));
      hideouts.clear();
      for (const x of players) if (x.role === "runner") hideouts.set(x.id, hidingSpot(r));
      return { ...p, phase: "scatter", t: 0, players, pings: [], lastPingAt: null, chat: [], winner: null, outsideSince: {} };
    });
    return null;
  }, []);

  const sendChat = useCallback(
    (text: string) =>
      setS((p) => ({ ...p, chat: [...p.chat, { id: `m${Date.now()}`, from: "You", text, at: p.t }] })),
    [],
  );

  const dismissAlert = useCallback(() => setS((p) => ({ ...p, alert: null })), []);

  /** The runner confirms a hunter tagged them in person. */
  const confirmTagged = useCallback(
    () => setS((p) => ({ ...p, tagPrompt: false, players: p.players.map((x) => (x.id === YOU_ID ? { ...x, tagged: true } : x)) })),
    [],
  );
  const denyTagged = useCallback(() => setS((p) => ({ ...p, tagPrompt: false, tagQuietUntil: p.t + 60 })), []);
  const reportTag = useCallback(() => setS((p) => ({ ...p, tagPrompt: true })), []);

  const leave = useCallback(() => {
    joinTimers.current.forEach(clearTimeout);
    startWall.current = null;
    setS((p) => ({ ...initial, settings: p.settings }));
  }, []);

  // Game loop.
  useEffect(() => {
    if (s.phase !== "scatter" && s.phase !== "hunt") return;
    const id = setInterval(() => {
      setS((p) => {
        if (!startWall.current || (p.phase !== "scatter" && p.phase !== "hunt")) return p;
        const t = ((Date.now() - startWall.current) / 1000) * DEMO_SPEED;
        const dt = t - p.t;
        const head = p.settings.headStartMin * 60;
        const round = p.settings.roundMin * 60;
        const hunt = Math.max(0, t - head);
        const zoneR = zoneRadiusAt(p.settings, hunt);
        let alert = p.alert;
        const raise = (title: string, body: string) => (alert = { id: ++alertSeq, title, body });

        let phase: Phase = t >= head ? "hunt" : "scatter";
        if (p.phase === "scatter" && phase === "hunt") raise("Ready or not", "Here we come. The hunt is on.");

        // Move everyone (your own dot stands in for GPS); hunters chase the nearest ping.
        const hunterList = p.players.filter((x) => x.role === "hunter");
        const players = p.players.map((x) => {
          if (x.tagged) return x;
          if (x.role === "hunter") {
            if (phase === "scatter") return x;
            const target = p.pings.length ? p.pings.reduce((a, b) => (dist(x.pos, a.pos) < dist(x.pos, b.pos) ? a : b)).pos : undefined;
            return { ...x, pos: step(x, dt, zoneR, target) };
          }
          // Runners sprint to a hiding spot, then lie low and only bolt when a hunter is close.
          const hide = hideouts.get(x.id);
          if (phase === "scatter" && hide) return { ...x, pos: step(x, dt, zoneR, hide) };
          const near = hunterList.find((h) => dist(h.pos, x.pos) < 90);
          if (near) {
            const away = { x: x.pos.x + (x.pos.x - near.pos.x) * 2, y: x.pos.y + (x.pos.y - near.pos.y) * 2 };
            return { ...x, pos: step(x, dt, zoneR, away, 1.1) };
          }
          return { ...x, pos: step(x, dt, zoneR, undefined, 0.25) };
        });

        // Tags. Simulated runners are tagged on contact; you get asked to confirm.
        let tagPrompt = p.tagPrompt;
        if (phase === "hunt") {
          for (const h of players.filter((x) => x.role === "hunter")) {
            for (const r of players) {
              if (r.role !== "runner" || r.tagged || dist(h.pos, r.pos) > TAG_DISTANCE_M) continue;
              if (r.id === YOU_ID) tagPrompt = tagPrompt || t >= p.tagQuietUntil;
              else r.tagged = true;
            }
          }
        }

        // Pings.
        let pings = p.pings;
        let lastPingAt = p.lastPingAt;
        const every = p.settings.pingMin * 60;
        const due = phase === "hunt" && Math.floor(hunt / every) > Math.floor(Math.max(0, p.t - head) / every);
        if (due) {
          pings = snapshot(players, t);
          lastPingAt = t;
          const youRole = players.find((x) => x.id === YOU_ID)?.role;
          if (youRole === "runner") raise("Ping!", "Your location was just sent to the hunters. Move!");
          else raise("Ping!", `${pings.length} runner${pings.length === 1 ? "" : "s"} just lit up.`);
        }

        // Shrink warning.
        const shrinkAt = nextShrinkAt(p.settings, hunt);
        const prevHunt = Math.max(0, p.t - head);
        if (shrinkAt !== null && hunt >= shrinkAt - SHRINK_WARNING_S && prevHunt < shrinkAt - SHRINK_WARNING_S) {
          raise("Zone shrinks in 1 min", `Down to ${Math.round(zoneRadiusAt(p.settings, shrinkAt) * 2)} m. Make sure you're inside the new edge.`);
        }

        // Outside the zone for too long: visible live.
        const outsideSince = { ...p.outsideSince };
        for (const x of players) {
          if (Math.hypot(x.pos.x, x.pos.y) > zoneR) outsideSince[x.id] ??= t;
          else delete outsideSince[x.id];
        }

        // Radio from teammates.
        const youRole = players.find((x) => x.id === YOU_ID)?.role ?? "runner";
        const mates = players.filter((x) => x.role === youRole && x.id !== YOU_ID).map((x) => x.name);
        const radio = scriptedRadio(youRole, mates, p.t, t).map((m, i) => ({ ...m, id: `r${m.at}-${i}` }));

        // Win conditions.
        const runnersLeft = players.filter((x) => x.role === "runner" && !x.tagged).length;
        let winner = p.winner;
        if (phase === "hunt" && runnersLeft === 0) winner = "hunter";
        else if (hunt >= round) winner = "runner";
        if (winner) {
          phase = "over";
          raise("Time!", "Round over. Open SCRAM to see how it went.");
        }

        return { ...p, t, phase, players, pings, lastPingAt, outsideSince, chat: radio.length ? [...p.chat, ...radio] : p.chat, winner, alert, tagPrompt };
      });
    }, 250);
    return () => clearInterval(id);
  }, [s.phase]);

  const derived = useMemo(() => {
    const zoneR = zoneRadiusAt(s.settings, huntS);
    const every = s.settings.pingMin * 60;
    return {
      you,
      headStartS,
      roundS,
      huntS,
      zoneR,
      headStartLeft: Math.max(0, headStartS - s.t),
      roundLeft: Math.max(0, roundS - huntS),
      nextPingIn: every - (huntS % every),
      shrinkIn: (() => {
        const at = nextShrinkAt(s.settings, huntS);
        return at === null ? null : at - huntS;
      })(),
      runners: s.players.filter((p) => p.role === "runner"),
      hunters: s.players.filter((p) => p.role === "hunter"),
      liveOutside: Object.entries(s.outsideSince)
        .filter(([, since]) => s.t - since > OUTSIDE_GRACE_S)
        .map(([id]) => id),
    };
  }, [s, you, headStartS, roundS, huntS]);

  return {
    settings: s.settings,
    code: s.code,
    isHost: s.isHost,
    phase: s.phase,
    players: s.players,
    t: s.t,
    pings: s.pings,
    chat: s.chat,
    winner: s.winner,
    alert: s.alert,
    tagPrompt: s.tagPrompt,
    ...derived,
    zoneCenter: null,
    setZoneCenter: noop,
    locationStatus: null,
    wantLocation: noop,
    rematch: hostGame,
    updateSettings,
    hostGame,
    joinGame,
    chooseRole,
    setReady,
    start,
    sendChat,
    dismissAlert,
    confirmTagged,
    denyTagged,
    reportTag,
    leave,
  };
}
