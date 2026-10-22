// SCRAM game rules on Convex. Every function takes the player's id and secret;
// `state` only returns what that player is allowed to see:
//   * your own position and your team's, never the other team's live position;
//   * hunters get runners' positions only as ping snapshots, plus runners who
//     have stayed outside the zone longer than the grace period;
//   * tagged players and finished rounds see everyone.
// Pings and the end of the round run on Convex's scheduler.
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { choice } from "./schema";

const OUTSIDE_GRACE_MS = 30_000;
const MAX_PLAYERS = 30;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const fail = (code: string): never => {
  throw new ConvexError(code);
};

async function me(ctx: QueryCtx, playerId: Id<"players">, secret: string) {
  const p = await ctx.db.get(playerId);
  if (!p || p.secret !== secret || p.left) return null;
  return p;
}

async function mustBeMe(ctx: QueryCtx, playerId: Id<"players">, secret: string) {
  return (await me(ctx, playerId, secret)) ?? fail("not_in_game");
}

async function activePlayers(ctx: QueryCtx, gameId: Id<"games">) {
  const all = await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  return all.filter((p) => !p.left);
}

function distM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/** Zone radius in metres at a moment: shrinks 15% at each quarter of the hunt. */
function zoneR(g: Doc<"games">, at: number) {
  if (!g.shrink || !g.startedAt) return g.zoneM / 2;
  const huntS = Math.max(0, (at - g.startedAt) / 1000 - g.headStartMin * 60);
  const shrinks = Math.min(3, Math.floor(huntS / ((g.roundMin * 60) / 4)));
  return (g.zoneM / 2) * 0.85 ** shrinks;
}

async function endIfNoRunners(ctx: MutationCtx, g: Doc<"games">) {
  if (g.status !== "live") return;
  const runnersLeft = (await activePlayers(ctx, g._id)).filter((p) => p.role === "runner" && !p.tagged).length;
  if (runnersLeft === 0) await ctx.db.patch(g._id, { status: "over", winner: "hunter", endedAt: Date.now() });
}

async function newPlayer(ctx: MutationCtx, gameId: Id<"games">, name: string) {
  const clean = name.trim().slice(0, 24);
  if (!clean) fail("need_name");
  const secret = crypto.randomUUID();
  const playerId = await ctx.db.insert("players", {
    gameId,
    secret,
    name: clean,
    choice: "random",
    ready: false,
    tagged: false,
    liveOutside: false,
    left: false,
  });
  return { playerId, secret };
}

// ——— Lobby ———

export const createGame = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    let code = "";
    do {
      code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
    } while (await ctx.db.query("games").withIndex("by_code", (q) => q.eq("code", code)).first());
    const gameId = await ctx.db.insert("games", {
      code,
      status: "lobby",
      round: 0,
      zoneM: 840,
      roundMin: 45,
      pingMin: 5,
      headStartMin: 3,
      shrink: false,
      lastPing: 0,
    });
    const p = await newPlayer(ctx, gameId, name);
    await ctx.db.patch(gameId, { hostPlayer: p.playerId });
    return { gameId, code, ...p };
  },
});

export const joinGame = mutation({
  args: { code: v.string(), name: v.string() },
  handler: async (ctx, { code, name }) => {
    const g = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
      .first();
    if (!g || g.status !== "lobby") return fail("game_not_found");
    if ((await activePlayers(ctx, g._id)).length >= MAX_PLAYERS) fail("game_full");
    const p = await newPlayer(ctx, g._id, name);
    return { gameId: g._id, code: g.code, ...p };
  },
});

const auth = { playerId: v.id("players"), secret: v.string() };

export const updateSettings = mutation({
  args: {
    ...auth,
    zoneLat: v.number(),
    zoneLng: v.number(),
    zoneM: v.number(),
    roundMin: v.number(),
    pingMin: v.number(),
    headStartMin: v.number(),
    shrink: v.boolean(),
  },
  handler: async (ctx, { playerId, secret, ...s }) => {
    const p = await mustBeMe(ctx, playerId, secret);
    const g = (await ctx.db.get(p.gameId))!;
    if (g.hostPlayer !== p._id || g.status !== "lobby") fail("not_host");
    const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(x)));
    await ctx.db.patch(g._id, {
      zoneLat: s.zoneLat,
      zoneLng: s.zoneLng,
      zoneM: clamp(s.zoneM, 400, 3000),
      roundMin: clamp(s.roundMin, 10, 180),
      pingMin: clamp(s.pingMin, 1, 30),
      headStartMin: clamp(s.headStartMin, 0, 15),
      shrink: s.shrink,
    });
  },
});

export const setChoice = mutation({
  args: { ...auth, choice },
  handler: async (ctx, { playerId, secret, choice }) => {
    const p = await mustBeMe(ctx, playerId, secret);
    await ctx.db.patch(p._id, { choice, ready: false });
  },
});

export const setReady = mutation({
  args: { ...auth, ready: v.boolean() },
  handler: async (ctx, { playerId, secret, ready }) => {
    const p = await mustBeMe(ctx, playerId, secret);
    await ctx.db.patch(p._id, { ready });
  },
});

/** Host starts the round. Random fills whichever team is short. */
export const start = mutation({
  args: auth,
  handler: async (ctx, { playerId, secret }) => {
    const host = await mustBeMe(ctx, playerId, secret);
    const g = (await ctx.db.get(host.gameId))!;
    if (g.hostPlayer !== host._id || g.status !== "lobby") fail("not_host");
    if (g.zoneLat === undefined) fail("no_zone");

    const players = await activePlayers(ctx, g._id);
    const n = players.length;
    const maxH = Math.max(1, Math.floor(n / 2));
    let hunters = players.filter((p) => p.choice === "hunter").length;
    const runners = players.filter((p) => p.choice === "runner").length;
    if (n < 3) fail("need_3_players");
    if (hunters > maxH) fail("too_many_hunters");
    if (n - runners < 1) fail("need_a_hunter");
    if (players.some((p) => !p.ready)) fail("not_all_ready");

    const target = Math.min(maxH, Math.max(1, Math.round(n / 3)));
    const roles = new Map<Id<"players">, "hunter" | "runner">();
    for (const p of [...players].sort(() => Math.random() - 0.5)) {
      if (p.choice !== "random") roles.set(p._id, p.choice);
      else if (hunters < target) {
        roles.set(p._id, "hunter");
        hunters++;
      } else roles.set(p._id, "runner");
    }
    if (![...roles.values()].includes("runner")) fail("need_a_runner");
    for (const p of players) {
      await ctx.db.patch(p._id, { role: roles.get(p._id), tagged: false, outsideSince: undefined, liveOutside: false });
    }

    const startedAt = Date.now();
    const round = g.round + 1;
    await ctx.db.patch(g._id, { status: "live", round, startedAt, endedAt: undefined, winner: undefined, lastPing: 0 });

    const huntStart = startedAt + g.headStartMin * 60_000;
    const pings = Math.floor(g.roundMin / g.pingMin);
    for (let i = 1; i <= pings; i++) {
      await ctx.scheduler.runAt(huntStart + i * g.pingMin * 60_000, internal.game.takePing, { gameId: g._id, round, n: i });
    }
    await ctx.scheduler.runAt(huntStart + g.roundMin * 60_000, internal.game.endRound, { gameId: g._id, round });
  },
});

export const rematch = mutation({
  args: auth,
  handler: async (ctx, { playerId, secret }) => {
    const p = await mustBeMe(ctx, playerId, secret);
    const g = (await ctx.db.get(p.gameId))!;
    if (g.hostPlayer !== p._id || g.status !== "over") fail("not_host");
    await ctx.db.patch(g._id, { status: "lobby", startedAt: undefined, endedAt: undefined, winner: undefined, lastPing: 0 });
    for (const x of await activePlayers(ctx, g._id)) {
      await ctx.db.patch(x._id, { ready: false, role: undefined, tagged: false, outsideSince: undefined, liveOutside: false });
    }
  },
});

export const leave = mutation({
  args: auth,
  handler: async (ctx, { playerId, secret }) => {
    const p = await me(ctx, playerId, secret);
    if (!p) return;
    await ctx.db.patch(p._id, { left: true, ready: false });
    const g = (await ctx.db.get(p.gameId))!;
    if (g.hostPlayer === p._id) {
      const next = (await activePlayers(ctx, g._id))[0];
      await ctx.db.patch(g._id, { hostPlayer: next?._id });
    }
    await endIfNoRunners(ctx, g);
  },
});

// ——— During the round ———

/** Each phone reports its own position. */
export const updateLocation = mutation({
  args: { ...auth, lat: v.number(), lng: v.number() },
  handler: async (ctx, { playerId, secret, lat, lng }) => {
    const p = await mustBeMe(ctx, playerId, secret);
    const g = (await ctx.db.get(p.gameId))!;
    if (g.status === "over" || p.tagged) return;
    const now = Date.now();
    const outside = g.status === "live" && g.zoneLat !== undefined && distM(g.zoneLat, g.zoneLng!, lat, lng) > zoneR(g, now);
    if (outside && p.outsideSince === undefined) {
      await ctx.db.patch(p._id, { lat, lng, outsideSince: now });
      await ctx.scheduler.runAfter(OUTSIDE_GRACE_MS, internal.game.checkOutside, { playerId: p._id, since: now });
    } else if (!outside) {
      await ctx.db.patch(p._id, { lat, lng, outsideSince: undefined, liveOutside: false });
    } else {
      await ctx.db.patch(p._id, { lat, lng });
    }
  },
});

/** The runner confirms a hunter tagged them in person. */
export const confirmTag = mutation({
  args: auth,
  handler: async (ctx, { playerId, secret }) => {
    const p = await mustBeMe(ctx, playerId, secret);
    if (p.role !== "runner") return;
    await ctx.db.patch(p._id, { tagged: true, outsideSince: undefined, liveOutside: false });
    await endIfNoRunners(ctx, (await ctx.db.get(p.gameId))!);
  },
});

export const sendMessage = mutation({
  args: { ...auth, body: v.string() },
  handler: async (ctx, { playerId, secret, body }) => {
    const p = await mustBeMe(ctx, playerId, secret);
    const g = (await ctx.db.get(p.gameId))!;
    const text = body.trim().slice(0, 280);
    if (!text) return;
    const team = g.status === "lobby" || !p.role ? "lobby" : p.role;
    await ctx.db.insert("messages", { gameId: g._id, playerId: p._id, team, body: text });
  },
});

// ——— Scheduled ———

export const takePing = internalMutation({
  args: { gameId: v.id("games"), round: v.number(), n: v.number() },
  handler: async (ctx, { gameId, round, n }) => {
    const g = await ctx.db.get(gameId);
    if (!g || g.status !== "live" || g.round !== round) return;
    const at = Date.now();
    for (const p of await activePlayers(ctx, gameId)) {
      if (p.role === "runner" && !p.tagged && p.lat !== undefined && p.lng !== undefined) {
        await ctx.db.insert("pings", { gameId, round, n, playerId: p._id, lat: p.lat, lng: p.lng, at });
      }
    }
    await ctx.db.patch(gameId, { lastPing: n });
  },
});

export const endRound = internalMutation({
  args: { gameId: v.id("games"), round: v.number() },
  handler: async (ctx, { gameId, round }) => {
    const g = await ctx.db.get(gameId);
    if (!g || g.status !== "live" || g.round !== round) return;
    await ctx.db.patch(gameId, { status: "over", winner: "runner", endedAt: Date.now() });
  },
});

export const checkOutside = internalMutation({
  args: { playerId: v.id("players"), since: v.number() },
  handler: async (ctx, { playerId, since }) => {
    const p = await ctx.db.get(playerId);
    if (p && p.outsideSince === since && !p.tagged) await ctx.db.patch(playerId, { liveOutside: true });
  },
});

// ——— What this player may see ———

export const state = query({
  args: auth,
  handler: async (ctx, { playerId, secret }) => {
    const viewer = await me(ctx, playerId, secret);
    if (!viewer) return null;
    const g = (await ctx.db.get(viewer.gameId))!;
    const seeAll = g.status === "over" || viewer.tagged;
    const players = await activePlayers(ctx, g._id);

    const visible = (p: Doc<"players">) =>
      p._id === viewer._id || seeAll || (p.role !== undefined && p.role === viewer.role) || (viewer.role === "hunter" && p.liveOutside);

    const pings =
      (viewer.role === "hunter" || seeAll) && g.lastPing > 0
        ? await ctx.db
            .query("pings")
            .withIndex("by_game_round_n", (q) => q.eq("gameId", g._id).eq("round", g.round).eq("n", g.lastPing))
            .collect()
        : [];

    const team = g.status === "lobby" || !viewer.role ? "lobby" : viewer.role;
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_game_team", (q) => q.eq("gameId", g._id).eq("team", team))
      .order("desc")
      .take(100);
    const names = new Map(players.map((p) => [p._id, p.name]));

    return {
      me: viewer._id,
      game: {
        code: g.code,
        status: g.status,
        hostPlayer: g.hostPlayer ?? null,
        round: g.round,
        zoneLat: g.zoneLat ?? null,
        zoneLng: g.zoneLng ?? null,
        zoneM: g.zoneM,
        roundMin: g.roundMin,
        pingMin: g.pingMin,
        headStartMin: g.headStartMin,
        shrink: g.shrink,
        startedAt: g.startedAt ?? null,
        winner: g.winner ?? null,
        lastPing: g.lastPing,
      },
      players: players.map((p) => ({
        id: p._id,
        name: p.name,
        choice: p.choice,
        role: p.role ?? null,
        ready: p.ready,
        tagged: p.tagged,
        lat: visible(p) ? (p.lat ?? null) : null,
        lng: visible(p) ? (p.lng ?? null) : null,
        liveOutside: viewer.role === "hunter" && p.role === "runner" && p.liveOutside,
      })),
      pings: pings.map((k) => ({ playerId: k.playerId, lat: k.lat, lng: k.lng, at: k.at })),
      messages: messages
        .reverse()
        // Team chat starts fresh each round.
        .filter((m) => team === "lobby" || m._creationTime >= (g.startedAt ?? 0))
        .map((m) => ({ id: m._id, from: names.get(m.playerId) ?? "?", playerId: m.playerId, body: m.body, at: m._creationTime })),
    };
  },
});
