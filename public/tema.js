/*
 * Modo día / noche del dashboard. Se carga en <head> antes de pintar (sin parpadeo).
 * · Automático: de día (8:00–20:00, hora del ordenador) claro; de noche, oscuro. Se revisa cada minuto.
 * · El botón ☀️/🌙 lo cambia a mano; ese cambio dura hasta el siguiente cambio automático
 *   (las 8:00 o las 20:00) y a partir de ahí vuelve a seguir la hora.
 * API: window.LSD_TEMA = { actual(), alternar(), manual(), siguienteCambio(), alCambiar(fn) }.
 * Diseño (Cuenta → Diseño): «clásico» (el de siempre, con día / noche) o «espacial» (el de la pantalla de acceso:
 * siempre oscuro, cielo de estrellas y tarjetas de cristal). Se guarda en este navegador (lsd_estilo).
 * API: window.LSD_ESTILO = { actual(), poner('clasico' | 'espacial'), guardado(), temporal('clasico' | 'espacial' | null) }.
 */
(function () {
  'use strict';
  var DIA_DESDE = 8;
  var DIA_HASTA = 20;
  var CLAVE = 'lsd_tema';
  var oyentes = [];

  function esDeDia(d) { var h = d.getHours(); return h >= DIA_DESDE && h < DIA_HASTA; }
  function automatico(d) { return esDeDia(d) ? 'light' : 'dark'; }
  // Próximo cambio automático (las 8:00 o las 20:00) a partir de `d`.
  function siguienteCambio(d) {
    var x = new Date(d.getTime());
    x.setSeconds(0, 0);
    x.setMinutes(0);
    if (esDeDia(d)) { x.setHours(DIA_HASTA); } else {
      if (d.getHours() >= DIA_HASTA) x.setDate(x.getDate() + 1);
      x.setHours(DIA_DESDE);
    }
    return x;
  }
  function leer() {
    try { var v = JSON.parse(localStorage.getItem(CLAVE) || 'null'); return v && v.tema && v.hasta > Date.now() ? v : null; } catch (e) { return null; }
  }
  function guardar(v) {
    try { if (v) localStorage.setItem(CLAVE, JSON.stringify(v)); else localStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento: solo en esta visita */ }
  }
  var enMemoria = null;
  function manual() { return leer() || (enMemoria && enMemoria.hasta > Date.now() ? enMemoria : null); }
  var CLAVE_ESTILO = 'lsd_estilo';
  // `temporal`: el diseño de una ventana que tiene el suyo propio (la Operativa) mientras está abierta.
  var temporal = null;
  function guardado() { try { return localStorage.getItem(CLAVE_ESTILO) === 'espacial' ? 'espacial' : 'clasico'; } catch (e) { return 'clasico'; } }
  function estilo() { return temporal || guardado(); }
  // El espacial es siempre oscuro.
  function deseado() { if (estilo() === 'espacial') return 'dark'; var m = manual(); return m ? m.tema : automatico(new Date()); }

  function aplicar(suave) {
    var root = document.documentElement;
    if (root.getAttribute('data-estilo') !== estilo()) root.setAttribute('data-estilo', estilo());
    var t = deseado();
    if (root.getAttribute('data-theme') === t) return;
    if (suave) {
      root.classList.add('tema-cambiando');
      setTimeout(function () { root.classList.remove('tema-cambiando'); }, 450);
    }
    root.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', estilo() === 'espacial' ? '#05060f' : t === 'dark' ? '#121212' : '#f7f6f3');
    for (var i = 0; i < oyentes.length; i++) { try { oyentes[i](t); } catch (e) { /* nada */ } }
  }

  function alternar() {
    var nuevo = deseado() === 'dark' ? 'light' : 'dark';
    // Si coincide con el automático, no hace falta guardar nada: se vuelve a seguir la hora.
    var v = nuevo === automatico(new Date()) ? null : { tema: nuevo, hasta: siguienteCambio(new Date()).getTime() };
    enMemoria = v;
    guardar(v);
    aplicar(true);
    return nuevo;
  }

  aplicar(false);
  setInterval(function () { aplicar(true); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) aplicar(true); });

  window.LSD_TEMA = {
    actual: deseado,
    alternar: alternar,
    manual: manual,
    siguienteCambio: function () { return siguienteCambio(new Date()); },
    alCambiar: function (fn) { oyentes.push(fn); },
  };
  window.LSD_ESTILO = {
    actual: estilo,
    poner: function (e) {
      try { localStorage.setItem(CLAVE_ESTILO, e === 'espacial' ? 'espacial' : 'clasico'); } catch (x) { /* sin almacenamiento */ }
      document.documentElement.setAttribute('data-estilo', estilo());
      document.documentElement.removeAttribute('data-theme'); // que se vuelva a aplicar el tema (y avise)
      aplicar(true);
      return estilo();
    },
    guardado: guardado,
    // Diseño solo mientras está abierta una ventana con el suyo ('clasico' | 'espacial'); null, el de siempre.
    temporal: function (e) {
      var nuevo = e === 'espacial' || e === 'clasico' ? e : null;
      if (nuevo === temporal) return estilo();
      temporal = nuevo;
      document.documentElement.setAttribute('data-estilo', estilo());
      document.documentElement.removeAttribute('data-theme');
      aplicar(true);
      return estilo();
    },
  };
}());
