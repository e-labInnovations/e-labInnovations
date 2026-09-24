// build-icons.js
// Generates icons/*.svg — rounded tiles in skillicons.dev geometry for the
// README's contact and skill rows, covering what skillicons lacks.
//
//   npm run icons
//
// brand — brand-colour tile, white glyph (social links)
// dark  — skillicons dark tile, brand-colour glyph
import * as si from "simple-icons";
import fs from "fs";

// LinkedIn was removed from simple-icons in v14; path taken from v13.
const LINKEDIN =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";

// Generic envelope (Material Icons "mail", Apache-2.0) — the address is on elabins.com, not Gmail.
const MAIL =
  "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z";

const ICONS = [
  { id: "telegram", style: "brand", icon: si.siTelegram },
  { id: "x", style: "brand", icon: si.siX },
  { id: "linkedin", style: "brand", icon: { path: LINKEDIN, hex: "0A66C2" } },
  { id: "stackoverflow", style: "brand", icon: si.siStackoverflow },
  { id: "facebook", style: "brand", icon: si.siFacebook },
  { id: "instagram", style: "brand", icon: si.siInstagram, gradient: ["#FFD600", "#FF0069", "#7638FA"] },
  { id: "youtube", style: "brand", icon: si.siYoutube },
  { id: "email", style: "brand", icon: { path: MAIL, hex: "475569" } },
  { id: "espressif", style: "dark", icon: si.siEspressif },
  { id: "nodered", style: "brand", icon: si.siNodered },
  { id: "kicad", style: "brand", icon: si.siKicad, size: 1.35 }, // wide wordmark
];

const S = 256; // tile, same as skillicons
const RADIUS = 60;
const GLYPH = 144; // glyph box inside the tile
const TILE_DARK = "#242938";

const round = (n) => Math.round(n * 100) / 100;
const isNearBlack = (hex) =>
  parseInt(hex.slice(0, 2), 16) + parseInt(hex.slice(2, 4), 16) + parseInt(hex.slice(4, 6), 16) < 120;

function tile({ style, icon, gradient, size = 1 }) {
  let defs = "";
  let fill = style === "dark" ? TILE_DARK : `#${icon.hex}`;
  if (gradient) {
    const stops = gradient
      .map((c, i) => `<stop offset="${i / (gradient.length - 1)}" stop-color="${c}"/>`)
      .join("");
    defs = `<defs><radialGradient id="t" cx="0.25" cy="1.05" r="1.25">${stops}</radialGradient></defs>`;
    fill = "url(#t)";
  }
  const ink = style === "dark" ? `#${icon.hex}` : "#FFFFFF";
  const g = GLYPH * size;
  const o = round((S - g) / 2);
  // Black tiles (X) would vanish on GitHub's dark theme: faint edge.
  const edge =
    style === "brand" && !gradient && isNearBlack(icon.hex)
      ? `<rect x="3" y="3" width="${S - 6}" height="${S - 6}" rx="${RADIUS - 3}" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="6"/>`
      : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs}` +
    `<rect width="${S}" height="${S}" rx="${RADIUS}" fill="${fill}"/>${edge}` +
    `<path transform="translate(${o} ${o}) scale(${round(g / 24)})" fill="${ink}" d="${icon.path}"/></svg>\n`
  );
}

fs.mkdirSync("icons", { recursive: true });
for (const i of ICONS) {
  if (!i.icon) throw new Error(`simple-icons has no icon for "${i.id}"`);
  fs.writeFileSync(`icons/${i.id}.svg`, tile(i));
}
console.log(`${ICONS.length} icons → icons/`);
