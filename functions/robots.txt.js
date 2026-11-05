// robots.txt con la dirección del sitemap (tiene que ser absoluta, por eso se genera aquí).
export const onRequestGet = ({ request }) =>
  new Response(`User-agent: *\nDisallow: /api/\n\nSitemap: ${new URL("/sitemap.xml", request.url).href}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
