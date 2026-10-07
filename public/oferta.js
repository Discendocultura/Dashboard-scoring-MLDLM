/*
 * Página de la oferta de un meteórico (oferta flash) en GHL. Pega en un bloque "Código HTML":
 *
 *     <div data-lsd-oferta></div>
 *     <script src="https://TU-DASHBOARD.pages.dev/oferta.js?m=CODIGO" defer></script>
 *
 * (los clientes que no son el principal llevan además &c=<cliente>; el dashboard te da el código exacto).
 * Pinta la cuenta atrás según la fase: «se abre en…» (calentamiento), «se cierra en…» con el botón de
 * compra (oferta abierta) y «ha terminado» (cerrada; si hay página de cerrado, manda allí). Cuenta las
 * visitas a la página (una por persona y sesión) para la conversión de la oferta. Los textos, horas y
 * enlaces se cambian en el dashboard: ⚡ Meteóricos → Configurar.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var src = script ? new URL(script.src) : null;
  var API = src ? src.origin : '';
  var CODE = src ? src.searchParams.get('m') || '' : '';
  var CLIENTE = src ? src.searchParams.get('c') || '' : '';
  if (!CODE) return;
  var q = 'm=' + encodeURIComponent(CODE) + (CLIENTE ? '&c=' + encodeURIComponent(CLIENTE) : '');

  var css = '.lsd-of{font-family:inherit;text-align:center;padding:14px 16px;border-radius:14px;background:#1f1a17;color:#fff;margin:0 auto;max-width:720px}'
    + '.lsd-of p{margin:0 0 6px;font-size:16px}.lsd-of .lsd-of-t{font-size:30px;font-weight:800;letter-spacing:.02em;font-variant-numeric:tabular-nums}'
    + '.lsd-of a{display:inline-block;margin-top:10px;padding:12px 26px;border-radius:999px;background:#f2c94c;color:#1f1a17;font-weight:800;text-decoration:none}'
    + '.lsd-of.abierta{background:#7a1d1d}.lsd-of.cerrada{background:#55504c}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cuenta(ms) {
    if (ms <= 0) return '00:00:00';
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d ? d + 'd ' : '') + p(h) + ':' + p(m) + ':' + p(s);
  }

  fetch(API + '/api/meteorico?estado=1&' + q).then(function (r) { return r.json(); }).then(function (e) {
    if (!e || !e.fase) return;
    var desfase = Date.now() - e.ahora; // por si el reloj del móvil va adelantado o atrasado
    var cajas = document.querySelectorAll('[data-lsd-oferta]');
    // Visita (una por sesión), salvo en preparación.
    try {
      var k = 'lsd_of_' + CODE;
      if (e.fase !== 'preparacion' && !sessionStorage.getItem(k)) {
        sessionStorage.setItem(k, '1');
        var body = JSON.stringify({ op: 'visita', m: CODE });
        if (navigator.sendBeacon) navigator.sendBeacon(API + '/api/meteorico' + (CLIENTE ? '?c=' + encodeURIComponent(CLIENTE) : ''), body);
        else fetch(API + '/api/meteorico' + (CLIENTE ? '?c=' + encodeURIComponent(CLIENTE) : ''), { method: 'POST', body: body, headers: { 'content-type': 'text/plain' } });
      }
    } catch (err) { /* sin almacenamiento: no se cuenta */ }
    var t = e.textos || {};
    // Suscripción: un botón por plan («Mensual · 29 €/mes»); si no, el botón de la oferta.
    function botones() {
      if (e.planes && e.planes.length > 1) {
        return '<div>' + e.planes.map(function (p) {
          return '<a href="' + esc(p.url) + '" style="margin:10px 5px 0">' + esc(p.label) + (p.precio ? ' · ' + esc(String(p.precio).replace('.', ',')) + ' €/' + esc(p.periodo) : '') + '</a>';
        }).join('') + '</div>';
      }
      return e.pagoUrl ? '<a href="' + esc(e.pagoUrl) + '">' + esc(t.boton || 'Quiero la oferta') + '</a>' : '';
    }
    function pintar() {
      var ahora = Date.now() - desfase;
      var fase = e.cierre && ahora >= e.cierre ? 'cerrada' : e.apertura && ahora >= e.apertura ? 'abierta' : 'calentamiento';
      var html;
      if (fase === 'cerrada') {
        if (e.cerradaUrl && location.href.indexOf(e.cerradaUrl) !== 0) { location.replace(e.cerradaUrl); return; }
        html = '<p>' + esc(t.cerrada || 'La oferta ha terminado. ¡Gracias!') + '</p>';
      } else if (fase === 'abierta') {
        html = '<p>' + esc(t.abierta || '⚡ La oferta está abierta. Se cierra en') + '</p><div class="lsd-of-t">' + cuenta(e.cierre - ahora) + '</div>'
          + botones();
      } else {
        html = '<p>' + esc(t.calentamiento || 'La oferta se abre en') + '</p><div class="lsd-of-t">' + (e.apertura ? cuenta(e.apertura - ahora) : '') + '</div>';
      }
      for (var i = 0; i < cajas.length; i++) { cajas[i].className = 'lsd-of ' + fase; cajas[i].innerHTML = html; }
    }
    pintar();
    setInterval(pintar, 1000);
  }).catch(function () { /* sin conexión: la página se queda como está */ });
}());
