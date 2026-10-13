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


/* ---------- escenas ilustradas (en píxeles de pantalla; la mira va en el centro 110,110) ---------- */
const MAPS = ['Dust II','Mirage','Inferno','Nuke','Ancient','Anubis','Overpass'];
const SC = 220, SCC = 110, sceneCache = {};
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function scene(i) {
  if (sceneCache[i]) return sceneCache[i];
  const cv = document.createElement('canvas'); cv.width = cv.height = SC;
  const x = cv.getContext('2d'); if (!x) return null;
  const rnd = mulberry(1234 + i * 77);
  const R = (a, b, w, h, c) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
  const bricks = (a, b, w, h, bw, bh, c, m, jit) => {
    R(a, b, w, h, m);
    for (let yy = b, row = 0; yy < b + h; yy += bh, row++) {
      for (let xx = a - (row % 2 ? bw / 2 : 0); xx < a + w; xx += bw) {
        const x0 = Math.max(a, xx), x1 = Math.min(a + w, xx + bw - 1), y1 = Math.min(b + h, yy + bh - 1);
        const k = jit ? (rnd() - .5) * jit : 0;
        x.fillStyle = shade(c, k); x.fillRect(x0, yy, x1 - x0, y1 - yy);
      }
    }
  };
  const sky = (h, top, bot) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bot); x.fillStyle = g; x.fillRect(0, 0, SC, h); };
  const blobs = (n, a, b, w, h, rmax, c) => { x.fillStyle = c; for (let k = 0; k < n; k++) { x.beginPath(); x.arc(a + rnd() * w, b + rnd() * h, 2 + rnd() * rmax, 0, 7); x.fill(); } };
  switch (i) {
    case 0: // Dust II: cielo, muro de arenisca y portón oscuro
      sky(84, '#8fbbe0', '#cfe0ea');
      bricks(0, 84, SC, SC - 84, 30, 15, '#c9a46c', '#a98552', 18);
      R(56, 88, 52, 132, '#7e5f3a'); R(60, 92, 46, 128, '#32261a');
      R(60, 92, 46, 3, '#5a4329'); blobs(14, 0, 180, SC, 40, 5, '#b8935e');
      break;
    case 1: // Mirage: yeso crema, tejado de terracota y ventana en arco
      sky(40, '#a8cde8', '#d6e6ef');
      R(0, 40, SC, 20, '#a9532f'); for (let k = 0; k < SC; k += 6) R(k, 40, 2, 20, '#8e4225');
      R(0, 60, SC, 4, '#7a3a20'); bricks(0, 64, SC, SC - 64, 44, 22, '#e2d1ac', '#d3c096', 10);
      x.fillStyle = '#6b5a44'; x.beginPath(); x.moveTo(108, 160); x.lineTo(108, 92); x.arc(136, 92, 28, Math.PI, 0); x.lineTo(164, 160); x.fill();
      x.fillStyle = '#231d18'; x.beginPath(); x.moveTo(112, 158); x.lineTo(112, 94); x.arc(136, 94, 24, Math.PI, 0); x.lineTo(160, 158); x.fill();
      break;
    case 2: // Inferno: ladrillo rojizo, puerta verde de madera y hiedra
      bricks(0, 0, SC, SC, 16, 8, '#a6553a', '#7c3c29', 22);
      R(108, 58, 66, 162, '#4a3322'); R(112, 62, 58, 158, '#3d6b3c');
      for (let k = 112; k < 170; k += 10) R(k, 62, 2, 158, '#2e5530');
      R(112, 120, 58, 3, '#2e5530'); R(160, 140, 4, 6, '#c8a24a');
      blobs(60, 0, 0, 90, 70, 6, '#4f7a32'); blobs(30, 0, 0, 70, 50, 4, '#6a9440');
      break;
    case 3: // Nuke: paneles metálicos, franja de peligro y zona oscura con luz
      R(0, 0, SC, 66, '#26323d'); R(70, 18, 80, 8, '#f3efcf'); R(66, 26, 88, 3, '#55606a');
      for (let yy = 66; yy < SC; yy += 40) for (let xx = 0; xx < SC; xx += 30) { R(xx, yy, 30, 40, '#6d7c87'); R(xx + 1, yy + 1, 28, 38, shade('#8b9ba6', (rnd() - .5) * 14)); }
      R(0, 112, SC, 14, '#141414'); x.fillStyle = '#e8bf2a';
      for (let k = -14; k < SC; k += 14) { x.beginPath(); x.moveTo(k, 126); x.lineTo(k + 7, 112); x.lineTo(k + 14, 112); x.lineTo(k + 7, 126); x.fill(); }
      break;
    case 4: // Ancient: piedra con musgo, hueco de jungla y friso turquesa
      bricks(0, 0, SC, SC, 24, 18, '#727b5c', '#4e5741', 26);
      R(0, 150, SC, 8, '#3c8c84'); for (let k = 0; k < SC; k += 8) R(k, 152, 4, 4, '#2a6a64');
      blobs(40, 120, 0, 100, 90, 5, '#5d7f3a');
      R(40, 0, 66, SC, '#18231a'); blobs(70, 40, 0, 66, SC, 4, '#2c4a26'); blobs(25, 40, 0, 66, SC, 3, '#41693a');
      break;
    case 5: // Anubis: cielo, arenisca, columna tallada y agua turquesa
      sky(70, '#7fbbe6', '#c3def0');
      bricks(0, 70, SC, 80, 40, 20, '#d9ba8b', '#bc9a6b', 12);
      R(112, 30, 22, 120, '#b8946a'); for (let k = 40; k < 150; k += 12) R(112, k, 22, 2, '#9c7a52');
      R(0, 150, SC, 70, '#2a9ea4'); for (let k = 0; k < 14; k++) R(rnd() * SC, 154 + rnd() * 62, 10 + rnd() * 20, 2, '#63c8ca');
      break;
    case 6: // Overpass: cielo, hormigón con manchas, pilar y césped
      sky(60, '#9fc2db', '#d7e5ec');
      R(0, 60, SC, 92, '#9d9e98'); for (let k = 0; k < 6; k++) R(0, 60 + k * 16, SC, 1, '#8c8d87');
      blobs(20, 0, 64, SC, 80, 7, '#8f908a'); R(100, 40, 26, 112, '#7d7e79'); R(100, 40, 26, 6, '#6b6c67');
      R(0, 152, SC, 68, '#5d893b'); blobs(80, 0, 152, SC, 68, 3, '#6f9b47');
      break;
  }
  // desenfoque: reducir y volver a ampliar suavizado, dos pasadas
  const soft = (cvs, f) => {
    const m = document.createElement('canvas'); m.width = m.height = Math.round(SC / f);
    const mx = m.getContext('2d'); mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high';
    mx.drawImage(cvs, 0, 0, m.width, m.height);
    x.clearRect(0, 0, SC, SC); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(m, 0, 0, SC, SC);
  };
  soft(cv, 4); soft(cv, 11); soft(cv, 5);
  // luz: brillo suave arriba y viñeta en los bordes
  const lg = x.createRadialGradient(SCC, 40, 10, SCC, 90, 200);
  lg.addColorStop(0, 'rgba(255,245,225,.18)'); lg.addColorStop(.5, 'rgba(255,245,225,0)'); lg.addColorStop(1, 'rgba(0,0,0,.28)');
  x.fillStyle = lg; x.fillRect(0, 0, SC, SC);
  // grano sutil para que no parezca plano
  try {
    const img = x.getImageData(0, 0, SC, SC), d = img.data;
    for (let p = 0; p < d.length; p += 4) { const n = (rnd() - .5) * 6; d[p] += n; d[p + 1] += n; d[p + 2] += n; }
    x.putImageData(img, 0, 0);
  } catch {}
  return sceneCache[i] = cv;
}
function shade(hexc, k) {
  const n = parseInt(hexc.slice(1), 16), f = v => clamp(Math.round(v + k), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function drawBg(ctx, W, zoom, c, idx = 0) {
  const sc = scene(idx);
  ctx.fillStyle = '#9a8a6a'; ctx.fillRect(0, 0, W, W);
  if (!sc) return;
  ctx.imageSmoothingEnabled = false;
  const n = Math.ceil(W / zoom) + 1, s = SCC - c;
  ctx.drawImage(sc, s, s, n, n, 0, 0, n * zoom, n * zoom);
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
function paint(cv, p, zoom, idx = 0) {
  const ctx = cv.getContext('2d'), W = cv.width, c = Math.floor(W / zoom / 2);
  drawBg(ctx, W, zoom, c, idx);
  if (zoom > 3) { // rejilla de píxeles tenue
    ctx.fillStyle = 'rgba(0,0,0,.07)';
    for (let x = 0; x < W; x += zoom) { ctx.fillRect(x, 0, 1, W); ctx.fillRect(0, x, W, 1); }
  }
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

