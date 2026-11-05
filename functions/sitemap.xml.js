// sitemap.xml: las páginas fijas y una por cada pro. Google lo lee para descubrir todas las páginas.
import { loadData, proSlugs, origin } from "./_site.js";

export async function onRequestGet({ request, env }) {
  const base = origin(request);
  const { pros, prosUpdated } = await loadData(env, request);
  const slugs = proSlugs(pros);
  const day = d => (d ? String(d).slice(0, 10) : null);
  const urls = [
    { loc: `${base}/`, lastmod: day(prosUpdated) },
    { loc: `${base}/cambios/`, lastmod: day(prosUpdated) },
    { loc: `${base}/estadisticas/`, lastmod: day(prosUpdated) },
    { loc: `${base}/parecido/` },
    { loc: `${base}/comando/` },
    { loc: `${base}/conversor/` },
    { loc: `${base}/enviar/` },
    ...pros.map(p => ({ loc: `${base}/jugador/${slugs.get(p.id)}`, lastmod: day(p.since || p.seen) })),
    { loc: `${base}/comparar/` },
    // comparaciones entre compañeros de equipo (las que más se buscan; todas las parejas serían demasiadas)
    ...pros.flatMap(p => pros.filter(q => q.team && q.team === p.team && q.status !== "retired" && p.status !== "retired" && slugs.get(p.id) < slugs.get(q.id))
      .map(q => ({ loc: `${base}/comparar/${slugs.get(p.id)}-vs-${slugs.get(q.id)}` }))),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
