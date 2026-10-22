import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Logo, T } from "../components/ui";
import { useAppMode, useGame, type Mode } from "../game/store";
import { colors } from "../theme";

export default function Welcome() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { name, setMode } = useAppMode();
  const g = useGame();
  const skid = useRef(new Animated.Value(0)).current;

  // "Skid in": the wordmark slides in from the right and settles.
  useEffect(() => {
    Animated.timing(skid, { toValue: 1, duration: 650, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true }).start();
  }, [skid]);

  // Back in a game after the app reloaded: go straight to it.
  useEffect(() => {
    if (!g.code || !g.you) return;
    router.replace(g.phase === "lobby" ? "/lobby" : g.phase === "over" ? "/result" : "/game");
  }, [g.code, g.you?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (path: "/host" | "/join", mode: Mode = "online") => {
    setMode(mode);
    if (mode === "practice" || name) router.push(path);
    else router.push({ pathname: "/name", params: { next: path } });
  };
  const logoW = Math.min(width - 40, 420);

  return (
    <View style={{ flex: 1, backgroundColor: colors.red }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20, gap: 28 }}>
        <Animated.View
          style={{
            transform: [{ translateX: skid.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }, { skewX: skid.interpolate({ inputRange: [0, 1], outputRange: ["-12deg", "0deg"] }) }],
          }}
        >
          <Logo width={logoW} />
        </Animated.View>
        <View style={{ gap: 12 }}>
          <T v="wide" size={30} color={colors.white}>
            Runners hide.{"\n"}Hunters chase.{"\n"}The phone referees.
          </T>
          <T size={17} color={colors.white} style={{ opacity: 0.9, maxWidth: 360 }}>
            Hide-and-seek for the whole neighbourhood. Bring snacks. Wear sneakers.
          </T>
        </View>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20, gap: 10 }}>
        <Button kind="white" label="Host a game" onPress={() => go("/host")} />
        <Button kind="outline" label="Join with a code" onPress={() => go("/join")} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <T size={13} color={colors.white} style={{ opacity: 0.8 }}>
            At least 3 players.
          </T>
          <Pressable onPress={() => go("/host", "practice")} accessibilityRole="button" hitSlop={10}>
            <T v="bold" size={14} color={colors.white} style={{ textDecorationLine: "underline" }}>
              Practice with bots
            </T>
          </Pressable>
        </View>
        {name ? (
          <Pressable onPress={() => router.push({ pathname: "/name", params: { next: "/" } })} hitSlop={8}>
            <T size={13} color={colors.white} style={{ opacity: 0.8, textAlign: "center" }}>
              Playing as {name} · Change
            </T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
