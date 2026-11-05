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
import { loadOg, ogImage, origin } from "./functions/_site.js";

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

// Páginas estáticas (portada, conversor, enviar): se les añade la imagen de vista previa
// genérica. Va aquí porque la etiqueta necesita la dirección completa de la web.
async function withOg(res, request, env) {
  if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  const og = await loadOg(env, request);
  const img = ogImage(origin(request), og, null);
  const tags = `<meta property="og:type" content="website"><meta property="og:site_name" content="CSConfig">` +
    `<meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` +
    `<meta name="twitter:card" content="summary_large_image">`;
  let title = "", desc = "";
  return new HTMLRewriter()
    .on("title", { text(t) { title += t.text; } })
    .on('meta[name="description"]', { element(e) { desc = e.getAttribute("content") || ""; } })
    .on("head", {
      element(e) {
        e.onEndTag(end => {
          const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
          end.before(`${tags}<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">`, { html: true });
        });
      },
    })
    .transform(res);
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
    const res = await env.ASSETS.fetch(request);
    return withOg(res, request, env);
  },
};
