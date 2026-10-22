import { useState } from "react";
import { TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "../components/screen";
import { Button, Eyebrow, T } from "../components/ui";
import { useAppMode } from "../game/store";
import { colors, fonts } from "../theme";

export default function NameScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { name, setName } = useAppMode();
  const [value, setValue] = useState(name ?? "");
  const clean = value.trim();

  const finish = () => {
    if (!clean) return;
    setName(clean);
    router.replace((next as "/host" | "/join" | "/") ?? "/");
  };

  return (
    <Screen back footer={<Button label="Continue" kind="red" disabled={!clean} onPress={finish} />}>
      <Eyebrow>Your name</Eyebrow>
      <T v="wide" size={40}>
        What should{"\n"}we call you?
      </T>
      <T size={16} color={colors.ink2}>
        Your friends see this in the lobby, on the map and in Team Radio.
      </T>
      <TextInput
        value={value}
        onChangeText={(t) => setValue(t.slice(0, 24))}
        onSubmitEditing={finish}
        placeholder="Name"
        placeholderTextColor={colors.ink4}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="done"
        autoFocus
        style={{ fontFamily: fonts.body, fontSize: 20, color: colors.ink, backgroundColor: colors.white, borderRadius: 18, padding: 18 }}
      />
    </Screen>
  );
}
