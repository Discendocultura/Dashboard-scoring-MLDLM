// Lector de Skool: un marcador («bookmarklet») que se pulsa en la página de Miembros de la comunidad en Skool, con la
// sesión de administrador iniciada. Skool no tiene API: así se leen los miembros sin guardar la contraseña de nadie.
//   1. Pide a Skool, página a página (?p=1, 2, 3…), los datos de Miembros que la propia página trae dentro
//      (el JSON de Next.js, «__NEXT_DATA__»), con la misma sesión de quien lo pulsa.
//   2. Busca en esos datos los miembros: cada objeto de una lista que contiene UN email (el de ese alumno) y lo deja
//      «plano» ({ 'user.email': …, 'member.tier': … }). Qué clave es cada dato se decide en AlquimIA (membresia.js).
//   3. Se lo manda a AlquimIA con postMessage (a la pestaña que abrió Skool o a una nueva, /?c=<cliente>#membresia) y, si el navegador no
//      deja, con un botón «Copiar» para pegarlo en Membresía.
// No toca nada en Skool: solo lee. Los datos van del navegador a AlquimIA; nunca pasan por otro sitio.

/* eslint-disable no-var, prefer-arrow-callback, func-names */
function lector(ORIGEN, CLI) {
  if (window.__alqSkool) return;
  window.__alqSkool = 1;
  var caja = document.createElement('div');
  caja.setAttribute('role', 'status');
  caja.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;max-width:380px;background:#fff;color:#1f2430;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:16px 18px;border-radius:14px;box-shadow:0 14px 44px rgba(0,0,0,.28);border:2px solid #6d4aff';
  document.body.appendChild(caja);
  var pon = function (h) { caja.innerHTML = '<div style="font-weight:800;margin-bottom:4px">AlquimIA · Alumnos de Skool</div>' + h; };
  var fin = function (ms) { setTimeout(function () { caja.remove(); window.__alqSkool = 0; }, ms || 400); };
  if (!/(^|\.)skool\.com$/.test(location.hostname)) {
    pon('Abre primero la página de <b>Miembros</b> de tu comunidad en Skool y vuelve a pulsar el marcador.');
    fin(7000);
    return;
  }
  var EM = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
  var json = function (s) { try { return JSON.parse(s); } catch (e) { return null; } };
  var emails = function (o, d, set) {
    if (d > 6 || !o || typeof o !== 'object' || set.size > 1) return set;
    for (var k in o) {
      var v = o[k];
      if (typeof v === 'string') {
        var t = v.trim();
        if (EM.test(t)) set.add(t.toLowerCase());
        else if (t.charAt(0) === '{' && t.length < 20000) emails(json(t), d + 1, set);
      } else if (v && typeof v === 'object') emails(v, d + 1, set);
      if (set.size > 1) break;
    }
    return set;
  };
  var plano = function (o, pre, out, d) {
    for (var k in o) {
      var v = o[k];
      var kk = pre ? pre + '.' + k : k;
      if (v == null || typeof v === 'function') continue;
      if (typeof v === 'string' && v.charAt(0) === '{' && v.length < 20000 && d < 4) {
        var p = json(v);
        if (p && typeof p === 'object') { plano(p, kk, out, d + 1); continue; }
      }
      if (typeof v === 'object') {
        if (Array.isArray(v)) { if (v.length && typeof v[0] !== 'object') out[kk] = v.slice(0, 10).join(', ').slice(0, 200); } else if (d < 4) plano(v, kk, out, d + 1);
      } else out[kk] = String(v).slice(0, 300);
    }
    return out;
  };
  var miembros = function (raiz, res) {
    (function walk(o, d) {
      if (!o || typeof o !== 'object' || d > 40) return;
      if (Array.isArray(o)) {
        for (var i = 0; i < o.length; i++) {
          var x = o[i];
          if (x && typeof x === 'object' && !Array.isArray(x)) {
            var s = emails(x, 0, new Set());
            if (s.size === 1) {
              var e = s.values().next().value;
              var f = plano(x, '', {}, 0);
              if (!res[e] || Object.keys(f).length > Object.keys(res[e]).length) res[e] = f;
              continue;
            }
          }
          walk(x, d + 1);
        }
      } else for (var k in o) walk(o[k], d + 1);
    })(raiz, 0);
  };
  var datosDe = function (html) {
    var m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    return m ? json(m[1]) : null;
  };
  var res = {};
  var paginas = 0;
  (async function () {
    try {
      var base = new URL(location.href);
      base.searchParams.delete('p');
      for (var p = 1; p <= 400; p++) {
        pon('Leyendo los miembros… página ' + p + ' · <b>' + Object.keys(res).length + '</b> alumnos');
        var u = new URL(base.href);
        if (p > 1) u.searchParams.set('p', String(p));
        var r = await fetch(u.href, { credentials: 'include' });
        if (!r.ok) break;
        var d = datosDe(await r.text());
        if (!d) break;
        var antes = Object.keys(res).length;
        miembros(d, res);
        if (Object.keys(res).length === antes) break;
        paginas = p;
        await new Promise(function (ok) { setTimeout(ok, 300); });
      }
      var filas = Object.keys(res).map(function (e) { return res[e]; });
      if (!filas.length) {
        pon('No encuentro alumnos con email aquí. Comprueba que estás en la página de <b>Miembros</b> de la comunidad y que tu usuario es <b>administrador</b> (solo así Skool enseña los emails).');
        fin(12000);
        return;
      }
      var datos = { tipo: 'alquimia-skool', version: 1, cliente: CLI, comunidad: location.pathname.split('/')[1] || '', url: base.href, at: Date.now(), paginas: paginas, filas: filas };
      var ok = false;
      window.addEventListener('message', function (e) {
        if (ok || e.origin !== ORIGEN || !e.data || e.data.tipo !== 'alquimia-skool-ok') return;
        ok = true;
        pon('✅ <b>' + filas.length + ' alumnos</b> enviados a AlquimIA. Revísalos allí antes de guardar. Ya puedes cerrar esta pestaña.');
        fin(8000);
      });
      var w = window.opener && !window.opener.closed ? window.opener : null;
      var intentos = 0;
      var enviar = function () {
        if (ok) return;
        try { if (w) w.postMessage(datos, ORIGEN); } catch (e) { /* la pestaña de AlquimIA ya no está */ }
        intentos++;
        if (intentos === 3 && !ok) w = window.open(ORIGEN + '/' + (CLI ? '?c=' + encodeURIComponent(CLI) : '') + '#membresia', 'alquimia-skool');
        if (intentos < 60) setTimeout(enviar, 700);
        else if (!ok) {
          pon('Leídos <b>' + filas.length + ' alumnos</b>, pero tu navegador no deja mandarlos solos.<br><button type="button" id="alq-copiar" style="margin-top:8px;padding:8px 14px;border-radius:10px;border:0;background:#6d4aff;color:#fff;font-weight:700;cursor:pointer">Copiar para AlquimIA</button><br><small>Después, en AlquimIA → Membresía → «Pegar los datos de Skool».</small>');
          document.getElementById('alq-copiar').onclick = function () {
            navigator.clipboard.writeText(JSON.stringify(datos)).then(function () { pon('Copiado ✅. Pégalo en AlquimIA → Membresía → «Pegar los datos de Skool».'); fin(9000); });
          };
        }
      };
      pon('Leídos <b>' + filas.length + ' alumnos</b> (' + paginas + (paginas === 1 ? ' página' : ' páginas') + '). Mandándolos a AlquimIA…');
      enviar();
    } catch (e) {
      pon('No he podido leer los miembros: ' + String(e && e.message || e).slice(0, 120));
      fin(10000);
    }
  })();
}

// El enlace del marcador (para arrastrarlo a la barra de marcadores). `origen`: la dirección de AlquimIA
// (https://…), `cliente`: el cliente al que van los alumnos.
export function enlaceLector(origen, cliente = '') {
  const codigo = `(${lector.toString()})(${JSON.stringify(String(origen))},${JSON.stringify(String(cliente || ''))})`;
  return `javascript:${encodeURIComponent(codigo)}`;
}

// Para las pruebas: el lector tal cual (se ejecuta en un DOM de prueba).
export const _lector = lector;

// ¿Es un mensaje del lector? (lo comprueba AlquimIA antes de usarlo: viene de otra web).
export const ORIGEN_SKOOL = /^https:\/\/([a-z0-9-]+\.)*skool\.com$/;
export function esDatosSkool(d) {
  return Boolean(d && typeof d === 'object' && d.tipo === 'alquimia-skool' && Array.isArray(d.filas) && d.filas.length <= 20000
    && d.filas.every((f) => f && typeof f === 'object' && !Array.isArray(f)));
}
