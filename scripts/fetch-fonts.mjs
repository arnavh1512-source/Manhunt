// Downloads the Archivo instances the app uses when they are not already in
// assets/fonts (e.g. on a CI or Vercel build that only has the source).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const base = "https://fonts.gstatic.com/s/archivo/v25/";
const fonts = {
  "Archivo-Expanded-ExtraBold.ttf": "k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q8EsJaRE-NWIDdgffTTtDRp8A.ttf",
  "Archivo-Condensed-ExtraBold.ttf": "k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q-EsJaRE-NWIDdgffTTtDRp8A.ttf",
  "Archivo-Medium.ttf": "k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTTBjNp8A.ttf",
  "Archivo-Bold.ttf": "k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTT0zRp8A.ttf",
};

mkdirSync("assets/fonts", { recursive: true });
for (const [name, file] of Object.entries(fonts)) {
  const dest = `assets/fonts/${name}`;
  if (existsSync(dest)) continue;
  const res = await fetch(base + file);
  if (!res.ok) throw new Error(`Font download failed: ${name} (${res.status})`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`fetched ${name}`);
}
