// Avisa en Discord cuando un pro cambia de mira o entra uno nuevo.
//
// Compara site/data/pros.json con la versión del último commit (antes de que el
// workflow guarde los datos nuevos) y publica un mensaje por cada novedad en el
// webhook de DISCORD_WEBHOOK_URL, con una imagen del antes → ahora.
//
//   DISCORD_WEBHOOK_URL   webhook del canal (secreto de GitHub). Sin él no hace nada.
//   SITE_URL              dirección de la web, para los enlaces.
//   node pipeline/og/avisos.mjs --dry-run <carpeta>   guarda imágenes y mensajes sin publicar
//   node pipeline/og/avisos.mjs --old <pros.json>     compara con otro archivo en vez del commit

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { XH, proSlugs, createCanvas, ROOT, W, H, C, STYLES, decode, shown, fitText, brand, preview } from "./draw.mjs";

const MAX_POSTS = 10;   // por ejecución, para no inundar el canal si entran muchos de golpe
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const dryDir = opt("--dry-run");
const webhook = process.env.DISCORD_WEBHOOK_URL || "";
const site = (process.env.SITE_URL || "").replace(/\/+$/, "");

if (!dryDir && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(webhook)) {
  console.log("avisos: sin DISCORD_WEBHOOK_URL, no se publica nada");
  process.exit(0);
}

/* ---------- qué ha cambiado ---------- */
const readPros = text => (JSON.parse(text).players || []).filter(r => r.id && r.name && r.code);
const now = readPros(readFileSync(join(ROOT, "site", "data", "pros.json"), "utf8"));
let before;
try {
  before = readPros(opt("--old") ? readFileSync(opt("--old"), "utf8")
    : execFileSync("git", ["show", "HEAD:site/data/pros.json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }));
} catch (e) {
  console.log("avisos: no hay versión anterior de pros.json para comparar", e.message);
  process.exit(0);
}
const prev = new Map(before.map(r => [r.id, r]));
const slugs = proSlugs(now);

const LABEL = { style: "Estilo", length: "Largo", gap: "Separación", thickness: "Grosor", color: "Color", a: "Opacidad",
  dot: "Punto", t: "Estilo T", outline: "Contorno", recoil: "Retroceso" };
function diffText(d) {
  const v = (k, x) => k === "style" ? (STYLES[x] ?? x) : k === "color" ? `rgb(${x.join(", ")})`
    : ["dot", "t", "outline", "recoil"].includes(k) ? (x ? "sí" : "no") : x;
  return d.map(x => ({ label: LABEL[x.k], from: String(v(x.k, x.a)), to: String(v(x.k, x.b)), k: x.k, a: x.a, b: x.b }));
}

const events = [];
for (const r of now) {
  const old = prev.get(r.id), n = decode(r.code);
  if (!n) continue;
  if (!old) { events.push({ type: "new", r, n }); continue; }
  if (old.code === r.code) continue;
  const o = decode(old.code);
  if (!o) continue;
  const d = diffText(XH.crosshairDiff(o, n));
  if (d.length) events.push({ type: "change", r, n, o, d });   // si solo cambia el código, no se ve: no se avisa
}
if (!events.length) { console.log("avisos: sin cambios de mira ni pros nuevos"); process.exit(0); }

/* ---------- imagen antes → ahora ---------- */
function changeImage(e) {
  const cv = createCanvas(W, H), ctx = cv.getContext("2d");
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.accent; ctx.fillRect(0, H - 8, W, 8);
  brand(ctx, 40, 74);

  const team = e.r.status === "retired" ? "Retirado" : e.r.team || "";
  const titleX = 300, titleW = W - titleX - 40;
  fitText(ctx, e.r.name, titleW, 56, 700, "RobotoCondensed");
  ctx.fillStyle = C.ink; ctx.textAlign = "right"; ctx.fillText(e.r.name, W - 40, 78);
  ctx.font = "700 22px RobotoCondensed"; ctx.fillStyle = C.muted;
  ctx.fillText(`${team ? team.toUpperCase() + " · " : ""}CAMBIO DE MIRA`, W - 40, 112); ctx.textAlign = "left";

  // las dos miras con el mismo zoom
  const S = 360, y = 140, x1 = 40, x2 = 40 + S + 70;
  const pa = XH.newParams(e.o), pb = XH.newParams(e.n);
  const z = Math.min(XH.fitZoom(S, pa), XH.fitZoom(S, pb));
  preview(ctx, e.o, x1, y, S, 0, z);
  preview(ctx, e.n, x2, y, S, 0, z);
  ctx.fillStyle = C.muted; ctx.font = "700 40px RobotoCondensed"; ctx.textAlign = "center";
  ctx.fillText("→", x1 + S + 35, y + S / 2 + 14);
  ctx.font = "700 20px RobotoCondensed";
  ctx.fillText("ANTES", x1 + S / 2, y + S + 34); ctx.fillStyle = C.accent; ctx.fillText("AHORA", x2 + S / 2, y + S + 34);
  ctx.textAlign = "left";

  // qué ha cambiado
  const dx = x2 + S + 40, dw = W - dx - 40;
  let dy = y + 18;
  for (const x of e.d.slice(0, 6)) {
    ctx.fillStyle = C.muted; ctx.font = "700 18px RobotoCondensed"; ctx.fillText(x.label.toUpperCase(), dx, dy);
    if (x.k === "color") {
      const sw = (c, px) => { ctx.fillStyle = `rgb(${c.join(",")})`; ctx.fillRect(px, dy + 12, 32, 32); ctx.strokeStyle = "#0008"; ctx.lineWidth = 2; ctx.strokeRect(px + 1, dy + 13, 30, 30); };
      sw(x.a, dx); ctx.fillStyle = C.muted; ctx.font = "700 28px RobotoCondensed"; ctx.fillText("→", dx + 44, dy + 38); sw(x.b, dx + 82);
    } else {
      const text = `${x.from} → ${x.to}`;
      fitText(ctx, text, dw, 32, 700, x.k === "style" ? "RobotoCondensed" : "RobotoMono");
      ctx.fillStyle = C.ink; ctx.fillText(text, dx, dy + 40);
    }
    dy += 72;
  }
  return cv.toBuffer("image/jpeg", 88);
}

/* ---------- mensajes ---------- */
const page = r => site ? `${site}/jugador/${slugs.get(r.id) || r.id}` : "";
function message(e) {
  const team = e.r.status === "retired" ? " (retirado)" : e.r.team ? ` (${e.r.team})` : "";
  const code = shown(e.r.code, e.n), link = page(e.r);
  if (e.type === "change") {
    const lines = e.d.map(x => x.k === "color" ? "• Color cambiado" : `• ${x.label}: ${x.from} → ${x.to}`);
    return { file: "cambio.jpg", image: changeImage(e),
      content: [`🎯 **${e.r.name}**${team} ha cambiado de mira`, ...lines, `\`${code}\``, link && `<${link}>`].filter(Boolean).join("\n") };
  }
  const og = join(ROOT, "site", "og", `${slugs.get(e.r.id)}.jpg`);
  return { file: "mira.jpg", image: existsSync(og) ? readFileSync(og) : null,
    content: [`🆕 Nuevo pro en CSConfig: **${e.r.name}**${team}`, `\`${code}\``, link && `<${link}>`].filter(Boolean).join("\n") };
}

async function post(m) {
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: m.content.slice(0, 1900), username: "CSConfig", allowed_mentions: { parse: [] } }));
  if (m.image) form.append("files[0]", new Blob([m.image], { type: "image/jpeg" }), m.file);
  for (let tries = 0; tries < 3; tries++) {
    const res = await fetch(webhook, { method: "POST", body: form });
    if (res.ok) return true;
    if (res.status === 429) { const j = await res.json().catch(() => ({})); await new Promise(r => setTimeout(r, 1000 * (j.retry_after || 2))); continue; }
    console.log(`avisos: Discord respondió ${res.status} ${(await res.text()).slice(0, 200)}`);
    return false;
  }
  return false;
}

// cambios primero, luego pros nuevos
events.sort((a, b) => (a.type === "change" ? 0 : 1) - (b.type === "change" ? 0 : 1) || a.r.name.localeCompare(b.r.name));
const todo = events.slice(0, MAX_POSTS);
if (events.length > todo.length) console.log(`avisos: ${events.length} novedades, se publican ${todo.length}`);

let ok = 0;
if (dryDir) mkdirSync(dryDir, { recursive: true });
for (const [i, e] of todo.entries()) {
  const m = message(e);
  if (dryDir) {
    const base = join(dryDir, `${i + 1}-${e.type}-${slugs.get(e.r.id) || e.r.id}`);
    writeFileSync(`${base}.txt`, m.content + "\n");
    if (m.image) writeFileSync(`${base}.jpg`, m.image);
    ok++;
  } else {
    if (await post(m)) ok++;
    await new Promise(r => setTimeout(r, 1200));   // los webhooks admiten pocas peticiones por segundo
  }
}
console.log(`avisos: ${ok}/${todo.length} ${dryDir ? "guardados en " + dryDir : "publicados en Discord"}`);
