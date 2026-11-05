/* Página de jugador (/jugador/...): el HTML llega ya hecho del servidor en español.
   Aquí se dibuja la vista previa, se copia el código, se cambia de fondo y de idioma. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const store = { get(k){ try { return localStorage.getItem(k); } catch { return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch {} } };
const P = JSON.parse($('pdata').textContent);

const T = {
es: {
  navPros:'Miras', navCompare:'Comparar', footCmd:'¿Haces directos? Añade el comando !mira a tu chat →', navChanges:'Cambios', navStats:'Estadísticas', navConv:'Conversor', navSubmit:'Enviar demo', crumbPros:'Pros', crumbPlayers:'Jugadores',
  titlePre:'Mira de', retired:'Retirado', codeTitle:'Código de mira', copy:'Copiar', copied:'¡Copiado!', selected:'Ctrl+C',
  howto:'En CS2: Ajustes → Juego → Mira → Compartir o importar → pega el código → Importar.',
  edit:'Editar esta mira →', compareWith:'Comparar con', compareAny:'Comparar con otro jugador', preview:'Vista previa y valores', history:'Historial de miras', current:'actual', use:'Usar', mates:'Más miras de',
  steam:'Perfil de Steam', faceitProfile:'Perfil de FACEIT',
  footer:'Proyecto independiente. No está afiliado ni respaldado por Valve, FACEIT ni los equipos o jugadores que aparecen.',
  remove:'Pedir que retiremos un jugador',
  vals:['Estilo','Largo','Separación','Grosor','Color','Opacidad','Punto','Estilo T','Contorno','Sigue el retroceso','Resolución del código'],
  yes:'Sí', no:'No', outlineOpts:['No','Completo','Medio'],
  styles:['Cruz dinámica','Círculo dinámico','Cruz dinámica (legacy)','Círculo estático','Cruz estática','Cruz estática con retroceso','Solo punto','Quad dinámico','Cuadrado estático','Quad estático'],
  title: who => `Mira de ${who} en CS2 · CSConfig`, source: (s, d) => `Visto por última vez el ${d} · ${s}`, locale: 'es-ES',
},
en: {
  navPros:'Crosshairs', navCompare:'Compare', footCmd:'Streaming? Add the !crosshair command to your chat →', navChanges:'Changes', navStats:'Stats', navConv:'Converter', navSubmit:'Submit a demo', crumbPros:'Pros', crumbPlayers:'Players',
  titlePre:'Crosshair of', retired:'Retired', codeTitle:'Crosshair code', copy:'Copy', copied:'Copied!', selected:'Ctrl+C',
  howto:'In CS2: Settings → Game → Crosshair → Share or Import → paste the code → Import.',
  edit:'Edit this crosshair →', compareWith:'Compare with', compareAny:'Compare with another player', preview:'Preview and values', history:'Crosshair history', current:'current', use:'Use', mates:'More crosshairs from',
  steam:'Steam profile', faceitProfile:'FACEIT profile',
  footer:'Independent project. Not affiliated with or endorsed by Valve, FACEIT or the teams and players shown.',
  remove:'Ask us to remove a player',
  vals:['Style','Length','Gap','Thickness','Color','Opacity','Dot','T style','Outline','Follow recoil','Code resolution'],
  yes:'Yes', no:'No', outlineOpts:['No','Full','Half'],
  styles:['Dynamic cross','Dynamic circle','Dynamic cross (legacy)','Static circle','Static cross','Static cross with shot feedback','Dot only','Dynamic quad','Static square','Static quad'],
  title: who => `${who}'s CS2 crosshair · CSConfig`, source: (s, d) => `Last seen ${d} · ${s}`, locale: 'en-GB',
}};

let lang = store.get('lang') || ((navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en');
let shown = P.code;
const t = () => T[lang];
const decodeSafe = c => { try { return anyCode(c); } catch { return null; } };
const shownCode = (c, n) => /^CSGO-/.test(c) ? encodeNew(n) : c;

function vals(n) {
  const L = t(), V = L.vals, yn = v => v ? L.yes : L.no;
  return [[V[0], L.styles[n.style] ?? n.style], [V[1], n.length], [V[2], n.gap], [V[3], n.thickness],
    [V[4], `<i class="swatch" style="background:rgb(${n.r},${n.g},${n.b})"></i> ${n.r} ${n.g} ${n.b}`], [V[5], n.a],
    [V[6], yn(n.dot)], [V[7], yn(n.t)], [V[8], L.outlineOpts[n.outline] ?? n.outline], [V[9], yn(n.recoil)],
    [V[10], n.h ? `${n.h}p` : '—']].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
}

function show(code) {
  const n = decodeSafe(code); if (!n) return;
  shown = code;
  $('code').textContent = shownCode(code, n);
  $('edit').href = `/conversor/?c=${encodeURIComponent(shownCode(code, n))}&n=${encodeURIComponent(P.name)}`;
  $('vals').innerHTML = vals(n);
  const p = newParams(n); paint($('cv'), p, fitZoom($('cv').width, p));
  document.querySelectorAll('#hist [data-h]').forEach(b => b.setAttribute('aria-pressed', P.hist[+b.dataset.h] === code));
}


function applyLang() {
  const L = t();
  document.documentElement.lang = lang;
  document.title = L.title(P.team ? `${P.name} (${P.team === 'Retirado' ? L.retired : P.team})` : P.name);
  document.querySelectorAll('[data-i]').forEach(el => { const v = L[el.dataset.i]; if (typeof v === 'string') el.textContent = v; });
  const fmt = iso => { try { return new Date(iso).toLocaleDateString(L.locale, { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }); } catch { return iso; } };
  document.querySelectorAll('time[datetime]').forEach(el => { el.textContent = fmt(el.getAttribute('datetime')); });
  if (P.seen) $('src').textContent = L.source([P.source, P.map].filter(Boolean).join(' · '), fmt(P.seen));
  $('lang_es').setAttribute('aria-pressed', lang === 'es'); $('lang_en').setAttribute('aria-pressed', lang === 'en');
  show(shown);
}

let timer;
$('copy').onclick = async () => {
  const L = t(), btn = $('copy');
  try { await navigator.clipboard.writeText($('code').textContent); btn.textContent = L.copied; btn.classList.add('done'); }
  catch { const r = document.createRange(); r.selectNodeContents($('code')); getSelection().removeAllRanges(); getSelection().addRange(r); btn.textContent = L.selected; }
  clearTimeout(timer); timer = setTimeout(() => { btn.textContent = t().copy; btn.classList.remove('done'); }, 1800);
};
document.querySelectorAll('#hist [data-h]').forEach(b => b.onclick = () => show(P.hist[+b.dataset.h]));
$('lang_es').onclick = () => { lang = 'es'; store.set('lang', 'es'); applyLang(); };
$('lang_en').onclick = () => { lang = 'en'; store.set('lang', 'en'); applyLang(); };

applyLang();
})();
