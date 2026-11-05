/* Menú de móvil (botón ☰, funciona solo con CSS): cerrarlo con Escape o al tocar fuera. */
(() => {
  const t = document.getElementById('navt'), top = document.querySelector('.top');
  if (!t || !top) return;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && t.checked) { t.checked = false; document.querySelector('.navbtn')?.focus(); } });
  document.addEventListener('click', e => { if (t.checked && !top.contains(e.target)) t.checked = false; });
})();
