// Online mode: game state streams live from Convex (convex/game.ts); this phone
// reports its own GPS while a round runs.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Alert, Game } from "../game/engine";
import { SHRINK_WARNING_S, nextShrinkAt, zoneRadiusAt } from "../game/sim";
import { DEFAULT_SETTINGS, type ChatMessage, type Phase, type Ping, type Player, type RoleChoice, type Settings } from "../game/types";
import { errorText, type Session } from "./convex";
import { toLocal, type LatLng } from "./geo";
import { useDeviceLocation } from "./location";

const SESSION_KEY = "scram.session";
const LOCATION_MS = 3000;
const NOWHERE = { x: NaN, y: NaN };

let alertSeq = 0;

export function useOnlineEngine(name: string | null): Game {
  const [session, setSession] = useState<Session | null>(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [tagPrompt, setTagPrompt] = useState(false);
  const [localSettings, setLocalSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [wantsLocation, setWantsLocation] = useState(false);
  const [now, setNow] = useState(Date.now());
  const prev = useRef<{ status?: string; lastPing?: number; huntStarted?: boolean; shrinkWarned?: number }>({});

  const auth = session ? { playerId: session.playerId as Id<"players">, secret: session.secret } : null;
  const server = useQuery(api.game.state, auth ?? "skip");

  const m = {
    createGame: useMutation(api.game.createGame),
    joinGame: useMutation(api.game.joinGame),
    updateSettings: useMutation(api.game.updateSettings),
    setChoice: useMutation(api.game.setChoice),
    setReady: useMutation(api.game.setReady),
    start: useMutation(api.game.start),
    rematch: useMutation(api.game.rematch),
    leave: useMutation(api.game.leave),
    updateLocation: useMutation(api.game.updateLocation),
    confirmTag: useMutation(api.game.confirmTag),
    sendMessage: useMutation(api.game.sendMessage),
  };

  const status = server?.game.status;
  const { pos: gps, status: locationStatus } = useDeviceLocation(wantsLocation || status === "live");

  const raise = (title: string, body: string) => setAlert({ id: ++alertSeq, title, body });

  const saveSession = useCallback((s: Session | null) => {
    setSession(s);
    prev.current = {};
    (s ? AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s)) : AsyncStorage.removeItem(SESSION_KEY)).catch(() => {});
  }, []);

  // Restore a game in progress after the app reloads.
  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then((raw) => raw && setSession(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  // The server no longer knows this player (left, or the game is gone).
  useEffect(() => {
    if (session && server === null) saveSession(null);
  }, [session, server, saveSession]);

  // Clock for countdowns while a round runs.
  useEffect(() => {
    if (status !== "live") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [status]);

  // Report this phone's position during the round.
  const lastSent = useRef(0);
  useEffect(() => {
    if (!auth || status !== "live" || !gps) return;
    if (Date.now() - lastSent.current < LOCATION_MS) return;
    lastSent.current = Date.now();
    m.updateLocation({ ...auth, lat: gps.lat, lng: gps.lng }).catch(() => {});
  }, [session, status, gps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Before a game exists, the host's own position is the default zone centre.
  useEffect(() => {
    if (!center && gps && !session) setCenter(gps);
  }, [center, gps, session]);

  const g = server?.game;
  const settings: Settings = g
    ? { zoneMeters: g.zoneM, roundMin: g.roundMin, pingMin: g.pingMin, headStartMin: g.headStartMin, shrink: g.shrink }
    : localSettings;
  const zoneCenter = g?.zoneLat != null && g.zoneLng != null ? { lat: g.zoneLat, lng: g.zoneLng } : center;
  const startedMs = g?.startedAt ?? null;
  const t = startedMs ? Math.max(0, (now - startedMs) / 1000) : 0;
  const headStartS = settings.headStartMin * 60;
  const roundS = settings.roundMin * 60;
  const huntS = Math.max(0, t - headStartS);
  const phase: Phase = !g ? "lobby" : g.status === "over" ? "over" : g.status === "live" ? (t < headStartS ? "scatter" : "hunt") : "lobby";

  // Alerts, as they'd arrive on the lock screen.
  useEffect(() => {
    if (!server) return;
    const p = prev.current;
    const meRole = server.players.find((x) => x.id === server.me)?.role;
    if (server.game.status === "live") {
      const hunting = t >= headStartS;
      if (hunting && p.huntStarted === false) raise("Ready or not", "Here we come. The hunt is on.");
      p.huntStarted = hunting;
      if (p.lastPing !== undefined && server.game.lastPing > p.lastPing) {
        if (meRole === "runner") raise("Ping!", "Your location was just sent to the hunters. Move!");
        else raise("Ping!", `${server.pings.length} runner${server.pings.length === 1 ? "" : "s"} just lit up.`);
      }
      const shrinkAt = nextShrinkAt(settings, huntS);
      if (shrinkAt !== null && huntS >= shrinkAt - SHRINK_WARNING_S && p.shrinkWarned !== shrinkAt) {
        p.shrinkWarned = shrinkAt;
        raise("Zone shrinks in 1 min", `Down to ${Math.round(zoneRadiusAt(settings, shrinkAt) * 2)} m. Make sure you’re inside the new edge.`);
      }
    } else {
      p.huntStarted = false;
    }
    if (p.status === "live" && server.game.status === "over") raise("Time!", "Round over. Open SCRAM to see how it went.");
    p.status = server.game.status;
    p.lastPing = server.game.lastPing;
  }, [server, t >= headStartS]); // eslint-disable-line react-hooks/exhaustive-deps

  const players: Player[] = useMemo(() => {
    if (!server) return [];
    return server.players.map((p) => {
      const isYou = p.id === server.me;
      const loc = isYou && gps ? gps : p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null;
      return {
        id: p.id,
        name: isYou ? "You" : p.name,
        isYou,
        choice: p.choice,
        role: p.role ?? undefined,
        ready: p.ready,
        tagged: p.tagged,
        pos: loc && zoneCenter ? toLocal(loc, zoneCenter) : NOWHERE,
      };
    });
  }, [server, gps, zoneCenter?.lat, zoneCenter?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const pings: Ping[] = useMemo(
    () =>
      server && zoneCenter && startedMs
        ? server.pings.map((k) => ({ playerId: k.playerId, pos: toLocal(k, zoneCenter), at: (k.at - startedMs) / 1000 }))
        : [],
    [server, zoneCenter?.lat, zoneCenter?.lng, startedMs], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const chat: ChatMessage[] = useMemo(
    () => server?.messages.map((x) => ({ id: x.id, from: x.playerId === server.me ? "You" : x.from, text: x.body, at: x.at })) ?? [],
    [server],
  );

  const you = players.find((p) => p.isYou);
  const every = settings.pingMin * 60;
  const shrinkAt = nextShrinkAt(settings, huntS);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (e) {
      return errorText(e);
    }
  };

  return {
    settings,
    updateSettings: (patch) => setLocalSettings((s) => ({ ...s, ...patch })),
    zoneCenter,
    setZoneCenter: setCenter,
    locationStatus,
    wantLocation: () => setWantsLocation(true),

    code: session?.code ?? null,
    isHost: !!server && server.game.hostPlayer === server.me,
    phase,
    players,
    you,
    t,
    pings,
    chat,
    winner: g?.winner ?? null,
    alert,
    tagPrompt,

    headStartS,
    roundS,
    huntS,
    zoneR: zoneRadiusAt(settings, huntS),
    headStartLeft: Math.max(0, headStartS - t),
    roundLeft: Math.max(0, roundS - huntS),
    nextPingIn: every - (huntS % every),
    shrinkIn: shrinkAt === null ? null : shrinkAt - huntS,
    runners: players.filter((p) => p.role === "runner"),
    hunters: players.filter((p) => p.role === "hunter"),
    liveOutside: server?.players.filter((p) => p.liveOutside).map((p) => p.id) ?? [],

    hostGame: async () => {
      if (!name) return "Add your name first.";
      if (!center) return "Waiting for your location to place the zone.";
      return run(async () => {
        const s = await m.createGame({ name });
        await m.updateSettings({
          playerId: s.playerId,
          secret: s.secret,
          zoneLat: center.lat,
          zoneLng: center.lng,
          zoneM: localSettings.zoneMeters,
          roundMin: localSettings.roundMin,
          pingMin: localSettings.pingMin,
          headStartMin: localSettings.headStartMin,
          shrink: localSettings.shrink,
        });
        saveSession(s);
      });
    },
    joinGame: async (code) => {
      if (!name) return "Add your name first.";
      return run(async () => saveSession(await m.joinGame({ code, name })));
    },
    start: () => run(() => m.start(auth!)),
    rematch: () => run(() => m.rematch(auth!)),
    chooseRole: (choice: RoleChoice) => {
      if (auth) run(() => m.setChoice({ ...auth, choice }));
    },
    setReady: (ready) => {
      if (auth) run(() => m.setReady({ ...auth, ready }));
    },
    sendChat: (body) => {
      if (auth) run(() => m.sendMessage({ ...auth, body }));
    },
    dismissAlert: () => setAlert(null),
    confirmTagged: () => {
      setTagPrompt(false);
      if (auth) run(() => m.confirmTag(auth));
    },
    denyTagged: () => setTagPrompt(false),
    reportTag: () => setTagPrompt(true),
    leave: () => {
      if (auth) m.leave(auth).catch(() => {});
      saveSession(null);
    },
  };
}
