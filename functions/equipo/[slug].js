// Página de un equipo: /equipo/<slug> ("vitality", "fut-esports"...).
// Las miras de todos sus pros en activo, juntas, con su código. Se genera en el servidor
// para que Google la indexe ("mira de Vitality") y Discord enseñe la imagen del equipo.

import { esc, proSlugs, teamSlug, teamsOf, loadData, loadOg, ogImage, decode, shownCode, origin, html, siteHeader, siteFooter, slugify } from "../_site.js";

const fmtDate = iso => {
  try { return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }
  catch { return iso || ""; }
};

function notFound() {
  return html(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Equipo no encontrado · CSConfig</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/assets/app.css"></head>
<body><header class="top"><a class="brand" href="/"><h1>CS<span>Config</span></h1></a></header>
<main><div class="card empty"><h3>Equipo no encontrado</h3><p>No tenemos miras de ese equipo todavía. <a href="/">Ver todas las miras</a> o <a href="/enviar/">envía una demo suya</a>.</p></div></main></body></html>`, 404, 60);
}

export async function onRequestGet({ params, request, env }) {
  const key = String(params.slug || "").toLowerCase();
  const [data, og] = await Promise.all([loadData(env, request), loadOg(env, request)]);
  const base = origin(request);
  const teams = teamsOf(data.pros);
  let team = teams.get(key);
  if (!team) {
    // "team-vitality" o el nombre completo: redirigir a la dirección buena
    const alt = [...teams.entries()].find(([, t]) => slugify(t.name) === key);
    if (alt) return Response.redirect(`${base}/equipo/${alt[0]}`, 301);
    return notFound();
  }

  const slugs = proSlugs(data.pros);
  const rows = team.players.map(p => ({ p, n: decode(p.code) })).filter(x => x.n);
  if (!rows.length) return notFound();

  const url = `${base}/equipo/${key}`;
  const last = rows.map(x => x.p.seen || x.p.since).filter(Boolean).sort().pop();
  const names = rows.map(x => x.p.name);
  const title = `Miras de ${team.name} en CS2 · CSConfig`;
  const desc = `Códigos de mira (crosshair) de los jugadores de ${team.name} en CS2: ${names.join(", ")}. Cópialos e impórtalos en el juego.`;

  const cards = rows.map(({ p, n }, i) => {
    const slug = slugs.get(p.id), code = shownCode(p.code, n);
    return `<article class="tcard">
      <a href="/jugador/${esc(slug)}" class="tlink"><canvas width="200" height="200" data-c="${i}" aria-label="Mira de ${esc(p.name)}"></canvas><b>${esc(p.name)}</b></a>
      <p class="tcode" id="c${i}">${esc(code)}</p>
      <button class="copy small" data-copy="c${i}" data-i="copy">Copiar</button>
    </article>`;
  }).join("");

  const pairs = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const [a, b] = [slugs.get(rows[i].p.id), slugs.get(rows[j].p.id)].sort();
    const [na, nb] = a === slugs.get(rows[i].p.id) ? [rows[i].p.name, rows[j].p.name] : [rows[j].p.name, rows[i].p.name];
    pairs.push(`<a class="chip" href="/comparar/${esc(a)}-vs-${esc(b)}">${esc(na)} vs ${esc(nb)}</a>`);
  }
  const others = [...teams.entries()].filter(([s]) => s !== key).sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([s, t]) => `<a class="chip" href="/equipo/${esc(s)}">${esc(t.name)}</a>`);

  const ld = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Miras", item: `${base}/` },
                      { "@type": "ListItem", position: 2, name: team.name, item: url }],
  };
  const client = { team: team.name, codes: rows.map(x => x.p.code), last: last || "" };

  return html(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CSConfig">
<meta property="og:title" content="${esc(`Miras de ${team.name}`)}">
<meta property="og:description" content="${esc(names.join(" · "))}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(ogImage(base, og, `equipo-${key}`))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`Las miras de ${team.name}`)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@600;700&family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="/assets/app.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
${siteHeader()}

<main>
  <nav class="crumbs" aria-label="Ruta"><a href="/" data-i="crumbPros">Pros</a><span aria-hidden="true">›</span><span>${esc(team.name)}</span></nav>
  <div>
    <h1 class="ptitle"><b data-i="titlePre">Miras de</b> <span>${esc(team.name)}</span></h1>
    <p class="lead" id="lead">${rows.length} ${rows.length === 1 ? "jugador" : "jugadores"}${last ? ` · última demo: <time datetime="${esc(String(last).slice(0, 10))}">${fmtDate(last)}</time>` : ""}</p>
  </div>

  <div class="tgrid">${cards}</div>
  <p class="howto" data-i="howto">En CS2: Ajustes → Juego → Mira → Compartir o importar → pega el código → Importar.</p>

  ${pairs.length ? `<section class="card"><p class="step"><span data-i="comparePairs">Comparar entre ellos</span></p><div class="chips">${pairs.join("")}</div></section>` : ""}
  ${others.length ? `<section class="card"><p class="step"><span data-i="otherTeams">Otros equipos</span></p><div class="chips">${others.join("")}</div></section>` : ""}

  ${siteFooter()}
</main>

<script src="/assets/crosshair.js"></script>
<script id="tdata" type="application/json">${JSON.stringify(client).replace(/</g, "\\u003c")}</script>
<script src="/assets/equipo.js"></script>
</body>
</html>`);
}
