import { useEffect, useState } from "react";
import * as Location from "expo-location";
import type { LatLng } from "./geo";

export type LocationStatus = "idle" | "asking" | "on" | "denied" | "unavailable";

/** Follows this phone's GPS while `active`. Foreground only for now. */
export function useDeviceLocation(active: boolean) {
  const [pos, setPos] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");

  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      setStatus("asking");
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (perm.status !== "granted") {
          setStatus("denied");
          return;
        }
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 3 },
          (loc) => {
            setPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
            setStatus("on");
          },
          () => setStatus("unavailable"),
        );
        if (cancelled) sub.remove();
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);

  return { pos, status };
}
