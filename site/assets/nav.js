/* En móvil el menú es una fila que se desliza: al entrar, dejar visible la sección actual. */
(() => {
  const nav = document.querySelector('.topnav'), cur = nav && nav.querySelector('[aria-current="page"]');
  if (!cur || nav.scrollWidth <= nav.clientWidth) return;
  nav.scrollLeft = Math.max(0, cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2);
})();
