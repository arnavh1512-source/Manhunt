import { useRef, useState, type ReactNode } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { LOGO_ASPECT, LOGO_XML } from "./logo-xml";
import { colors, fonts, radius } from "../theme";

export function Logo({ width, color = colors.white }: { width: number; color?: string }) {
  return <SvgXml xml={LOGO_XML} width={width} height={width / LOGO_ASPECT} color={color} />;
}

type Variant = "wide" | "narrow" | "body" | "bold";
export function T({ v = "body", size = 16, color = colors.ink, style, ...rest }: TextProps & { v?: Variant; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const tight = v === "wide" || v === "narrow";
  return (
    <Text
      {...rest}
      style={[{ fontFamily: fonts[v], fontSize: size, color, letterSpacing: tight ? -size * 0.04 : 0, lineHeight: tight ? size * 0.95 : size * 1.4 }, style]}
    />
  );
}

export function Eyebrow({ children, color = colors.redText }: { children: ReactNode; color?: string }) {
  return (
    <T v="wide" size={13} color={color} style={{ letterSpacing: 0.6, textTransform: "uppercase", lineHeight: 16 }}>
      {children}
    </T>
  );
}

type BtnKind = "red" | "ink" | "white" | "outline" | "ghost";
const btnStyles: Record<BtnKind, { bg: string; fg: string; border?: string }> = {
  red: { bg: colors.red, fg: colors.white },
  ink: { bg: colors.ink, fg: colors.white },
  white: { bg: colors.white, fg: colors.redText },
  outline: { bg: "transparent", fg: colors.white, border: colors.white },
  ghost: { bg: "transparent", fg: colors.ink, border: colors.line },
};

export function Button({
  label,
  onPress,
  kind = "ink",
  disabled,
  style,
  icon,
}: {
  label: string;
  onPress?: () => void;
  kind?: BtnKind;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
}) {
  const k = btnStyles[kind];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: k.bg, borderColor: k.border ?? "transparent", borderWidth: k.border ? 2 : 0, opacity: disabled ? 0.35 : 1 },
        { transform: [{ scale: pressed ? 0.96 : 1 }] },
        style,
      ]}
    >
      {icon}
      <T v="wide" size={16} color={k.fg}>
        {label}
      </T>
    </Pressable>
  );
}

export function Card({ children, style, dark }: { children: ReactNode; style?: StyleProp<ViewStyle>; dark?: boolean }) {
  return <View style={[styles.card, dark && { backgroundColor: colors.ink }, style]}>{children}</View>;
}

export function Avatar({ name, size = 34, bg = colors.ink, fg = colors.white, ring }: { name: string; size?: number; bg?: string; fg?: string; ring?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: ring ? 3 : 0,
        borderColor: ring,
      }}
    >
      <T v="wide" size={size * 0.32} color={fg}>
        {name.slice(0, 2).toUpperCase()}
      </T>
    </View>
  );
}

/** Stepped slider with a min and max caption, like the site's rules card. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  minLabel,
  maxLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  minLabel: string;
  maxLabel: string;
  onChange: (v: number) => void;
}) {
  const [w, setW] = useState(1);
  const wRef = useRef(1);
  const startX = useRef(0);
  const frac = (value - min) / (max - min);

  const setFromX = (x: number) => {
    const f = Math.min(1, Math.max(0, x / wRef.current));
    const v = Math.round((min + f * (max - min)) / step) * step;
    onChange(Math.min(max, Math.max(min, v)));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        setFromX(startX.current);
      },
      onPanResponderMove: (_, g) => setFromX(startX.current + g.dx),
    }),
  ).current;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <T v="bold" size={15} color={colors.ink2}>
          {label}
        </T>
        <T v="wide" size={20}>
          {format(value)}
        </T>
      </View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: format(value) }}
        onLayout={(e: LayoutChangeEvent) => {
          wRef.current = e.nativeEvent.layout.width;
          setW(e.nativeEvent.layout.width);
        }}
        {...pan.panHandlers}
        style={{ height: 28, justifyContent: "center" }}
      >
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.fill }} pointerEvents="none">
          <View style={{ height: 6, borderRadius: 3, width: frac * w, backgroundColor: colors.red }} />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: frac * w - 13,
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: colors.white,
            borderWidth: 3,
            borderColor: colors.red,
          }}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T size={12} color={colors.ink4}>
          {minLabel}
        </T>
        <T size={12} color={colors.ink4}>
          {maxLabel}
        </T>
      </View>
    </View>
  );
}

export function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bold" size={15} color={colors.ink2}>
          {label}
        </T>
        {hint ? (
          <T size={13} color={colors.ink4}>
            {hint}
          </T>
        ) : null}
      </View>
      <View style={{ width: 52, height: 32, borderRadius: 16, padding: 3, backgroundColor: value ? colors.red : colors.line }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, marginLeft: value ? 20 : 0 }} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 58,
    borderRadius: radius.btn,
    paddingHorizontal: 24,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    padding: 20,
  },
});
