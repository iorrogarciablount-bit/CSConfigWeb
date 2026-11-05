// Genera las imágenes de vista previa (og:image) que salen al compartir el enlace
// de un pro en Discord, Twitter, WhatsApp...
//
//   site/og/<slug>.jpg     una por pro (1200x630)
//   site/og/default.jpg    la de la web y de los jugadores que no son pros
//   site/og/index.json     { slug: versión } -> la página usa ?v=versión para que
//                          Discord no enseñe una imagen vieja tras un cambio de mira
//
// Dibuja con el mismo crosshair.js que la web, así que la mira es idéntica.
// Solo rehace las imágenes cuya mira ha cambiado. Uso: node pipeline/og/og.mjs

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { XH, proSlugs, createCanvas, ROOT, W, H, C, STYLES, decode, shown, fitText, brand, preview } from "./draw.mjs";

const OUT = join(ROOT, "site", "og");
const STYLE_VERSION = "1";   // súbelo si cambias el diseño, para regenerar todas

function card(r, n) {
  const cv = createCanvas(W, H), ctx = cv.getContext("2d");
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.accent; ctx.fillRect(0, H - 8, W, 8);

  const P = 40, S = H - 2 * P - 8;               // cuadrado de la vista previa
  preview(ctx, n, P, P, S);

  const x = P + S + 48, maxW = W - x - P;
  brand(ctx, x, P + 34);

  ctx.fillStyle = C.muted; ctx.font = "700 26px RobotoCondensed";
  ctx.fillText("MIRA DE CS2", x, 180);

  const size = fitText(ctx, r.name, maxW, 96, 700, "RobotoCondensed");
  ctx.fillStyle = C.ink; ctx.fillText(r.name, x, 180 + size * 0.95);
  let yy = 180 + size * 0.95 + 46;
  const team = r.status === "retired" ? "Retirado" : r.team || "";
  if (team) { fitText(ctx, team, maxW, 34, 600, "RobotoCondensed"); ctx.fillStyle = C.muted; ctx.fillText(team, x, yy); yy += 20; }

  // valores principales
  yy += 44;
  const specs = [["LARGO", n.length], ["SEPARACIÓN", n.gap], ["GROSOR", n.thickness]];
  let sx = x;
  for (const [k, v] of specs) {
    ctx.fillStyle = C.muted; ctx.font = "700 18px RobotoCondensed"; ctx.fillText(k, sx, yy);
    ctx.fillStyle = C.ink; ctx.font = "700 44px RobotoMono"; ctx.fillText(String(v), sx, yy + 46);
    sx += Math.max(ctx.measureText(String(v)).width, 90) + 40;
  }
  ctx.fillStyle = `rgb(${n.r},${n.g},${n.b})`; ctx.fillRect(sx, yy + 12, 36, 36);
  ctx.strokeStyle = "#0008"; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, yy + 13, 34, 34);

  // estilo y código
  ctx.fillStyle = C.muted; ctx.font = "500 22px RobotoCondensed";
  ctx.fillText((STYLES[n.style] || `Estilo ${n.style}`).toUpperCase() + (n.dot ? " · CON PUNTO" : ""), x, yy + 92);
  const code = shown(r.code, n);
  fitText(ctx, code, maxW, 24, 500, "RobotoMono");
  ctx.fillStyle = C.accent; ctx.fillText(code, x, H - P - 22);
  return cv;
}

function defaultCard(sample) {
  const cv = createCanvas(W, H), ctx = cv.getContext("2d");
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.accent; ctx.fillRect(0, H - 8, W, 8);
  const P = 40, S = H - 2 * P - 8;
  if (sample) preview(ctx, sample, P, P, S, 1);
  const x = sample ? P + S + 48 : 90, maxW = W - x - P;
  brand(ctx, x, 120);
  ctx.fillStyle = C.ink;
  fitText(ctx, "MIRAS DE CS2", maxW, 92, 700, "RobotoCondensed"); ctx.fillText("MIRAS DE CS2", x, 260);
  ctx.fillStyle = C.muted; ctx.font = "500 32px RobotoCondensed";
  ["De pros y de cualquier jugador,", "sacadas de demos de partidas reales.", "Copia el código e impórtalo."]
    .forEach((l, i) => ctx.fillText(l, x, 330 + i * 46));
  return cv;
}

const save = (cv, file) => writeFileSync(file, cv.toBuffer("image/jpeg", 88));
const version = code => createHash("sha1").update(STYLE_VERSION + code).digest("hex").slice(0, 10);

const pros = JSON.parse(readFileSync(join(ROOT, "site", "data", "pros.json"), "utf8")).players || [];
const slugs = proSlugs(pros);
mkdirSync(OUT, { recursive: true });
const manifestPath = join(OUT, "index.json");
const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const manifest = {};
let made = 0;

for (const r of pros) {
  const n = decode(r.code), slug = slugs.get(r.id);
  if (!n || !slug) continue;
  const v = version(`${r.code}|${r.name}|${r.team || ""}|${r.status || ""}`);
  manifest[slug] = v;
  if (old[slug] === v && existsSync(join(OUT, `${slug}.jpg`))) continue;
  save(card(r, n), join(OUT, `${slug}.jpg`));
  made++;
}

// imagen genérica: con la mira del primer pro como ejemplo
const sample = pros.map(r => decode(r.code)).find(Boolean);
const dv = version(`default|${sample ? JSON.stringify(sample) : ""}`);
if (old.default !== dv || !existsSync(join(OUT, "default.jpg"))) { save(defaultCard(sample), join(OUT, "default.jpg")); made++; }
manifest.default = dv;

// borrar imágenes de pros que ya no están
let removed = 0;
for (const f of readdirSync(OUT)) {
  if (f.endsWith(".jpg") && !(f.slice(0, -4) in manifest)) { unlinkSync(join(OUT, f)); removed++; }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
console.log(`og: ${made} imágenes nuevas o cambiadas, ${removed} borradas, ${Object.keys(manifest).length} en total`);
