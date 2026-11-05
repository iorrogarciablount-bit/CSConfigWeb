/* Página de comparar (/comparar/...): el HTML llega hecho del servidor en español.
   Aquí se dibujan las dos miras con el mismo zoom, se copian los códigos,
   se cambia de fondo y de idioma, y el selector lleva a otra comparación. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const store = { get(k){ try { return localStorage.getItem(k); } catch { return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch {} } };
const D = JSON.parse($('cdata').textContent);

const T = {
es: {
  navPros:'Miras', navChanges:'Cambios', navStats:'Estadísticas', navConv:'Conversor', navSubmit:'Enviar demo',
  footer:'Proyecto independiente. No está afiliado ni respaldado por Valve, FACEIT ni los equipos o jugadores que aparecen.',
  remove:'Pedir que retiremos un jugador',
  titleIdx:'Comparar', titleIdx2:'miras', leadIdx:'Elige dos jugadores para ver sus miras lado a lado y en qué se diferencian.',
  choose:'Elige un jugador', compare:'Comparar', examples:'Compañeros de equipo', crumb:'Comparar', nf:'No encuentro esa comparación',
  similar:'de parecido', valsTitle:'Valores', diffNote:'Resaltado: lo que cambia entre las dos miras.',
  copy:'Copiar', copied:'¡Copiado!', selected:'Ctrl+C',
  summary:(pct, n) => pct === 100 ? 'Tienen exactamente la misma mira.' : n === 1 ? 'Solo cambia 1 valor.' : `Cambian ${n} valores.`,
  rows:{ style:'Estilo', length:'Largo', gap:'Separación', thickness:'Grosor', color:'Color', a:'Opacidad', dot:'Punto', t:'Estilo T', outline:'Contorno', recoil:'Sigue el retroceso', h:'Resolución del código' },
  yes:'Sí', no:'No', outlineOpts:['No','Completo','Medio'],
  styles:['Cruz dinámica','Círculo dinámico','Cruz dinámica (legacy)','Círculo estático','Cruz estática','Cruz estática con retroceso','Solo punto','Quad dinámico','Cuadrado estático','Quad estático'],
  title:(a, b) => `${a} vs ${b}: comparación de miras de CS2 · CSConfig`, titleIndex:'Comparar miras de jugadores de CS2 · CSConfig',
},
en: {
  navPros:'Crosshairs', navChanges:'Changes', navStats:'Stats', navConv:'Converter', navSubmit:'Submit a demo',
  footer:'Independent project. Not affiliated with or endorsed by Valve, FACEIT or the teams and players shown.',
  remove:'Ask us to remove a player',
  titleIdx:'Compare', titleIdx2:'crosshairs', leadIdx:'Pick two players to see their crosshairs side by side and what is different.',
  choose:'Pick a player', compare:'Compare', examples:'Teammates', crumb:'Compare', nf:'Comparison not found',
  similar:'similar', valsTitle:'Values', diffNote:'Highlighted: what differs between the two crosshairs.',
  copy:'Copy', copied:'Copied!', selected:'Ctrl+C',
  summary:(pct, n) => pct === 100 ? 'They have the exact same crosshair.' : n === 1 ? 'Only 1 value differs.' : `${n} values differ.`,
  rows:{ style:'Style', length:'Length', gap:'Gap', thickness:'Thickness', color:'Color', a:'Opacity', dot:'Dot', t:'T style', outline:'Outline', recoil:'Follow recoil', h:'Code resolution' },
  yes:'Yes', no:'No', outlineOpts:['No','Full','Half'],
  styles:['Dynamic cross','Dynamic circle','Dynamic cross (legacy)','Static circle','Static cross','Static cross with shot feedback','Dot only','Dynamic quad','Static square','Static quad'],
  title:(a, b) => `${a} vs ${b}: CS2 crosshair comparison · CSConfig`, titleIndex:'Compare CS2 player crosshairs · CSConfig',
}};

let lang = store.get('lang') || ((navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en');
let bgIdx = clamp(+(store.get('bg') || 0) || 0, 0, MAPS.length - 1);
const t = () => T[lang];
const decodeSafe = c => { try { return anyCode(c); } catch { return null; } };
const nL = D.mode === 'pair' ? decodeSafe(D.L.code) : null, nR = D.mode === 'pair' ? decodeSafe(D.R.code) : null;

function draw() {
  if (!nL || !nR) return;
  const pa = newParams(nL), pb = newParams(nR), cvL = $('cvL'), cvR = $('cvR');
  const z = Math.min(fitZoom(cvL.width, pa), fitZoom(cvR.width, pb));   // mismo zoom: se comparan a ojo
  paint(cvL, pa, z, bgIdx); paint(cvR, pb, z, bgIdx);
}

function rowValue(k, n) {
  const L = t();
  switch (k) {
    case 'style': return L.styles[n.style] ?? n.style;
    case 'color': return `<i class="swatch" style="background:rgb(${n.r},${n.g},${n.b})"></i> ${n.r} ${n.g} ${n.b}`;
    case 'dot': case 't': case 'recoil': return n[k] ? L.yes : L.no;
    case 'outline': return L.outlineOpts[n.outline] ?? n.outline;
    case 'h': return n.h ? `${n.h}p` : '—';
    default: return n[k];
  }
}

function buildBg() {
  document.querySelectorAll('.bgChips').forEach(box => {
    box.innerHTML = '';
    MAPS.forEach((name, i) => {
      const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = name;
      b.setAttribute('aria-pressed', i === bgIdx);
      b.onclick = () => { bgIdx = i; store.set('bg', i); buildBg(); draw(); };
      box.append(b);
    });
  });
}

function applyLang() {
  const L = t();
  document.documentElement.lang = lang;
  document.title = D.mode === 'pair' ? L.title(D.L.name, D.R.name) : L.titleIndex;
  document.querySelectorAll('[data-i]').forEach(el => { const v = L[el.dataset.i]; if (typeof v === 'string') el.textContent = v; });
  document.querySelectorAll('#rows tr').forEach(tr => {
    const k = tr.cells[0].dataset.row;
    tr.cells[0].textContent = L.rows[k];
    tr.cells[1].innerHTML = rowValue(k, nL); tr.cells[2].innerHTML = rowValue(k, nR);
  });
  if ($('summary')) $('summary').textContent = L.summary(D.pct, D.diffs);
  $('lang_es').setAttribute('aria-pressed', lang === 'es'); $('lang_en').setAttribute('aria-pressed', lang === 'en');
}

/* copiar códigos */
const timers = {};
document.querySelectorAll('[data-copy]').forEach(btn => btn.onclick = async () => {
  const L = t(), el = $(btn.dataset.copy);
  try { await navigator.clipboard.writeText(el.textContent); btn.textContent = L.copied; btn.classList.add('done'); }
  catch { const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); btn.textContent = L.selected; }
  clearTimeout(timers[btn.dataset.copy]);
  timers[btn.dataset.copy] = setTimeout(() => { btn.textContent = t().copy; btn.classList.remove('done'); }, 1800);
});

/* selector: al elegir los dos, ir directo (el servidor ordena la URL) */
const pick = $('pick');
if (pick) {
  const go = () => { const a = $('pa').value, b = $('pb').value; if (a && b && a !== b) location.href = `/comparar/${encodeURIComponent(a)}-vs-${encodeURIComponent(b)}`; };
  pick.addEventListener('submit', e => { e.preventDefault(); go(); });
  $('pa').addEventListener('change', go); $('pb').addEventListener('change', go);
}

$('lang_es').onclick = () => { lang = 'es'; store.set('lang', 'es'); applyLang(); };
$('lang_en').onclick = () => { lang = 'en'; store.set('lang', 'en'); applyLang(); };
buildBg(); draw(); applyLang();
})();
