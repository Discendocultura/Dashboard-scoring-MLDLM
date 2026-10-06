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
    '.lsd-gate.lsd-gate-login,.lsd-gate-page .lsd-gate,.lsd-gate-page.lsd-gate{aspect-ratio:auto;padding:28px 20px}' +
    '.lsd-locked{aspect-ratio:16/9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:20px;border-radius:12px;background:#f6f3ef;color:#2b2522;box-sizing:border-box}' +
    '.lsd-locked-btn{display:inline-block;margin-top:8px;padding:10px 18px;border-radius:999px;background:#b4552d;color:#fff;font-weight:600;text-decoration:none}' +
    '.lsd-locked p{margin:0}.lsd-locked-icon{font-size:2em}.lsd-locked-text{font-weight:600}.lsd-cd{font-variant-numeric:tabular-nums;font-weight:700}' +
    '.lsd-cdb{display:flex;gap:10px;justify-content:center}.lsd-cdb-unit{display:flex;flex-direction:column;align-items:center;min-width:64px;padding:10px 8px;border-radius:10px;background:#f6f3ef}' +
    '.lsd-cdb-num{font-size:2em;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}.lsd-cdb-label{font-size:.75em;text-transform:uppercase;letter-spacing:.05em;margin-top:4px}' +
    '[data-lsd-bar]{display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}' +
    '.lsd-bar-btn{display:inline-block;padding:6px 14px;border-radius:999px;background:#b4552d;color:#fff;font-weight:600;text-decoration:none}';

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
      // Campo trampa para bots: nombre raro para que ningún autorrelleno ni gestor de contraseñas lo rellene.
      '<input name="lsd_hp_zq" type="text" tabindex="-1" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" data-form-type="other" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" aria-hidden="true">' +
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
        ? '<strong>Todavía no estás registrada en este evento.</strong> Completa tus datos para registrarte y acceder.'
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
      var payload = { email: email, launch: launch, hp: f('lsd_hp_zq').value };
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
        // Mensaje según el motivo (y el código, para poder ver qué ha pasado).
        var code = (r && r.error) || 'sin-respuesta';
        if (window.console) console.warn('[lsd] acceso no completado:', r);
        err.textContent = code === 'email' ? 'Ese email no parece válido. Revísalo e inténtalo de nuevo.'
          : code === 'launch' ? 'Ahora mismo no hay ningún lanzamiento abierto. Inténtalo más tarde.'
            : 'No hemos podido comprobar tu email ahora mismo. Inténtalo de nuevo en unos minutos. (' + code + ')';
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

  function track(container, who, launchCode) {
    var video = container.getAttribute('data-lsd-video');
    var launch = launchCode || container.getAttribute('data-launch') || params.get('l');
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
    // La vista previa del dashboard se conserva al pasar de una página a otra (no al directo).
    if (params.get('lsd_preview') && u.pathname !== '/directo') u.searchParams.set('lsd_preview', params.get('lsd_preview'));
    location.replace(u.toString());
  }

  // ---------- Datos del lanzamiento configurados en el dashboard ----------
  var clockSkew = 0; // diferencia entre la hora del servidor y la del dispositivo

  function fetchPage(launch, who) {
    var q = new URLSearchParams({ l: launch || 'auto' });
    if (who && who.cid) q.set('cid', who.cid);
    if (params.get('lsd_preview')) q.set('preview', params.get('lsd_preview'));
    return fetch(API + '/api/page?' + q.toString()).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.now) clockSkew = d.now - Date.now();
      return d;
    });
  }

  var serverNow = function () { return Date.now() + clockSkew; };

  function fmtCountdown(ms) {
    if (ms <= 0) return '0:00:00';
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400); s %= 86400;
    var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60); s %= 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d > 0 ? d + ' d ' + h + ' h ' + pad(m) + ' min' : h + ':' + pad(m) + ':' + pad(s);
  }

  // Todas las cuentas atrás de la página (<span data-lsd-cd="epoch">) se actualizan cada segundo.
  var cdTimer = null;
  function tickCountdowns() {
    document.querySelectorAll('[data-lsd-cd]').forEach(function (el) {
      el.textContent = fmtCountdown(Number(el.getAttribute('data-lsd-cd')) - serverNow());
    });
    // Cuenta atrás en cajas (días / horas / min / seg).
    document.querySelectorAll('[data-lsd-cdb-at]').forEach(function (el) {
      var ms = Math.max(0, Number(el.getAttribute('data-lsd-cdb-at')) - serverNow());
      var s = Math.floor(ms / 1000);
      var parts = { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
      el.querySelectorAll('[data-u]').forEach(function (n) {
        var v = parts[n.getAttribute('data-u')];
        n.textContent = (v < 10 ? '0' : '') + v;
      });
    });
  }

  // <div data-lsd-countdown-boxes="directo|clase1|clase2|vip"></div>
  function renderCountdownBoxes(data) {
    document.querySelectorAll('[data-lsd-countdown-boxes]').forEach(function (el) {
      var k = el.getAttribute('data-lsd-countdown-boxes');
      var at = k === 'directo' || k === 'vip' ? data.vip.closesAt : k === 'fase' ? data.countdownTo : (data.videos[k] || {}).unlockAt;
      if (!at || at <= serverNow()) { el.innerHTML = ''; el.removeAttribute('data-lsd-cdb-at'); show(el, false); return; }
      show(el, true);
      if (Number(el.getAttribute('data-lsd-cdb-at')) === at) return;
      el.setAttribute('data-lsd-cdb-at', at);
      var unit = function (u, label) { return '<div class="lsd-cdb-unit"><span class="lsd-cdb-num" data-u="' + u + '">00</span><span class="lsd-cdb-label">' + label + '</span></div>'; };
      el.innerHTML = '<div class="lsd-cdb">' + unit('d', 'días') + unit('h', 'horas') + unit('m', 'min') + unit('s', 'seg') + '</div>';
    });
  }
  function startCountdowns() {
    tickCountdowns();
    if (!cdTimer) cdTimer = setInterval(tickCountdowns, 1000);
  }
  var cdSpan = function (at) { return at ? '<span class="lsd-cd" data-lsd-cd="' + at + '"></span>' : ''; };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var show = function (el, on) { el.style.display = on ? '' : 'none'; };

  function renderPage(data, who, onVideo, noVideos) {
    injectCss();
    var linkWho = function (href) {
      if (!href || !who) return href;
      try {
        var u = new URL(href);
        if (u.origin === API && u.pathname === '/directo') {
          if (who.cid) u.searchParams.set('cid', who.cid); else if (who.email) u.searchParams.set('email', who.email);
        }
        return u.toString();
      } catch (e) { return href; }
    };

    // Barra de urgencia: <div data-lsd-bar></div>
    document.querySelectorAll('[data-lsd-bar]').forEach(function (el) {
      var b = data.bar || {};
      var text = esc(b.text || '').replace('{cuenta}', cdSpan(data.countdownTo));
      var btn = b.button ? '<a class="lsd-bar-btn" href="' + esc(linkWho(b.button.href)) + '"' + (b.button.key === 'whatsapp' ? ' target="_blank" rel="noopener"' : '') + '>' + esc(b.button.label || defaultLabel(b.button.key)) + '</a>' : '';
      el.innerHTML = '<span class="lsd-bar-text">' + text + '</span>' + btn;
      el.setAttribute('data-lsd-phase-now', data.phase);
      show(el, Boolean(b.text));
    });

    // Enlaces: <a data-lsd-link="vip|whatsapp|directo|grabacion|venta|pago|llamada">
    document.querySelectorAll('[data-lsd-link]').forEach(function (el) {
      var href = data.links[el.getAttribute('data-lsd-link')];
      if (href) { el.setAttribute('href', linkWho(href)); show(el, true); } else show(el, false);
      // La encuesta se abre en otra pestaña: al volver, la página detecta que ya está hecha.
      if (el.getAttribute('data-lsd-link') === 'encuesta' && !el.getAttribute('target')) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
    });

    // Textos: <span data-lsd-text="fechaDirecto|horaDirecto|directo|clase1|clase2|replay|cierreVip|cierreCarrito|precioVip">
    document.querySelectorAll('[data-lsd-text]').forEach(function (el) {
      var v = data.texts[el.getAttribute('data-lsd-text')];
      if (v != null) el.textContent = v;
    });

    // Cuentas atrás sueltas: <span data-lsd-countdown="directo|clase1|clase2|replay|vip|fase">
    document.querySelectorAll('[data-lsd-countdown]').forEach(function (el) {
      var k = el.getAttribute('data-lsd-countdown');
      var at = k === 'fase' ? data.countdownTo : k === 'vip' ? data.vip.closesAt : k === 'directo' ? data.vip.closesAt : (data.videos[k] || {}).unlockAt;
      el.innerHTML = at && at > serverNow() ? cdSpan(at) : '';
    });

    renderCountdownBoxes(data);

    // Mostrar/ocultar por fase: data-lsd-phase="pre_c1 c1 c2 dia_directo en_directo replay cerrado"
    document.querySelectorAll('[data-lsd-phase]').forEach(function (el) {
      show(el, el.getAttribute('data-lsd-phase').split(/[\s,]+/).indexOf(data.phase) >= 0);
    });

    // Mostrar/ocultar por VIP y encuesta: data-lsd-if="vip-abierta|vip-cerrada|ya-vip|encuesta-pendiente|encuesta-hecha"
    var isVip = data.vip.isVip === true;
    var enc = data.encuesta || {};
    var conds = {
      'ya-vip': isVip,
      'vip-abierta': data.vip.open && !isVip,
      'vip-cerrada': !data.vip.open && !isVip,
      'encuesta-pendiente': Boolean(enc.required && !enc.done),
      'encuesta-hecha': Boolean(enc.required && enc.done),
    };
    document.querySelectorAll('[data-lsd-if]').forEach(function (el) {
      var c = el.getAttribute('data-lsd-if');
      show(el, Object.prototype.hasOwnProperty.call(conds, c) ? conds[c] : true);
    });

    // Vídeos sin data-vimeo: la URL llega del dashboard cuando se desbloquean.
    document.querySelectorAll('[data-lsd-video]').forEach(function (el) {
      if (noVideos || el.getAttribute('data-lsd-fixed') === '1' || el.querySelector('.lsd-gate')) return;
      var v = data.videos[el.getAttribute('data-lsd-video')];
      if (!v) return;
      if (v.url) {
        if (el.getAttribute('data-lsd-playing') === '1') return;
        el.innerHTML = '';
        el.setAttribute('data-vimeo', v.url);
        el.setAttribute('data-lsd-playing', '1');
        onVideo(el);
      } else {
        // Bloqueado hasta su hora; si ya pasó la hora pero aún no hay vídeo, "muy pronto".
        // Si falta la encuesta, además se pide (y al llegar la hora solo se pide la encuesta).
        var pending = v.unlockAt && v.unlockAt > serverNow();
        var encHref = data.links.encuesta;
        var state = v.unlocked ? 'encuesta' : (pending ? 'cuenta' : 'pronto') + (v.needsEncuesta ? '-encuesta' : '');
        if (el.getAttribute('data-lsd-locked') === state) return;
        el.setAttribute('data-lsd-locked', state);
        var encBtn = v.needsEncuesta && encHref ? '<a class="lsd-locked-btn" data-lsd-encuesta href="' + esc(encHref) + '" target="_blank" rel="noopener">' + esc(el.getAttribute('data-encuesta-label') || 'Rellenar la encuesta') + '</a>' : '';
        var encText = esc(el.getAttribute('data-encuesta-text') || 'Completa la encuesta para desbloquear las clases');
        el.innerHTML = '<div class="lsd-locked"><div class="lsd-locked-icon">🔒</div>' +
          (state === 'encuesta' ? '<p class="lsd-locked-text">' + encText + '</p>'
            : pending ? '<p class="lsd-locked-text">Disponible el ' + esc(v.unlockText) + '</p><p class="lsd-locked-count">Faltan ' + cdSpan(v.unlockAt) + '</p>' + (v.needsEncuesta ? '<p>' + encText + '</p>' : '')
            : '<p class="lsd-locked-text">Muy pronto disponible</p>' + (v.needsEncuesta ? '<p>' + encText + '</p>' : '')) +
          encBtn + '</div>';
      }
    });
    startCountdowns();
  }

  function defaultLabel(key) {
    return { whatsapp: 'Unirme al grupo', vip: 'Quiero mi entrada VIP', directo: 'Entrar al directo', grabacion: 'Ver la grabación', venta: 'Conocer Raíces', pago: 'Unirme a Raíces', 'pago-fraccionado': 'Pagar a plazos', llamada: 'Reservar llamada', calendario: 'Añadir al calendario', encuesta: 'Rellenar la encuesta' }[key] || 'Ir';
  }

  // Página gestionada desde el dashboard (recursos / grabación). Vuelve a pedir los datos cuando
  // cambia de fase o se desbloquea un vídeo, y redirige (recursos → directo → grabación).
  function runManagedPage(kind, launchAttr, who, onVideo) {
    var timer = null;
    function cycle() {
      fetchPage(launchAttr, who).then(function (data) {
        if (!data || data.error) return;
        if (kind === 'recursos' && data.redirectTo && data.links[data.redirectTo]) {
          return goTo(data.links[data.redirectTo], who);
        }
        renderPage(data, who, function (el) { onVideo(el, data.code); });
        // Próximo cambio: fase o desbloqueo de vídeo.
        var next = [data.changesAt, data.videos.clase1.unlockAt, data.videos.clase2.unlockAt, data.videos.replay.unlockAt]
          .filter(function (t) { return t && t > data.now; }).sort(function (a, b) { return a - b; })[0];
        clearTimeout(timer);
        // Encuesta pendiente: se vuelve a comprobar cada 15 s (y al volver a la pestaña).
        waitingEncuesta = Boolean(data.encuesta && data.encuesta.required && !data.encuesta.done && who && who.cid);
        if (waitingEncuesta && !document.hidden) next = Math.min(next || Infinity, serverNow() + 15000);
        if (next) timer = setTimeout(cycle, Math.min(next - serverNow() + 1500, 2147483000));
      }).catch(function () { /* sin conexión: se queda como está */ });
    }
    var waitingEncuesta = false;
    function recheck() { if (waitingEncuesta && !document.hidden) { clearTimeout(timer); cycle(); } }
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    cycle();
  }

  // Página de login: <div data-lsd-login data-launch="auto" data-redirect="https://…/recursos"></div>
  // Registrada → redirige. Si no, pide nombre y móvil, la registra con la etiqueta del lanzamiento y redirige.
  function initLogin(el) {
    if (el.getAttribute('data-lsd-ready')) return;
    el.setAttribute('data-lsd-ready', '1');
    var attr = params.get('l') || el.getAttribute('data-launch') || 'auto';
    var ready = attr === 'auto' || !el.getAttribute('data-redirect')
      ? fetchPage(attr, null).then(function (d) { return { code: d.code, redirect: el.getAttribute('data-redirect') || d.links.recursos }; })
      : Promise.resolve({ code: attr, redirect: el.getAttribute('data-redirect') });
    ready.catch(function () { return { code: attr, redirect: el.getAttribute('data-redirect') }; }).then(function (cfg) {
      var cid = params.get('cid');
      if (cid && !/^\{\{/.test(cid)) { store(STORE, { cid: cid }); return goTo(cfg.redirect, { cid: cid }); } // viene de un email de GHL
      var stored = store(STORE) || {};
      var preset = params.get('email') || '';
      gate(el, cfg.code, function (who) { goTo(cfg.redirect, who); }, preset || '', {
        login: true,
        title: el.getAttribute('data-title') || 'Accede a las clases con el email con el que te registraste',
        button: el.getAttribute('data-button') || 'Acceder',
      });
      // Si este navegador ya la conoce, dejamos su email escrito (pero puede cambiarlo).
      if (!preset && stored.email) { var inp = el.querySelector('input[name="email"]'); if (inp) inp.value = stored.email; }
    });
  }

  function init() {
    var login = document.querySelector('[data-lsd-login]');
    if (login) initLogin(login);

    var pageEl = document.querySelector('[data-lsd-page]');
    var containers = Array.prototype.slice.call(document.querySelectorAll('[data-lsd-video]'))
      .filter(function (c) { return !c.getAttribute('data-lsd-ready'); });
    if (!containers.length && !pageEl) return;
    containers.forEach(function (c) {
      c.setAttribute('data-lsd-ready', '1');
      c.classList.add('lsd-wrap');
      if (c.getAttribute('data-vimeo')) c.setAttribute('data-lsd-fixed', '1');
    });
    var managed = Boolean(pageEl) || containers.some(function (c) { return !c.getAttribute('data-vimeo'); });
    var kind = pageEl ? pageEl.getAttribute('data-lsd-page') : 'recursos';
    var launchAttr = params.get('l') || (pageEl && pageEl.getAttribute('data-launch')) || (containers[0] && containers[0].getAttribute('data-launch')) || 'auto';
    // URL del login: data-login en la página o en un vídeo, o la configurada en el dashboard.
    var loginAttrEl = document.querySelector('[data-lsd-page][data-login], [data-lsd-video][data-login]');

    function begin(launch, loginUrl) {
      function start(who) {
        decorateLiveLinks(who);
        var playVideo = function (el, code) { loadVimeo(function () { track(el, who, code || launch); }); };
        containers.filter(function (c) { return c.getAttribute('data-lsd-fixed') === '1'; }).forEach(function (c) { playVideo(c, launch); });
        if (managed) runManagedPage(kind, launchAttr === 'auto' ? launch : launchAttr, who, playVideo);
      }

      var gateHost = document.querySelector('[data-lsd-gate]') || containers[0] || pageEl;
      function showGate(presetEmail) {
        if (loginUrl) return goTo(loginUrl, presetEmail ? { email: presetEmail } : null);
        containers.forEach(function (c) { if (c !== gateHost) c.style.display = 'none'; });
        if (gateHost === pageEl) pageEl.classList.add('lsd-gate-page');
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

    // Páginas públicas (p. ej. la de registro: <div data-lsd-page="registro" data-launch="auto">):
    // solo se pintan los datos del lanzamiento (fecha, hora, cuentas atrás, enlaces), sin pedir
    // el email ni redirigir al login, porque quien está ahí todavía no se ha registrado.
    if (kind === 'registro' || kind === 'publica') {
      fetchPage(launchAttr, null).then(function (d) {
        if (d && !d.error) renderPage(d, null, function () {}, true);
      }).catch(function () { /* sin datos: se queda el texto del diseño */ });
      return;
    }
    var attrLogin = loginAttrEl ? loginAttrEl.getAttribute('data-login') : '';
    if (!managed && launchAttr !== 'auto') return begin(launchAttr, attrLogin);
    // Con el dashboard: primero sabemos qué lanzamiento es (y su URL de login).
    fetchPage(launchAttr, null).then(function (d) {
      if (!d || d.error) return begin(launchAttr, attrLogin);
      // Fechas, cuenta atrás, barra y botones se pintan ya (son públicos), antes de identificarla.
      try { renderPage(d, null, function () {}, true); } catch (e) { /* sigue igual */ }
      begin(d.code, attrLogin || d.links.login);
    }).catch(function () { begin(launchAttr, attrLogin); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
