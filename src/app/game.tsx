import { useEffect, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { CityMap, type Marker } from "../components/city-map";
import { Avatar, Button, Logo, T } from "../components/ui";
import { ago, clock, nextShrinkAt, zoneRadiusAt } from "../game/sim";
import { useGame } from "../game/store";
import { colors, fonts } from "../theme";

export default function Game() {
  const g = useGame();
  const insets = useSafeAreaInsets();
  const [radioOpen, setRadioOpen] = useState(false);
  const seenChat = useRef(0);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (g.phase === "over") router.replace("/result");
    if (g.phase === "lobby") router.replace("/");
  }, [g.phase]);

  useEffect(() => {
    if (radioOpen) {
      seenChat.current = g.chat.length;
      setUnread(0);
    } else setUnread(g.chat.length - seenChat.current);
  }, [g.chat.length, radioOpen]);

  const you = g.you;
  if (!you?.role) return null;
  const hunter = you.role === "hunter";
  const out = you.tagged;
  const scatter = g.phase === "scatter";
  const runnersLeft = g.runners.filter((r) => !r.tagged).length;

  // What this phone is allowed to see.
  const markers: Marker[] = [];
  const nameOf = (id: string) => g.players.find((p) => p.id === id)?.name ?? "?";
  for (const p of g.players) {
    if (p.isYou) continue;
    const sameTeam = p.role === you.role;
    if (sameTeam || out) markers.push({ id: p.id, pos: p.pos, label: p.name.toUpperCase(), kind: p.tagged ? "tagged" : "teammate" });
    else if (hunter && g.liveOutside.includes(p.id) && !p.tagged) markers.push({ id: p.id, pos: p.pos, label: `${p.name.toUpperCase()} · LIVE`, kind: "live" });
  }
  if (hunter && !out) {
    for (const ping of g.pings) {
      const p = g.players.find((x) => x.id === ping.playerId);
      if (!p || p.tagged || g.liveOutside.includes(p.id)) continue;
      markers.push({ id: `ping-${ping.playerId}`, pos: ping.pos, label: nameOf(ping.playerId).toUpperCase(), kind: "ping", caption: ago(g.t - ping.at) });
    }
  }
  markers.push({ id: "you", pos: you.pos, label: "YOU", kind: out ? "tagged" : "you" });

  const shrinkAt = nextShrinkAt(g.settings, g.huntS);
  const nextZoneR = g.shrinkIn !== null && g.shrinkIn <= 60 && shrinkAt !== null ? zoneRadiusAt(g.settings, shrinkAt) : null;

  return (
    <View style={{ flex: 1, backgroundColor: hunter ? colors.night : colors.fill }}>
      <StatusBar style={hunter ? "light" : "dark"} />
      <CityMap zoneR={g.zoneR} nextZoneR={nextZoneR} markers={markers} dark={hunter} viewR={g.settings.zoneMeters / 2 * 1.15} />

      {/* Top status */}
      <View style={{ position: "absolute", top: insets.top + 10, left: 12, right: 12, gap: 8 }}>
        <View style={{ backgroundColor: hunter ? colors.red : colors.ink, borderRadius: 24, padding: 16, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <T v="bold" size={12} color={colors.white} style={{ opacity: 0.8, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {out ? "Tagged · spectating" : scatter ? "Head start" : hunter ? "Next ping" : "Hunters ping you in"}
            </T>
            <T v="narrow" size={56} color={colors.white} style={{ lineHeight: 52 }}>
              {clock(scatter ? g.headStartLeft : out ? g.roundLeft : g.nextPingIn)}
            </T>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <T v="bold" size={12} color={colors.white} style={{ opacity: 0.8 }}>
              Runners left
            </T>
            <T v="wide" size={22} color={colors.white}>
              {runnersLeft} of {g.runners.length}
            </T>
            <T v="bold" size={12} color={colors.white} style={{ opacity: 0.8 }}>
              Round {clock(g.roundLeft)}
            </T>
          </View>
        </View>
        {g.shrinkIn !== null && g.shrinkIn <= 60 && !scatter ? (
          <Chip text={`Zone shrinks in ${clock(g.shrinkIn)}`} />
        ) : !scatter && !out ? (
          <Chip text={hunter ? "Tag them in person. They confirm it." : "Keep moving between pings."} subtle />
        ) : null}
      </View>

      {hunter && scatter ? <NoPeeking left={g.headStartLeft} /> : null}

      {/* Bottom bar */}
      <View style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + 12, flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => setRadioOpen(true)}
          accessibilityRole="button"
          style={{ flex: 1, height: 58, borderRadius: 18, backgroundColor: colors.white, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <T v="wide" size={16}>
            Team Radio
          </T>
          {unread > 0 ? (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
              <T v="wide" size={11} color={colors.white}>
                {unread}
              </T>
            </View>
          ) : null}
        </Pressable>
        {!hunter && !out && !scatter ? <Button kind="red" label="I got tagged" onPress={g.reportTag} style={{ flex: 1 }} /> : null}
        {out ? <Button kind="ghost" label="Leave" onPress={() => { g.leave(); router.replace("/"); }} style={{ backgroundColor: colors.white }} /> : null}
      </View>

      <AlertBanner />
      <Radio open={radioOpen} onClose={() => setRadioOpen(false)} />
      <TagPrompt />
    </View>
  );
}

function Chip({ text, subtle }: { text: string; subtle?: boolean }) {
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: subtle ? colors.white : colors.red, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
      <T v="bold" size={13} color={subtle ? colors.ink : colors.white}>
        {text}
      </T>
    </View>
  );
}

function NoPeeking({ left }: { left: number }) {
  return (
    <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(27,25,24,0.94)", alignItems: "center", justifyContent: "center", padding: 24, gap: 10 }}>
      <T v="bold" size={14} color={colors.onDark2} style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
        Meanwhile, the hunters
      </T>
      <T v="wide" size={34} color={colors.white} style={{ textAlign: "center" }}>
        Waiting out the head start.{"\n"}No peeking.
      </T>
      <T v="narrow" size={110} color={colors.red} style={{ lineHeight: 104 }}>
        {clock(left)}
      </T>
      <T v="wide" size={18} color={colors.white} style={{ textAlign: "center", opacity: 0.8 }}>
        Ready or not…
      </T>
    </View>
  );
}

/** Mirrors how a ping or zone warning arrives as a phone notification. */
function AlertBanner() {
  const g = useGame();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-160)).current;
  const alert = g.alert;

  useEffect(() => {
    if (!alert) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start();
    const t = setTimeout(() => Animated.timing(y, { toValue: -160, duration: 250, useNativeDriver: true }).start(() => g.dismissAlert()), 3500);
    return () => clearTimeout(t);
  }, [alert?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!alert) return null;
  return (
    <Animated.View style={{ position: "absolute", top: insets.top + 6, left: 10, right: 10, transform: [{ translateY: y }] }}>
      <Pressable onPress={g.dismissAlert} style={{ backgroundColor: "rgba(255,255,255,0.97)", borderRadius: 22, padding: 14, flexDirection: "row", gap: 12, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, elevation: 6 }}>
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.red, alignItems: "center", justifyContent: "center" }}>
          <T v="wide" size={18} color={colors.white}>
            S
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T v="bold" size={12} color={colors.ink4}>
              SCRAM
            </T>
            <T size={12} color={colors.ink4}>
              now
            </T>
          </View>
          <T v="bold" size={15}>
            {alert.title}
          </T>
          <T size={14} color={colors.ink2}>
            {alert.body}
          </T>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Radio({ open, onClose }: { open: boolean; onClose: () => void }) {
  const g = useGame();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const scroll = useRef<ScrollViewInstance>(null);
  const team = g.you?.role === "hunter" ? g.hunters : g.runners;

  const send = () => {
    if (!text.trim()) return;
    g.sendChat(text.trim());
    setText("");
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close radio" />
        <View style={{ backgroundColor: colors.ground, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "75%", paddingBottom: insets.bottom + 12 }}>
          <View style={{ padding: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ gap: 4 }}>
              <T v="wide" size={24}>
                Team Radio
              </T>
              <T size={13} color={colors.ink4}>
                Only your team sees this.
              </T>
            </View>
            <View style={{ flexDirection: "row" }}>
              {team.map((p, i) => (
                <View key={p.id} style={{ marginLeft: i ? -8 : 0 }}>
                  <Avatar name={p.isYou ? "You" : p.name} size={32} bg={p.isYou ? colors.red : colors.ink} ring={colors.ground} />
                </View>
              ))}
            </View>
          </View>
          <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd()} contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 12 }}>
            {g.chat.length === 0 ? (
              <T size={14} color={colors.ink4}>
                Make a plan, split up, argue about snacks.
              </T>
            ) : null}
            {g.chat.map((m) => {
              const mine = m.from === "You";
              return (
                <View key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", gap: 3 }}>
                  {!mine ? (
                    <T v="bold" size={12} color={colors.ink4}>
                      {m.from}
                    </T>
                  ) : null}
                  <View style={{ backgroundColor: mine ? colors.red : colors.white, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <T size={15} color={mine ? colors.white : colors.ink}>
                      {m.text}
                    </T>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={send}
              placeholder="Message your team"
              placeholderTextColor={colors.ink4}
              returnKeyType="send"
              style={{ flex: 1, height: 52, borderRadius: 16, backgroundColor: colors.white, paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 16, color: colors.ink }}
            />
            <Button label="Send" kind="ink" onPress={send} style={{ height: 52, paddingHorizontal: 18 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TagPrompt() {
  const g = useGame();
  return (
    <Modal visible={g.tagPrompt} transparent animationType="fade" onRequestClose={g.denyTagged}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 }}>
        <View style={{ backgroundColor: colors.red, borderRadius: 28, padding: 24, gap: 14 }}>
          <Logo width={110} />
          <T v="wide" size={34} color={colors.white}>
            Tagged?
          </T>
          <T size={16} color={colors.white}>
            Only confirm if a hunter tagged you in person. You’ll be out, but you can keep watching.
          </T>
          <Button kind="white" label="Yes, I’m out" onPress={g.confirmTagged} />
          <Button kind="outline" label="No, still free" onPress={g.denyTagged} />
        </View>
      </View>
    </Modal>
  );
}
