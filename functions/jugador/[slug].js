// Página de un jugador: /jugador/<slug> para pros, /jugador/<SteamID64> para cualquiera.
// Se genera en el servidor para que Google y las vistas previas de Discord/Twitter vean
// el nombre, el código y los valores sin ejecutar JavaScript.
// Los pros se indexan; el resto de jugadores lleva noindex.

import { esc, proSlugs, loadData, loadOg, ogImage, decode, shownCode, origin, html } from "../_site.js";

const STYLES = ["Cruz dinámica", "Círculo dinámico", "Cruz dinámica (legacy)", "Círculo estático", "Cruz estática",
  "Cruz estática con retroceso", "Solo punto", "Quad dinámico", "Cuadrado estático", "Quad estático"];
const OUTLINE = ["No", "Completo", "Medio"];
const MAP_NAMES = { de_dust2: "Dust II", de_mirage: "Mirage", de_inferno: "Inferno", de_nuke: "Nuke", de_ancient: "Ancient",
  de_anubis: "Anubis", de_overpass: "Overpass", de_train: "Train", de_vertigo: "Vertigo" };

const fmtDate = iso => {
  try { return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }
  catch { return iso || ""; }
};
const mapName = m => MAP_NAMES[m] || (m || "").replace(/^de_/, "").replace(/^\w/, c => c.toUpperCase());

function valsRows(n) {
  const yes = v => (v ? "Sí" : "No");
  return [["Estilo", STYLES[n.style] ?? n.style], ["Largo", n.length], ["Separación", n.gap], ["Grosor", n.thickness],
    ["Color", `<i class="swatch" style="background:rgb(${n.r},${n.g},${n.b})"></i> ${n.r} ${n.g} ${n.b}`], ["Opacidad", n.a],
    ["Punto", yes(n.dot)], ["Estilo T", yes(n.t)], ["Contorno", OUTLINE[n.outline] ?? n.outline],
    ["Sigue el retroceso", yes(n.recoil)], ["Resolución del código", n.h ? `${n.h}p` : "—"]]
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
}

function notFound(base) {
  return html(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jugador no encontrado · CSConfig</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/assets/app.css"></head>
<body><header class="top"><a class="brand" href="/"><h1>CS<span>Config</span></h1></a></header>
<main><div class="card empty"><h3>Jugador no encontrado</h3><p>No tenemos a nadie con ese nombre o SteamID. <a href="/#jugadores">Búscalo en la lista</a>.</p></div></main></body></html>`, 404, 60);
}

export async function onRequestGet({ params, request, env }) {
  const key = String(params.slug || "").toLowerCase();
  const isId = /^7656\d{13}$/.test(key);
  const [data, og] = await Promise.all([loadData(env, request, { players: isId }), loadOg(env, request)]);
  const slugs = proSlugs(data.pros);
  const base = origin(request);

  let r = data.pros.find(p => slugs.get(p.id) === key), pro = Boolean(r);
  if (!r && isId) {
    const p = data.pros.find(x => x.id === key);
    if (p) return Response.redirect(`${base}/jugador/${slugs.get(p.id)}`, 301);  // pro buscado por SteamID
    r = data.players.find(x => x.id === key);
    pro = Boolean(r && r.pro);
  }
  if (!r) return notFound(base);

  const n = decode(r.code);
  if (!n) return notFound(base);

  const code = shownCode(r.code, n);
  const url = pro ? `${base}/jugador/${slugs.get(r.id) || r.id}` : `${base}/jugador/${r.id}`;
  const team = pro ? (r.status === "retired" ? "Retirado" : r.team || "") : "";
  const who = team ? `${r.name} (${team})` : r.name;
  const title = `Mira de ${who} en CS2 · CSConfig`;
  const desc = `Código de mira (crosshair) de ${r.name} en CS2: estilo ${(STYLES[n.style] || n.style).toLowerCase()}, largo ${n.length}, separación ${n.gap}, grosor ${n.thickness}. Cópialo e impórtalo en el juego.`;

  const hist = [{ code: r.code, from: r.since, now: true }, ...(r.history || []).slice().reverse()];
  const histHtml = hist.map((h, i) => {
    const hn = decode(h.code);
    return `<li><time${h.from ? ` datetime="${esc(String(h.from).slice(0, 10))}"` : ""}>${h.from ? fmtDate(h.from) : ""}</time><code>${esc(hn ? shownCode(h.code, hn) : h.code)}</code>${
      h.now ? `<span class="badge" style="margin:0" data-i="current">actual</span>` : `<button class="mini" data-h="${i}" data-i="use">Usar</button>`}</li>`;
  }).join("");

  const links = [`<a href="https://steamcommunity.com/profiles/${esc(r.id)}" target="_blank" rel="noopener" data-i="steam">Perfil de Steam</a>`];
  if (r.faceit) links.push(`<a href="https://www.faceit.com/es/players/${encodeURIComponent(r.faceit)}" target="_blank" rel="noopener" data-i="faceitProfile">Perfil de FACEIT</a>`);

  // Otros pros del mismo equipo (enlaces internos: ayudan a Google a encontrar todas las páginas)
  const mates = pro && r.team && r.status !== "retired"
    ? data.pros.filter(p => p.id !== r.id && p.team === r.team && p.status !== "retired").sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const matesHtml = mates.length
    ? `<section class="card"><p class="step"><span><span data-i="mates">Más miras de</span> ${esc(r.team)}</span></p>
       <div class="chips">${mates.map(p => `<a class="chip" href="/jugador/${esc(slugs.get(p.id))}">${esc(p.name)}</a>`).join("")}</div></section>`
    : "";

  const seen = r.seen ? `Visto por última vez el ${fmtDate(r.seen)} · ${esc([r.source || "demo", r.map ? mapName(r.map) : ""].filter(Boolean).join(" · "))}` : "";

  const ld = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Miras", item: `${base}/` },
                      { "@type": "ListItem", position: 2, name: r.name, item: url }],
  };
  const client = { name: r.name, code: r.code, hist: hist.map(h => h.code), team, seen: r.seen || "", source: r.source || "demo", map: r.map ? mapName(r.map) : "" };

  return html(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${pro ? `<link rel="canonical" href="${esc(url)}">` : `<meta name="robots" content="noindex">`}
<meta property="og:type" content="profile">
<meta property="og:site_name" content="CSConfig">
<meta property="og:title" content="${esc(`Mira de ${who}`)}">
<meta property="og:description" content="${esc(code)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(ogImage(base, og, pro ? slugs.get(r.id) : null))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`Vista previa de la mira de ${r.name}`)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@600;700&family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="/assets/app.css">
${pro ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>
<header class="top">
  <a class="brand" href="/"><h1>CS<span>Config</span></h1></a>
  <nav class="topnav">
    <a href="/" data-i="navPros">Miras</a>
    <a href="/cambios/" data-i="navChanges">Cambios</a>
    <a href="/conversor/" data-i="navConv">Conversor</a>
    <a href="/enviar/" data-i="navSubmit">Enviar demo</a>
    <div class="lang" role="group" aria-label="Idioma / Language">
      <button id="lang_es" aria-pressed="true">ES</button><button id="lang_en" aria-pressed="false">EN</button>
    </div>
  </nav>
</header>

<main>
  <nav class="crumbs" aria-label="Ruta"><a href="/${pro ? "" : "#jugadores"}" data-i="${pro ? "crumbPros" : "crumbPlayers"}">${pro ? "Pros" : "Jugadores"}</a><span aria-hidden="true">›</span><span>${esc(r.name)}</span></nav>
  <div>
    <h1 class="ptitle"><b data-i="titlePre">Mira de</b> <span>${esc(r.name)}</span></h1>
    <p class="lead">${team ? `<span ${r.status === "retired" ? 'data-i="retired"' : ""}>${esc(team)}</span>` : r.faceit ? `<span class="fc">FACEIT</span> ${esc(r.faceit)}` : ""}</p>
  </div>

  <section class="card result">
    <p class="step"><span data-i="codeTitle">Código de mira</span></p>
    <div class="codebox">
      <p class="code" id="code">${esc(code)}</p>
      <button class="copy" id="copy" data-i="copy">Copiar</button>
    </div>
    <p class="howto" data-i="howto">En CS2: Ajustes → Juego → Mira → Compartir o importar → pega el código → Importar.</p>
  </section>

  <section class="card">
    <p class="step"><span data-i="preview">Vista previa y valores</span></p>
    <div class="sgrid">
      <canvas id="cv" width="300" height="300" aria-label="Vista previa de la mira"></canvas>
      <table class="vtable"><tbody id="vals">${valsRows(n)}</tbody></table>
    </div>
    <div class="chips bgChips under"></div>
  </section>

  ${hist.length > 1 ? `<section class="card"><p class="step"><span data-i="history">Historial de miras</span></p><ul class="hist" id="hist">${histHtml}</ul></section>` : ""}

  ${matesHtml}

  <div class="links">${links.join("")}</div>
  <p class="src" id="src">${seen}</p>

  <footer><span data-i="footer">Proyecto independiente. No está afiliado ni respaldado por Valve, FACEIT ni los equipos o jugadores que aparecen.</span> <a href="https://github.com/iorrogarciablount-bit/CSConfigWeb/issues/new?template=retirar-jugador.yml" target="_blank" rel="noopener" data-i="remove">Pedir que retiremos un jugador</a></footer>
</main>

<script src="/assets/crosshair.js"></script>
<script id="pdata" type="application/json">${JSON.stringify(client).replace(/</g, "\\u003c")}</script>
<script src="/assets/jugador.js"></script>
</body>
</html>`);
}
