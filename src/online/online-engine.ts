// Online mode: state comes from the Supabase game functions, polled every couple
// of seconds; this phone reports its own GPS while a round runs.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Alert, Game } from "../game/engine";
import { SHRINK_WARNING_S, nextShrinkAt, zoneRadiusAt } from "../game/sim";
import { DEFAULT_SETTINGS, type ChatMessage, type Phase, type Ping, type Player, type RoleChoice, type Settings } from "../game/types";
import { GameError, api, type ServerState, type Session } from "./api";
import { toLocal, type LatLng } from "./geo";
import { useDeviceLocation } from "./location";

const SESSION_KEY = "scram.session";
const POLL_MS = 2000;
const LOCATION_MS = 3000;
const NOWHERE = { x: NaN, y: NaN };

let alertSeq = 0;

function errorText(e: unknown) {
  return e instanceof GameError ? e.message : "Something went wrong. Try again.";
}

export function useOnlineEngine(name: string | null): Game {
  const [session, setSession] = useState<Session | null>(null);
  const [server, setServer] = useState<ServerState | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [tagPrompt, setTagPrompt] = useState(false);
  const [localSettings, setLocalSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [wantsLocation, setWantsLocation] = useState(false);
  const [now, setNow] = useState(Date.now());

  const lastMsg = useRef(0);
  const round = useRef<number | null>(null);
  const prev = useRef<{ status?: string; lastPing?: number; huntStarted?: boolean; shrinkWarned?: number }>({});
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const status = server?.game.status;
  const { pos: gps, status: locationStatus } = useDeviceLocation(wantsLocation || status === "live");

  const raise = (title: string, body: string) => setAlert({ id: ++alertSeq, title, body });

  // Restore a game in progress after the app reloads.
  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then((raw) => raw && setSession(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const saveSession = useCallback((s: Session | null) => {
    setSession(s);
    lastMsg.current = 0;
    round.current = null;
    prev.current = {};
    setChat([]);
    setServer(null);
    (s ? AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s)) : AsyncStorage.removeItem(SESSION_KEY)).catch(() => {});
  }, []);

  const poll = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      const st = await api.state(s, lastMsg.current);
      if (sessionRef.current !== s) return;
      setOffsetMs(Date.parse(st.now) - Date.now());
      if (round.current !== st.game.round) {
        // New round, new team chat.
        round.current = st.game.round;
        if (lastMsg.current) {
          lastMsg.current = 0;
          setChat([]);
          return poll();
        }
      }
      if (st.messages.length) {
        lastMsg.current = st.messages[st.messages.length - 1].id;
        setChat((c) => [
          ...c,
          ...st.messages.map((m) => ({ id: String(m.id), from: m.player_id === st.me ? "You" : m.from, text: m.body, at: Date.parse(m.at) })),
        ]);
      }
      setServer(st);
    } catch (e) {
      if (e instanceof GameError && e.code === "not_in_game") saveSession(null);
    }
  }, [saveSession]);

  useEffect(() => {
    if (!session) return;
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [session, poll]);

  // Clock for countdowns while a round runs.
  useEffect(() => {
    if (status !== "live") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [status]);

  // Report this phone's position during the round.
  const lastSent = useRef(0);
  useEffect(() => {
    if (!session || status !== "live" || !gps) return;
    if (Date.now() - lastSent.current < LOCATION_MS) return;
    lastSent.current = Date.now();
    api.updateLocation(session, gps.lat, gps.lng).catch(() => {});
  }, [session, status, gps]);

  // Before a game exists, the host's own position is the default zone centre.
  useEffect(() => {
    if (!center && gps && !session) setCenter(gps);
  }, [center, gps, session]);

  const g = server?.game;
  const settings: Settings = g
    ? { zoneMeters: g.zone_m, roundMin: g.round_min, pingMin: g.ping_min, headStartMin: g.head_start_min, shrink: g.shrink }
    : localSettings;
  const zoneCenter = g?.zone_lat != null && g.zone_lng != null ? { lat: g.zone_lat, lng: g.zone_lng } : center;
  const startedMs = g?.started_at ? Date.parse(g.started_at) : null;
  const t = startedMs ? Math.max(0, (now + offsetMs - startedMs) / 1000) : 0;
  const headStartS = settings.headStartMin * 60;
  const roundS = settings.roundMin * 60;
  const huntS = Math.max(0, t - headStartS);

  const phase: Phase = !g ? "lobby" : g.status === "over" ? "over" : g.status === "live" ? (t < headStartS ? "scatter" : "hunt") : "lobby";

  // Alerts, as they'd arrive on the lock screen.
  useEffect(() => {
    if (!server) return;
    const p = prev.current;
    const me = server.players.find((x) => x.id === server.me);
    if (server.game.status === "live") {
      const hunting = t >= headStartS;
      if (hunting && p.huntStarted === false) raise("Ready or not", "Here we come. The hunt is on.");
      p.huntStarted = hunting;
      if (p.lastPing !== undefined && server.last_ping > p.lastPing) {
        if (me?.role === "runner") raise("Ping!", "Your location was just sent to the hunters. Move!");
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
    p.lastPing = server.last_ping;
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
        ? server.pings.map((k) => ({ playerId: k.player_id, pos: toLocal(k, zoneCenter), at: (Date.parse(k.at) - startedMs) / 1000 }))
        : [],
    [server, zoneCenter?.lat, zoneCenter?.lng, startedMs], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const you = players.find((p) => p.isYou);
  const every = settings.pingMin * 60;
  const shrinkAt = nextShrinkAt(settings, huntS);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await poll();
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
    isHost: !!server && server.game.host_player === server.me,
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
    liveOutside: server?.players.filter((p) => p.live_outside).map((p) => p.id) ?? [],

    hostGame: async () => {
      if (!name) return "Add your name first.";
      if (!center) return "Waiting for your location to place the zone.";
      try {
        const s = await api.createGame(name);
        await api.updateSettings(s, {
          zone_lat: center.lat,
          zone_lng: center.lng,
          zone_m: localSettings.zoneMeters,
          round_min: localSettings.roundMin,
          ping_min: localSettings.pingMin,
          head_start_min: localSettings.headStartMin,
          shrink: localSettings.shrink,
        });
        saveSession(s);
        return null;
      } catch (e) {
        return errorText(e);
      }
    },
    joinGame: async (code) => {
      if (!name) return "Add your name first.";
      try {
        saveSession(await api.joinGame(code, name));
        return null;
      } catch (e) {
        return errorText(e);
      }
    },
    start: () => run(() => api.start(session!)),
    rematch: () => run(() => api.rematch(session!)),
    chooseRole: (choice: RoleChoice) => {
      if (session) run(() => api.setChoice(session, choice));
    },
    setReady: (ready) => {
      if (session) run(() => api.setReady(session, ready));
    },
    sendChat: (text) => {
      if (session) run(() => api.sendMessage(session, text));
    },
    dismissAlert: () => setAlert(null),
    confirmTagged: () => {
      setTagPrompt(false);
      if (session) run(() => api.confirmTag(session));
    },
    denyTagged: () => setTagPrompt(false),
    reportTag: () => setTagPrompt(true),
    leave: () => {
      if (session) api.leave(session).catch(() => {});
      saveSession(null);
    },
  };
}
