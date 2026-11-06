/* Página de equipo (/equipo/...): el HTML llega hecho del servidor en español.
   Aquí se dibujan las miras (cada una con su zoom; para comparar tamaños está /comparar/),
   se copian los códigos y se cambia de idioma. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const store = { get(k){ try { return localStorage.getItem(k); } catch { return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch {} } };
const D = JSON.parse($('tdata').textContent);

const T = {
es: {
  navPros:'Miras', navCompare:'Comparar', navChanges:'Cambios', navStats:'Estadísticas', navConv:'Conversor', navSubmit:'Enviar demo', navStreamers:'Streamers',
  footCmd:'¿Haces directos? Añade el comando !mira a tu chat →', crumbPros:'Pros', titlePre:'Miras de',
  copy:'Copiar', copied:'¡Copiado!', selected:'Ctrl+C', comparePairs:'Comparar entre ellos', otherTeams:'Otros equipos',
  howto:'En CS2: Ajustes → Juego → Mira → Compartir o importar → pega el código → Importar.',
  footer:'Proyecto independiente. No está afiliado ni respaldado por Valve, FACEIT ni los equipos o jugadores que aparecen.',
  remove:'Pedir que retiremos un jugador',
  lead:(n, d) => `${n} ${n === 1 ? 'jugador' : 'jugadores'}${d ? ` · última demo: ${d}` : ''}`,
  title: t => `Miras de ${t} en CS2 · CSConfig`, locale:'es-ES',
},
en: {
  navPros:'Crosshairs', navCompare:'Compare', navChanges:'Changes', navStats:'Stats', navConv:'Converter', navSubmit:'Submit a demo', navStreamers:'Streamers',
  footCmd:'Streaming? Add the !crosshair command to your chat →', crumbPros:'Pros', titlePre:'Crosshairs of',
  copy:'Copy', copied:'Copied!', selected:'Ctrl+C', comparePairs:'Compare them', otherTeams:'Other teams',
  howto:'In CS2: Settings → Game → Crosshair → Share or Import → paste the code → Import.',
  footer:'Independent project. Not affiliated with or endorsed by Valve, FACEIT or the teams and players shown.',
  remove:'Ask us to remove a player',
  lead:(n, d) => `${n} ${n === 1 ? 'player' : 'players'}${d ? ` · last demo: ${d}` : ''}`,
  title: t => `${t} CS2 crosshairs · CSConfig`, locale:'en-GB',
}};

let lang = store.get('lang') || ((navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en');
const t = () => T[lang];
const decodeSafe = c => { try { return anyCode(c); } catch { return null; } };

function draw() {
  const cvs = [...document.querySelectorAll('canvas[data-c]')];
  cvs.forEach(cv => { const n = decodeSafe(D.codes[+cv.dataset.c]); if (!n) return; const p = newParams(n); paint(cv, p, fitZoom(cv.width, p)); });
}

function applyLang() {
  const L = t();
  document.documentElement.lang = lang;
  document.title = L.title(D.team);
  document.querySelectorAll('[data-i]').forEach(el => { const v = L[el.dataset.i]; if (typeof v === 'string') el.textContent = v; });
  const d = D.last ? new Date(D.last).toLocaleDateString(L.locale, { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }) : '';
  $('lead').textContent = L.lead(D.codes.length, d);
  $('lang_es').setAttribute('aria-pressed', lang === 'es'); $('lang_en').setAttribute('aria-pressed', lang === 'en');
}

const timers = {};
document.querySelectorAll('[data-copy]').forEach(btn => btn.onclick = async () => {
  const L = t(), el = $(btn.dataset.copy);
  try { await navigator.clipboard.writeText(el.textContent); btn.textContent = L.copied; btn.classList.add('done'); }
  catch { const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); btn.textContent = L.selected; }
  clearTimeout(timers[btn.dataset.copy]);
  timers[btn.dataset.copy] = setTimeout(() => { btn.textContent = t().copy; btn.classList.remove('done'); }, 1800);
});

$('lang_es').onclick = () => { lang = 'es'; store.set('lang', 'es'); applyLang(); };
$('lang_en').onclick = () => { lang = 'en'; store.set('lang', 'en'); applyLang(); };
draw(); applyLang();
})();
