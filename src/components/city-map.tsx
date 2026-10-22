// Stylized neighbourhood map drawn in SVG, in metres around the zone centre.
// It keeps every screen working on web and in Expo Go; swap in react-native-maps
// with the same props once real GPS is wired up.
import { useMemo, useRef, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, G, Mask, Path, Rect, Text as SvgText } from "react-native-svg";
import type { Point } from "../game/types";
import { colors, fonts } from "../theme";

export interface Marker {
  id: string;
  pos: Point;
  label: string;
  kind: "you" | "teammate" | "ping" | "live" | "tagged";
  caption?: string;
}

const WORLD = 2400;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function useStreets() {
  return useMemo(() => {
    const rnd = seeded(42);
    const lines: { d: string; major: boolean }[] = [];
    for (let x = -WORLD; x <= WORLD; ) {
      const major = rnd() < 0.18;
      lines.push({ d: `M${x} ${-WORLD}L${x + (rnd() - 0.5) * 60} ${WORLD}`, major });
      x += 90 + rnd() * 70;
    }
    for (let y = -WORLD; y <= WORLD; ) {
      const major = rnd() < 0.18;
      lines.push({ d: `M${-WORLD} ${y}L${WORLD} ${y + (rnd() - 0.5) * 60}`, major });
      y += 80 + rnd() * 80;
    }
    lines.push({ d: `M${-WORLD} ${WORLD * 0.6}L${WORLD} ${-WORLD * 0.9}`, major: true });
    return lines;
  }, []);
}

const CANAL = `M${-WORLD} 260 C -700 120, -300 420, 120 300 S 700 80, 1100 220 S ${WORLD} 180, ${WORLD} 160`;

export function CityMap({
  zoneR,
  nextZoneR,
  markers = [],
  dark,
  viewR,
  draggable,
  onDrag,
  height,
}: {
  zoneR: number;
  nextZoneR?: number | null;
  markers?: Marker[];
  dark?: boolean;
  viewR?: number;
  draggable?: boolean;
  onDrag?: (offset: Point) => void;
  height?: number;
}) {
  const streets = useStreets();
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const base = useRef<Point>({ x: 0, y: 0 });
  const half = viewR ?? zoneR * 1.25;
  // Metres per screen pixel, using the shorter side so the zone always fits.
  const mpp = (half * 2) / Math.max(1, Math.min(size.w, size.h));
  const vw = size.w * mpp;
  const vh = size.h * mpp;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!draggable,
      onMoveShouldSetPanResponder: () => !!draggable,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const next = { x: base.current.x - g.dx * mppRef.current, y: base.current.y - g.dy * mppRef.current };
        setOffset(next);
      },
      onPanResponderRelease: (_, g) => {
        base.current = { x: base.current.x - g.dx * mppRef.current, y: base.current.y - g.dy * mppRef.current };
        onDragRef.current?.(base.current);
      },
    }),
  ).current;
  const mppRef = useRef(mpp);
  mppRef.current = mpp;
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  const c = dark
    ? { ground: colors.night, block: colors.nightBlock, street: colors.nightStreet, major: "#4a4542", water: "#24323a", park: "#24302a", veil: "rgba(0,0,0,0.45)", ink: colors.white, halo: colors.night }
    : { ground: colors.fill, block: "#e2dfde", street: colors.white, major: colors.white, water: "#cfdde3", park: "#dde6d3", veil: "rgba(32,30,29,0.28)", ink: colors.ink, halo: colors.white };

  const px = (n: number) => n * mpp; // screen pixels → metres

  return (
    <View
      style={{ flex: height ? undefined : 1, height, overflow: "hidden", backgroundColor: c.ground }}
      onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...pan.panHandlers}
    >
      <Svg width="100%" height="100%" viewBox={`${-vw / 2} ${-vh / 2} ${vw} ${vh}`}>
        <Defs>
          <Mask id="outside">
            <Rect x={-vw} y={-vh} width={vw * 2} height={vh * 2} fill="#fff" />
            <Circle cx={0} cy={0} r={zoneR} fill="#000" />
          </Mask>
        </Defs>
        <G transform={`translate(${-offset.x} ${-offset.y})`}>
          <Rect x={-WORLD} y={-WORLD} width={WORLD * 2} height={WORLD * 2} fill={c.block} />
          <Rect x={-520} y={-640} width={360} height={260} rx={30} fill={c.park} />
          <Rect x={420} y={-300} width={220} height={300} rx={30} fill={c.park} />
          {streets.map((s, i) => (
            <Path key={i} d={s.d} stroke={s.major ? c.major : c.street} strokeWidth={s.major ? px(9) : px(5)} fill="none" />
          ))}
          <Path d={CANAL} stroke={c.water} strokeWidth={px(16)} fill="none" strokeLinecap="round" />
        </G>

        {/* Outside the zone is shaded; the edge is the red ring. */}
        <Rect x={-vw} y={-vh} width={vw * 2} height={vh * 2} fill={c.veil} mask="url(#outside)" />
        {nextZoneR ? <Circle cx={0} cy={0} r={nextZoneR} stroke={colors.red} strokeWidth={px(2)} strokeDasharray={`${px(8)} ${px(6)}`} fill="none" /> : null}
        <Circle cx={0} cy={0} r={zoneR} stroke={colors.red} strokeWidth={px(4)} fill="none" />

        {markers.map((m) => (
          <MarkerGlyph key={m.id} m={m} px={px} ink={c.ink} halo={c.halo} dark={dark} />
        ))}
      </Svg>
    </View>
  );
}

function MarkerGlyph({ m, px, ink, halo, dark }: { m: Marker; px: (n: number) => number; ink: string; halo: string; dark?: boolean }) {
  const { x, y } = m.pos;
  const label = (
    <>
      <SvgText x={x} y={y - px(24)} fontSize={px(13)} fontFamily={fonts.wide} fill={halo} stroke={halo} strokeWidth={px(4)} textAnchor="middle">
        {m.label}
      </SvgText>
      <SvgText x={x} y={y - px(24)} fontSize={px(13)} fontFamily={fonts.wide} fill={m.kind === "live" ? colors.red : ink} textAnchor="middle">
        {m.label}
      </SvgText>
      {m.caption ? (
        <SvgText x={x} y={y + px(30)} fontSize={px(11)} fontFamily={fonts.bold} fill={dark ? colors.onDark2 : colors.ink3} textAnchor="middle">
          {m.caption}
        </SvgText>
      ) : null}
    </>
  );

  if (m.kind === "ping") {
    return (
      <G>
        <Circle cx={x} cy={y} r={px(18)} fill="none" stroke={ink} strokeWidth={px(2)} opacity={0.5} />
        <Circle cx={x} cy={y} r={px(9)} fill={ink} stroke={halo} strokeWidth={px(3)} />
        {label}
      </G>
    );
  }
  if (m.kind === "tagged") {
    return (
      <G opacity={0.45}>
        <Circle cx={x} cy={y} r={px(8)} fill={ink} />
        {label}
      </G>
    );
  }
  const fill = m.kind === "you" ? colors.red : m.kind === "live" ? colors.red : ink;
  return (
    <G>
      {m.kind === "you" ? <Circle cx={x} cy={y} r={px(22)} fill={colors.red} opacity={0.18} /> : null}
      <Circle cx={x} cy={y} r={px(11)} fill={fill} stroke={halo} strokeWidth={px(3)} />
      {label}
    </G>
  );
}
