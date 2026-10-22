import { Pressable, Share, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "../components/screen";
import { Avatar, Button, Card, Eyebrow, T } from "../components/ui";
import { hunterRange, teamCheck } from "../game/sim";
import { useGame } from "../game/store";
import type { RoleChoice } from "../game/types";
import { colors } from "../theme";

const ROLES: { key: RoleChoice; title: string; tag: string; body: string }[] = [
  { key: "hunter", title: "Hunter", tag: "You’re it.", body: "Get a ping every few minutes. Close in on foot and tag in person." },
  { key: "runner", title: "Runner", tag: "Run.", body: "Take the head start, hide inside the zone and keep moving between pings." },
  { key: "random", title: "Random", tag: "Let the app decide.", body: "Fills whichever team is short." },
];

const choiceLabel: Record<RoleChoice, string> = { hunter: "Hunter", runner: "Runner", random: "Random" };

export default function Lobby() {
  const g = useGame();
  const { code, settings, players, you, isHost } = g;
  if (!code || !you) {
    return (
      <Screen back>
        <T v="wide" size={28}>
          No game yet.
        </T>
        <Button label="Back to start" onPress={() => router.replace("/")} />
      </Screen>
    );
  }

  const check = teamCheck(players);
  const range = hunterRange(players.length);
  const allReady = players.every((p) => p.ready);
  const canStart = isHost && check.ok && allReady;

  const start = () => {
    g.start();
    router.replace("/role");
  };

  return (
    <Screen
      back
      footer={
        <>
          {!check.ok ? (
            <T size={13} color={colors.redText} style={{ textAlign: "center" }}>
              {check.reason}
            </T>
          ) : !allReady ? (
            <T size={13} color={colors.ink3} style={{ textAlign: "center" }}>
              Waiting for everyone to tap “I’m ready”.
            </T>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button style={{ flex: 1 }} kind={you.ready ? "ghost" : "ink"} label={you.ready ? "Not ready" : "I’m ready"} onPress={() => g.setReady(!you.ready)} />
            {isHost ? <Button style={{ flex: 1 }} kind="red" label="Let’s go" disabled={!canStart} onPress={start} /> : null}
          </View>
          {!isHost && check.ok && allReady ? (
            <Button kind="red" label="Host started · Continue" onPress={start} />
          ) : null}
        </>
      }
    >
      <Card dark style={{ gap: 14 }}>
        <Eyebrow color={colors.onDark2}>Game code</Eyebrow>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <T v="wide" size={40} color={colors.white} style={{ letterSpacing: 4 }}>
            {code}
          </T>
          <Pressable
            onPress={() => Share.share({ message: `Join my SCRAM game with code ${code}` }).catch(() => {})}
            style={{ backgroundColor: colors.red, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 }}
            accessibilityRole="button"
          >
            <T v="wide" size={14} color={colors.white}>
              Share
            </T>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[
            `${settings.zoneMeters} m zone`,
            `${settings.roundMin} min round`,
            `Ping every ${settings.pingMin} min`,
            settings.headStartMin ? `${settings.headStartMin} min head start` : "No head start",
            ...(settings.shrink ? ["Shrinking zone"] : []),
          ].map((c) => (
            <View key={c} style={{ backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
              <T v="bold" size={12} color={colors.onDark2}>
                {c}
              </T>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ gap: 6 }}>
        <Eyebrow>Pick a side</Eyebrow>
        <T size={14} color={colors.ink3}>
          With {players.length} players: {range.min} to {range.max} hunter{range.max > 1 ? "s" : ""}.
        </T>
      </View>
      <View style={{ gap: 10 }}>
        {ROLES.map((r) => {
          const on = you.choice === r.key;
          return (
            <Pressable
              key={r.key}
              onPress={() => g.chooseRole(r.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{ backgroundColor: on ? colors.red : colors.white, borderRadius: 22, padding: 18, gap: 6 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T v="bold" size={13} color={on ? colors.white : colors.ink3} style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
                  {r.title}
                </T>
                {on ? (
                  <T v="wide" size={12} color={colors.white}>
                    That’s you
                  </T>
                ) : null}
              </View>
              <T v="wide" size={26} color={on ? colors.white : colors.ink}>
                {r.tag}
              </T>
              <T size={14} color={on ? colors.white : colors.ink3}>
                {r.body}
              </T>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>Players · {players.length}</Eyebrow>
        <Card style={{ paddingVertical: 6 }}>
          {players.map((p, i) => (
            <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.fill }}>
              <Avatar name={p.name} bg={p.isYou ? colors.red : colors.ink} />
              <View style={{ flex: 1 }}>
                <T v="bold" size={16}>
                  {p.isYou ? "You" : p.name}
                  {p.isYou && isHost ? " · host" : ""}
                </T>
                <T size={13} color={colors.ink4}>
                  {choiceLabel[p.choice]}
                </T>
              </View>
              <T v="wide" size={12} color={p.ready ? colors.redText : colors.ink4}>
                {p.ready ? "Ready" : "…"}
              </T>
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}
