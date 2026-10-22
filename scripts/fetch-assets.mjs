// Downloads the fonts and logo the app uses when they are not already in the
// checkout (e.g. on a CI or Vercel build that only has the source).
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

// The SCRAM wordmark: five letter layers from the website, merged into one SVG frame.
const logoFile = "src/components/logo-xml.ts";
if (!existsSync(logoFile)) {
  const parts = [];
  let viewBox = "";
  for (const letter of "scram") {
    const res = await fetch(`https://scramhideandseek.com/assets/logo/${letter}.svg`);
    if (!res.ok) throw new Error(`Logo download failed: ${letter} (${res.status})`);
    const svg = (await res.text()).trim();
    viewBox ||= svg.match(/viewBox="([^"]+)"/)[1];
    parts.push(svg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, "").replaceAll('fill="#fff"', 'fill="currentColor"'));
  }
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${parts.join("")}</svg>`;
  writeFileSync(
    logoFile,
    "// SCRAM wordmark from scramhideandseek.com (assets/logo/*.svg), merged into one frame.\n" +
      `export const LOGO_XML = \`${xml}\`;\n\nexport const LOGO_ASPECT = 1256.7 / 464.78;\n`,
  );
  console.log("fetched logo");
}
