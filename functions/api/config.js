import { json, configured } from "./_lib.js";

// La página del formulario pregunta aquí si el envío está activo y qué clave de Turnstile usar.
export const onRequestGet = ({ env }) =>
  json({ enabled: configured(env), turnstile: env.TURNSTILE_SITEKEY || null });
