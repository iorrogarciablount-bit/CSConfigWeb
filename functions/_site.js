// Utilidades para las páginas que se generan en el servidor (jugador, sitemap...).
// Los datos se leen de los mismos JSON estáticos que usa la web (site/data/).

import "../site/assets/crosshair.js";

export const XH = globalThis.XH;

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* URL de cada pro (la regla está en crosshair.js, compartida con la web) */
export const slugify = XH.slugify;
export const proSlugs = XH.proSlugs;

async function getJson(env, request, path) {
  const res = await env.ASSETS.fetch(new URL(path, request.url));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/* Pros y jugadores. players.json solo se descarga si hace falta (pesa más). */
export async function loadData(env, request, { players = false } = {}) {
  const pros = await getJson(env, request, "/data/pros.json");
  const out = { pros: pros.players || [], prosUpdated: pros.updated, players: [], playersUpdated: null };
  if (players) {
    const pl = await getJson(env, request, "/data/players.json");
    out.players = pl.players || [];
    out.playersUpdated = pl.updated;
  }
  return out;
}

/* Imágenes de vista previa (site/og/index.json, las genera pipeline/og/og.mjs): { slug: versión } */
export async function loadOg(env, request) {
  try {
    const res = await env.ASSETS.fetch(new URL("/og/index.json", request.url));
    return res.ok ? await res.json() : {};
  } catch { return {}; }
}

/* URL absoluta de la imagen de un pro, o la genérica si no tiene */
export function ogImage(base, og, slug) {
  if (slug && og[slug]) return `${base}/og/${slug}.jpg?v=${og[slug]}`;
  return `${base}/og/default.jpg${og.default ? `?v=${og.default}` : ""}`;
}

export function decode(code) {
  try { return XH.anyCode(code); } catch { return null; }
}

/* Código que se muestra: los antiguos (CSGO-...) se enseñan ya convertidos a 1080p */
export const shownCode = (code, n) => (/^CSGO-/.test(code) ? XH.encodeNew(n) : code);

export const origin = request => new URL(request.url).origin;

export const html = (body, status = 200, maxAge = 300) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": `public, max-age=${maxAge}` },
  });

/* Cabecera y pie comunes de las páginas que se generan en el servidor.
   active: "navPros", "navChanges"... para marcar la sección actual. */
const NAV = [["/", "navPros", "Miras"], ["/comparar/", "navCompare", "Comparar"], ["/cambios/", "navChanges", "Cambios"], ["/estadisticas/", "navStats", "Estadísticas"],
  ["/conversor/", "navConv", "Conversor"], ["/enviar/", "navSubmit", "Enviar demo"]];
export const siteHeader = (active = "") => `<header class="top">
  <a class="brand" href="/"><h1>CS<span>Config</span></h1></a>
  <nav class="topnav">
${NAV.map(([href, key, label]) => `    <a href="${href}"${key === active ? ' aria-current="page"' : ""} data-i="${key}">${label}</a>`).join("\n")}
    <div class="lang" role="group" aria-label="Idioma / Language">
      <button id="lang_es" aria-pressed="true">ES</button><button id="lang_en" aria-pressed="false">EN</button>
    </div>
  </nav>
</header>`;
export const siteFooter = () => `<footer><span data-i="footer">Proyecto independiente. No está afiliado ni respaldado por Valve, FACEIT ni los equipos o jugadores que aparecen.</span> <a href="https://github.com/iorrogarciablount-bit/CSConfigWeb/issues/new?template=retirar-jugador.yml" target="_blank" rel="noopener" data-i="remove">Pedir que retiremos un jugador</a></footer>
  <script src="/assets/nav.js" defer></script>`;
