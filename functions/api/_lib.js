// Utilidades compartidas por las funciones de Cloudflare Pages.
// Variables de entorno (Cloudflare → Workers & Pages → tu proyecto → Settings → Variables and Secrets):
//   GITHUB_TOKEN       (secreto) token fine-grained con permiso Issues: Read and write sobre el repo
//   GITHUB_REPO        (texto)   p. ej. iorrogarciablount-bit/CSConfigWeb
//   TURNSTILE_SITEKEY  (texto)   clave pública del widget anti-spam de Cloudflare Turnstile
//   TURNSTILE_SECRET   (secreto) clave secreta de ese widget

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export function gh(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "CSConfigWeb",
      "x-github-api-version": "2022-11-28",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
}

export const configured = env => Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO);
