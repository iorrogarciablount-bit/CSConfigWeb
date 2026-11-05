// Comparar dos jugadores: /comparar/<a>-vs-<b>  (a y b = URL del pro o SteamID64)
//   /comparar/            solo el selector
//   /comparar/?a=..&b=..  lo que manda el selector sin JavaScript -> redirige a la URL buena
// El orden se normaliza (alfabético) y el otro redirige con 301, para no tener dos URLs iguales.

import { XH, esc, proSlugs, loadData, loadOg, ogImage, decode, shownCode, origin, html, siteHeader, siteFooter } from "../_site.js";

const STYLES = ["Cruz dinámica", "Círculo dinámico", "Cruz dinámica (legacy)", "Círculo estático", "Cruz estática",
  "Cruz estática con retroceso", "Solo punto", "Quad dinámico", "Cuadrado estático", "Quad estático"];
const OUTLINE = ["No", "Completo", "Medio"];
const yes = v => (v ? "Sí" : "No");
const swatch = n => `<i class="swatch" style="background:rgb(${n.r},${n.g},${n.b})"></i> ${n.r} ${n.g} ${n.b}`;
// [clave de texto, etiqueta, valor, ¿es distinto?]
const ROWS = [
  ["style", "Estilo", n => STYLES[n.style] ?? n.style, (a, b) => a.style !== b.style],
  ["length", "Largo", n => n.length, (a, b) => a.length !== b.length],
  ["gap", "Separación", n => n.gap, (a, b) => a.gap !== b.gap],
  ["thickness", "Grosor", n => n.thickness, (a, b) => a.thickness !== b.thickness],
  ["color", "Color", swatch, (a, b) => a.r !== b.r || a.g !== b.g || a.b !== b.b],
  ["a", "Opacidad", n => n.a, (a, b) => a.a !== b.a],
  ["dot", "Punto", n => yes(n.dot), (a, b) => !!a.dot !== !!b.dot],
  ["t", "Estilo T", n => yes(n.t), (a, b) => !!a.t !== !!b.t],
  ["outline", "Contorno", n => OUTLINE[n.outline] ?? n.outline, (a, b) => a.outline !== b.outline],
  ["recoil", "Sigue el retroceso", n => yes(n.recoil), (a, b) => !!a.recoil !== !!b.recoil],
  ["h", "Resolución del código", n => (n.h ? `${n.h}p` : "—"), (a, b) => a.h !== b.h],
];

function page({ title, desc, canonical, noindex, ogImg, body, data }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="CSConfig">
<meta property="og:title" content="${esc(title.replace(/ · CSConfig$/, ""))}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImg)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@600;700&family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="/assets/app.css">
</head>
<body>
${siteHeader("navCompare")}
<main>
${body}
  ${siteFooter()}
</main>
<script src="/assets/crosshair.js"></script>
<script id="cdata" type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script src="/assets/comparar.js"></script>
</body>
</html>`;
}

function picker(pros, slugs, a = "", b = "") {
  const opts = sel => pros.map(p => { const s = slugs.get(p.id); return `<option value="${esc(s)}"${s === sel ? " selected" : ""}>${esc(p.name)}${p.team ? ` · ${esc(p.team)}` : ""}</option>`; }).join("");
  return `<form class="card cpick" id="pick" action="/comparar/" method="get">
    <select name="a" id="pa" aria-label="Jugador 1">${a ? "" : '<option value="" selected disabled data-i="choose">Elige un jugador</option>'}${opts(a)}</select>
    <span class="cvs">vs</span>
    <select name="b" id="pb" aria-label="Jugador 2">${b ? "" : '<option value="" selected disabled data-i="choose">Elige un jugador</option>'}${opts(b)}</select>
    <button class="copy" type="submit" data-i="compare">Comparar</button>
  </form>`;
}

export async function onRequestGet({ params, request, env }) {
  const url = new URL(request.url), base = origin(request);
  const qa = url.searchParams.get("a"), qb = url.searchParams.get("b");
  const pair = String(params.pair || "").toLowerCase();

  // del formulario sin JavaScript a la URL buena
  if (!pair && qa && qb) return Response.redirect(`${base}/comparar/${encodeURIComponent(qa.toLowerCase())}-vs-${encodeURIComponent(qb.toLowerCase())}`, 302);

  const keys = pair ? pair.split("-vs-") : [];
  const needPlayers = keys.some(k => /^7656\d{13}$/.test(k));
  const [data, og] = await Promise.all([loadData(env, request, { players: needPlayers }), loadOg(env, request)]);
  const pros = data.pros.slice().sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: "base" }));
  const slugs = proSlugs(data.pros);
  const keyOf = r => (data.pros.includes(r) ? slugs.get(r.id) : r.id);
  const find = k => data.pros.find(p => slugs.get(p.id) === k) || [...data.pros, ...data.players].find(p => p.id === k) || null;

  // /comparar/ : solo el selector, con algunas parejas de compañeros de equipo como ejemplo
  if (!pair) {
    const byTeam = {};
    data.pros.filter(p => p.team && p.status !== "retired").forEach(p => (byTeam[p.team] ||= []).push(p));
    const examples = Object.values(byTeam).filter(t => t.length > 1).flatMap(t => {
      const s = t.slice().sort((x, y) => (keyOf(x) < keyOf(y) ? -1 : 1));
      return s.slice(1).map(p => [s[0], p]);
    }).slice(0, 8);
    const body = `  <div>
    <h1 class="ptitle"><b data-i="titleIdx">Comparar</b> <span data-i="titleIdx2">miras</span></h1>
    <p class="lead" data-i="leadIdx">Elige dos jugadores para ver sus miras lado a lado y en qué se diferencian.</p>
  </div>
  ${picker(pros, slugs, slugs.has ? [...slugs.values()].find(v => v === String(qa || "").toLowerCase()) || "" : "")}
  ${examples.length ? `<section class="card"><p class="step"><span data-i="examples">Compañeros de equipo</span></p><div class="chips">${
    examples.map(([x, y]) => `<a class="chip" href="/comparar/${esc(keyOf(x))}-vs-${esc(keyOf(y))}">${esc(x.name)} vs ${esc(y.name)}</a>`).join("")}</div></section>` : ""}`;
    return html(page({ title: "Comparar miras de jugadores de CS2 · CSConfig", desc: "Compara las miras de dos jugadores de CS2 lado a lado: estilo, largo, separación, grosor, color y su código.",
      canonical: `${base}/comparar/`, ogImg: ogImage(base, og, null), body, data: { mode: "index" } }));
  }

  if (keys.length !== 2) return html(page({ title: "Comparación no encontrada · CSConfig", desc: "", canonical: `${base}/comparar/`, noindex: true, ogImg: ogImage(base, og, null),
    body: `${picker(pros, slugs)}<div class="card empty"><h3 data-i="nf">No encuentro esa comparación</h3></div>`, data: { mode: "index" } }), 404, 60);

  const A = find(keys[0]), B = find(keys[1]);
  if (!A || !B) {
    const missing = !A ? keys[0] : keys[1];
    return html(page({ title: "Jugador no encontrado · CSConfig", desc: "", canonical: `${base}/comparar/`, noindex: true, ogImg: ogImage(base, og, null),
      body: `${picker(pros, slugs, A ? keyOf(A) : "", B ? keyOf(B) : "")}<div class="card empty"><h3 data-i="nf">No encuentro a ese jugador</h3><p>${esc(missing)}</p></div>`, data: { mode: "index" } }), 404, 60);
  }
  if (A === B) return Response.redirect(`${base}/jugador/${encodeURIComponent(keyOf(A))}`, 302);

  // orden alfabético por URL: zywoo-vs-donk -> donk-vs-zywoo
  const [ka, kb] = [keyOf(A), keyOf(B)];
  const [L, R] = ka <= kb ? [A, B] : [B, A];   // mismo orden que el sitemap y la página de jugador
  const canonPath = `/comparar/${keyOf(L)}-vs-${keyOf(R)}`;
  if (url.pathname.replace(/\/+$/, "") !== canonPath || qa || qb) return Response.redirect(`${base}${canonPath}`, 301);

  const nL = decode(L.code), nR = decode(R.code);
  if (!nL || !nR) return html("Código de mira no válido", 500, 60);
  const pct = XH.crosshairSimilarity(nL, nR);
  const isPro = r => data.pros.includes(r);
  const teamOf = r => (isPro(r) ? (r.status === "retired" ? "Retirado" : r.team || "") : "");
  const diffs = ROWS.filter(([k, , , d]) => k !== "h" && d(nL, nR)).length;

  const col = (r, n, side) => `<div class="ccol">
      <canvas id="cv${side}" width="300" height="300" aria-label="Mira de ${esc(r.name)}"></canvas>
      <h2 class="cname"><a href="/jugador/${esc(keyOf(r))}">${esc(r.name)}</a></h2>
      <p class="pteam">${esc(teamOf(r))}</p>
      <div class="codebox ccode"><p class="code" id="code${side}">${esc(shownCode(r.code, n))}</p><button class="copy" type="button" data-copy="code${side}" data-i="copy">Copiar</button></div>
    </div>`;
  const rows = ROWS.map(([k, label, v, d]) => `<tr${d(nL, nR) ? ' class="diff"' : ""}><td data-row="${k}">${label}</td><td>${v(nL)}</td><td>${v(nR)}</td></tr>`).join("");
  const summary = pct === 100 ? "Tienen exactamente la misma mira." : diffs === 1 ? "Solo cambia 1 valor." : `Cambian ${diffs} valores.`;

  const body = `  <nav class="crumbs" aria-label="Ruta"><a href="/comparar/" data-i="crumb">Comparar</a><span aria-hidden="true">›</span><span>${esc(L.name)} vs ${esc(R.name)}</span></nav>
  <div>
    <h1 class="ptitle">${esc(L.name)} <span>vs</span> ${esc(R.name)}</h1>
    <p class="lead"><b class="cpct">${pct}%</b> <span data-i="similar">de parecido</span> · <span id="summary">${summary}</span></p>
  </div>
  ${picker(pros, slugs, isPro(L) ? keyOf(L) : "", isPro(R) ? keyOf(R) : "")}
  <section class="card">
    <div class="cgrid">${col(L, nL, "L")}${col(R, nR, "R")}</div>
    <div class="chips bgChips under"></div>
  </section>
  <section class="card">
    <p class="step"><span data-i="valsTitle">Valores</span></p>
    <table class="vtable ctable"><thead><tr><th></th><th>${esc(L.name)}</th><th>${esc(R.name)}</th></tr></thead><tbody id="rows">${rows}</tbody></table>
    <p class="fine" data-i="diffNote">Resaltado: lo que cambia entre las dos miras.</p>
  </section>`;

  return html(page({
    title: `${L.name} vs ${R.name}: comparación de miras de CS2 · CSConfig`,
    desc: `Mira de ${L.name} frente a la de ${R.name} en CS2: ${pct}% de parecido. ${summary} Estilo, largo, separación, grosor, color y los dos códigos.`,
    canonical: `${base}${canonPath}`, noindex: !isPro(L) || !isPro(R),
    ogImg: ogImage(base, og, isPro(L) ? keyOf(L) : null), body,
    data: { mode: "pair", L: { name: L.name, code: L.code }, R: { name: R.name, code: R.code }, pct, diffs },
  }));
}
