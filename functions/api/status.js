import { json, gh, configured } from "./_lib.js";

// Estado de un envío: pendiente → procesando → procesada / rechazada / error.
export async function onRequestGet({ request, env }) {
  if (!configured(env)) return json({ error: "No disponible." }, 503);
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Identificador no válido." }, 400);

  const res = await gh(env, `/issues/${id}`);
  if (!res.ok) return json({ error: "Envío no encontrado." }, 404);
  const issue = await res.json();
  const labels = (issue.labels || []).map(l => l.name);
  if (!labels.includes("demo")) return json({ error: "Envío no encontrado." }, 404);

  let state = "pendiente";
  for (const s of ["procesada", "rechazada", "error"]) if (labels.includes(s)) state = s;
  if (state === "pendiente" && labels.includes("aprobada")) state = "procesando";

  let result = null;
  if (["procesada", "rechazada", "error"].includes(state)) {
    const cr = await gh(env, `/issues/${id}/comments?per_page=30`);
    const comments = cr.ok ? await cr.json() : [];
    for (const c of comments.reverse()) {
      const m = /<!-- resultado: (\{[\s\S]*?\}) -->/.exec(c.body || "");
      if (m) { try { result = JSON.parse(m[1]); } catch {} break; }
    }
  }
  return json({ id, state, result }, 200);
}
