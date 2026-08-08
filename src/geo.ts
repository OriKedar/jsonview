export interface Coord {
  lat: number;
  lon: number;
}

function inRange(v: number, min: number, max: number): boolean {
  return v >= min && v <= max;
}

function orderPair(a: number, b: number): Coord | null {
  const aIsLat = inRange(a, -90, 90);
  const bIsLat = inRange(b, -90, 90);
  const aIsLon = inRange(a, -180, 180);
  const bIsLon = inRange(b, -180, 180);
  if (aIsLat && bIsLon) return { lat: a, lon: b };
  if (bIsLat && aIsLon) return { lat: b, lon: a };
  return null;
}

export function coordFromString(value: string): Coord | null {
  const m = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return orderPair(Number(m[1]), Number(m[2]));
}

export function coordFromArray(arr: unknown[]): Coord | null {
  if (arr.length !== 2) return null;
  const [a, b] = arr;
  if (typeof a !== "number" || typeof b !== "number") return null;
  return orderPair(a, b);
}

const LAT_KEY = /^lat(itude)?$/i;
const LON_KEY = /^(lon(gitude)?|lng|long)$/i;

export function coordFromEntries(entries: readonly (readonly [string, unknown])[]): Coord | null {
  let lat: number | null = null;
  let lon: number | null = null;
  for (const [k, v] of entries) {
    if (typeof v !== "number") continue;
    if (lat === null && LAT_KEY.test(k)) lat = v;
    else if (lon === null && LON_KEY.test(k)) lon = v;
  }
  if (lat === null || lon === null) return null;
  if (!inRange(lat, -90, 90) || !inRange(lon, -180, 180)) return null;
  return { lat, lon };
}

export function coordFromPair(a: number, b: number): Coord | null {
  return orderPair(a, b);
}
