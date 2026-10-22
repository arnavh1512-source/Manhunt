import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Screen } from "../components/screen";
import { Button, Eyebrow, T } from "../components/ui";
import { clock } from "../game/sim";
import { useGame } from "../game/store";
import { colors } from "../theme";

export default function RoleReveal() {
  const g = useGame();
  const role = g.you?.role;

  useEffect(() => {
    if (g.phase === "lobby") router.replace("/");
  }, [g.phase]);

  if (!role) return null;
  const hunter = role === "hunter";
  const mates = (hunter ? g.hunters : g.runners).filter((p) => !p.isYou).map((p) => p.name);

  return (
    <Screen
      bg={colors.red}
      scroll={false}
      contentStyle={{ justifyContent: "space-between" }}
      footer={<Button kind="white" label={hunter ? "Open the map" : "Go hide"} onPress={() => router.replace("/game")} />}
    >
      <StatusBar style="light" />
      <View style={{ gap: 14 }}>
        <Eyebrow color={colors.white}>Your role · {hunter ? "Hunter" : "Runner"}</Eyebrow>
        <T v="wide" size={72} color={colors.white}>
          {hunter ? "You’re\nit." : "Run."}
        </T>
        <T size={18} color={colors.white} style={{ maxWidth: 360 }}>
          {hunter
            ? `Wait out the head start. No peeking. Then you get a ping every ${g.settings.pingMin} min.`
            : `Stay hidden for ${g.settings.roundMin} min. You get a ${g.settings.headStartMin} min head start, then the hunters get a ping every ${g.settings.pingMin} min.`}
        </T>
        {mates.length ? (
          <T v="bold" size={15} color={colors.white} style={{ opacity: 0.85 }}>
            Your team: {mates.join(", ")}
          </T>
        ) : null}
      </View>
      <View style={{ gap: 4 }}>
        <T v="bold" size={14} color={colors.white} style={{ opacity: 0.85 }}>
          {g.phase === "scatter" ? "Head start" : "Hunt is on"}
        </T>
        <T v="narrow" size={120} color={colors.white} style={{ lineHeight: 112, letterSpacing: -3 }}>
          {clock(g.phase === "scatter" ? g.headStartLeft : g.roundLeft)}
        </T>
      </View>
    </Screen>
  );
}
