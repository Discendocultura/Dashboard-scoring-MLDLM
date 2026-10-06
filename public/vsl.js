/*
 * Páginas del embudo VSL en GHL. Pega en un bloque "Código HTML":
 *
 *   Página de la VSL (vídeo medido + botones que aparecen en el minuto configurado):
 *     <div data-lsd-vsl></div>
 *   Páginas de gracias (vídeo sin medir):
 *     <div data-lsd-vsl-embed="gracias"></div>   (tras registrarse)
 *     <div data-lsd-vsl-embed="agenda"></div>    (tras reservar la llamada)
 *   Y una sola vez por página:
 *     <script src="https://TU-DASHBOARD.pages.dev/vsl.js" defer></script>
 *
 * Todo (vídeo, minuto de los botones, textos y enlaces) se cambia en el dashboard:
 * VSL → Configuración → Páginas del embudo. Identifica a la lead por ?cid={{contact.id}} o
 * ?email={{contact.email}} en la URL (o lo que recuerda el navegador) y avisa al dashboard al
 * llegar al 25%, 50%, 75% y 90% del vídeo (segundos realmente vistos).
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var API = script ? new URL(script.src).origin : '';
  // Cliente del dashboard (varios clientes): viene en el src del script, p. ej. tracker.js?c=clinica-sol.
  var CLIENTE = script ? new URL(script.src).searchParams.get('c') || '' : '';
  function conCliente(path) { return CLIENTE ? path + (path.indexOf('?') >= 0 ? '&' : '?') + 'c=' + encodeURIComponent(CLIENTE) : path; }
  var STORE = 'lsd_identity';
  var params = new URLSearchParams(location.search);
  var THRESHOLDS = [25, 50, 75, 90];

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      return null;
    }
  }

  // Misma identidad que tracker.js (las dos páginas comparten dominio).
  function identity() {
    var saved = store(STORE) || {};
    var cid = params.get('cid') || params.get('contact_id');
    var email = params.get('email');
    if (cid && !/^\{\{/.test(cid)) {
      store(STORE, { cid: cid, email: saved.cid === cid ? saved.email : undefined, ok: saved.cid === cid ? saved.ok : undefined });
      return { cid: cid };
    }
    if (email && /@/.test(email) && !/^\{\{/.test(email)) {
      email = email.toLowerCase();
      store(STORE, { email: email, cid: saved.email === email ? saved.cid : undefined });
      return { email: email };
    }
    return saved.cid || saved.email ? saved : null;
  }

  function post(path, data) {
    var body = JSON.stringify(data);
    if (navigator.sendBeacon && navigator.sendBeacon(API + conCliente(path), new Blob([body], { type: 'text/plain' }))) return;
    fetch(API + conCliente(path), { method: 'POST', body: body, keepalive: true }).catch(function () {});
  }

  function embedSrc(url) {
    if (!url) return '';
    var m = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([0-9a-f]+))?/i);
    if (m) {
      var h = m[2] || (String(url).match(/[?&]h=([0-9a-f]+)/i) || [])[1];
      return 'https://player.vimeo.com/video/' + m[1] + '?' + (h ? 'h=' + h + '&' : '') + 'title=0&byline=0&portrait=0&dnt=1';
    }
    var y = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
    if (y) return 'https://www.youtube-nocookie.com/embed/' + y[1] + '?rel=0';
    return '';
  }

  var CSS = '.lsdv-video{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000}' +
    '.lsdv-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}' +
    '.lsdv-botones{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:18px;animation:lsdvIn .5s ease}' +
    '.lsdv-botones[hidden]{display:none}' +
    '.lsdv-btn{display:inline-block;padding:16px 26px;border-radius:999px;font:inherit;font-weight:700;font-size:1.05em;text-decoration:none;text-align:center;line-height:1.2}' +
    '.lsdv-compra{background:#860d0e;color:#fff}' +
    '.lsdv-llamada{background:#fff;color:#860d0e;border:2px solid #860d0e}' +
    '@keyframes lsdvIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';
  function injectCss() {
    if (document.getElementById('lsdv-css')) return;
    var s = document.createElement('style');
    s.id = 'lsdv-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function loadVimeo(cb) {
    if (window.Vimeo && window.Vimeo.Player) return cb();
    var s = document.querySelector('script[data-lsd-vimeo]');
    if (!s) {
      s = document.createElement('script');
      s.src = 'https://player.vimeo.com/api/player.js';
      s.setAttribute('data-lsd-vimeo', '');
      document.head.appendChild(s);
    }
    s.addEventListener('load', cb);
  }

  function iframe(src) {
    var f = document.createElement('iframe');
    f.src = src;
    f.allow = 'autoplay; fullscreen; picture-in-picture';
    f.allowFullscreen = true;
    var box = document.createElement('div');
    box.className = 'lsdv-video';
    box.appendChild(f);
    return box;
  }

  function botones(data, who) {
    var box = document.createElement('div');
    box.className = 'lsdv-botones';
    var add = function (href, text, cls) {
      if (!href) return;
      var a = document.createElement('a');
      a.className = 'lsdv-btn ' + cls;
      a.href = href;
      a.target = '_top';
      a.textContent = text;
      box.appendChild(a);
    };
    var llamada = data.links.llamada;
    if (llamada && who && who.email) {
      try { var u = new URL(llamada); u.searchParams.set('email', who.email); llamada = u.toString(); } catch (e) { /* tal cual */ }
    }
    add(data.links.compra, data.textos.compra, 'lsdv-compra');
    add(llamada, data.textos.llamada, 'lsdv-llamada');
    return box;
  }

  function vsl(el, data, who) {
    var src = embedSrc(data.video);
    if (!src) return;
    var box = iframe(src);
    el.innerHTML = '';
    el.appendChild(box);
    var btns = botones(data, who);
    var VISTO = 'lsd_vsl_botones';
    var mostrar = function () { btns.hidden = false; store(VISTO, 1); };
    btns.hidden = !(data.botonSegundos <= 0 || store(VISTO));
    el.appendChild(btns);
    if (!/vimeo/.test(src)) { if (btns.hidden) setTimeout(mostrar, data.botonSegundos * 1000); return; }

    loadVimeo(function () {
      var player = new window.Vimeo.Player(box.querySelector('iframe'));
      var KEY = 'lsd_vsl_vsl';
      var sent = store(KEY) || {};
      var visto = 0;
      var last = null;
      var duracion = 0;
      player.getDuration().then(function (d) { duracion = d; });
      player.on('timeupdate', function (e) {
        duracion = e.duration || duracion;
        if (last != null && e.seconds > last && e.seconds - last < 1.5) visto += e.seconds - last; // solo lo reproducido
        last = e.seconds;
        if (btns.hidden && (e.seconds >= data.botonSegundos || visto >= data.botonSegundos)) mostrar();
        if (!duracion || !who) return;
        var pct = (visto / duracion) * 100;
        THRESHOLDS.forEach(function (t) {
          if (pct >= t && !sent[t]) {
            sent[t] = 1;
            store(KEY, sent);
            post('/api/track', { launch: 'vsl', video: 'vsl', pct: t, cid: who.cid, email: who.email });
          }
        });
      });
      player.on('seeked', function (e) { last = e.seconds; });
    });
  }

  function start() {
    var vslEls = document.querySelectorAll('[data-lsd-vsl]');
    var embedEls = document.querySelectorAll('[data-lsd-vsl-embed]');
    if (!vslEls.length && !embedEls.length) return;
    injectCss();
    var who = identity();
    var q = new URLSearchParams();
    if (who && who.cid) q.set('cid', who.cid);
    fetch(API + conCliente('/api/vsl?' + q.toString())).then(function (r) { return r.json(); }).then(function (data) {
      if (!data || data.error) return;
      vslEls.forEach(function (el) { vsl(el, data, who); });
      embedEls.forEach(function (el) {
        var src = embedSrc((data.embeds || {})[el.getAttribute('data-lsd-vsl-embed')]);
        if (!src) { el.style.display = 'none'; return; }
        el.innerHTML = '';
        el.appendChild(iframe(src));
      });
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
