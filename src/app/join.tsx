import { useRef, useState } from "react";
import { Pressable, TextInput, View, type TextInputInstance } from "react-native";
import { router } from "expo-router";
import { Screen } from "../components/screen";
import { Button, Eyebrow, T } from "../components/ui";
import { useGame } from "../game/store";
import { colors } from "../theme";

export default function Join() {
  const { joinGame } = useGame();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    setError(null);
    const err = await joinGame(code);
    setBusy(false);
    if (err) setError(err);
    else router.replace("/lobby");
  };
  const input = useRef<TextInputInstance>(null);

  return (
    <Screen
      back
      footer={
        <>
          {error ? (
            <T size={13} color={colors.redText} style={{ textAlign: "center" }}>
              {error}
            </T>
          ) : null}
          <Button kind="red" label={busy ? "Joining…" : "Join game"} disabled={code.length < 6 || busy} onPress={join} />
        </>
      }
    >
      <Eyebrow>Join</Eyebrow>
      <T v="wide" size={40}>
        Six characters.{"\n"}Pick a side.
      </T>
      <T size={16} color={colors.ink2}>
        Enter the code from the host’s phone.
      </T>

      <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: "row", gap: 8 }} accessibilityLabel="Game code">
        {Array.from({ length: 6 }, (_, i) => {
          const active = i === code.length;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                aspectRatio: 0.8,
                borderRadius: 14,
                backgroundColor: colors.white,
                borderWidth: 2,
                borderColor: active ? colors.red : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T v="wide" size={28}>
                {code[i] ?? ""}
              </T>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={(t) => {
          setError(null);
          setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
        }}
        onSubmitEditing={() => code.length === 6 && join()}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        style={{ position: "absolute", opacity: 0, height: 1, width: 1 }}
      />
    </Screen>
  );
}
