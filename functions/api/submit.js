import { json, gh, configured } from "./_lib.js";

const FACEIT_ROOM = /^https:\/\/(www\.)?faceit\.com\/[a-z-]{2,5}\/cs2\/room\/(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export async function onRequestPost({ request, env }) {
  if (!configured(env)) return json({ error: "El envío desde la web todavía no está activado." }, 503);

  let data;
  try { data = await request.json(); } catch { return json({ error: "Petición no válida." }, 400); }
  const url = String(data.url || "").trim();
  const event = String(data.event || "").replace(/[\r\n\t]+/g, " ").replace(/[^\p{L}\p{N}\s·.,:&'()\/-]/gu, "").trim().slice(0, 80);

  if (!/^https:\/\/\S{8,1900}$/.test(url)) return json({ error: "Pega un enlace que empiece por https://" }, 400);

  // Anti-spam con Cloudflare Turnstile (si está configurado).
  if (env.TURNSTILE_SECRET) {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", String(data.turnstile || ""));
    form.append("remoteip", request.headers.get("CF-Connecting-IP") || "");
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).then(r => r.json()).catch(() => ({}));
    if (!v.success) return json({ error: "No hemos podido comprobar que no eres un bot. Vuelve a intentarlo." }, 400);
  }

  const room = url.match(FACEIT_ROOM);
  const title = `Demo (web): ${event || (room ? `FACEIT ${room[2]}` : url.split("?")[0].split("/").pop() || "enlace")}`.slice(0, 120);
  const body = `<!-- enviado desde la web -->\n\n### Enlace a la demo\n\n${url}\n\n### Torneo o partido\n\n${event || "_No response_"}`;
  const res = await gh(env, "/issues", { method: "POST", body: JSON.stringify({ title, body, labels: ["demo", "web"] }) });
  if (!res.ok) return json({ error: "No se ha podido registrar el envío. Inténtalo más tarde." }, 502);
  const issue = await res.json();
  return json({ id: issue.number });
}
