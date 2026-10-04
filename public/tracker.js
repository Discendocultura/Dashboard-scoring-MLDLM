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
 * Puede haber varios vídeos en la misma página (p. ej. una página de recursos con la clase 1 y 2).
 * Identifica al lead por ?cid={{contact.id}} o ?email={{contact.email}} en la URL.
 * Si llega sin identificar, muestra UN formulario de acceso con el email del registro. Si el email
 * existe en GHL se le pone la etiqueta de registro (si no la tenía); si no existe, se le piden nombre
 * y móvil y se registra como nueva. El navegador la recuerda para la próxima vez.
 * Opcional: <div data-lsd-gate></div> para colocar el formulario en otro sitio de la página.
 * Los enlaces de la página a /directo se completan solos con la identidad de la lead.
 *
 * Cuenta los segundos realmente reproducidos (saltar al final no cuenta) y avisa al
 * dashboard al llegar al 25%, 50%, 75% y 90%.
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

  // Identidad de la lead: de la URL (cid/email) o la que recuerda este navegador.
  // `ok` guarda en qué lanzamientos ya se comprobó que está registrada.
  function identity() {
    var saved = store(STORE) || {};
    var cid = params.get('cid') || params.get('contact_id');
    var email = params.get('email');
    if (cid && !/^\{\{/.test(cid)) {
      var w = { cid: cid, email: saved.cid === cid ? saved.email : undefined, ok: saved.cid === cid ? saved.ok : undefined, fromUrl: true };
      store(STORE, { cid: cid, email: w.email, ok: w.ok });
      return w;
    }
    if (email && /@/.test(email)) {
      email = email.toLowerCase();
      store(STORE, { email: email, cid: saved.email === email ? saved.cid : undefined, ok: saved.email === email ? saved.ok : undefined });
      return { email: email };
    }
    return saved.cid || saved.email ? saved : null;
  }

  function markRegistered(who, launch) {
    var saved = store(STORE) || {};
    var ok = (saved.cid === who.cid || saved.email === who.email) && saved.ok ? saved.ok : {};
    ok[launch] = 1;
    store(STORE, { cid: who.cid || saved.cid, email: who.email || saved.email, ok: ok });
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
    '.lsd-gate input{flex:1 1 100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #d8d0c9;font:inherit}' +
    '.lsd-gate button{padding:12px 18px;border:0;border-radius:8px;background:#b4552d;color:#fff;font:inherit;font-weight:600;cursor:pointer}' +
    '.lsd-gate .lsd-err{color:#b3261e;font-size:.9em}' +
    '.lsd-gate.lsd-gate-login{aspect-ratio:auto;padding:28px 20px}';

  function injectCss() {
    if (document.getElementById('lsd-css')) return;
    var st = document.createElement('style');
    st.id = 'lsd-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // Formulario de acceso: se muestra UNA sola vez por página (aunque haya varios vídeos).
  // Paso 1: email. Si está registrada (o existe en GHL, y entonces se registra) → acceso.
  // Paso 2 (email nuevo): nombre y teléfono → se registra en GHL → acceso.
  function gate(container, launch, done, presetEmail, opts) {
    opts = opts || {};
    injectCss();
    var box = document.createElement('div');
    box.className = 'lsd-gate' + (opts.login ? ' lsd-gate-login' : '');
    box.innerHTML =
      '<p class="lsd-title"><strong>' + (opts.title || 'Escribe el email con el que te registraste al webinar') + '</strong>' + (opts.login ? '' : ' para acceder a las clases.') + '</p>' +
      '<form autocomplete="on">' +
      '<input name="email" type="email" required placeholder="tu@email.com" autocomplete="email">' +
      '<input name="name" type="text" placeholder="Tu nombre" autocomplete="name" hidden>' +
      '<input name="phone" type="tel" placeholder="Tu móvil (WhatsApp)" autocomplete="tel" hidden>' +
      '<input name="website" type="text" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' +
      '<button type="submit">' + (opts.button || 'Acceder') + '</button></form>' +
      '<p class="lsd-err" hidden></p>';
    container.appendChild(box);
    var form = box.querySelector('form');
    var title = box.querySelector('.lsd-title');
    var err = box.querySelector('.lsd-err');
    var btn = form.querySelector('button');
    var f = function (n) { return form.querySelector('[name="' + n + '"]'); };
    var signup = false;
    var turnstileToken = '';
    var turnstileShown = false;

    // Verificación anti-bots de Cloudflare (solo si está configurada en el dashboard).
    function showTurnstile(siteKey) {
      if (!siteKey || turnstileShown) return;
      turnstileShown = true;
      var holder = document.createElement('div');
      holder.style.margin = '4px 0';
      form.insertBefore(holder, btn);
      function render() {
        window.turnstile.render(holder, {
          sitekey: siteKey,
          callback: function (t) { turnstileToken = t; },
          'expired-callback': function () { turnstileToken = ''; },
        });
      }
      if (window.turnstile) return render();
      var sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      sc.async = true;
      sc.onload = render;
      document.head.appendChild(sc);
    }

    function showSignup(known, siteKey) {
      showTurnstile(siteKey);
      signup = true;
      title.innerHTML = known
        ? '<strong>Todavía no estás registrada en este webinar.</strong> Completa tus datos para registrarte y acceder.'
        : '<strong>No encontramos tu registro.</strong> Completa tus datos para registrarte y acceder.';
      f('name').hidden = false; f('name').required = true;
      f('phone').hidden = false; f('phone').required = true;
      btn.textContent = 'Registrarme y acceder';
      f('name').focus();
    }
    if (presetEmail) { f('email').value = presetEmail; showSignup(); }

    form.onsubmit = function (e) {
      e.preventDefault();
      var email = f('email').value.trim().toLowerCase();
      btn.disabled = true;
      err.hidden = true;
      var payload = { email: email, launch: launch, website: f('website').value };
      if (signup) { payload.name = f('name').value.trim(); payload.phone = f('phone').value.trim(); payload.turnstile = turnstileToken; }
      post('/api/access', payload).then(function (r) {
        btn.disabled = false;
        if (r && r.ok) {
          var who = r.cid ? { cid: r.cid, email: email } : { email: email };
          store(STORE, who);
          markRegistered(who, launch);
          box.remove();
          return done(who);
        }
        if (r && r.needs === 'signup') {
          if (signup) {
            err.textContent = r.error === 'turnstile' ? 'Confirma que no eres un robot y vuelve a pulsar.' : 'Revisa tu nombre y tu móvil.';
            err.hidden = false;
          }
          return showSignup(r.known, r.siteKey);
        }
        err.textContent = 'No hemos podido comprobar ese email. Revísalo e inténtalo de nuevo.';
        err.hidden = false;
      }).catch(function () {
        // Si nuestro servidor no responde, no bloqueamos el acceso a las clases.
        box.remove();
        done({ email: email });
      });
    };
  }

  // Los enlaces al directo de la página se personalizan con la identidad de la lead,
  // así entra a Zoom sin volver a escribir su email.
  function decorateLiveLinks(who) {
    if (!who) return;
    document.querySelectorAll('a[href*="/directo"]').forEach(function (a) {
      try {
        var u = new URL(a.href, location.href);
        if (u.origin !== API || u.pathname !== '/directo') return;
        if (who.cid) u.searchParams.set('cid', who.cid);
        else if (who.email) u.searchParams.set('email', who.email);
        a.href = u.toString();
      } catch (e) { /* enlace no válido: lo dejamos igual */ }
    });
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
      [25, 50, 75, 90].forEach(function (t) {
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

  // Lleva a una URL añadiendo la identidad de la lead (cid o email) y conservando el resto.
  function goTo(url, who) {
    var u = new URL(url, location.href);
    if (who && who.cid) u.searchParams.set('cid', who.cid);
    else if (who && who.email) u.searchParams.set('email', who.email);
    location.replace(u.toString());
  }

  // Página de login: <div data-lsd-login data-launch="nov26" data-redirect="https://…/recursos"></div>
  // Registrada → redirige. Si no, pide nombre y móvil, la registra con la etiqueta del lanzamiento y redirige.
  function initLogin(el) {
    if (el.getAttribute('data-lsd-ready')) return;
    el.setAttribute('data-lsd-ready', '1');
    var launch = params.get('l') || el.getAttribute('data-launch');
    var redirect = el.getAttribute('data-redirect');
    var cid = params.get('cid');
    if (cid && !/^\{\{/.test(cid)) { store(STORE, { cid: cid }); return goTo(redirect, { cid: cid }); } // viene de un email de GHL
    var stored = store(STORE) || {};
    var preset = params.get('email') || '';
    gate(el, launch, function (who) { goTo(redirect, who); }, preset || '', {
      login: true,
      title: el.getAttribute('data-title') || 'Accede a las clases con el email con el que te registraste',
      button: el.getAttribute('data-button') || 'Acceder',
    });
    // Si este navegador ya la conoce, dejamos su email escrito (pero puede cambiarlo).
    if (!preset && stored.email) { var inp = el.querySelector('input[name="email"]'); if (inp) inp.value = stored.email; }
  }

  function init() {
    var login = document.querySelector('[data-lsd-login]');
    if (login) initLogin(login);

    var containers = Array.prototype.slice.call(document.querySelectorAll('[data-lsd-video]'))
      .filter(function (c) { return !c.getAttribute('data-lsd-ready'); });
    if (!containers.length) return;
    containers.forEach(function (c) { c.setAttribute('data-lsd-ready', '1'); c.classList.add('lsd-wrap'); });
    var launch = params.get('l') || containers[0].getAttribute('data-launch');
    // Con data-login="URL de la página de login", quien llega sin identificar va al login.
    var loginEl = document.querySelector('[data-lsd-video][data-login]');
    var loginUrl = loginEl ? loginEl.getAttribute('data-login') : '';

    function start(who) {
      decorateLiveLinks(who);
      loadVimeo(function () {
        containers.forEach(function (c) { track(c, who); });
      });
    }

    var gateHost = document.querySelector('[data-lsd-gate]') || containers[0];
    function showGate(presetEmail) {
      if (loginUrl) return goTo(loginUrl, presetEmail ? { email: presetEmail } : null);
      containers.forEach(function (c) { if (c !== gateHost) c.style.display = 'none'; });
      gate(gateHost, launch, function (w) {
        containers.forEach(function (c) { c.style.display = ''; });
        start(w);
      }, presetEmail);
    }

    var who = identity();
    if (!who) return showGate();
    // Ya comprobada en este lanzamiento, o llega con su cid desde el login o un email de GHL.
    if ((who.ok && who.ok[launch]) || (who.cid && (who.fromUrl || !who.email))) return start(who);
    // Si no, comprobamos que esté registrada en este lanzamiento (p. ej. viene de uno anterior).
    post('/api/access', { email: who.email, launch: launch }).then(function (r) {
      if (r && r.ok) {
        var w = r.cid ? { cid: r.cid, email: who.email } : who;
        markRegistered(w, launch);
        return start(w);
      }
      if (r && r.needs === 'signup') return showGate(who.email);
      start(who);
    }).catch(function () { start(who); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
