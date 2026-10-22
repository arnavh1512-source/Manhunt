import { View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Screen } from "../components/screen";
import { Avatar, Button, Card, Eyebrow, T } from "../components/ui";
import { useGame } from "../game/store";
import { colors } from "../theme";

export default function Result() {
  const g = useGame();
  const role = g.you?.role;
  const won = g.winner !== null && role === g.winner;
  const survived = role === "runner" && !g.you?.tagged;

  const headline = won ? (survived ? "You survived!" : "You won!") : g.winner === "hunter" ? "All tagged." : "They got away.";
  const sub = won ? "Absolute legend." : g.winner === "hunter" ? "The hunters swept the zone." : "Time ran out with runners still free.";

  return (
    <Screen
      bg={won ? colors.red : colors.ink}
      footer={
        <>
          <Button
            kind="white"
            label="Play again"
            onPress={() => {
              g.isHost ? g.hostGame() : g.joinGame(g.code ?? "");
              router.replace("/lobby");
            }}
          />
          <Button
            kind="outline"
            label="Done"
            onPress={() => {
              g.leave();
              router.replace("/");
            }}
          />
        </>
      }
    >
      <StatusBar style="light" />
      <Eyebrow color={colors.white}>Round over</Eyebrow>
      <T v="wide" size={56} color={colors.white}>
        {headline}
      </T>
      <T size={20} color={colors.white} style={{ opacity: 0.9 }}>
        {sub}
      </T>

      <Card style={{ gap: 4, paddingVertical: 8 }}>
        {[...g.players]
          .sort((a, b) => (a.role === b.role ? 0 : a.role === "hunter" ? -1 : 1))
          .map((p, i) => (
            <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.fill }}>
              <Avatar name={p.isYou ? "You" : p.name} bg={p.isYou ? colors.red : colors.ink} />
              <View style={{ flex: 1 }}>
                <T v="bold" size={16}>
                  {p.isYou ? "You" : p.name}
                </T>
                <T size={13} color={colors.ink4}>
                  {p.role === "hunter" ? "Hunter" : "Runner"}
                </T>
              </View>
              <T v="wide" size={12} color={p.role === "runner" && !p.tagged ? colors.redText : colors.ink4}>
                {p.role === "hunter" ? "Hunted" : p.tagged ? "Tagged" : "Free"}
              </T>
            </View>
          ))}
      </Card>
    </Screen>
  );
}
