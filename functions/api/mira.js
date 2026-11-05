// Comando de chat: devuelve en una línea de texto el código de mira de un jugador.
// Pensado para bots de Twitch (Nightbot, StreamElements...) y cualquier cosa que lea texto.
//
//   /api/mira?q=donk            -> "donk (Team Spirit): CSyyzo... · https://.../jugador/donk"
//   /api/mira?q=                -> usa ?def= si viene (p. ej. la mira del propio streamer)
//   &lang=en                    -> respuesta en inglés
//
// Busca en los pros (nombre, URL, nick) y, si no, en el resto de jugadores
// (nombre, usuario de FACEIT o SteamID64). Siempre responde 200 con texto,
// porque los bots muestran tal cual lo que reciben.

import { loadData, proSlugs, decode, shownCode, origin } from "../_site.js";

const TXT = {
  es: {
    usage: base => `Uso: !mira <jugador>. Todas las miras en ${base}`,
    none: (q, base) => `No tengo la mira de "${q}". Búscala en ${base}`,
    retired: "retirado",
  },
  en: {
    usage: base => `Usage: !crosshair <player>. All crosshairs at ${base}`,
    none: (q, base) => `I don't have "${q}"'s crosshair. Look it up at ${base}`,
    retired: "retired",
  },
};

const norm = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Los bots a veces mandan "@donk" o el texto entre comillas
const clean = s => String(s || "").replace(/^[\s@"'«]+|[\s"'»]+$/g, "").slice(0, 60);

function find(q, pros, players, slugs, exactOnly = false) {
  const id = (q.match(/7656\d{13}/) || [])[0];
  if (id) return [...pros, ...players].find(r => r.id === id) || null;
  const n = norm(q);
  if (!n) return null;
  const keys = r => [r.name, r.nick, slugs.get(r.id), r.faceit, ...(r.aliases || [])].map(norm).filter(Boolean);
  // 1) exacto en pros, 2) exacto en jugadores, 3) pro que empieza por, 4) jugador que empieza por
  const exact = pros.find(r => keys(r).includes(n)) || players.find(r => keys(r).includes(n));
  if (exact || exactOnly) return exact || null;
  return (n.length >= 2 ? pros.find(r => keys(r).some(k => k.startsWith(n))) : null)
    || (n.length >= 3 ? players.find(r => keys(r).some(k => k.startsWith(n))) : null)
    || null;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const L = TXT[url.searchParams.get("lang") === "en" ? "en" : "es"];
  const base = origin(request);
  const reply = (text, maxAge = 120) => new Response(text.slice(0, 380), {   // Nightbot exige menos de 400 caracteres
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": `public, max-age=${maxAge}`, "access-control-allow-origin": "*" },
  });

  const q = clean(url.searchParams.get("q")) || clean(url.searchParams.get("def"));
  if (!q) return reply(L.usage(base), 3600);

  const isId = /7656\d{13}/.test(q);
  let data = await loadData(env, request);
  const slugs = proSlugs(data.pros);
  let r = find(q, data.pros, [], slugs, true);
  if (!r) {                                    // players.json solo si no es un pro exacto (pesa más)
    data = await loadData(env, request, { players: true });
    r = find(q, data.pros, data.players, slugs);
  }
  if (!r) return reply(L.none(q, base), isId ? 300 : 120);

  const n = decode(r.code);
  if (!n) return reply(L.none(q, base));
  const pro = data.pros.includes(r);
  const team = pro ? (r.status === "retired" ? L.retired : r.team) : "";
  const page = `${base}/jugador/${pro ? slugs.get(r.id) : r.id}`;
  return reply(`${r.name}${team ? ` (${team})` : ""}: ${shownCode(r.code, n)} · ${page}`);
}
