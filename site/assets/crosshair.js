/* Núcleo de miras CS2: formato de códigos (verificado con 30 códigos reales), conversión y dibujo */
'use strict';
const DICT = 'ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789';
const PRESET = {0:[255,0,0],1:[0,255,0],2:[255,255,0],3:[0,0,255],4:[0,255,255]};
const STYLE_MAP = {0:0,1:4,2:2,3:0,4:4,5:5};

function toBytes(chars, nBytes) {
  let big = 0n;
  for (const ch of [...chars].reverse()) {
    const i = DICT.indexOf(ch);
    if (i < 0) throw new Error('badchar:'+ch);
    big = big * 57n + BigInt(i);
  }
  const hex = big.toString(16).padStart(nBytes * 2, '0');
  if (hex.length > nBytes * 2) throw new Error('invalid');
  const b = [];
  for (let i = 0; i < nBytes * 2; i += 2) b.push(parseInt(hex.slice(i, i + 2), 16));
  if (b[0] !== b.slice(1).reduce((a, v) => a + v, 0) % 256) throw new Error('checksum');
  return b;
}

function decodeOld(code) {
  const b = toBytes(code.replace(/CSGO|-/g, ''), 18);
  const i8 = n => (n << 24) >> 24;
  return {
    gap: i8(b[2]) / 10, outlinethickness: b[3] / 2, r: b[4], g: b[5], b: b[6], alpha: b[7],
    splitdist: b[8] & 7, recoil: ((b[8] >> 4) & 8) ? 1 : 0, color: b[10] & 7, drawoutline: (b[10] & 8) ? 1 : 0,
    innermod: (b[10] >> 4) / 10, outermod: (b[11] & 15) / 10, splitratio: (b[11] >> 4) / 10, thickness: b[12] / 10,
    dot: ((b[13] >> 4) & 1) ? 1 : 0, useweapongap: ((b[13] >> 4) & 2) ? 1 : 0, usealpha: ((b[13] >> 4) & 4) ? 1 : 0,
    t: ((b[13] >> 4) & 8) ? 1 : 0, style: (b[13] & 15) >> 1, size: b[14] / 10,
  };
}

function decodeNew(code) {
  const b = toBytes(code.slice(2), 32);
  const dyn = b[18] | (b[19] << 8) | (b[20] << 16) | (b[21] << 24);
  const r2 = x => Math.round(x * 100) / 100;
  let gap = b[14] | (b[15] << 8); if (gap & 0x8000) gap -= 0x10000;
  return {
    h: b[2] | (b[3] << 8), style: b[4] & 31, recoil: (b[4] >> 5) & 1, dot: (b[4] >> 6) & 1, t: (b[4] >> 7) & 1,
    r: b[5], g: b[6], b: b[7], a: b[8], or: b[9], og: b[10], ob: b[11], oa: b[12],
    thickness: b[13] & 31, outline: (b[13] >> 6) & 3, gap, length: b[16], spread: b[17],
    splitdist: b[18] & 127, innermod: r2(((dyn >>> 7) & 127) / 100), outermod: r2(((dyn >>> 14) & 127) / 100 + .3),
    splitratio: r2(((dyn >>> 21) & 127) / 100), ironcolor: (b[21] >> 4) & 1, ironscale: r2(.1 + b[22] / 100),
  };
}

function encodeNew(n) {
  const dyn = ((n.splitdist & 127) | ((Math.round(n.innermod * 100) & 127) << 7) |
    ((Math.round((n.outermod - .3) * 100) & 127) << 14) | ((Math.round(n.splitratio * 100) & 127) << 21)) >>> 0;
  const g = n.gap & 0xffff;
  const b = [0, 1, n.h & 255, (n.h >> 8) & 255,
    (n.style & 31) | (n.recoil << 5) | (n.dot << 6) | (n.t << 7),
    n.r, n.g, n.b, n.a, n.or, n.og, n.ob, n.oa,
    (n.thickness & 31) | ((n.outline & 3) << 6), g & 255, g >> 8, n.length, n.spread & 255,
    dyn & 255, (dyn >>> 8) & 255, (dyn >>> 16) & 255, (dyn >>> 24) & 255,
    Math.round((n.ironscale - .1) * 100) & 255, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  b[21] |= n.ironcolor << 4;
  b[0] = b.slice(1).reduce((a, v) => a + v, 0) & 255;
  let big = BigInt('0x' + b.map(x => x.toString(16).padStart(2, '0')).join(''));
  let code = 'CS';
  for (let i = 0; i < 44; i++) { code += DICT[Number(big % 57n)]; big /= 57n; }
  return code;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const bround = x => { const f = Math.floor(x); return Math.abs(x - f - .5) < 1e-9 ? (f % 2 ? f + 1 : f) : Math.round(x); };
const oldPx = (o, h) => { const s = h / 480; return { len: bround(o.size * s), thick: Math.max(1, bround(o.thickness * s)), gap: Math.trunc(4 + o.gap) }; };
const oldRgb = o => o.color !== 5 && PRESET[o.color] ? PRESET[o.color] : [o.r, o.g, o.b];

function convert(o, h) {
  const px = oldPx(o, h), rgb = oldRgb(o), a = o.usealpha ? o.alpha : 255;
  return {
    h, style: STYLE_MAP[o.style] ?? 4, recoil: o.recoil, dot: o.dot, t: o.t,
    r: rgb[0], g: rgb[1], b: rgb[2], a, or: 0, og: 0, ob: 0, oa: a,
    thickness: clamp(px.thick, 1, 31), outline: o.drawoutline ? 1 : 0,
    gap: clamp(px.gap + px.thick % 2, -3840, 3840), length: clamp(px.len, 0, 255), spread: 128,
    splitdist: o.splitdist, innermod: clamp(o.innermod, 0, 1), outermod: clamp(o.outermod, .3, 1), splitratio: clamp(o.splitratio, 0, 1),
    ironcolor: 1, ironscale: 1,
  };
}


/* ---------- fondo de la vista previa: neutro y siempre igual ----------
   Gris grafito, para que las miras de colores vivos (cian, verde, amarillo, blanco...) se vean bien.
   Si la mira es oscura (azul, negro...) y no se distinguiría sobre él, se usa la versión clara. */
const BG = { dark: ['#3a4048', '#262b31', 'rgba(255,255,255,.035)'], light: ['#c9cfd6', '#aab1ba', 'rgba(0,0,0,.06)'] };
const luminance = ([r, g, b]) => {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const rgbOf = color => (String(color).match(/\d+(\.\d+)?/g) || [0, 255, 0]).slice(0, 3).map(Number);
/* 'light' si la mira contrasta poco con el gris oscuro (ratio de contraste WCAG < 2.5) */
const bgTone = color => ((luminance(rgbOf(color)) + 0.05) / (luminance([48, 54, 61]) + 0.05) < 2.5 ? 'light' : 'dark');
function drawBg(ctx, W, zoom, color) {
  const [mid, edge, grid] = BG[color ? bgTone(color) : 'dark'];
  const g = ctx.createRadialGradient(W / 2, W / 2, W * 0.05, W / 2, W / 2, W * 0.75);
  g.addColorStop(0, mid); g.addColorStop(1, edge);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
  if (zoom > 3) {   // rejilla de píxeles muy tenue: ayuda a contar píxeles al ampliar
    ctx.fillStyle = grid;
    for (let x = 0; x < W; x += zoom) { ctx.fillRect(x, 0, 1, W); ctx.fillRect(0, x, W, 1); }
  }
}

/* ---------- dibujo ---------- */
function shapes(p, c) {
  const th = p.thick, x0 = c - Math.floor(th / 2), y0 = x0, x1 = x0 + th, y1 = x1, r = [];
  if (p.arms && p.len > 0) {
    r.push([x1 + p.gap, y0, p.len, th], [x0 - p.gap - p.len, y0, p.len, th], [x0, y1 + p.gap, th, p.len]);
    if (!p.t) r.push([x0, y0 - p.gap - p.len, th, p.len]);
  }
  if (p.dot) r.push([x0, y0, th, th]);
  if (p.quad) {
    const d = Math.max(p.gap + p.len + 2, 6), a = Math.max(2, th + 1);
    for (const [sx, sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
      const ox = sx < 0 ? c - d - th : c + d, oy = sy < 0 ? c - d - th : c + d;
      r.push([sx < 0 ? ox : ox - a + th, oy, a, th], [ox, sy < 0 ? oy : oy - a + th, th, a]);
    }
  }
  return r;
}
const extent = p => Math.abs(p.gap) + p.len + p.thick + (p.quad ? 8 : 0) + 2;
function paint(cv, p, zoom) {
  const ctx = cv.getContext('2d'), W = cv.width, c = Math.floor(W / zoom / 2);
  drawBg(ctx, W, zoom, p.color);
  const R = ([x, y, w, h], pad, fill) => { if (w > 0 && h > 0) { ctx.fillStyle = fill; ctx.fillRect((x - pad) * zoom, (y - pad) * zoom, (w + 2 * pad) * zoom, (h + 2 * pad) * zoom); } };
  if (p.circle) {
    const rad = (Math.abs(p.gap) + p.len) * zoom, cx = (c + .5) * zoom;
    if (p.outline) { ctx.strokeStyle = p.outlineColor; ctx.lineWidth = (p.thick + 2) * zoom; ctx.beginPath(); ctx.arc(cx, cx, rad, 0, 7); ctx.stroke(); }
    ctx.strokeStyle = p.color; ctx.lineWidth = p.thick * zoom; ctx.beginPath(); ctx.arc(cx, cx, rad, 0, 7); ctx.stroke();
  }
  const rs = shapes(p, c);
  if (p.outline) rs.forEach(s => R(s, p.outline, p.outlineColor));
  rs.forEach(s => R(s, 0, p.color));
}

/* parámetros de dibujo para un código nuevo decodificado */
function newParams(n) {
  const st = n.style, th = Math.max(1, n.thickness);
  return { len: n.length, thick: th, gap: n.gap - th % 2, dot: n.dot || st === 6, t: n.t,
    outline: n.outline ? 1 : 0, outlineColor: `rgba(${n.or},${n.og},${n.ob},${n.oa / 255})`,
    arms: [0, 2, 4, 5, 7, 9].includes(st), circle: [1, 3].includes(st), quad: [7, 8, 9].includes(st),
    color: `rgba(${n.r},${n.g},${n.b},${n.a / 255})` };
}
function fitZoom(W, p) { return clamp(Math.floor(W / (extent(p) * 2 + 6)), 2, 14); }
/* acepta código nuevo (CS…) o antiguo (CSGO-…, convertido a 1080p) */
function anyCode(code) {
  if (/^CSGO(-[A-Za-z0-9]{5}){5}$/.test(code)) return convert(decodeOld(code), 1080);
  return decodeNew(code);
}


/* ---------- URL de la página de cada jugador ---------- */
/* Slug de un nombre: "-kRyTouS" -> "krytous" */
const slugify = name => String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
/* Map SteamID -> slug de cada pro; si el slug falta, es un número o lo comparten dos pros, se usa su SteamID */
function proSlugs(pros) {
  const count = new Map();
  pros.forEach(p => { const s = slugify(p.name); count.set(s, (count.get(s) || 0) + 1); });
  return new Map(pros.map(p => { const s = slugify(p.name); return [p.id, s && count.get(s) === 1 && !/^\d+$/.test(s) ? s : p.id]; }));
}

/* ---------- parecido entre dos miras (decodificadas) ---------- */
const styleFamily = s => [4, 5].includes(s) ? 'static' : [0, 2].includes(s) ? 'dynamic' : [1, 3].includes(s) ? 'circle' : s === 6 ? 'dot' : 'quad';
/* Distancia: 0 = iguales. Pesa más lo que más se nota en pantalla (grosor, separación, color, estilo) */
function crosshairDistance(a, b) {
  const lim = (x, y) => Math.min(Math.abs(x - y), 10);
  let d = a.style === b.style ? 0 : styleFamily(a.style) === styleFamily(b.style) ? 1 : 4;
  d += lim(a.length, b.length) * 0.6 + lim(a.gap, b.gap) * 0.8 + lim(a.thickness, b.thickness) * 1.0;
  d += Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) / 441.7 * 5 + Math.abs(a.a - b.a) / 255;
  d += (!!a.dot !== !!b.dot) * 2 + (!!a.t !== !!b.t) * 3 + (!!a.outline !== !!b.outline) * 1;
  return d;
}
/* Parecido en % (100 = misma mira) */
const crosshairSimilarity = (a, b) => Math.round(100 * Math.exp(-crosshairDistance(a, b) / 10));
/* Qué campos visibles cambian: [{ k, a, b }] con k en style, length, gap, thickness, color, a, dot, t, outline, recoil */
function crosshairDiff(a, b) {
  const out = [];
  for (const k of ['style', 'length', 'gap', 'thickness']) if (a[k] !== b[k]) out.push({ k, a: a[k], b: b[k] });
  if (a.r !== b.r || a.g !== b.g || a.b !== b.b) out.push({ k: 'color', a: [a.r, a.g, a.b], b: [b.r, b.g, b.b] });
  if (a.a !== b.a) out.push({ k: 'a', a: a.a, b: b.a });
  for (const k of ['dot', 't', 'outline', 'recoil']) if (!!a[k] !== !!b[k]) out.push({ k, a: a[k], b: b[k] });
  return out;
}

/* La misma mira como comandos de consola del sistema nuevo (en una línea, para la consola o el autoexec.cfg).
   cl_crosshair_screen_height va primero: largo, separación y grosor son píxeles a esa resolución. */
function consoleCmds(n) {
  return [['cl_crosshair_screen_height', n.h], ['cl_crosshairstyle', n.style], ['cl_crosshair_length', n.length], ['cl_crosshair_gap', n.gap],
    ['cl_crosshair_thickness', n.thickness], ['cl_crosshairdot', n.dot], ['cl_crosshair_t', n.t], ['cl_crosshair_drawoutline', n.outline],
    ['cl_crosshaircolor_r', n.r], ['cl_crosshaircolor_g', n.g], ['cl_crosshaircolor_b', n.b], ['cl_crosshaircolor_a', n.a],
    ['cl_crosshair_recoil', n.recoil]].filter(([k, v]) => v !== undefined && !(k === 'cl_crosshair_screen_height' && !v))
    .map(([k, v]) => `${k} ${v}`).join('; ');
}

/* Para las funciones de Cloudflare (functions/) y el generador de imágenes (pipeline/og/),
   que importan este archivo como módulo */
globalThis.XH = { decodeOld, decodeNew, encodeNew, convert, anyCode, newParams, paint, fitZoom, slugify, proSlugs, crosshairSimilarity, crosshairDiff, consoleCmds };
