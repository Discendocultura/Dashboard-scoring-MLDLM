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
  var VERSION_LECTOR_DENTRO = 4; // = VERSION_LECTOR (abajo): sube con cada cambio del lector
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
  // Lista de planes / precios de la comunidad (fuera de los miembros): cada objeto con un código (id) y un nombre,
  // y su precio si lo trae. Sirve para traducir el código de plan de cada alumno («c852af…» → «VIP»).
  var COD = /^[a-f0-9]{16,}$|^[0-9a-f]{8}-[0-9a-f]{4}-|^(price|prod|plan|sub)_[A-Za-z0-9]{8,}$/i;
  var NOMBRE = /^(name|title|label|display_?name|tier_?name|plan_?name|nombre|product_?name)$/i;
  // Nombre de cada código: el del propio objeto o, si no tiene (un precio dentro de su plan), el del más cercano por
  // encima. Si el propio nombre es solo la periodicidad («Monthly», «Anual»), se junta con el del plan: «VIP anual».
  var PERIODO = /^(monthly|annual|annually|yearly|month|year|mensual|anual|trimestral|quarterly|semanal|weekly)$/i;
  var catalogo = function (raiz, cat) {
    // `arriba`: nombre heredado, solo dentro de algo que se llama precio/plan/tier/producto (si no, un código cualquiera
    // dentro de la comunidad cogería el nombre de la comunidad).
    var EN_PRECIO = /price|tier|plan|product|membership|level|subscription|pricing|offer/i;
    (function walk(o, d, arriba) {
      if (!o || typeof o !== 'object' || d > 40 || Object.keys(cat).length > 3000) return;
      if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) walk(o[i], d + 1, arriba); return; }
      var conEmail = emails(o, 0, new Set()).size > 0; // una persona: su nombre no es el de un plan
      var ids = []; var nombre = ''; var importe = null; var intervalo = ''; var hijos = [];
      for (var k in o) {
        var v = o[k];
        if (typeof v === 'string') {
          var t = v.trim();
          if (COD.test(t)) ids.push(t);
          else if (NOMBRE.test(k) && t && t.length <= 60 && !EM.test(t)) nombre = nombre || t;
          else if (/interval|period|recurr/i.test(k) && t.length < 20) intervalo = intervalo || t;
          else if ((t.charAt(0) === '{' || t.charAt(0) === '[') && t.length < 50000) { var pj = json(t); if (pj && typeof pj === 'object') hijos.push({ v: pj, k: k }); }
        } else if (typeof v === 'number' && /amount|price|cost|unit/i.test(k) && importe == null) importe = v;
        else if (v && typeof v === 'object') hijos.push({ v: v, k: k });
      }
      var propio = conEmail ? '' : nombre;
      var ES = { monthly: 'mensual', month: 'mensual', mensual: 'mensual', annual: 'anual', annually: 'anual', yearly: 'anual', year: 'anual', anual: 'anual', quarterly: 'trimestral', trimestral: 'trimestral', weekly: 'semanal', semanal: 'semanal' };
      var ef = propio && PERIODO.test(propio) && arriba ? arriba + ' ' + (ES[propio.toLowerCase()] || propio.toLowerCase()) : propio || (conEmail ? '' : arriba);
      var dist = propio ? 0 : 1;
      if (ef && !conEmail) {
        for (var j = 0; j < ids.length; j++) {
          var x = cat[ids[j]];
          if (!x || x.dist > dist) cat[ids[j]] = { nombre: ef, importe: importe, intervalo: intervalo, dist: dist };
        }
      }
      var paraHijos = conEmail ? '' : (propio && !PERIODO.test(propio) ? propio : arriba);
      for (var h = 0; h < hijos.length; h++) walk(hijos[h].v, d + 1, EN_PRECIO.test(hijos[h].k) ? paraHijos : '');
    })(raiz, 0, '');
  };
  var datosDe = function (html) {
    var m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    return m ? json(m[1]) : null;
  };
  var res = {};
  var cat = {};
  var pagDe = {}; // en qué página de Miembros sale cada alumno (para abrir su ficha)
  var paginas = 0;
  var espera = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
  var hasta = async function (cond, ms) { var t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (cond()) return true; } catch (e) { /* aún no */ } await espera(150); } return false; };
  // ---- Fichas: abrir cada alumno (clic en su nombre) y quedarse con lo que Skool carga al abrirla ----
  // Se escuchan las respuestas JSON de la página (fetch y XHR) y, tras cada clic, las que hablan de ese alumno (traen su
  // email o su id, o son de «member») se guardan como «ficha.*». También el texto de la ventana que se abre.
  var capt = [];
  var escuchar = function () {
    if (window.__alqFetch) return;
    window.__alqFetch = 1;
    var f0 = window.fetch;
    window.fetch = function () {
      var pr = f0.apply(this, arguments);
      pr.then(function (r) { try { if (/json/i.test(r.headers.get('content-type') || '')) r.clone().json().then(function (j) { capt.push({ t: Date.now(), url: String(r.url || ''), j: j }); }).catch(function () {}); } catch (e) { /* nada */ } }).catch(function () {});
      return pr;
    };
    var X = XMLHttpRequest.prototype; var o0 = X.open; var s0 = X.send;
    X.open = function (m, u) { this.__alqU = u; return o0.apply(this, arguments); };
    X.send = function () { var x = this; x.addEventListener('load', function () { try { if (/json/i.test(x.getResponseHeader('content-type') || '')) capt.push({ t: Date.now(), url: String(x.__alqU || ''), j: JSON.parse(x.responseText) }); } catch (e) { /* nada */ } }); return s0.apply(this, arguments); };
  };
  var valorDe = function (f, re) { for (var k in f) if (re.test(k)) return String(f[k] || '').trim(); return ''; };
  var nombreVisible = function (f) {
    var n = (valorDe(f, /(^|\.)first_?name$/i) + ' ' + valorDe(f, /(^|\.)last_?name$/i)).trim();
    return n || valorDe(f, /(^|\.)(display_?name|full_?name)$/i);
  };
  var buscarEl = function (nombre) {
    var n = String(nombre || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (n.length < 3) return null;
    var els = document.querySelectorAll('a,button,[role="button"],span,div,p,h1,h2,h3,h4,strong');
    var mejor = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (caja.contains(el)) continue;
      var t = (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (t === n && (!mejor || mejor.contains(el))) mejor = el;
    }
    return mejor ? (mejor.closest('a,button,[role="button"]') || mejor) : null;
  };
  // La tarjeta del alumno en la lista de Miembros: el bloque más pequeño que contiene su nombre y un botón
  // «Membresía» / «Membership». → { tarjeta, boton } (o null).
  var MEMB = /^\s*(membres\S{0,3}a|membership)\s*$/i;
  var buscarTarjeta = function (nombre) {
    var n = String(nombre || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (n.length < 3) return null;
    var els = document.querySelectorAll('a,span,div,p,h1,h2,h3,h4,strong');
    var nom = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (caja.contains(el)) continue;
      var t = (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (t === n && (!nom || nom.contains(el))) nom = el;
    }
    for (var a = nom; a && a !== document.body; a = a.parentElement) {
      var bs = a.querySelectorAll('button,a,[role="button"]');
      for (var j = 0; j < bs.length; j++) if (MEMB.test(bs[j].textContent || '') || MEMB.test(bs[j].getAttribute('aria-label') || '')) return { tarjeta: a, boton: bs[j] };
    }
    return nom ? { tarjeta: nom.parentElement, boton: null } : null;
  };
  // Lo que dice la tarjeta: «$367/año», «Se renueva en 363 días», «Se unió el nov. 8, 2026», «Activo hace 19h».
  var MESES = { ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11 };
  var fechaTexto = function (t) {
    var m = /([a-záéíóú]{3})[a-záéíóú]*\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(t) || null;
    if (m && MESES[m[1].toLowerCase()] != null) return new Date(Date.UTC(+m[3], MESES[m[1].toLowerCase()], +m[2], 12)).toISOString();
    m = /(\d{1,2})\s+(?:de\s+)?([a-záéíóú]{3})[a-záéíóú]*\.?\s+(?:de\s+)?(\d{4})/i.exec(t);
    if (m && MESES[m[2].toLowerCase()] != null) return new Date(Date.UTC(+m[3], MESES[m[2].toLowerCase()], +m[1], 12)).toISOString();
    return '';
  };
  var haceTexto = function (t) {
    var m = /(\d+)\s*(min|m\b|h|d|sem|w|mes|mo|a\b|y)/i.exec(t);
    if (!m) return /ahora|now|online|en l[ií]nea/i.test(t) ? new Date().toISOString() : '';
    var u = m[2].toLowerCase(); var n = +m[1];
    var ms = /^min|^m$/.test(u) ? 6e4 : u === 'h' ? 36e5 : u === 'd' ? 864e5 : /^sem|^w/.test(u) ? 6048e5 : /^mes|^mo/.test(u) ? 2592e6 : 31536e6;
    return new Date(Date.now() - n * ms).toISOString();
  };
  var leerTarjeta = function (tarjeta, f) {
    var t = (tarjeta && tarjeta.innerText || '').replace(/ /g, ' ');
    if (!t) return 0;
    var n = 0;
    var put = function (k, v) { if (v && !(k in f)) { f[k] = v; n++; } };
    put('tarjeta.texto', t.slice(0, 1500));
    var pm = /([$€£]\s?[\d.,]+|[\d.,]+\s?[$€£]|[\d.,]+\s?(?:usd|eur))\s*\/\s*(año|mes|semana|year|month|week|yr|mo)\b/i.exec(t);
    if (pm) put('tarjeta.precio', pm[0].replace(/\s+/g, ''));
    if (/gratis|free/i.test(t) && !pm) put('tarjeta.precio', '0/mes');
    var rn = /(?:se renueva en|renews in)\s+(\d+)\s+(d[ií]as?|days?|mes(?:es)?|months?|años?|years?)/i.exec(t);
    if (rn) { var dias = /^d/i.test(rn[2]) ? +rn[1] : /^m/i.test(rn[2]) ? +rn[1] * 30 : +rn[1] * 365; put('tarjeta.renueva', new Date(Date.now() + dias * 864e5).toISOString()); }
    var un = /(?:se uni[oó] el|joined)\s+([^\n]+)/i.exec(t);
    if (un) put('tarjeta.alta', fechaTexto(un[1]));
    var ac = /(?:activ[oa]|active)\s+([^\n]+)/i.exec(t);
    if (ac) put('tarjeta.ultima', haceTexto(ac[1]));
    var cn = /(se uni[oó] directamente|joined directly|invitad[oa]|invited)[^\n]*/i.exec(t);
    if (cn) put('tarjeta.como', cn[0].trim());
    if (/cancel|se cancela|no se renueva|churn/i.test(t)) put('tarjeta.renovacion', 'no se renueva');
    return n;
  };
  var ventana = function () { var l = document.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="Modal"],[class*="modal"]'); for (var i = l.length - 1; i >= 0; i--) if (!caja.contains(l[i]) && (l[i].textContent || '').trim()) return l[i]; return null; };
  var cerrar = async function (urlAntes) {
    if (location.href !== urlAntes) { history.back(); await hasta(function () { return location.href === urlAntes; }, 5000); await espera(500); return; }
    var v = ventana();
    if (!v) return;
    var x = v.querySelector('[aria-label*="lose" i],[aria-label*="errar" i],button[class*="lose" i]');
    if (x) x.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    await hasta(function () { return !ventana(); }, 2000);
  };
  var irAPagina = async function (p, base) {
    var u = new URL(base.href);
    if (p > 1) u.searchParams.set('p', String(p));
    var actual = new URL(location.href);
    if ((actual.searchParams.get('p') || '1') === String(p) && actual.pathname === u.pathname) return true;
    var rt = window.next && window.next.router;
    if (!rt || !rt.push) return false; // sin el navegador de Skool solo se abre la página que se ve
    rt.push(u.pathname + u.search);
    await hasta(function () { return (new URL(location.href).searchParams.get('p') || '1') === String(p); }, 8000);
    await espera(1200);
    return true;
  };
  var abrirFichas = async function (base) {
    escuchar();
    var emails0 = Object.keys(res);
    var paginasL = [];
    for (var i = 0; i < emails0.length; i++) if (paginasL.indexOf(pagDe[emails0[i]] || 1) < 0) paginasL.push(pagDe[emails0[i]] || 1);
    paginasL.sort(function (a, b) { return a - b; });
    var hechos = 0; var conFicha = 0; var parar = false; var sinPagina = 0;
    for (var pi = 0; pi < paginasL.length && !parar; pi++) {
      var pg = paginasL[pi];
      var dePag = emails0.filter(function (e) { return (pagDe[e] || 1) === pg; });
      if (!(await irAPagina(pg, base))) { sinPagina += dePag.length; hechos += dePag.length; continue; }
      for (var j = 0; j < dePag.length && !parar; j++) {
        var e = dePag[j];
        var f = res[e];
        hechos++;
        pon('Abriendo la ficha de cada alumno… <b>' + hechos + ' / ' + emails0.length + '</b><br><small>No toques esta pestaña mientras tanto.</small><br><button type="button" id="alq-parar" style="margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">Parar y enviar lo leído</button>');
        var bp = document.getElementById('alq-parar');
        if (bp) bp.onclick = function () { parar = true; };
        var nombre = nombreVisible(f);
        await hasta(function () { return buscarTarjeta(nombre); }, 4000);
        var tj = buscarTarjeta(nombre);
        if (!tj) continue;
        // Lo que ya enseña la tarjeta (precio, renovación, alta, última conexión), aunque no haya botón.
        var deTarjeta = leerTarjeta(tj.tarjeta, f);
        if (!tj.boton) { if (deTarjeta) conFicha++; continue; }
        var el = tj.boton; // el botón «Membresía» de su tarjeta (no su nombre: ese abre el perfil)
        var uid = valorDe(f, /(^|\.)id$/i);
        var urlAntes = location.href;
        var t0 = Date.now();
        el.click();
        await hasta(function () { return ventana() || location.href !== urlAntes || capt.some(function (c) { return c.t >= t0; }); }, 3000);
        await espera(900);
        var añadidos = 0;
        for (var c = 0; c < capt.length; c++) {
          if (capt[c].t < t0) continue;
          var txtJ = '';
          try { txtJ = JSON.stringify(capt[c].j); } catch (er) { continue; }
          if (txtJ.length > 400000) continue;
          if (txtJ.toLowerCase().indexOf(e) < 0 && !(uid && txtJ.indexOf(uid) >= 0) && !/member/i.test(capt[c].url)) continue;
          var pl = plano(capt[c].j, 'ficha', {}, 0);
          for (var k in pl) if (!(k in f) && añadidos < 200) { f[k] = pl[k]; añadidos++; }
        }
        var v = ventana();
        if (v) { f['ficha.texto'] = (v.innerText || '').replace(/\s+\n/g, '\n').slice(0, 2000); añadidos++; }
        if (añadidos) conFicha++;
        await cerrar(urlAntes);
        await espera(250);
      }
    }
    return { conFicha: conFicha, sinPagina: sinPagina, parado: parar };
  };
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
        for (var ek in res) if (!pagDe[ek]) pagDe[ek] = p;
        catalogo(d, cat);
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
      // ¿Abrir la ficha de cada alumno? Ahí Skool enseña su plan, lo que paga y más; tarda unos segundos por alumno.
      var minutos = Math.max(1, Math.round(filas.length * 3 / 60));
      var elegir = await new Promise(function (ok) {
        pon('Leídos <b>' + filas.length + ' alumnos</b> (' + paginas + (paginas === 1 ? ' página' : ' páginas') + ').<br>Para traer <b>el plan y todos sus datos</b>, abro la ficha de cada uno (unos ' + minutos + ' min).<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" id="alq-fichas" style="padding:8px 14px;border-radius:10px;border:0;background:#6d4aff;color:#fff;font-weight:700;cursor:pointer">Abrir cada ficha</button><button type="button" id="alq-ya" style="padding:8px 14px;border-radius:10px;border:1px solid #ccc;background:#fff;cursor:pointer">Enviar sin abrirlas</button></div>');
        document.getElementById('alq-fichas').onclick = function () { ok(true); };
        document.getElementById('alq-ya').onclick = function () { ok(false); };
      });
      var resumenFichas = null;
      if (elegir) {
        resumenFichas = await abrirFichas(base);
        filas = Object.keys(res).map(function (e) { return res[e]; });
      }
      var datos = { tipo: 'alquimia-skool', version: VERSION_LECTOR_DENTRO, fichas: resumenFichas, cliente: CLI, comunidad: location.pathname.split('/')[1] || '', url: base.href, at: Date.now(), paginas: paginas, filas: filas, catalogo: cat };
      var ok = false;
      window.addEventListener('message', function (e) {
        if (ok || e.origin !== ORIGEN || !e.data || e.data.tipo !== 'alquimia-skool-ok') return;
        ok = true;
        pon('✅ <b>' + filas.length + ' alumnos</b> enviados a AlquimIA. Revísalos allí antes de guardar. Ya puedes cerrar esta pestaña.');
        fin(8000);
      });
      // Envío: 1) a la pestaña de AlquimIA que abrió Skool (si Skool no ha cortado la conexión), sin que se note;
      // 2) con el botón «Enviar a AlquimIA»: un formulario al servidor de AlquimIA en una pestaña nueva (lo abre un clic,
      // así que el navegador no lo bloquea); 3) «Copiar» y pegarlo en AlquimIA.
      var w = null;
      try { w = window.opener && !window.opener.closed ? window.opener : null; } catch (e) { w = null; }
      var intentos = 0;
      var porPestana = function () {
        if (ok || !w || intentos++ > 8) return;
        try { w.postMessage(datos, ORIGEN); } catch (e) { /* la pestaña de AlquimIA ya no está */ }
        setTimeout(porPestana, 600);
      };
      var BTN = 'margin-top:8px;padding:9px 14px;border-radius:10px;font-weight:700;cursor:pointer;font:inherit;font-weight:700;';
      pon('Leídos <b>' + filas.length + ' alumnos</b> (' + paginas + (paginas === 1 ? ' página' : ' páginas') + ')' + (resumenFichas ? ', con <b>' + resumenFichas.conFicha + '</b> fichas' : '') + '.'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="alq-enviar" style="' + BTN + 'border:0;background:#6d4aff;color:#fff">Enviar a AlquimIA</button>'
        + '<button type="button" id="alq-copiar" style="' + BTN + 'border:1px solid #ccc;background:#fff;color:#1f2430">Copiar</button></div>'
        + '<small style="display:block;margin-top:6px;color:#666">«Enviar» abre AlquimIA en otra pestaña con la revisión. Si no funciona, «Copiar» y en AlquimIA → Membresía → «Pegar datos».</small>');
      document.getElementById('alq-enviar').onclick = function () {
        var f = document.createElement('form');
        f.method = 'POST';
        f.action = ORIGEN + '/api/skool-entrada' + (CLI ? '?c=' + encodeURIComponent(CLI) : '');
        f.target = '_blank';
        f.style.display = 'none';
        var t = document.createElement('textarea');
        t.name = 'datos';
        t.value = JSON.stringify(datos);
        f.appendChild(t);
        document.body.appendChild(f);
        f.submit();
        setTimeout(function () { f.remove(); }, 1000);
        ok = true;
        pon('✅ <b>' + filas.length + ' alumnos</b> enviados. Se abre AlquimIA en otra pestaña con la revisión (si no se abre, mira si tu navegador ha bloqueado una ventana y permítela).<br><small>Ya puedes cerrar esta pestaña.</small>');
        fin(15000);
      };
      document.getElementById('alq-copiar').onclick = function () {
        navigator.clipboard.writeText(JSON.stringify(datos)).then(function () { ok = true; pon('Copiado ✅. Pégalo en AlquimIA → Membresía → «Pegar datos».'); fin(10000); })
          .catch(function () { pon('Tu navegador no deja copiar desde aquí. Usa «Enviar a AlquimIA».'); });
      };
      porPestana();
    } catch (e) {
      pon('No he podido leer los miembros: ' + String(e && e.message || e).slice(0, 120));
      fin(10000);
    }
  })();
}

// El enlace del marcador (para arrastrarlo a la barra de marcadores). `origen`: la dirección de AlquimIA
// (https://…), `cliente`: el cliente al que van los alumnos.
// El marcador CARGA el lector más nuevo desde AlquimIA (/api/skool-lector): así no se queda viejo aunque se
// arrastrase hace meses. Si Skool no deja cargar scripts de fuera (o AlquimIA no responde en 6 s), usa el que lleva
// dentro (el de cuando se arrastró).
export const VERSION_LECTOR = 4;
export const codigoLector = (origen, cliente = '') => `(${lector.toString()})(${JSON.stringify(String(origen))},${JSON.stringify(String(cliente || ''))})`;
export function enlaceLector(origen, cliente = '') {
  const O = JSON.stringify(String(origen));
  const C = JSON.stringify(String(cliente || ''));
  const cargador = `(function(O,C){var hecho=false;var dentro=function(){if(hecho)return;hecho=true;(${lector.toString()})(O,C);};`
    + `var s=document.createElement('script');s.src=O+'/api/skool-lector?o='+encodeURIComponent(O)+'&cl='+encodeURIComponent(C)+'&t='+Date.now();`
    + `s.onload=function(){if(hecho)return;if(window.__alqLectorNuevo){hecho=true;window.__alqLectorNuevo(O,C);}else dentro();};s.onerror=dentro;`
    + `setTimeout(function(){if(!hecho&&!window.__alqLectorNuevo)dentro();},6000);(document.head||document.documentElement).appendChild(s);})(${O},${C})`;
  return `javascript:${encodeURIComponent(cargador)}`;
}

// Para las pruebas: el lector tal cual (se ejecuta en un DOM de prueba).
export const _lector = lector;

// ¿Es un mensaje del lector? (lo comprueba AlquimIA antes de usarlo: viene de otra web).
export const ORIGEN_SKOOL = /^https:\/\/([a-z0-9-]+\.)*skool\.com$/;
export function esDatosSkool(d) {
  return Boolean(d && typeof d === 'object' && d.tipo === 'alquimia-skool' && Array.isArray(d.filas) && d.filas.length <= 20000
    && d.filas.every((f) => f && typeof f === 'object' && !Array.isArray(f)));
}
