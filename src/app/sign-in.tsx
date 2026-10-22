import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "../components/screen";
import { Button, Eyebrow, T } from "../components/ui";
import { useGame } from "../game/store";
import { colors, fonts } from "../theme";

export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signIn } = useGame();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [updates, setUpdates] = useState(false);
  const valid = /\S+@\S+\.\S+/.test(email);

  const finish = () => {
    signIn(email);
    router.replace((next as "/host" | "/join") ?? "/");
  };

  return (
    <Screen
      back
      footer={
        sent ? (
          <Button label="Sign in" kind="red" disabled={code.length < 6} onPress={finish} />
        ) : (
          <Button label="Email me a code" kind="red" disabled={!valid} onPress={() => setSent(true)} />
        )
      }
    >
      <Eyebrow>Sign in</Eyebrow>
      <T v="wide" size={40}>
        {sent ? "Check your\ninbox." : "What’s your\nemail?"}
      </T>
      <T size={16} color={colors.ink2}>
        {sent ? `We sent a 6-digit code to ${email}.` : "We’ll email you a code. No passwords. Other players never see your email."}
      </T>

      {sent ? (
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          placeholderTextColor={colors.line}
          keyboardType="number-pad"
          autoFocus
          style={{ fontFamily: fonts.wide, fontSize: 40, letterSpacing: 8, color: colors.ink, backgroundColor: colors.white, borderRadius: 18, padding: 18 }}
        />
      ) : (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.ink4}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoFocus
            style={{ fontFamily: fonts.body, fontSize: 18, color: colors.ink, backgroundColor: colors.white, borderRadius: 18, padding: 18 }}
          />
          <Pressable onPress={() => setUpdates(!updates)} style={{ flexDirection: "row", gap: 12, alignItems: "center" }} accessibilityRole="checkbox" accessibilityState={{ checked: updates }}>
            <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: updates ? colors.red : colors.line, backgroundColor: updates ? colors.red : "transparent", alignItems: "center", justifyContent: "center" }}>
              {updates ? (
                <T v="wide" size={13} color={colors.white}>
                  ✓
                </T>
              ) : null}
            </View>
            <T size={14} color={colors.ink3} style={{ flex: 1 }}>
              Send me the odd bit of SCRAM news. Unsubscribe any time.
            </T>
          </Pressable>
        </>
      )}
      {sent ? (
        <Pressable onPress={() => setSent(false)}>
          <T v="bold" size={14} color={colors.redText}>
            Use a different email
          </T>
        </Pressable>
      ) : null}
    </Screen>
  );
}
