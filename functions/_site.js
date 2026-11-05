// Utilidades para las páginas que se generan en el servidor (jugador, sitemap...).
// Los datos se leen de los mismos JSON estáticos que usa la web (site/data/).

import "../site/assets/crosshair.js";

export const XH = globalThis.XH;

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Slug de un nombre: "-kRyTouS" -> "krytous". La misma regla está en site/index.html (playerSlug). */
export const slugify = name =>
  String(name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* URL de cada pro: su slug, o su SteamID si el slug falta o lo comparte con otro pro. */
export function proSlugs(pros) {
  const count = new Map();
  pros.forEach(p => { const s = slugify(p.name); count.set(s, (count.get(s) || 0) + 1); });
  return new Map(pros.map(p => { const s = slugify(p.name); return [p.id, s && count.get(s) === 1 && !/^\d+$/.test(s) ? s : p.id]; }));
}

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
