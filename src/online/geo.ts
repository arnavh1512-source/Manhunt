import type { Point } from "../game/types";

export interface LatLng {
  lat: number;
  lng: number;
}

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG_EQ = 111320;

/** Metres east (x) and south (y) of `origin`. Accurate enough across a few km. */
export function toLocal(p: LatLng, origin: LatLng): Point {
  return {
    x: (p.lng - origin.lng) * M_PER_DEG_LNG_EQ * Math.cos((origin.lat * Math.PI) / 180),
    y: -(p.lat - origin.lat) * M_PER_DEG_LAT,
  };
}

export function fromLocal(p: Point, origin: LatLng): LatLng {
  return {
    lat: origin.lat - p.y / M_PER_DEG_LAT,
    lng: origin.lng + p.x / (M_PER_DEG_LNG_EQ * Math.cos((origin.lat * Math.PI) / 180)),
  };
}
