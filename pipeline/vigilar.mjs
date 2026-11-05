// Comprueba que la web publicada funciona: páginas, página de jugador, comparar, !mira,
// sitemap, imágenes y datos. Sale con código 1 si algo falla (el workflow avisa).
//
//   SITE_URL=https://csconfig.counterstrike2.workers.dev node pipeline/vigilar.mjs
//   Escribe el informe en VIGILANCIA_INFORME (si se indica) en Markdown.

import { writeFileSync } from "node:fs";

const site = (process.env.SITE_URL || "https://csconfig.counterstrike2.workers.dev").replace(/\/+$/, "");
globalThis.document = {};
await import("../site/assets/crosshair.js");
const { proSlugs } = globalThis.XH;

const results = [];
async function check(name, path, { type, contains = [], json, status = 200 } = {}) {
  const url = site + path, t0 = Date.now();
  let ok = false, detail = "";
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "CSConfig-vigilancia" }, signal: AbortSignal.timeout(20000) });
    const ms = Date.now() - t0;
    const ct = res.headers.get("content-type") || "";
    const body = type === "image" ? "" : await res.text();
    const problems = [];
    if (res.status !== status) problems.push(`HTTP ${res.status} (esperado ${status})`);
    if (type === "image" && !ct.startsWith("image/")) problems.push(`tipo ${ct || "?"}`);
    if (type === "html" && !ct.includes("text/html")) problems.push(`tipo ${ct || "?"}`);
    for (const c of contains) if (!body.includes(c)) problems.push(`no contiene «${c}»`);
    let data = null;
    if (json) { try { data = JSON.parse(body); const err = json(data); if (err) problems.push(err); } catch { problems.push("JSON no válido"); } }
    ok = !problems.length;
    detail = ok ? `${res.status} · ${ms} ms` : problems.join("; ");
    results.push({ name, path, ok, detail });
    return { ok, data, body };
  } catch (e) {
    results.push({ name, path, ok: false, detail: e.name === "TimeoutError" ? "no responde (20 s)" : e.message === "fetch failed" ? "no se puede conectar" : e.message });
    return { ok: false };
  }
}

const html = { type: "html", contains: ["CS<span>Config</span>"] };
await check("Portada", "/", html);
await check("Comparar", "/comparar/", html);
await check("Cambios", "/cambios/", html);
await check("Estadísticas", "/estadisticas/", html);
await check("¿A qué pro se parece?", "/parecido/", html);
await check("Conversor", "/conversor/", html);
await check("Enviar demo", "/enviar/", html);
await check("Comando para streamers", "/comando/", html);
await check("Script de miras", "/assets/crosshair.js", { contains: ["function decodeNew"] });

const pros = await check("Datos de pros", "/data/pros.json", { json: d => (Array.isArray(d.players) && d.players.length ? null : "sin jugadores") });
await check("Datos de jugadores", "/data/players.json", { json: d => (Array.isArray(d.players) ? null : "sin lista de jugadores") });

const list = pros.data?.players || [];
if (list.length) {
  const slugs = proSlugs(list), a = list[0], b = list[1];
  const sa = slugs.get(a.id);
  await check(`Página de jugador (${a.name})`, `/jugador/${sa}`, { type: "html", contains: [a.code, 'property="og:image"'] });
  if (b) { const [x, y] = [sa, slugs.get(b.id)].sort(); await check("Comparación de dos pros", `/comparar/${x}-vs-${y}`, { type: "html", contains: ['class="cpct"'] }); }
  await check("Comando !mira", `/api/mira?q=${encodeURIComponent(a.name)}`, { contains: [a.name, "/jugador/"] });
  await check(`Imagen al compartir (${a.name})`, `/og/${sa}.jpg`, { type: "image" });
}
await check("Jugador que no existe (debe dar 404)", "/jugador/no-existe-csconfig", { type: "html", status: 404 });
await check("Imagen al compartir (genérica)", "/og/default.jpg", { type: "image" });
await check("Sitemap", "/sitemap.xml", { contains: ["<urlset", "/jugador/"] });
await check("robots.txt", "/robots.txt", { contains: ["Sitemap:"] });
await check("API del formulario", "/api/config", { json: d => (typeof d.enabled === "boolean" ? null : "respuesta inesperada") });

const failed = results.filter(r => !r.ok);
const report = [
  failed.length ? `**${failed.length} de ${results.length} comprobaciones fallan** en ${site}` : `Todo funciona en ${site} (${results.length} comprobaciones)`,
  "",
  "| | Comprobación | Ruta | Resultado |", "| --- | --- | --- | --- |",
  ...results.map(r => `| ${r.ok ? "✅" : "❌"} | ${r.name} | \`${r.path}\` | ${r.detail.replace(/\|/g, "/")} |`),
].join("\n");
console.log(report);
if (process.env.VIGILANCIA_INFORME) writeFileSync(process.env.VIGILANCIA_INFORME, report + "\n");
process.exit(failed.length ? 1 : 0);
