import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { CityMap } from "../components/city-map";
import { Screen } from "../components/screen";
import { Button, Card, Eyebrow, Slider, T, Toggle } from "../components/ui";
import { useAppMode, useGame } from "../game/store";
import { LIMITS } from "../game/types";
import { fromLocal } from "../online/geo";
import { colors } from "../theme";

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min`);
const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${m} m`);

const LOCATION_HINT = {
  asking: "Finding you…",
  denied: "Location is off. Allow it in your browser or phone settings to place the zone.",
  unavailable: "Couldn’t get your location. Check that location services are on.",
};

export default function Host() {
  const g = useGame();
  const { mode } = useAppMode();
  const { settings, updateSettings } = g;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = mode === "online";

  useEffect(() => {
    if (online) g.wantLocation();
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setBusy(true);
    setError(null);
    const err = await g.hostGame();
    setBusy(false);
    if (err) setError(err);
    else router.replace("/lobby");
  };

  const waiting = online && !g.zoneCenter;
  const hint = online && g.locationStatus && g.locationStatus !== "on" && g.locationStatus !== "idle" ? LOCATION_HINT[g.locationStatus] : null;

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
          <Button kind="red" label={busy ? "Creating…" : "Create game"} disabled={busy || waiting} onPress={create} />
        </>
      }
    >
      <View style={{ gap: 10 }}>
        <Eyebrow>{online ? "Host" : "Practice · bots play the others"}</Eyebrow>
        <T v="wide" size={40}>
          Set the arena.
        </T>
      </View>

      <View style={{ borderRadius: 24, overflow: "hidden", backgroundColor: colors.fill }}>
        {waiting ? (
          <View style={{ height: 300, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <T v="bold" size={15} color={colors.ink3} style={{ textAlign: "center" }}>
              {hint ?? "Finding you…"}
            </T>
          </View>
        ) : (
          <CityMap
            center={g.zoneCenter}
            zoneR={settings.zoneMeters / 2}
            viewR={Math.max(settings.zoneMeters / 2, 200) * 1.3}
            draggable
            onDrag={(offset) => g.zoneCenter && g.setZoneCenter(fromLocal(offset, g.zoneCenter))}
            height={300}
          />
        )}
        {!waiting ? (
          <>
            <View style={{ position: "absolute", left: 12, top: 12, backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <T v="bold" size={12} color={colors.white}>
                Drag the map to move the zone
              </T>
            </View>
            <View style={{ position: "absolute", left: 12, bottom: 12, backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <T v="wide" size={13}>
                {fmtM(settings.zoneMeters)} across
              </T>
            </View>
          </>
        ) : null}
      </View>

      <Card style={{ gap: 26 }}>
        <Slider label="Zone size" value={settings.zoneMeters} {...LIMITS.zoneMeters} format={fmtM} minLabel="400 m" maxLabel="3 km" onChange={(v) => updateSettings({ zoneMeters: v })} />
        <Slider label="Round length" value={settings.roundMin} {...LIMITS.roundMin} format={fmtMin} minLabel="10 min" maxLabel="3 h" onChange={(v) => updateSettings({ roundMin: v })} />
        <Slider label="Ping every" value={settings.pingMin} {...LIMITS.pingMin} format={fmtMin} minLabel="1 min" maxLabel="30 min" onChange={(v) => updateSettings({ pingMin: v })} />
        <Slider
          label="Head start"
          value={settings.headStartMin}
          {...LIMITS.headStartMin}
          format={(v) => (v ? fmtMin(v) : "None")}
          minLabel="None"
          maxLabel="15 min"
          onChange={(v) => updateSettings({ headStartMin: v })}
        />
        <Toggle
          label="Shrinking zone"
          hint="The zone closes in on a schedule, with a 1-minute warning before each shrink."
          value={settings.shrink}
          onChange={(shrink) => updateSettings({ shrink })}
        />
      </Card>
    </Screen>
  );
}
