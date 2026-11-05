// Piezas de dibujo compartidas por og.mjs (imágenes de vista previa) y avisos.mjs (Discord).
// Dibuja con el mismo crosshair.js que la web.

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// crosshair.js crea sus lienzos con document.createElement('canvas'): se lo damos hecho
globalThis.document = { createElement: () => createCanvas(1, 1) };
const site = await import("../../functions/_site.js");
export const XH = globalThis.XH;
export const proSlugs = site.proSlugs;
export { createCanvas };

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..");
export const W = 1200, H = 630;

GlobalFonts.registerFromPath(join(HERE, "fonts", "RobotoCondensed.ttf"), "RobotoCondensed");
GlobalFonts.registerFromPath(join(HERE, "fonts", "RobotoMono.ttf"), "RobotoMono");

export const C = { bg: "#11151a", panel: "#1a2028", line: "#2b3440", ink: "#dfe5ec", muted: "#8a96a4", accent: "#3a9cf0" };
export const STYLES = ["Cruz dinámica", "Círculo dinámico", "Cruz dinámica (legacy)", "Círculo estático", "Cruz estática",
  "Cruz estática con retroceso", "Solo punto", "Quad dinámico", "Cuadrado estático", "Quad estático"];

export const decode = code => { try { return XH.anyCode(code); } catch { return null; } };
export const shown = (code, n) => (/^CSGO-/.test(code) ? XH.encodeNew(n) : code);

/* Texto que se encoge hasta caber en maxW */
export function fitText(ctx, text, maxW, size, weight, family) {
  for (; size > 12; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return size;
}

export function brand(ctx, x, y) {
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 34px RobotoCondensed";
  // icono de mira de la cabecera de la web
  ctx.fillStyle = C.accent;
  const s = 22, cx = x + s / 2, cy = y - 12;
  ctx.fillRect(cx - 1.5, cy - s / 2, 3, 8); ctx.fillRect(cx - 1.5, cy + s / 2 - 8, 3, 8);
  ctx.fillRect(cx - s / 2, cy - 1.5, 8, 3); ctx.fillRect(cx + s / 2 - 8, cy - 1.5, 8, 3);
  ctx.fillStyle = "#e9eef3"; ctx.fillText("CS", x + s + 12, y);
  const w = ctx.measureText("CS ").width;
  ctx.fillStyle = C.accent; ctx.fillText("CONFIG", x + s + 12 + w, y);
}

/* Vista previa de la mira (misma función paint() de la web) en un cuadrado */
export function preview(ctx, n, x, y, size, zoom = null) {
  const cv = createCanvas(size, size);
  const p = XH.newParams(n);
  XH.paint(cv, p, zoom || XH.fitZoom(size, p));
  ctx.drawImage(cv, x, y);
  ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
}
