import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const role = v.union(v.literal("hunter"), v.literal("runner"));
export const choice = v.union(v.literal("hunter"), v.literal("runner"), v.literal("random"));

export default defineSchema({
  games: defineTable({
    code: v.string(),
    hostPlayer: v.optional(v.id("players")),
    status: v.union(v.literal("lobby"), v.literal("live"), v.literal("over")),
    round: v.number(),
    zoneLat: v.optional(v.number()),
    zoneLng: v.optional(v.number()),
    zoneM: v.number(),
    roundMin: v.number(),
    pingMin: v.number(),
    headStartMin: v.number(),
    shrink: v.boolean(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    winner: v.optional(role),
    lastPing: v.number(),
  }).index("by_code", ["code"]),

  players: defineTable({
    gameId: v.id("games"),
    secret: v.string(),
    name: v.string(),
    choice,
    role: v.optional(role),
    ready: v.boolean(),
    tagged: v.boolean(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    outsideSince: v.optional(v.number()),
    /** Set once a runner has stayed outside the zone past the grace period. */
    liveOutside: v.boolean(),
    left: v.boolean(),
  }).index("by_game", ["gameId"]),

  pings: defineTable({
    gameId: v.id("games"),
    round: v.number(),
    n: v.number(),
    playerId: v.id("players"),
    lat: v.number(),
    lng: v.number(),
    at: v.number(),
  }).index("by_game_round_n", ["gameId", "round", "n"]),

  messages: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    team: v.union(v.literal("hunter"), v.literal("runner"), v.literal("lobby")),
    body: v.string(),
  }).index("by_game_team", ["gameId", "team"]),
});
