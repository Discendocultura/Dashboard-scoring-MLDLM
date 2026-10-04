/*
 * Seguimiento de vídeos de Vimeo para las páginas de GHL.
 *
 * Pega esto en un bloque "Código HTML" de la página:
 *
 *   <div data-lsd-video="clase1" data-vimeo="https://vimeo.com/123456789" data-launch="nov26"></div>
 *   <script src="https://TU-DASHBOARD.pages.dev/tracker.js" defer></script>
 *
 *   data-lsd-video: clase1 | clase2 | replay
 *   data-vimeo:     ID o URL del vídeo (si es oculto, la URL con el hash: https://vimeo.com/123/abcdef)
 *   data-launch:    código del lanzamiento (también puede venir en la URL como ?l=nov26)
 *
 * Identifica al lead por ?cid={{contact.id}} o ?email={{contact.email}} en la URL.
 * Si llega sin identificar (p. ej. desde el grupo de WhatsApp), le pide el email una vez
 * y lo recuerda en ese navegador para el resto de vídeos.
 *
 * Cuenta los segundos realmente reproducidos (saltar al final no cuenta) y avisa al
 * dashboard al llegar al 50% y al 90%.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var API = script ? new URL(script.src).origin : '';
  var STORE = 'lsd_identity';
  var params = new URLSearchParams(location.search);

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      return null;
    }
  }

  function identity() {
    var cid = params.get('cid') || params.get('contact_id');
    var email = params.get('email');
    if (cid && !/^\{\{/.test(cid)) { store(STORE, { cid: cid }); return { cid: cid }; }
    if (email && /@/.test(email)) { store(STORE, { email: email.toLowerCase() }); return { email: email.toLowerCase() }; }
    return store(STORE);
  }

  function post(path, payload) {
    var body = JSON.stringify(payload);
    // text/plain evita la petición previa CORS; el servidor lo interpreta como JSON.
    if (path === '/api/track' && navigator.sendBeacon && navigator.sendBeacon(API + path, new Blob([body], { type: 'text/plain' }))) {
      return Promise.resolve({ ok: true });
    }
    return fetch(API + path, { method: 'POST', body: body, headers: { 'content-type': 'text/plain' }, keepalive: true })
      .then(function (r) { return r.json(); });
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

  var CSS = '.lsd-wrap{position:relative;width:100%;font-family:inherit}' +
    '.lsd-gate{display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;text-align:center;padding:32px 20px;border-radius:12px;background:#f6f3ef;color:#2b2522;aspect-ratio:16/9;box-sizing:border-box}' +
    '.lsd-gate p{margin:0;max-width:420px;line-height:1.45}' +
    '.lsd-gate form{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;width:100%;max-width:420px}' +
    '.lsd-gate input{flex:1 1 220px;padding:12px;border-radius:8px;border:1px solid #d8d0c9;font:inherit}' +
    '.lsd-gate button{padding:12px 18px;border:0;border-radius:8px;background:#b4552d;color:#fff;font:inherit;font-weight:600;cursor:pointer}' +
    '.lsd-gate .lsd-skip{background:none;color:#7a6f69;text-decoration:underline;padding:4px;font-weight:400}' +
    '.lsd-gate .lsd-err{color:#b3261e;font-size:.9em}';

  function injectCss() {
    if (document.getElementById('lsd-css')) return;
    var st = document.createElement('style');
    st.id = 'lsd-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function gate(container, done) {
    injectCss();
    var box = document.createElement('div');
    box.className = 'lsd-gate';
    box.innerHTML = '<p><strong>Escribe el email con el que te registraste</strong> para ver la clase.</p>' +
      '<form><input type="email" required placeholder="tu@email.com" autocomplete="email"><button type="submit">Ver la clase</button></form>' +
      '<p class="lsd-err" hidden></p><button type="button" class="lsd-skip" hidden>Ver sin identificarme</button>';
    container.appendChild(box);
    var form = box.querySelector('form');
    var err = box.querySelector('.lsd-err');
    var skip = box.querySelector('.lsd-skip');
    skip.onclick = function () { box.remove(); done(null); };
    form.onsubmit = function (e) {
      e.preventDefault();
      var email = form.querySelector('input').value.trim().toLowerCase();
      var btn = form.querySelector('button');
      btn.disabled = true;
      post('/api/identify', { email: email }).then(function (r) {
        if (r && r.found) {
          store(STORE, { email: email });
          box.remove();
          done({ email: email });
        } else {
          err.textContent = 'No encontramos ese email. Prueba con el que usaste al registrarte.';
          err.hidden = false;
          skip.hidden = false;
          btn.disabled = false;
        }
      }).catch(function () { box.remove(); done({ email: email }); });
    };
  }

  function track(container, who) {
    var video = container.getAttribute('data-lsd-video');
    var launch = params.get('l') || container.getAttribute('data-launch');
    var src = container.getAttribute('data-vimeo') || '';
    var key = 'lsd_' + launch + '_' + video;
    var saved = store(key) || {};
    var buckets = saved.b || {};          // porcentajes (0-99) ya reproducidos
    var sent = saved.s || {};             // umbrales ya enviados
    var last = null;
    var duration = 0;

    var host = document.createElement('div');
    container.appendChild(host);
    var opts = { responsive: true };
    if (/^\d+$/.test(src)) opts.id = Number(src); else opts.url = src;
    var player = new window.Vimeo.Player(host, opts);

    function save() { store(key, { b: buckets, s: sent }); }

    function check() {
      var pct = Object.keys(buckets).length;
      [50, 90].forEach(function (t) {
        if (pct >= t && !sent[t]) {
          sent[t] = true;
          save();
          if (who) post('/api/track', { launch: launch, video: video, pct: t, cid: who.cid, email: who.email });
        }
      });
    }

    player.getDuration().then(function (d) { duration = d; });
    player.on('timeupdate', function (d) {
      duration = d.duration || duration;
      var t = d.seconds;
      if (duration && last !== null && t >= last && t - last <= 3) {
        var from = Math.floor((last / duration) * 100);
        var to = Math.min(99, Math.floor((t / duration) * 100));
        for (var i = from; i <= to; i++) buckets[i] = 1;
      }
      last = t;
      check();
    });
    player.on('seeked', function (d) { last = d.seconds; });
    player.on('pause', save);
    window.addEventListener('pagehide', save);
  }

  function init() {
    var containers = document.querySelectorAll('[data-lsd-video]');
    if (!containers.length) return;
    loadVimeo(function () {
      containers.forEach(function (c) {
        if (c.getAttribute('data-lsd-ready')) return;
        c.setAttribute('data-lsd-ready', '1');
        c.classList.add('lsd-wrap');
        var who = identity();
        if (who) track(c, who);
        else gate(c, function (w) { track(c, w); });
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
