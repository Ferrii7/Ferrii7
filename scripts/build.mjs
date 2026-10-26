// Builds every SVG in assets/ from scratch: `npm install && npm run build`.
//
// The look follows the securebusinesshub.com heroes: #04070A space, steel-blue
// nebula haze, four-point stars, amber #C98F2C, cream #F2F0EB, Fraunces over
// IBM Plex Mono eyebrows. GitHub shows these SVGs as <img>, so nothing outside
// the file can load. Fonts are fetched from Google Fonts subset to the exact
// glyphs each file uses (the `text=` parameter) and inlined as base64.
import fs from "node:fs";
import crypto from "node:crypto";
import { geoOrthographic, geoPath, geoGraticule, geoInterpolate, geoDistance, geoContains } from "d3-geo";
import { feature, mesh } from "topojson-client";
import { create } from "fontkit";

const OUT = "assets";
const CACHE = ".cache/fonts";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const C = {
  space: "#04070A", ground: "#0A0E12", land: "#182029", coast: "#96ACC1",
  gold: "#C98F2C", goldL: "#E8C77A", ink: "#F2F0EB", ice: "#BAD0FF", danger: "#D9534A",
};
const INK = (a) => `rgba(242,240,235,${a})`;

const FONTS = {
  serif: { spec: (o) => `Fraunces:opsz,wght@${o},600`, family: "sbh-serif", weight: 600, stack: "Georgia,'Times New Roman',serif" },
  cap: { spec: () => "Inter:wght@600", family: "sbh-cap", weight: 600, stack: "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif" },
  sans: { spec: () => "Inter:wght@400", family: "sbh-sans", weight: 400, stack: "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif" },
  sansb: { spec: () => "Inter:wght@600", family: "sbh-sansb", weight: 600, stack: "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif" },
};

const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const n1 = (v) => Math.round(v * 10) / 10;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const round = (d) => d.replace(/-?\d+\.\d+/g, (m) => String(n1(+m)));

// Shared motion. Everything stops under prefers-reduced-motion.
const BASE_CSS = `
.tw{animation:tw 6s ease-in-out infinite}
.up{animation:up .9s cubic-bezier(.2,.7,.2,1) both}
.draw{stroke-dasharray:100;animation:draw 1.8s ease-out both}
.pk{stroke-dasharray:6 200;animation:pk 3.4s linear infinite}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 3.2s ease-out infinite}
.drift{animation:drift 14s ease-in-out infinite alternate}
@keyframes tw{0%,100%{opacity:1}50%{opacity:.28}}
@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes draw{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
@keyframes pk{from{stroke-dashoffset:6}to{stroke-dashoffset:-100}}
@keyframes pulse{0%{transform:scale(1);opacity:.9}75%,100%{transform:scale(3.4);opacity:0}}
@keyframes drift{from{transform:translate(0,0) rotate(0)}to{transform:translate(-14px,6px) rotate(24deg)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.pk{display:none}}`;

async function fontFile(key, text, opsz) {
  const spec = FONTS[key].spec(opsz);
  const chars = [...new Set(text + " ")].sort().join("");
  const file = `${CACHE}/${crypto.createHash("sha1").update(spec + chars).digest("hex").slice(0, 16)}.woff2`;
  if (!fs.existsSync(file)) {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${spec}&text=${encodeURIComponent(chars)}`, { headers: { "user-agent": UA } })).text();
    const url = css.match(/url\((https:[^)]+)\)/)?.[1];
    if (!url) throw new Error(`Google Fonts returned no file for ${spec}\n${css.slice(0, 300)}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  return fs.readFileSync(file);
}

async function fontFace(key, text, opsz) {
  const f = FONTS[key];
  const b64 = (await fontFile(key, text, opsz)).toString("base64");
  return `@font-face{font-family:${f.family};font-weight:${f.weight};src:url(data:font/woff2;base64,${b64}) format("woff2")}
.f-${key}{font-family:${f.family},${f.stack};font-weight:${f.weight}}`;
}

// Label widths come from the real Inter SemiBold advances (no kerning, which caps barely use).
const METRICS = create(await fontFile("cap", Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") + "·°"));
const capW = (s, size, ls) => (METRICS.layout(s).advanceWidth / METRICS.unitsPerEm) * size + ls * (s.length - 1);

// One SVG document. `t()` writes text and records its glyphs for the font subset.
class Doc {
  constructor(w, h, label, { opsz = 72, css = "" } = {}) {
    Object.assign(this, { w, h, label, opsz, css, defs: [], body: [], glyphs: {} });
  }
  def(s) { this.defs.push(s); return this; }
  add(...s) { this.body.push(...s); return this; }
  t(font, x, y, size, str, attrs = "") {
    this.glyphs[font] = (this.glyphs[font] || "") + str;
    return `<text class="f-${font}" x="${n1(x)}" y="${n1(y)}" font-size="${size}" ${attrs}>${esc(str)}</text>`;
  }
  async write(name) {
    const faces = [];
    for (const [k, s] of Object.entries(this.glyphs)) faces.push(await fontFace(k, s, this.opsz));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w}" height="${this.h}" role="img" aria-label="${esc(this.label)}">
<style>${faces.join("\n")}${BASE_CSS}${this.css}</style>
<defs>${this.defs.join("\n")}</defs>
${this.body.join("\n")}
</svg>
`;
    // A content hash in the filename gives every change a new URL, so GitHub's image
    // cache can't keep serving the old art.
    const file = name.replace(/\.svg$/, `.${crypto.createHash("sha1").update(svg).digest("hex").slice(0, 8)}.svg`);
    fs.writeFileSync(`${OUT}/${file}`, svg);
    WRITTEN.set(name, file);
    console.log(`${file.padEnd(36)} ${(svg.length / 1024).toFixed(1)} KB`);
  }
}

// ── sky ─────────────────────────────────────────────────────────────────────

// Gradients every sky uses: star glow, amber glow, star spikes.
function skyDefs(d) {
  d.def(`<radialGradient id="glw"><stop offset="0" stop-color="#DEE8FF" stop-opacity=".42"/><stop offset=".25" stop-color="#DEE8FF" stop-opacity=".1"/><stop offset="1" stop-color="#DEE8FF" stop-opacity="0"/></radialGradient>
<radialGradient id="glg"><stop offset="0" stop-color="${C.goldL}" stop-opacity=".55"/><stop offset=".3" stop-color="${C.gold}" stop-opacity=".16"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>
<linearGradient id="sph"><stop offset="0" stop-color="#DEE8FF" stop-opacity="0"/><stop offset=".5" stop-color="#DEE8FF" stop-opacity=".75"/><stop offset="1" stop-color="#DEE8FF" stop-opacity="0"/></linearGradient>
<linearGradient id="spv" x2="0" y2="1"><stop offset="0" stop-color="#DEE8FF" stop-opacity="0"/><stop offset=".5" stop-color="#DEE8FF" stop-opacity=".75"/><stop offset="1" stop-color="#DEE8FF" stop-opacity="0"/></linearGradient>`);
}

// Domain-noise haze in one tint, faded out at the edge of an ellipse.
function nebula(d, id, { cx, cy, rx, ry, rgb, a = 0.5, freq = 0.005, seed = 1 }) {
  const [r, g, b] = rgb.map((v) => (v / 255).toFixed(3));
  d.def(`<filter id="${id}f" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="5" seed="${seed}"/><feColorMatrix values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 2.4 0 0 0 -.92"/></filter>
<radialGradient id="${id}g"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="${id}m"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}g)"/></mask>
<radialGradient id="${id}b"><stop offset="0" stop-color="rgb(${rgb})" stop-opacity=".16"/><stop offset="1" stop-color="rgb(${rgb})" stop-opacity="0"/></radialGradient>`);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}b)"/>
<rect x="${cx - rx}" y="${cy - ry}" width="${rx * 2}" height="${ry * 2}" filter="url(#${id}f)" mask="url(#${id}m)" opacity="${a}"/>`;
}

const TINTS = ["#FFFFFF", "#FFFFFF", "#DEE8FF", "#DEE8FF", "#BAD0FF", "#96B9FF", "#FFE9C4"];
function starfield(rnd, w, h, n, { minA = 0.2, twinkle = 0.12, box = [0, 0, w, h] } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = box[0] + rnd() * (box[2] - box[0]), y = box[1] + rnd() * (box[3] - box[1]);
    const r = 0.25 + Math.pow(rnd(), 3.2) * 1.25;
    const a = minA + rnd() * (1 - minA);
    const fill = TINTS[(rnd() * TINTS.length) | 0];
    const tw = rnd() < twinkle ? ` class="tw" style="animation-delay:${n1(rnd() * 6)}s;animation-duration:${n1(4 + rnd() * 5)}s"` : "";
    out.push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="${fill}" opacity="${n1(a)}"${tw}/>`);
  }
  return out.join("");
}

// The four-point star from SBH's StarAccents: glow, cross spike, white core.
function spike(x, y, r, len, delay = 0, dur = 6) {
  const s = len
    ? `<rect x="${n1(x - len / 2)}" y="${n1(y - 0.5)}" width="${len}" height="1" fill="url(#sph)"/><rect x="${n1(x - 0.5)}" y="${n1(y - len / 2)}" width="1" height="${len}" fill="url(#spv)"/>`
    : "";
  return `<g class="tw" style="animation-delay:${delay}s;animation-duration:${dur}s"><circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r * 7)}" fill="url(#glw)"/>${s}<circle cx="${n1(x)}" cy="${n1(y)}" r="${r}" fill="#fff"/></g>`;
}

// Small four-point star used as a bullet or separator.
const sparkle = (x, y, s, fill = C.gold) =>
  `<path d="M${n1(x)} ${n1(y - s)}Q${n1(x + s * 0.18)} ${n1(y - s * 0.18)} ${n1(x + s)} ${n1(y)}Q${n1(x + s * 0.18)} ${n1(y + s * 0.18)} ${n1(x)} ${n1(y + s)}Q${n1(x - s * 0.18)} ${n1(y + s * 0.18)} ${n1(x - s)} ${n1(y)}Q${n1(x - s * 0.18)} ${n1(y - s * 0.18)} ${n1(x)} ${n1(y - s)}Z" fill="${fill}"/>`;

const brackets = (w, h, i, l, a = 0.7) =>
  `<g fill="none" stroke="${C.gold}" stroke-opacity="${a}" stroke-width="2"><path d="M${i} ${i + l}V${i}H${i + l}"/><path d="M${w - i - l} ${i}H${w - i}V${i + l}"/><path d="M${i} ${h - i - l}V${h - i}H${i + l}"/><path d="M${w - i - l} ${h - i}H${w - i}V${h - i - l}"/></g>`;

// The SBH eyebrow: a short amber rule, then spaced mono caps.
const eyebrow = (d, x, y, str, size = 12) =>
  `<line x1="${x}" y1="${y - size * 0.36}" x2="${x + 26}" y2="${y - size * 0.36}" stroke="${C.gold}" stroke-opacity=".6"/>` +
  d.t("cap", x + 38, y, size, str.toUpperCase(), `letter-spacing="${n1(size * 0.16)}" fill="${C.gold}"`);

// Rock texture shared by the moon, meteorites and planets.
function rockDefs(d) {
  d.def(`<filter id="rock" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="4" seed="11" result="n"/><feDiffuseLighting in="n" surfaceScale="2.4" lighting-color="#fff" result="l"><feDistantLight azimuth="-50" elevation="40"/></feDiffuseLighting><feBlend in="SourceGraphic" in2="l" mode="multiply" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in"/></filter>
<radialGradient id="rockg" cx=".66" cy=".3" r=".85"><stop offset="0" stop-color="#C9C2B6"/><stop offset=".45" stop-color="#77716A"/><stop offset="1" stop-color="#1B1D20"/></radialGradient>`);
}

function meteor(rnd, x, y, r, delay) {
  const pts = [];
  const k = 9;
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2, rr = r * (0.72 + rnd() * 0.38);
    pts.push(`${n1(x + Math.cos(a) * rr)},${n1(y + Math.sin(a) * rr * 0.86)}`);
  }
  return `<g class="drift" style="animation-delay:${delay}s;transform-box:fill-box;transform-origin:center"><polygon points="${pts.join(" ")}" fill="url(#rockg)" filter="url(#rock)"/></g>`;
}

// ── banner: the homepage globe ──────────────────────────────────────────────

const world = JSON.parse(fs.readFileSync("node_modules/world-atlas/countries-110m.json", "utf8"));
const LAND = feature(world, world.objects.land);
const BORDERS = mesh(world, world.objects.countries, (a, b) => a !== b);

// [lon, lat], from SBH's heroGlobeEngine city list
const CITIES = [
  [-74.0, 40.7], [-87.6, 41.9], [-84.4, 33.7], [-79.4, 43.7], [-99.1, 19.4], [-74.1, 4.7],
  [-46.6, -23.5], [-58.4, -34.6], [-70.7, -33.4], [-9.1, 38.7], [-3.7, 40.4], [2.3, 48.9],
  [-0.1, 51.5], [-6.3, 53.3], [4.9, 52.4], [4.35, 50.85], [8.7, 50.1], [13.4, 52.5], [12.6, 55.7],
  [18.1, 59.3], [10.75, 59.9], [24.9, 60.2], [21.0, 52.2], [14.4, 50.1], [16.4, 48.2], [8.5, 47.4],
  [9.2, 45.5], [12.5, 41.9], [23.7, 38.0], [29.0, 41.0], [30.5, 50.5], [37.6, 55.75], [34.8, 32.1],
  [55.3, 25.2], [46.7, 24.7], [36.8, -1.3], [3.4, 6.5], [28.0, -26.2], [31.2, 30.0], [-43.2, -22.9],
  [-38.5, -12.97], [-34.9, -8.05], [-17.4, 14.7], [-7.6, 33.6], [10.2, 36.8], [-15.4, 28.1],
];
const HOME = [2.17, 41.39]; // Barcelona, the city the arcs leave from
const ROUTES = [[-74.0, 40.7], [-46.6, -23.5], [3.4, 6.5], [55.3, 25.2], [37.6, 55.75], [-0.1, 51.5], [-99.1, 19.4]];
const EXTRA = [[[-0.1, 51.5], [-74.0, 40.7]], [[8.7, 50.1], [36.8, -1.3]], [[-58.4, -34.6], [-9.1, 38.7]]];

function globe(d, { cx, cy, r, rotate }) {
  const proj = geoOrthographic().scale(r).translate([cx, cy]).rotate(rotate).clipAngle(90).precision(0.3);
  const path = geoPath(proj);
  const centre = [-rotate[0], -rotate[1]];
  const seen = (p, m = 0) => geoDistance(p, centre) < Math.PI / 2 - m;

  // Land as a dot matrix: equal-area spacing, fading toward the limb.
  const buckets = [[], [], []];
  for (let lat = -78; lat <= 80; lat += 2.1) {
    const step = 2.1 / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
    for (let lon = -180; lon < 180; lon += step) {
      const p = [lon, lat];
      if (!seen(p, 0.02) || !geoContains(LAND, p)) continue;
      const mu = Math.cos(geoDistance(p, centre));
      const [x, y] = proj(p);
      buckets[mu > 0.6 ? 0 : mu > 0.3 ? 1 : 2].push(`M${n1(x)} ${n1(y)}h0`);
    }
  }
  const dots = buckets.map((b, i) => `<path d="${b.join("")}" stroke="${C.coast}" stroke-opacity="${[0.62, 0.42, 0.22][i]}" stroke-width="${[1.7, 1.5, 1.2][i]}" stroke-linecap="round"/>`).join("");

  // Lifted great-circle arc: in an orthographic view, raising a point off the surface
  // by h is the same as scaling its offset from the centre by (1 + h).
  const arc = (a, b) => {
    const ip = geoInterpolate(a, b), dist = geoDistance(a, b), pts = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, [x, y] = proj(ip(t)), h = 1 + Math.sin(Math.PI * t) * (0.04 + dist * 0.16);
      pts.push(`${n1(cx + (x - cx) * h)} ${n1(cy + (y - cy) * h)}`);
    }
    return "M" + pts.join("L");
  };

  d.def(`<radialGradient id="atm" cx="${cx}" cy="${cy}" r="${r * 1.22}" gradientUnits="userSpaceOnUse"><stop offset="${(r * 0.97) / (r * 1.22)}" stop-color="${C.ice}" stop-opacity="0"/><stop offset="${r / (r * 1.22)}" stop-color="#7FA6E0" stop-opacity=".34"/><stop offset="${(r * 1.04) / (r * 1.22)}" stop-color="#4C6FA8" stop-opacity=".12"/><stop offset="1" stop-color="#4C6FA8" stop-opacity="0"/></radialGradient>
<radialGradient id="night" cx="${cx + r * 0.42}" cy="${cy - r * 0.5}" r="${r * 1.55}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".45" stop-color="#000" stop-opacity=".18"/><stop offset=".8" stop-color="#000" stop-opacity=".66"/><stop offset="1" stop-color="#000" stop-opacity=".8"/></radialGradient>
<linearGradient id="rim" x1="1" y1="0" x2=".2" y2=".8"><stop offset="0" stop-color="${C.ice}" stop-opacity=".9"/><stop offset=".5" stop-color="${C.ice}" stop-opacity=".18"/><stop offset="1" stop-color="${C.ice}" stop-opacity="0"/></linearGradient>
<clipPath id="disc"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`);

  const cities = CITIES.filter((p) => seen(p, 0.08)).map((p) => {
    const [x, y] = proj(p);
    return `<circle cx="${n1(x)}" cy="${n1(y)}" r="7" fill="url(#glg)"/><circle cx="${n1(x)}" cy="${n1(y)}" r="1.4" fill="${C.goldL}"/>`;
  }).join("");

  const routes = [...ROUTES.map((p) => [HOME, p]), ...EXTRA].filter(([a, b]) => seen(a) && seen(b));
  const arcs = routes.map(([a, b], i) => {
    const dd = arc(a, b);
    return `<path d="${dd}" pathLength="100" class="draw" style="animation-delay:${n1(0.6 + i * 0.18)}s" fill="none" stroke="${C.gold}" stroke-opacity=".38" stroke-width="1.1"/>` +
      `<path d="${dd}" pathLength="100" class="pk" style="animation-delay:${n1(1.8 + i * 0.47)}s;animation-duration:${n1(2.6 + (i % 3) * 0.7)}s" fill="none" stroke="${C.goldL}" stroke-width="2.2" stroke-linecap="round"/>`;
  }).join("");

  const [hx, hy] = proj(HOME);
  const lines = `<path d="${round(path(geoGraticule().step([15, 15])()))}" fill="none" stroke="#fff" stroke-opacity=".05" stroke-width=".8"/>`;
  const sphere = [
    `<circle cx="${cx}" cy="${cy}" r="${r * 1.22}" fill="url(#atm)"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.ground}"/>`,
    `<g clip-path="url(#disc)">`,
    `<path d="${round(path(LAND))}" fill="${C.land}" fill-opacity=".85"/>`,
    lines, dots,
    `<path d="${round(path(BORDERS))}" fill="none" stroke="${C.coast}" stroke-opacity=".14" stroke-width=".7"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#night)"/>`,
    cities,
    `</g>`,
    `<circle cx="${cx}" cy="${cy}" r="${r - 0.8}" fill="none" stroke="url(#rim)" stroke-width="1.6"/>`,
  ].join("\n");
  return { sphere, arcs, home: [hx, hy] };
}

// One tilted orbit. The back half is drawn behind the globe, the front half over it,
// and the satellite is masked out while it passes behind the disc.
function orbit(d, id, { cx, cy, r, rx, ry, tilt, dur, sats }) {
  const back = `M${-rx} 0A${rx} ${ry} 0 0 1 ${rx} 0`, front = `M${rx} 0A${rx} ${ry} 0 0 1 ${-rx} 0`;
  const full = `M${-rx} 0A${rx} ${ry} 0 1 1 ${rx} 0A${rx} ${ry} 0 1 1 ${-rx} 0`;
  const tf = `translate(${cx} ${cy}) rotate(${tilt})`;
  d.def(`<clipPath id="${id}c"><rect x="-3000" y="-3000" width="6000" height="3000" transform="${tf}"/></clipPath>
<mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${d.w}" height="${d.h}"><rect width="${d.w}" height="${d.h}" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="#000" clip-path="url(#${id}c)"/></mask>`);
  const ring = (p, a) => `<path d="${p}" transform="${tf}" fill="none" stroke="${C.ice}" stroke-opacity="${a}" stroke-width="1" stroke-dasharray="2 5"/>`;
  const s = Array.from({ length: sats }, (_, i) =>
    `<g transform="${tf}"><g><circle r="6" fill="url(#glw)"/><circle r="1.9" fill="#fff"/><animateMotion dur="${dur}s" begin="${n1((-dur * i) / sats)}s" repeatCount="indefinite" path="${full}"/></g></g>`).join("");
  return { back: ring(back, 0.18), front: ring(front, 0.32) + `<g mask="url(#${id}m)">${s}</g>` };
}

async function banner() {
  const W = 1280, H = 460;
  const d = new Doc(W, H, "Ferran Fabra, founder of SecureBusinessHub", {
    opsz: 144,
    css: `.home{transform-box:fill-box;transform-origin:center;animation:pulse 2.8s ease-out infinite}`,
  });
  const rnd = rng(20260731);
  skyDefs(d); rockDefs(d);
  const G = { cx: 990, cy: 278, r: 238 };
  const g = globe(d, { ...G, rotate: [16, -27] });
  const o1 = orbit(d, "o1", { ...G, rx: G.r * 1.36, ry: G.r * 0.24, tilt: -14, dur: 38, sats: 2 });
  const o2 = orbit(d, "o2", { ...G, rx: G.r * 1.2, ry: G.r * 0.46, tilt: 61, dur: 52, sats: 1 });

  d.def(`<clipPath id="frame"><rect width="${W}" height="${H}" rx="16"/></clipPath>
<linearGradient id="shade"><stop offset="0" stop-color="#030508" stop-opacity=".86"/><stop offset=".36" stop-color="#030508" stop-opacity=".42"/><stop offset=".56" stop-color="#030508" stop-opacity="0"/></linearGradient>
<radialGradient id="vig" cx=".62" cy=".5" r=".85"><stop offset=".55" stop-color="#020305" stop-opacity="0"/><stop offset="1" stop-color="#020305" stop-opacity=".8"/></radialGradient>
<radialGradient id="moonhalo"><stop offset=".55" stop-color="${C.ice}" stop-opacity=".16"/><stop offset="1" stop-color="${C.ice}" stop-opacity="0"/></radialGradient>
<radialGradient id="moonlit" cx=".68" cy=".28" r=".9"><stop offset="0" stop-color="#E9E5DC"/><stop offset=".5" stop-color="#9A958C"/><stop offset=".85" stop-color="#2E3034"/><stop offset="1" stop-color="#16181B"/></radialGradient>`);

  const M = { x: 1196, y: 66, r: 30 };
  const moon = `<circle cx="${M.x}" cy="${M.y}" r="${M.r * 1.9}" fill="url(#moonhalo)"/>
<circle cx="${M.x}" cy="${M.y}" r="${M.r}" fill="url(#moonlit)" filter="url(#rock)"/>
<g fill="#000" fill-opacity=".16"><circle cx="${M.x + 8}" cy="${M.y - 9}" r="5"/><circle cx="${M.x - 6}" cy="${M.y + 6}" r="7"/><circle cx="${M.x + 13}" cy="${M.y + 10}" r="3"/><circle cx="${M.x - 12}" cy="${M.y - 10}" r="2.4"/></g>`;

  // Copy block, left. Meta row is mono, so the separators can be placed exactly.
  const meta = ["CATALONIA, ES", "ASIR · CYBERSECURITY", "SECUREBUSINESSHUB.COM"];
  let mx = 72;
  const metaRow = meta.map((s, i) => {
    const out = d.t("cap", mx, 384, 14, s, `letter-spacing="1.1" fill="${INK(0.55)}"`) + (i < meta.length - 1 ? sparkle(mx + capW(s, 14, 1.1) + 20, 379, 4.5) : "");
    mx += capW(s, 14, 1.1) + 40;
    return out;
  }).join("");

  const [hx, hy] = g.home;
  d.add(
    `<g clip-path="url(#frame)">`,
    `<rect width="${W}" height="${H}" fill="${C.space}"/>`,
    nebula(d, "n1", { cx: 1010, cy: 120, rx: 420, ry: 200, rgb: [58, 90, 140], a: 0.75, freq: 0.0042, seed: 4 }),
    nebula(d, "n2", { cx: 560, cy: 470, rx: 520, ry: 170, rgb: [70, 104, 160], a: 0.5, freq: 0.006, seed: 9 }),
    nebula(d, "n3", { cx: 1220, cy: 420, rx: 260, ry: 180, rgb: [120, 96, 150], a: 0.32, freq: 0.007, seed: 21 }),
    starfield(rnd, W, H, 340),
    spike(1150, 186, 2.1, 46, 0, 5.5), spike(706, 58, 1.7, 32, 2.4, 6), spike(1246, 300, 1.3, 0, 1.8, 6.5),
    spike(612, 420, 1.4, 26, 3.1, 7), spike(1100, 430, 1.2, 0, 4, 5),
    moon,
    o1.back, o2.back,
    g.sphere,
    g.arcs,
    `<circle class="home" cx="${n1(hx)}" cy="${n1(hy)}" r="4" fill="none" stroke="${C.goldL}" stroke-width="1.4"/>`,
    `<circle cx="${n1(hx)}" cy="${n1(hy)}" r="3.4" fill="${C.goldL}" stroke="${C.space}" stroke-width="1"/>`,
    `<path d="M${n1(hx + 5)} ${n1(hy - 5)}L${n1(hx + 34)} ${n1(hy - 34)}H${n1(hx + 48)}" fill="none" stroke="${C.goldL}" stroke-opacity=".7"/>`,
    `<rect x="${n1(hx + 48)}" y="${n1(hy - 56)}" width="${n1(capW("41.4°N 2.2°E", 10, 0.9) + 20)}" height="42" rx="2" fill="${C.space}" fill-opacity=".82" stroke="${C.goldL}" stroke-opacity=".45"/>`,
    d.t("cap", hx + 58, hy - 37, 11, "CATALONIA", `letter-spacing="1.3" fill="${C.goldL}"`),
    d.t("cap", hx + 58, hy - 22, 10, "41.4°N 2.2°E", `letter-spacing="0.9" fill="${INK(0.55)}"`),
    o1.front, o2.front,
    meteor(rnd, 676, 392, 8, 0), meteor(rnd, 1252, 236, 5, 3), meteor(rnd, 742, 120, 3.6, 6),
    `<rect width="${W}" height="${H}" fill="url(#vig)"/>`,
    `<rect width="${W}" height="${H}" fill="url(#shade)"/>`,
    `</g>`,
    brackets(W, H, 22, 22),
    `<g class="up" style="animation-delay:.15s">${eyebrow(d, 72, 120, "Founder · SecureBusinessHub", 13)}</g>`,
    `<g class="up" style="animation-delay:.3s">${d.t("serif", 66, 222, 98, "Ferran Fabra", `letter-spacing="-3.6" fill="${C.ink}"`)}</g>`,
    `<g class="up" style="animation-delay:.5s">`,
    d.t("sans", 72, 280, 23, "I write security guides and build free tools for", `fill="${INK(0.76)}"`),
    d.t("sans", 72, 313, 23, "small businesses that don't have an IT department.", `fill="${INK(0.76)}"`),
    `</g>`,
    `<line x1="72" y1="346" x2="660" y2="346" stroke="${INK(0.12)}"/>`,
    `<g class="up" style="animation-delay:.7s">${metaRow}</g>`,
  );
  await d.write("banner.svg");
}

// ── link pills ──────────────────────────────────────────────────────────────

async function pill(name, label, primary = false) {
  const size = 12, ls = 1.3, h = 40;
  const tw = capW(label, size, ls);
  const w = Math.ceil(18 + 10 + 12 + tw + 18 + (primary ? 20 : 0));
  const d = new Doc(w, h, label);
  const fg = primary ? C.space : C.ink;
  d.add(
    `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="3" fill="${primary ? C.gold : C.ground}" stroke="${primary ? C.goldL : "rgba(201,143,44,.5)"}" stroke-opacity="${primary ? 0.6 : 1}"/>`,
    sparkle(23, h / 2, 5, primary ? C.space : C.gold),
    d.t("cap", 40, h / 2 + size * 0.36, size, label, `letter-spacing="${ls}" fill="${fg}"`),
    primary ? `<path d="M${w - 30} ${h / 2 + 4}l8-8m-6 0h6v6" fill="none" stroke="${fg}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` : "",
  );
  await d.write(`nav/${name}.svg`);
}

// ── flight log ──────────────────────────────────────────────────────────────

async function log() {
  const W = 900, H = 440;
  const d = new Doc(W, H, "Flight log: Ferran Fabra's role, what has shipped so far, and what comes next", {
    css: `.ring{transform-box:fill-box;transform-origin:center;animation:pulse 2.6s ease-out infinite}`,
  });
  const rnd = rng(77);
  skyDefs(d); rockDefs(d);
  d.def(`<clipPath id="frame"><rect width="${W}" height="${H}" rx="14"/></clipPath>
<radialGradient id="pl" cx=".7" cy=".26" r=".9"><stop offset="0" stop-color="#6F8FBF"/><stop offset=".45" stop-color="#2C4268"/><stop offset=".9" stop-color="#0C1420"/></radialGradient>
<linearGradient id="fade" x1="0" x2="1"><stop offset=".45" stop-color="#030508" stop-opacity=".7"/><stop offset=".8" stop-color="#030508" stop-opacity="0"/></linearGradient>
<clipPath id="pdisc"><circle cx="806" cy="${H + 6}" r="92"/></clipPath>
<clipPath id="pfront"><rect x="0" y="${H - 34}" width="${W}" height="200" transform="rotate(-12 806 ${H - 20})"/></clipPath>`);

  const rows = [
    ["Role", "Solo founder and developer of SecureBusinessHub", "done"],
    ["Readers", "Small businesses where security is somebody's side job", "done"],
    ["Shipped", "6 free security tools, a 228-term glossary, the Starter Kit", "done"],
    ["Runs on", "React and TypeScript on Cloudflare Workers, D1 and R2", "done"],
    ["Studying", "ASIR degree, cybersecurity track: Cisco, Linux, Windows Server", "now"],
    ["Speaks", "Català, Español, English", "done"],
    ["Next", "Offensive security", "next"],
  ];
  const top = 122, gap = 42, tx = 58;
  const marks = rows.map(([k, v, s], i) => {
    const y = top + i * gap, delay = n1(0.3 + i * 0.22);
    const mark =
      s === "done" ? `<circle cx="${tx}" cy="${y - 5}" r="8" fill="url(#glg)"/><circle cx="${tx}" cy="${y - 5}" r="3.6" fill="${C.gold}"/>`
      : s === "now" ? `<circle class="ring" cx="${tx}" cy="${y - 5}" r="4" fill="none" stroke="${C.goldL}"/><circle cx="${tx}" cy="${y - 5}" r="4.4" fill="${C.space}" stroke="${C.goldL}" stroke-width="1.6"/><circle cx="${tx}" cy="${y - 5}" r="1.8" fill="${C.goldL}"/>`
      : `<g class="tw">${sparkle(tx, y - 5, 8, C.goldL)}</g>`;
    return `<g class="up" style="animation-delay:${delay}s">${mark}` +
      d.t("cap", 88, y, 11, k.toUpperCase(), `letter-spacing="1.3" fill="${s === "next" ? C.goldL : INK(0.5)}"`) +
      d.t(s === "next" ? "sansb" : "sans", 210, y, 16, v, `fill="${s === "next" ? C.goldL : INK(0.9)}"`) + `</g>`;
  }).join("\n");

  const now = top + 4 * gap - 5, nxt = top + 6 * gap - 5;
  const P = { x: 806, y: H + 6, r: 92 };
  d.add(
    `<g clip-path="url(#frame)">`,
    `<rect width="${W}" height="${H}" fill="${C.space}"/>`,
    nebula(d, "n1", { cx: 760, cy: 160, rx: 300, ry: 200, rgb: [58, 90, 140], a: 0.6, freq: 0.006, seed: 5 }),
    starfield(rnd, W, H, 190, { minA: 0.15 }),
    spike(842, 110, 1.8, 34, 0.5), spike(560, 404, 1.2, 0, 2), spike(724, 70, 1.3, 22, 3.3),
    // destination planet, rings behind and in front
    `<ellipse cx="${P.x}" cy="${P.y - 14}" rx="${P.r * 1.75}" ry="${P.r * 0.3}" transform="rotate(-12 ${P.x} ${P.y - 14})" fill="none" stroke="${C.goldL}" stroke-opacity=".22" stroke-width="5"/>`,
    `<circle cx="${P.x}" cy="${P.y}" r="${P.r}" fill="url(#pl)"/>`,
    `<g clip-path="url(#pdisc)" transform="rotate(-12 ${P.x} ${P.y})">${[-62, -40, -22, -6, 14].map((dy, i) => `<ellipse cx="${P.x}" cy="${P.y + dy}" rx="${P.r * 1.3}" ry="${[5, 9, 4, 7, 10][i]}" fill="${i % 2 ? C.ice : "#0C1420"}" fill-opacity="${i % 2 ? 0.1 : 0.22}"/>`).join("")}</g>`,
    `<circle cx="${P.x}" cy="${P.y}" r="${P.r - 1}" fill="none" stroke="${C.ice}" stroke-opacity=".35"/>`,
    `<ellipse cx="${P.x}" cy="${P.y - 14}" rx="${P.r * 1.75}" ry="${P.r * 0.3}" transform="rotate(-12 ${P.x} ${P.y - 14})" fill="none" stroke="${C.goldL}" stroke-opacity=".5" stroke-width="5" clip-path="url(#pfront)"/>`,
    meteor(rnd, 640, 66, 4.5, 1),
    `<rect width="${W}" height="${H}" fill="url(#fade)"/>`,
    `</g>`,
    `<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="13.5" fill="none" stroke="${INK(0.1)}" stroke-width="1.5"/>`,
    eyebrow(d, 40, 54, "Flight log"),
    d.t("cap", W - 40, 54, 11, "FERRII · CATALONIA, ES", `text-anchor="end" letter-spacing="1.3" fill="${INK(0.45)}"`),
    `<line x1="40" y1="78" x2="${W - 40}" y2="78" stroke="${INK(0.08)}"/>`,
    // trajectory: flown (solid), current leg (thin), still ahead (dashed)
    `<line x1="${tx}" y1="${top - 5}" x2="${tx}" y2="${now}" stroke="${C.gold}" stroke-opacity=".55" stroke-width="1.5" pathLength="100" class="draw" style="animation-delay:.2s"/>`,
    `<line x1="${tx}" y1="${now}" x2="${tx}" y2="${nxt}" stroke="${C.goldL}" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="3 6"/>`,
    marks,
  );
  await d.write("log.svg");
}

// ── SBH tool constellation ──────────────────────────────────────────────────

async function constellation() {
  const W = 900, H = 330;
  const d = new Doc(W, H, "SecureBusinessHub's six free tools, drawn as a constellation", {
    opsz: 72,
    css: `.ping,.flare{opacity:0;transform-box:fill-box;transform-origin:center;animation:ping 9s ease-out infinite}
.flare{animation-name:flare}
.pan{animation:pan 34s ease-in-out infinite alternate}
@keyframes ping{0%{opacity:.95;transform:scale(.6)}12%{opacity:0;transform:scale(3.2)}100%{opacity:0}}
@keyframes flare{0%{opacity:1}16%,100%{opacity:0}}
@keyframes pan{from{transform:translate(0,0)}to{transform:translate(-22px,8px)}}`,
  });
  const rnd = rng(606);
  skyDefs(d);
  d.def(`<clipPath id="frame"><rect width="${W}" height="${H}" rx="14"/></clipPath>
<linearGradient id="fade" x1="0" x2="1"><stop offset=".25" stop-color="#030508" stop-opacity=".8"/><stop offset=".5" stop-color="#030508" stop-opacity="0"/></linearGradient>`);
  // [x, y, label, label dx, label dy, anchor]
  const S = [
    [486, 128, "SPOOFING CHECK", 0, 30, "middle"],
    [580, 72, "LOOKALIKE DOMAINS", 0, -20, "middle"],
    [672, 150, "EXPOSURE CHECK", -16, 30, "end"],
    [780, 92, "BASELINE CHECK", 0, -20, "middle"],
    [818, 214, "HEADER ANALYZER", 0, 30, "middle"],
    [660, 262, "BREACH CLOCK", 0, 30, "middle"],
  ];
  const E = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 2]];
  // One path through every edge in order. The pulse's head reaches a star at
  // time T * (share of the path walked so far), so each flare is scheduled from that.
  const route = [0, 1, 2, 3, 4, 5, 2], T = 9, START = 2.6;
  let walked = 0;
  const at = route.map((k, i) => (i ? (walked += Math.hypot(S[k][0] - S[route[i - 1]][0], S[k][1] - S[route[i - 1]][1])) : 0));
  const pulsePath = "M" + route.map((k) => `${S[k][0]} ${S[k][1]}`).join("L");
  const pulse = `<path d="${pulsePath}" pathLength="100" class="pk" style="animation-duration:${T}s;animation-delay:${START}s" fill="none" stroke="${C.goldL}" stroke-width="2.4" stroke-linecap="round"/>`;
  const flares = route.map((k, i) => {
    const delay = n1(START + (T * (at[i] / walked) * 100) / 106);
    return `<circle class="flare" style="animation-delay:${delay}s" cx="${S[k][0]}" cy="${S[k][1]}" r="16" fill="url(#glg)"/>` +
      `<circle class="ping" style="animation-delay:${delay}s" cx="${S[k][0]}" cy="${S[k][1]}" r="5" fill="none" stroke="${C.goldL}" stroke-width="1.2"/>`;
  }).join("");
  const lines = E.map(([a, b], i) =>
    `<line x1="${S[a][0]}" y1="${S[a][1]}" x2="${S[b][0]}" y2="${S[b][1]}" pathLength="100" class="draw" style="animation-delay:${n1(0.4 + i * 0.25)}s" stroke="${C.ice}" stroke-opacity=".4" stroke-width="1"/>`).join("");
  const stars = S.map(([x, y, label, dx, dy, anchor], i) =>
    spike(x, y, 2.3, 40, n1(i * 0.9), 5 + (i % 3)) +
    d.t("cap", x + dx, y + dy, 10, `0${i + 1}`, `text-anchor="${anchor}" letter-spacing="1.1" fill="${C.gold}" dy="-13"`) +
    d.t("cap", x + dx, y + dy, 11, label, `text-anchor="${anchor}" letter-spacing="1.1" fill="${INK(0.82)}"`)).join("\n");

  d.add(
    `<g clip-path="url(#frame)">`,
    `<rect width="${W}" height="${H}" fill="${C.space}"/>`,
    nebula(d, "n1", { cx: 680, cy: 170, rx: 300, ry: 190, rgb: [58, 90, 140], a: 0.8, freq: 0.006, seed: 12 }),
    nebula(d, "n2", { cx: 860, cy: 300, rx: 200, ry: 120, rgb: [120, 96, 150], a: 0.3, freq: 0.008, seed: 3 }),
    `<g class="pan">${starfield(rnd, W, H, 290, { minA: 0.15, box: [-30, -30, W + 30, H + 30] })}</g>`,
    `<rect width="${W}" height="${H}" fill="url(#fade)"/>`,
    lines, flares, pulse, stars,
    `</g>`,
    `<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="13.5" fill="none" stroke="${INK(0.1)}" stroke-width="1.5"/>`,
    eyebrow(d, 40, 62, "securebusinesshub.com"),
    d.t("serif", 38, 128, 44, "SecureBusinessHub", `letter-spacing="-1.4" fill="${C.ink}"`),
    d.t("sans", 40, 170, 16, "Security guides and free checks for", `fill="${INK(0.74)}"`),
    d.t("sans", 40, 194, 16, "businesses with no security team.", `fill="${INK(0.74)}"`),
    d.t("serif", 38, 262, 40, "6", `fill="${C.gold}"`),
    d.t("cap", 72, 248, 10, "FREE TOOLS", `letter-spacing="1.1" fill="${INK(0.55)}"`),
    d.t("cap", 72, 263, 10, "NO SIGN-UP", `letter-spacing="1.1" fill="${INK(0.55)}"`),
    `<line x1="186" y1="232" x2="186" y2="268" stroke="${INK(0.14)}"/>`,
    d.t("serif", 208, 262, 40, "228", `fill="${C.gold}"`),
    d.t("cap", 290, 248, 10, "GLOSSARY", `letter-spacing="1.1" fill="${INK(0.55)}"`),
    d.t("cap", 290, 263, 10, "TERMS", `letter-spacing="1.1" fill="${INK(0.55)}"`),
  );
  await d.write("sbh.svg");
}

// ── request path diagram ────────────────────────────────────────────────────

async function stack() {
  const W = 900, H = 340;
  const d = new Doc(W, H, "How SecureBusinessHub is built: a Cloudflare Worker renders pages from D1, serves downloads from R2, runs the chatbot on Workers AI, and takes payments through Stripe");
  const rnd = rng(31337);
  skyDefs(d);
  d.def(`<clipPath id="frame"><rect width="${W}" height="${H}" rx="14"/></clipPath>
<radialGradient id="hub" cx=".64" cy=".32" r=".9"><stop offset="0" stop-color="${C.goldL}"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="#5A3C0E"/></radialGradient>
<radialGradient id="node" cx=".64" cy=".32" r=".9"><stop offset="0" stop-color="#8FB0DD"/><stop offset=".55" stop-color="#2C4268"/><stop offset="1" stop-color="#0C1420"/></radialGradient>`);

  const hub = [430, 176];
  // [x, y, title, note, label side]
  const N = {
    visitor: [118, 176, "VISITOR", "Pagefind search runs in the browser", "below"],
    build: [430, 62, "VITE BUILD", "React · TypeScript · Tailwind", "right"],
    stripe: [430, 292, "STRIPE CHECKOUT", "payment, then a download token", "right"],
    d1: [690, 86, "D1", "articles and tool data", "right"],
    r2: [690, 176, "R2", "Starter Kit files", "right"],
    ai: [690, 266, "WORKERS AI", "the site chatbot", "right"],
  };
  const curve = ([x1, y1], [x2, y2]) => {
    const mx = (x1 + x2) / 2;
    return x1 === x2 ? `M${x1} ${y1}L${x2} ${y2}` : `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
  };
  const links = Object.entries(N).map(([k, [x, y]], i) => {
    const p = k === "visitor" ? curve([x, y], hub) : curve(hub, [x, y]);
    const col = k === "visitor" || k === "stripe" ? C.gold : C.ice;
    return `<path d="${p}" pathLength="100" class="draw" style="animation-delay:${n1(0.3 + i * 0.2)}s" fill="none" stroke="${col}" stroke-opacity=".4" stroke-width="1.2"/>` +
      `<path d="${p}" pathLength="100" class="pk" style="animation-delay:${n1(1.6 + i * 0.55)}s;animation-duration:${n1(2.4 + (i % 3) * 0.6)}s" fill="none" stroke="${col === C.gold ? C.goldL : "#fff"}" stroke-width="2" stroke-linecap="round"/>`;
  }).join("\n");

  const nodes = Object.values(N).map(([x, y, title, note, side]) => {
    const lx = side === "right" ? x + 26 : x, anchor = side === "right" ? "start" : "middle";
    const ly = side === "right" ? y - 3 : y + 38;
    return `<circle cx="${x}" cy="${y}" r="22" fill="url(#glw)"/><circle cx="${x}" cy="${y}" r="10" fill="url(#node)"/><circle cx="${x}" cy="${y}" r="10" fill="none" stroke="${C.ice}" stroke-opacity=".5"/>` +
      d.t("cap", lx, ly, 11, title, `text-anchor="${anchor}" letter-spacing="1.2" fill="${C.ink}"`) +
      d.t("sans", lx, ly + 18, 13, note, `text-anchor="${anchor}" fill="${INK(0.6)}"`);
  }).join("\n");

  const [hx, hy] = hub;
  d.add(
    `<g clip-path="url(#frame)">`,
    `<rect width="${W}" height="${H}" fill="${C.space}"/>`,
    nebula(d, "n1", { cx: 430, cy: 180, rx: 340, ry: 170, rgb: [58, 90, 140], a: 0.55, freq: 0.006, seed: 8 }),
    starfield(rnd, W, H, 200, { minA: 0.12 }),
    spike(860, 40, 1.6, 30, 1), spike(250, 300, 1.3, 0, 3),
    `</g>`,
    `<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="13.5" fill="none" stroke="${INK(0.1)}" stroke-width="1.5"/>`,
    eyebrow(d, 40, 50, "Request path"),
    links,
    // the Worker: a small amber star with an orbit
    `<circle cx="${hx}" cy="${hy}" r="60" fill="url(#glg)"/>`,
    `<ellipse cx="${hx}" cy="${hy}" rx="44" ry="13" transform="rotate(-18 ${hx} ${hy})" fill="none" stroke="${C.goldL}" stroke-opacity=".45" stroke-dasharray="2 4"/>`,
    `<circle cx="${hx}" cy="${hy}" r="17" fill="url(#hub)"/>`,
    `<g transform="translate(${hx} ${hy}) rotate(-18)"><circle r="2.4" fill="#fff"><animateMotion dur="9s" repeatCount="indefinite" path="M-44 0A44 13 0 1 1 44 0A44 13 0 1 1 -44 0"/></circle></g>`,
    d.t("cap", hx - 30, hy - 66, 11, "CLOUDFLARE WORKER", `text-anchor="end" letter-spacing="1.2" fill="${C.goldL}"`),
    d.t("sans", hx - 30, hy - 48, 13, "renders every page", `text-anchor="end" fill="${INK(0.6)}"`),
    d.t("sans", hx - 30, hy - 31, 13, "with HTMLRewriter", `text-anchor="end" fill="${INK(0.6)}"`),
    nodes,
  );
  await d.write("stack.svg");
}

// ── guide cards ─────────────────────────────────────────────────────────────

// Each guide's icon drawn as a constellation: [points], [segments as index pairs].
const ring = (n, r, a0 = -Math.PI / 2) => Array.from({ length: n }, (_, i) => [Math.cos(a0 + (i / n) * Math.PI * 2) * r, Math.sin(a0 + (i / n) * Math.PI * 2) * r]);
const chain = (from, to) => Array.from({ length: to - from }, (_, i) => [from + i, from + i + 1]);

const ICONS = {
  lock: () => {
    const shackle = Array.from({ length: 7 }, (_, i) => { const a = Math.PI + (i / 6) * Math.PI; return [Math.cos(a) * 24, -24 + Math.sin(a) * 24]; });
    const pts = [[-24, -2], ...shackle, [24, -2], [-38, -2], [38, -2], [38, 46], [-38, 46], [0, 16], [0, 30]];
    const segs = [...chain(0, 8), [9, 10], [10, 11], [11, 12], [12, 9], [13, 14]];
    return { pts, segs, anim: [0, 9], cls: "shackle" };
  },
  policy: () => {
    const pts = [[-34, -48], [16, -48], [34, -30], [34, 48], [-34, 48], [16, -30], [-20, -22], [8, -22], [-20, -6], [20, -6], [-20, 10], [20, 10]];
    const segs = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 5], [5, 2], [6, 7], [8, 9], [10, 11]];
    return { pts, segs };
  },
  voice: () => {
    const hs = [14, 30, 50, 70, 86, 70, 50, 30, 14];
    const pts = [], segs = [];
    hs.forEach((h, i) => { const x = -60 + i * 15; pts.push([x, -h / 2], [x, h / 2]); segs.push([i * 2, i * 2 + 1]); });
    return { pts, segs, bars: true };
  },
  clock: () => {
    const pts = [...ring(12, 50), [0, 0], [0, -34], [24, 0]];
    const segs = [...chain(0, 11), [11, 0], [12, 13], [12, 14]];
    return { pts, segs, hands: [12, 13, 14] };
  },
  hook: () => {
    const pts = [[6, -56], [6, 6], [4, 22], [-6, 34], [-20, 36], [-32, 26], [-34, 12], [-24, 20], [6, -56]];
    const segs = [...chain(0, 6), [6, 7]];
    return { pts: pts.slice(0, 8), segs, cls: "bait" };
  },
  laptop: () => {
    const pts = [[-42, -38], [42, -38], [42, 18], [-42, 18], [-54, 30], [54, 30], [-6, -16], [6, -16], [6, -4], [0, 2], [0, 8]];
    const segs = [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 2], [6, 7], [7, 8], [8, 9], [9, 10]];
    return { pts, segs, ghost: true };
  },
};

const GUIDES = [
  { file: "01-ransomware", tag: "Ransomware", title: ["The Ransomware", "Survival Guide"], hook: ["The first hours after it hits, and why", "paying is usually the wrong call."], icon: "lock", rgb: [58, 90, 140], seed: 1 },
  { file: "02-insurance", tag: "Cyber insurance", title: ["Why Your Cyber", "Insurance Was Denied"], hook: ["The questionnaire used to be one page.", "What insurers check before they pay."], icon: "policy", stamp: true, rgb: [96, 80, 140], seed: 2 },
  { file: "03-deepfake", tag: "Deepfakes", title: ["The Voice of", "Your CEO?"], hook: ["A voice note that sounds like your boss,", "in a hurry, asking for money."], icon: "voice", rgb: [58, 110, 150], seed: 3 },
  { file: "04-nis2-gdpr", tag: "Compliance", title: ["NIS2 and GDPR", "for Small Business"], hook: ["Which parts reach a small company, and", "the supplier questions that come with it."], icon: "clock", rgb: [70, 96, 150], seed: 4 },
  { file: "05-social", tag: "Social engineering", title: ["Hacking", "the Human"], hook: ["You can't patch a person. A toolkit for", "teaching your team what to look for."], icon: "hook", rgb: [80, 90, 150], seed: 5 },
  { file: "06-shadowit", tag: "Remote work", title: ["Shadow IT in a", "Remote Team"], hook: ["The apps and devices your staff use", "without telling anyone."], icon: "laptop", rgb: [58, 96, 130], seed: 6 },
];

async function guide(gd, i) {
  const W = 600, H = 220;
  const d = new Doc(W, H, gd.title.join(" "), {
    opsz: 36,
    css: `.shackle{animation:shackle 3.4s ease-in-out infinite}
.bait{animation:bob 3s ease-in-out infinite}
.bar{transform-box:fill-box;transform-origin:center;animation:talk 1.1s ease-in-out infinite}
.hand{transform-origin:490px 108px;animation:spin 12s linear infinite}
.stamp{transform-box:fill-box;transform-origin:center;animation:stamp 4.2s ease-out infinite}
.ghost{animation:glitch 2.8s steps(1) infinite}
.grow{transform-box:fill-box;transform-origin:left;animation:grow 1.2s .3s ease-out both}
@keyframes shackle{0%,40%,100%{transform:translateY(0)}55%,85%{transform:translateY(-10px)}}
@keyframes bob{0%,100%{transform:translateY(-4px)}50%{transform:translateY(5px)}}
@keyframes talk{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.45)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes stamp{0%,12%{opacity:0;transform:rotate(-14deg) scale(1.8)}22%{opacity:1;transform:rotate(-14deg) scale(.95)}28%,82%{opacity:1;transform:rotate(-14deg) scale(1)}95%,100%{opacity:0;transform:rotate(-14deg) scale(1)}}
@keyframes glitch{0%,100%{transform:translate(7px,7px)}40%{transform:translate(12px,4px)}44%{transform:translate(3px,9px)}48%{transform:translate(7px,7px)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}`,
  });
  const rnd = rng(1000 + gd.seed * 97);
  skyDefs(d);
  d.def(`<clipPath id="frame"><rect width="${W}" height="${H}" rx="14"/></clipPath>
<linearGradient id="fade" x1="0" x2="1"><stop offset=".3" stop-color="#030508" stop-opacity=".72"/><stop offset=".62" stop-color="#030508" stop-opacity="0"/></linearGradient>`);

  const ox = 490, oy = 108, ic = ICONS[gd.icon]();
  const P = ic.pts.map(([x, y]) => [ox + x, oy + y]);
  const seg = ([a, b], k) => `<line x1="${n1(P[a][0])}" y1="${n1(P[a][1])}" x2="${n1(P[b][0])}" y2="${n1(P[b][1])}" pathLength="100" class="draw" style="animation-delay:${n1(0.3 + k * 0.09)}s" stroke="${C.ice}" stroke-opacity=".5" stroke-width="1.1" stroke-linecap="round"/>`;
  const dot = ([x, y], k, big) => big
    ? spike(x, y, 1.9, 22, n1((k * 0.7) % 5), 5)
    : `<circle cx="${n1(x)}" cy="${n1(y)}" r="5" fill="url(#glw)"/><circle cx="${n1(x)}" cy="${n1(y)}" r="1.6" fill="#fff"/>`;

  let icon;
  if (ic.bars) {
    icon = ic.segs.map(([a, b], k) =>
      `<g class="bar" style="animation-delay:${n1(k * 0.12)}s">${seg([a, b], k)}${dot(P[a], k)}${dot(P[b], k)}</g>`).join("");
  } else if (ic.hands) {
    const [c, h1, h2] = ic.hands;
    const face = ic.segs.filter(([a, b]) => a < 12 && b < 12);
    icon = face.map(seg).join("") + P.slice(0, 12).map((p, k) => dot(p, k, k % 3 === 0)).join("") +
      seg([c, h2], 13) + `<g class="hand">${seg([c, h1], 12)}${dot(P[h1], 1)}</g>` + dot(P[c], 0, true) +
      d.t("cap", ox, oy + 30, 13, "72H", `text-anchor="middle" letter-spacing="1.1" fill="${C.goldL}"`);
  } else {
    const [s0, s1] = ic.anim || [0, 0];
    const moving = ic.segs.filter(([a, b]) => a >= s0 && b < s1 && b >= s0);
    const still = ic.segs.filter((s) => !moving.includes(s));
    const moveDots = P.map((p, k) => (k >= s0 && k < s1 ? dot(p, k, k === s0 + 4) : "")).join("");
    const stillDots = P.map((p, k) => (k >= s0 && k < s1 ? "" : dot(p, k, k === P.length - 1 || k === 1))).join("");
    const shape = `${still.map(seg).join("")}${stillDots}${moving.length ? `<g class="${ic.cls}">${moving.map(seg).join("")}${moveDots}</g>` : ""}`;
    icon = ic.cls === "bait" ? `<g class="bait">${shape}</g>` : shape;
    if (ic.ghost) icon = `<g class="ghost" opacity=".32">${ic.segs.map(([a, b]) => `<line x1="${n1(P[a][0])}" y1="${n1(P[a][1])}" x2="${n1(P[b][0])}" y2="${n1(P[b][1])}" stroke="${C.ice}" stroke-dasharray="3 4"/>`).join("")}</g>` + icon;
  }
  if (gd.stamp) icon += `<g class="stamp"><rect x="${ox - 44}" y="${oy + 6}" width="88" height="28" rx="3" fill="${C.space}" fill-opacity=".6" stroke="${C.danger}" stroke-width="2.2"/>${d.t("cap", ox, oy + 26, 15, "DENIED", `text-anchor="middle" letter-spacing="1.7" fill="${C.danger}"`)}</g>`;

  d.add(
    `<g clip-path="url(#frame)">`,
    `<rect width="${W}" height="${H}" fill="${C.space}"/>`,
    nebula(d, "n1", { cx: 480, cy: 100, rx: 220, ry: 150, rgb: gd.rgb, a: 0.8, freq: 0.008, seed: gd.seed * 7 }),
    starfield(rnd, W, H, 120, { minA: 0.15 }),
    `<rect width="${W}" height="${H}" fill="url(#fade)"/>`,
    `<circle cx="${ox}" cy="${oy}" r="74" fill="none" stroke="${INK(0.06)}"/>`,
    icon,
    `<rect class="grow" x="0" y="${H - 4}" width="${W}" height="4" fill="${C.gold}"/>`,
    `</g>`,
    `<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="13.5" fill="none" stroke="${INK(0.1)}" stroke-width="1.5"/>`,
    `<g class="up" style="animation-delay:${n1(i * 0.08)}s">`,
    eyebrow(d, 32, 44, `Guide · ${gd.tag}`, 11),
    d.t("serif", 31, 92, 29, gd.title[0], `letter-spacing="-.6" fill="${C.ink}"`),
    d.t("serif", 31, 126, 29, gd.title[1], `letter-spacing="-.6" fill="${C.ink}"`),
    d.t("sans", 32, 166, 14, gd.hook[0], `fill="${INK(0.66)}"`),
    d.t("sans", 32, 186, 14, gd.hook[1], `fill="${INK(0.66)}"`),
    `</g>`,
    `<path d="M${W - 38} 40l10-10m-8 0h8v8" fill="none" stroke="${C.gold}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  await d.write(`guides/${gd.file}.svg`);
}

const WRITTEN = new Map();
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(`${OUT}/nav`, { recursive: true });
fs.mkdirSync(`${OUT}/guides`, { recursive: true });
await banner();
await pill("site", "SECUREBUSINESSHUB.COM", true);
await pill("tools", "FREE TOOLS");
await pill("kit", "STARTER KIT");
await pill("glossary", "GLOSSARY");
await pill("contact", "CONTACT");
await log();
await constellation();
await stack();
for (const [i, g] of GUIDES.entries()) await guide(g, i);

// Point the README at the freshly hashed files.
const readme = fs.readFileSync("README.md", "utf8").replace(/\.\/assets\/([\w/-]+?)(?:\.[0-9a-f]{8})?\.svg/g, (m, base) => {
  const file = WRITTEN.get(`${base}.svg`);
  if (!file) throw new Error(`README links ${m}, which the build no longer makes`);
  return `./assets/${file}`;
});
fs.writeFileSync("README.md", readme);
