// Tokens from scramhideandseek.com (styles.css :root).
export const colors = {
  red: "#ec3013",
  redText: "#ae1800",
  splash: "#ff3131",
  ink: "#201e1d",
  ink2: "#444141",
  ink3: "#605d5d",
  ink4: "#7d7979",
  ground: "#f3f2f2",
  line: "#d7d3d3",
  fill: "#eae7e7",
  onDark2: "#bab6b6",
  white: "#ffffff",
  // Hunter map: the site shows it as the light map inverted.
  night: "#1b1918",
  nightBlock: "#2a2726",
  nightStreet: "#3a3634",
};

export const fonts = {
  // Archivo at 125% width: headings, buttons, numbers.
  wide: "ArchivoExpanded",
  // Archivo at 62.5% width: big countdowns and labels.
  narrow: "ArchivoCondensed",
  body: "ArchivoMedium",
  bold: "ArchivoBold",
};

export const fontAssets = {
  [fonts.wide]: require("../assets/fonts/Archivo-Expanded-ExtraBold.ttf"),
  [fonts.narrow]: require("../assets/fonts/Archivo-Condensed-ExtraBold.ttf"),
  [fonts.body]: require("../assets/fonts/Archivo-Medium.ttf"),
  [fonts.bold]: require("../assets/fonts/Archivo-Bold.ttf"),
};

export const radius = { btn: 18, card: 24, pill: 999 };
