import type { ReactNode } from "react";
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors } from "../theme";
import { T } from "./ui";

export function Screen({
  children,
  footer,
  bg = colors.ground,
  scroll = true,
  back,
  contentStyle,
}: {
  children: ReactNode;
  footer?: ReactNode;
  bg?: string;
  scroll?: boolean;
  back?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const body = [{ paddingHorizontal: 20, paddingTop: back ? 8 : insets.top + 16, paddingBottom: 24, gap: 20 }, contentStyle];
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {back ? (
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <T v="wide" size={22} color={bg === colors.red ? colors.white : colors.ink}>
              ←
            </T>
          </Pressable>
        </View>
      ) : null}
      {scroll ? (
        <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, body]}>{children}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16, gap: 10 }}>{footer}</View> : null}
    </View>
  );
}
