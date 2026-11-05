// Punto de entrada del Worker de Cloudflare (proyecto "csconfig").
//
// La web se despliega como Worker con archivos estáticos (carpeta site/), no como
// Cloudflare Pages, así que la carpeta functions/ no se ejecuta sola. Este archivo
// reparte cada ruta a su función. Cloudflare sirve primero los archivos de site/;
// el Worker solo recibe las rutas que no son un archivo.

import * as apiConfig from "./functions/api/config.js";
import * as apiStatus from "./functions/api/status.js";
import * as apiSubmit from "./functions/api/submit.js";
import * as jugador from "./functions/jugador/[slug].js";
import * as sitemap from "./functions/sitemap.xml.js";
import * as robots from "./functions/robots.txt.js";

// [patrón, módulo]. Los parámetros del patrón (:slug) llegan en ctx.params, como en Pages.
const ROUTES = [
  ["/api/config", apiConfig],
  ["/api/status", apiStatus],
  ["/api/submit", apiSubmit],
  ["/jugador/:slug", jugador],
  ["/sitemap.xml", sitemap],
  ["/robots.txt", robots],
];

function match(pattern, path) {
  const p = pattern.split("/"), a = path.replace(/\/+$/, "").split("/");
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) {
      if (!a[i]) return null;
      try { params[p[i].slice(1)] = decodeURIComponent(a[i]); } catch { return null; }
    } else if (p[i] !== a[i]) return null;
  }
  return params;
}

const HANDLER = { GET: "onRequestGet", HEAD: "onRequestGet", POST: "onRequestPost" };

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    for (const [pattern, mod] of ROUTES) {
      const params = match(pattern, pathname);
      if (!params) continue;
      const fn = mod[HANDLER[request.method]] || mod.onRequest;
      if (!fn) return new Response("Método no permitido", { status: 405, headers: { allow: Object.keys(HANDLER).filter(m => mod[HANDLER[m]]).join(", ") } });
      try {
        const res = await fn({ request, env, params, waitUntil: ctx.waitUntil.bind(ctx) });
        return request.method === "HEAD" ? new Response(null, res) : res;
      } catch (err) {
        console.error(pathname, err);
        return new Response("Error interno", { status: 500 });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
