/*
 * Seguimiento de vídeos de Vimeo para las páginas de GHL.
 *
 * Pega esto en un bloque "Código HTML" de la página:
 *
 *   <div data-lsd-video="clase1" data-vimeo="https://vimeo.com/123456789" data-launch="nov26"></div>
 *   <script src="https://TU-DASHBOARD.pages.dev/tracker.js" defer></script>
 *
 *   data-lsd-video: clase1 | clase2 | replay  (lanzamientos de varios vídeos: replay2, replay3, replay4)
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
  // El plan B del directo (bloque pegado en GHL) mira esto: si el dashboard cargó, no se enseña nunca.
  window.lsdCargado = true;
  'use strict';
  var script = document.currentScript;
  var API = script ? new URL(script.src).origin : '';
  // Cliente del dashboard (varios clientes): viene en el src del script, p. ej. tracker.js?c=clinica-sol.
  var CLIENTE = script ? new URL(script.src).searchParams.get('c') || '' : '';
  function conCliente(path) { return CLIENTE ? path + (path.indexOf('?') >= 0 ? '&' : '?') + 'c=' + encodeURIComponent(CLIENTE) : path; }
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
    if ((path === '/api/track' || path === '/api/visita' || payload.op === 'click' || payload.op === 'espera' || payload.op === 'visita') && navigator.sendBeacon && navigator.sendBeacon(API + conCliente(path), new Blob([body], { type: 'text/plain' }))) {
      return Promise.resolve({ ok: true });
    }
    return fetch(API + conCliente(path), { method: 'POST', body: body, headers: { 'content-type': 'text/plain' }, keepalive: true })
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
    '.lsd-gate .lsd-movil-nota{flex:1 1 100%;margin:-2px 0 2px;font-size:.82em;opacity:.75}' +
    '.lsd-gate.lsd-gate-login,.lsd-gate-page .lsd-gate,.lsd-gate-page.lsd-gate{aspect-ratio:auto;padding:28px 20px}' +
    '.lsd-locked{aspect-ratio:16/9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:20px;border-radius:12px;background:#f6f3ef;color:#2b2522;box-sizing:border-box}' +
    '.lsd-locked-btn{display:inline-block;margin-top:8px;padding:10px 18px;border-radius:999px;background:#b4552d;color:#fff;font-weight:600;text-decoration:none}' +
    '.lsd-locked p{margin:0}.lsd-locked-icon{font-size:2em}.lsd-locked-text{font-weight:600}.lsd-cd{font-variant-numeric:tabular-nums;font-weight:700}' +
    '.lsd-cdb{display:flex;gap:10px;justify-content:center}.lsd-cdb-unit{display:flex;flex-direction:column;align-items:center;min-width:64px;padding:10px 8px;border-radius:10px;background:#f6f3ef}' +
    '.lsd-cdb-num{font-size:2em;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}.lsd-cdb-label{font-size:.75em;text-transform:uppercase;letter-spacing:.05em;margin-top:4px}' +
    '[data-lsd-bar]{display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}' +
    // Barra fija de la página de replay (cuenta atrás → página de venta). --lsd-rb: su color (Configuración).
    '.lsd-rb{position:fixed;top:0;left:0;right:0;z-index:2147482000;display:flex;gap:10px 16px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px 16px;background:var(--lsd-rb,#860d0e);color:#fff;font-weight:600;font-size:16px;line-height:1.35;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.18);box-sizing:border-box;font-family:inherit}' +
    '.lsd-rb .lsd-cd{display:inline-block;margin-left:4px;padding:2px 10px;border-radius:8px;background:rgba(255,255,255,.18);font-size:1.1em}' +
    '.lsd-rb .lsd-bar-btn{background:#fff;color:var(--lsd-rb,#860d0e);font-weight:700;padding:7px 16px}' +
    '@media (max-width:600px){.lsd-rb{font-size:14px;padding:8px 12px}.lsd-rb .lsd-bar-btn{padding:6px 12px}}' +
    '.lsd-embed{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000}.lsd-embed iframe{position:absolute;top:0;left:0;inset:0;width:100%;height:100%;border:0}' +
    '.lsd-bar-btn{display:inline-block;padding:6px 14px;border-radius:999px;background:#b4552d;color:#fff;font-weight:600;text-decoration:none}' +
    // Recursos de la preclase: música, votación (el diseño de la página puede cambiar --lsd-acento)
    '.lsd-rec{border-radius:12px;padding:16px;background:#f6f3ef;color:#2b2522;font-family:inherit;box-sizing:border-box}' +
    '.lsd-rec-lock{display:flex;gap:10px;align-items:center;opacity:.85}.lsd-rec-lock .lsd-locked-icon{font-size:1.5em}' +
    '.lsd-rec audio{width:100%;margin-top:8px}.lsd-rec-t{margin:0 0 4px;font-weight:700}.lsd-rec-s{margin:0;font-size:.92em;opacity:.85}' +
    '.lsd-vot-ops{display:grid;gap:8px;margin-top:10px}.lsd-vot-op{display:block;width:100%;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid #d8d0c9;background:#fff;font:inherit;cursor:pointer}' +
    '.lsd-vot-op:hover{border-color:var(--lsd-acento,#b4552d)}.lsd-vot-res{position:relative;padding:10px 12px;border-radius:10px;background:#fff;overflow:hidden;border:1px solid #e6ded6}' +
    '.lsd-vot-res i{position:absolute;top:0;bottom:0;left:0;inset:0 auto 0 0;background:var(--lsd-acento,#b4552d);opacity:.16}.lsd-vot-res span{position:relative;display:flex;justify-content:space-between;gap:10px}' +
    '.lsd-vot-res.mio{border-color:var(--lsd-acento,#b4552d);font-weight:700}.lsd-vot-total{margin:8px 0 0;font-size:.88em;opacity:.8}' +
    '.lsd-vot-q+.lsd-vot-q{margin-top:16px}.lsd-vot-op.sel{border-color:var(--lsd-acento,#b4552d);box-shadow:inset 0 0 0 1px var(--lsd-acento,#b4552d);font-weight:700}' +
    '.lsd-vot-libre{display:block;width:100%;box-sizing:border-box;margin-top:10px;padding:12px 14px;border-radius:10px;border:1px solid #d8d0c9;background:#fff;font:inherit;resize:vertical}' +
    '.lsd-vot-enviar{display:block;width:100%;margin-top:14px;padding:13px 16px;border:0;border-radius:10px;background:var(--lsd-acento,#b4552d);color:#fff;font:inherit;font-weight:700;cursor:pointer}.lsd-vot-enviar:disabled{opacity:.6}' +
    '.lsd-vot-mia{margin-top:8px;padding:10px 12px;border-radius:10px;background:#fff;border:1px solid #e6ded6}.lsd-vot-mia span{font-size:.8em;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.7}.lsd-vot-mia p{margin:4px 0 0;white-space:pre-line}';
  CSS +=
    '.lsd-cal-menu{display:flex;flex-direction:column;gap:8px;width:100%;max-width:360px;margin:12px auto 0;padding:14px;border-radius:16px;background:#fff;color:#2b2522;box-shadow:0 18px 40px -16px rgba(0,0,0,.45);text-align:left;font-size:15px;box-sizing:border-box;animation:lsdEncIn .2s ease both}' +
    '.lsd-cal-t{margin:0 0 2px;font-weight:700;font-size:14px}.lsd-cal-s{margin:0 0 4px;font-size:12.5px;opacity:.75;line-height:1.4}.lsd-cal-op{display:flex;flex-direction:column;gap:2px;padding:11px 14px;border-radius:12px;border:1.5px solid #e6ded6;color:inherit!important;text-decoration:none!important;background:#faf7f4}' +
    '.lsd-cal-op:hover{border-color:var(--lsd-acento,#b4552d)}.lsd-cal-op span{font-size:13px;opacity:.75}.lsd-cal-op.lsd-cal-hecho{border-color:#3c9a5f}.lsd-cal-op.lsd-cal-hecho strong::after{content:" ✓";color:#3c9a5f}';
  // Encuesta primero (preclase): pantalla completa hasta que la rellena. Colores con variables para cada página:
  // --lsd-enc-fondo, --lsd-enc-texto, --lsd-enc-tarjeta y --lsd-acento.
  CSS +=
    '#lsd-encuesta:not(.res-pop){position:fixed;inset:0;top:0;right:0;bottom:0;left:0;z-index:2147482990;overflow-y:auto;display:flex;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;' +
    'background:var(--lsd-enc-fondo,rgba(20,14,12,.94));-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);font-family:inherit;animation:lsdEncIn .4s ease both}' +
    '#lsd-encuesta:not(.res-pop) .lsd-enc-c{width:100%;max-width:480px;padding:32px 26px;border-radius:20px;background:var(--lsd-enc-tarjeta,#fffaf5);color:var(--lsd-enc-texto,#2b2522);text-align:center;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);box-sizing:border-box}' +
    '#lsd-encuesta:not(.res-pop) .lsd-enc-ico{font-size:44px;line-height:1;margin:0 0 12px}#lsd-encuesta:not(.res-pop) .lsd-enc-paso{margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--lsd-acento,#b4552d)}' +
    '#lsd-encuesta:not(.res-pop) h2{margin:0 0 10px;font-size:clamp(22px,5vw,28px);line-height:1.2;color:inherit}#lsd-encuesta:not(.res-pop) p{margin:0 0 18px;line-height:1.55;opacity:.85}' +
    '#lsd-encuesta:not(.res-pop) .lsd-enc-btn{display:block;width:100%;padding:16px 18px;border-radius:999px;background:var(--lsd-acento,#b4552d);color:#fff;font-weight:700;font-size:16px;text-decoration:none;box-sizing:border-box}' +
    '#lsd-encuesta:not(.res-pop) .lsd-enc-ya{display:inline-block;margin-top:14px;padding:6px 10px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-decoration:underline;opacity:.75;cursor:pointer}' +
    '#lsd-encuesta:not(.res-pop) .lsd-enc-msg{min-height:1.4em;margin:8px 0 0;font-size:14px;opacity:.8}' +
    '#lsd-encuesta:not(.res-pop).lsd-enc-dentro{align-items:flex-start;padding:12px}#lsd-encuesta:not(.res-pop).lsd-enc-dentro .lsd-enc-c{max-width:720px;padding:20px 16px 16px}' +
    '#lsd-encuesta:not(.res-pop).lsd-enc-dentro .lsd-enc-ico{font-size:30px;margin-bottom:6px}#lsd-encuesta:not(.res-pop).lsd-enc-dentro h2{font-size:clamp(19px,4.5vw,24px)}#lsd-encuesta:not(.res-pop).lsd-enc-dentro p{margin-bottom:12px}' +
    '#lsd-encuesta:not(.res-pop) .lsd-enc-marco{width:100%;height:min(70vh,760px);border-radius:14px;overflow:hidden;background:#fff;border:1px solid rgba(0,0,0,.08)}' +
    '#lsd-encuesta:not(.res-pop) .lsd-enc-marco iframe{display:block;width:100%;height:100%;border:0}' +
    '#lsd-encuesta:not(.res-pop) .lsd-enc-btn-sec{margin-top:12px;padding:10px 14px;background:none;color:inherit;border:1.5px solid currentColor;font-size:14px;opacity:.85}' +
    '#lsd-encuesta:not(.res-pop).lsd-enc-popup{background:var(--lsd-enc-fondo-popup,rgba(20,14,12,.62));-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}' +
    '#lsd-encuesta:not(.res-pop).lsd-enc-popup .lsd-enc-c{max-width:440px;animation:lsdEncPop .35s cubic-bezier(.2,.9,.3,1.2) both}' +
    '#lsd-encuesta:not(.res-pop) .lsd-enc-c>p.lsd-enc-txt{white-space:pre-line}' +
    '@keyframes lsdEncIn{from{opacity:0}to{opacity:1}}@keyframes lsdEncPop{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}' +
    '@media (prefers-reduced-motion:reduce){#lsd-encuesta:not(.res-pop),#lsd-encuesta:not(.res-pop) .lsd-enc-c{animation:none}}';
  CSS +=
    '#lsd-espera{position:fixed;top:0;right:0;bottom:0;left:0;width:100%;height:100%;inset:0;z-index:2147483000;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;box-sizing:border-box;' +
    'background:var(--lsd-espera-fondo,radial-gradient(120% 80% at 50% 0%,#fffaf5 0%,#f6ebe1 55%,#f0e4da 100%));color:var(--lsd-espera-texto,#3a2a24);font-family:Lato,Helvetica,Arial,sans-serif;text-align:center;animation:lsdEspIn .6s ease both}' +
    '#lsd-espera:focus{outline:none}' +
    '#lsd-espera .lsd-espera-in{flex:1 0 auto;width:100%;max-width:720px;margin:0 auto;padding:clamp(28px,6vh,64px) 20px 20px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center}' +
    '#lsd-espera .lsd-espera-logo{display:block;max-width:200px;max-height:104px;width:auto;height:auto;margin:0 auto clamp(18px,3.5vh,30px);object-fit:contain;animation:lsdEspUp .7s .05s ease both}' +
    '#lsd-espera .lsd-espera-t{margin:0;font-size:clamp(30px,6vw,56px);font-weight:900;line-height:1.08;letter-spacing:-.01em;color:var(--lsd-espera-titulo,#4a2c20);text-wrap:balance;animation:lsdEspUp .7s .12s ease both}' +
    '#lsd-espera .lsd-espera-sub{display:inline-flex;align-items:center;gap:12px;margin:12px 0 0;font-size:clamp(19px,3vw,27px);font-weight:900;font-style:italic;color:var(--lsd-espera-acento,#860d0e);animation:lsdEspUp .7s .2s ease both}' +
    '#lsd-espera .lsd-espera-sub::before,#lsd-espera .lsd-espera-sub::after{content:"";width:34px;height:2px;border-radius:2px;background:#c49b79;opacity:.7}' +
    '#lsd-espera .lsd-espera-cd{display:flex;align-items:flex-start;justify-content:center;gap:clamp(8px,1.8vw,16px);margin:clamp(22px,4.5vh,40px) 0 0;animation:lsdEspUp .7s .28s ease both}' +
    '#lsd-espera .lsd-espera-u{display:flex;flex-direction:column;align-items:center;gap:10px}' +
    '#lsd-espera .lsd-espera-num{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:1.55em;padding:.14em .18em;border-radius:22px;box-sizing:border-box;' +
    'background:linear-gradient(180deg,#ffffff 0%,#fdf8f4 100%);border:1px solid #e2d3c5;box-shadow:0 1px 0 #ffffff inset,0 14px 34px rgba(134,13,14,.10),0 3px 0 #ead9c9;' +
    'font-size:clamp(52px,11.5vw,108px);font-weight:900;line-height:1;color:var(--lsd-espera-acento,#860d0e);font-variant-numeric:tabular-nums}' +
    '#lsd-espera .lsd-espera-num::after{content:"";position:absolute;left:12%;right:12%;top:50%;height:1px;background:rgba(74,44,32,.07)}' +
    '#lsd-espera .lsd-espera-sep{font-size:clamp(40px,8.5vw,84px);font-weight:900;line-height:1;margin-top:.22em;color:var(--lsd-espera-acento,#860d0e);opacity:.5;animation:lsdEspSep 1s steps(1) infinite}' +
    '#lsd-espera .lsd-espera-lbl{font-size:12px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:#8a7468}' +
    '#lsd-espera .lsd-espera-msg{position:relative;display:inline-flex;align-items:center;gap:14px;margin:clamp(22px,4vh,34px) auto 0;max-width:560px;padding:14px 44px 14px 18px;box-sizing:border-box;text-align:center;justify-content:center;' +
    'background:#ffffff;border:1.5px solid #e2d3c5;border-radius:999px;font-size:clamp(16px,2vw,19px);line-height:1.45;color:var(--lsd-espera-texto,#3a2a24);' +
    'box-shadow:0 10px 28px rgba(134,13,14,.10);animation:lsdEspUp .7s .36s ease both,lsdEspAura 2.8s 1.2s ease-in-out infinite}' +
    '#lsd-espera .lsd-espera-msg>span:last-child{flex:1;text-align:center;text-wrap:balance}' +
    '#lsd-espera .lsd-espera-msg strong{font-weight:900;color:var(--lsd-espera-acento,#860d0e)}' +
    '#lsd-espera .lsd-espera-dot{position:relative;flex:none;width:12px;height:12px;border-radius:50%;background:var(--lsd-espera-acento,#860d0e)}' +
    '#lsd-espera .lsd-espera-dot::before,#lsd-espera .lsd-espera-dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--lsd-espera-acento,#860d0e);opacity:.45;animation:lsdEspOnda 1.8s ease-out infinite}' +
    '#lsd-espera .lsd-espera-dot::after{animation-delay:.9s}' +
    '@keyframes lsdEspOnda{from{transform:scale(1);opacity:.45}to{transform:scale(3.2);opacity:0}}' +
    '@keyframes lsdEspAura{0%,100%{box-shadow:0 10px 28px rgba(134,13,14,.10),0 0 0 0 rgba(196,155,121,.0)}50%{box-shadow:0 12px 32px rgba(134,13,14,.16),0 0 0 7px rgba(196,155,121,.22)}}' +
    '@media (max-width:600px){#lsd-espera .lsd-espera-msg{border-radius:20px;padding:14px 40px 14px 16px;gap:12px}}' +
    '#lsd-espera .lsd-espera-paisaje{flex:none;position:relative;width:100%;height:clamp(130px,min(19vw,27vh),250px);margin-top:12px}' +
    '#lsd-espera .lsd-espera-paisaje svg{position:absolute;top:0;left:0;inset:0;width:100%;height:100%;display:block}' +
    '#lsd-espera .lsd-espera-paisaje{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 30%);mask-image:linear-gradient(to bottom,transparent 0,#000 30%)}' +
    '#lsd-espera .lsd-esp-sol{transform-box:fill-box;transform-origin:50% 50%;animation:lsdEspSol 5s ease-in-out infinite}' +
    '#lsd-espera .lsd-esp-nube{animation:lsdEspNube 34s linear infinite}#lsd-espera .lsd-esp-nube--2{animation-duration:48s;animation-delay:-20s}' +
    '#lsd-espera .lsd-esp-trazo{stroke-dasharray:3 12;animation:lsdEspMarcha 1.1s linear infinite}' +
    '#lsd-espera .lsd-esp-cipres{transform-box:fill-box;transform-origin:50% 100%;animation:lsdEspViento 4s ease-in-out infinite}#lsd-espera .lsd-esp-cipres--b{animation-delay:-1.6s}' +
    '@keyframes lsdEspIn{from{opacity:0}to{opacity:1}}@keyframes lsdEspUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes lsdEspSep{50%{opacity:.12}}' +
    '@keyframes lsdEspSol{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:.9;transform:scale(1.08)}}@keyframes lsdEspNube{from{transform:translateX(-220px)}to{transform:translateX(1400px)}}' +
    '@keyframes lsdEspMarcha{to{stroke-dashoffset:-15}}@keyframes lsdEspViento{0%,100%{transform:rotate(0)}50%{transform:rotate(2.5deg)}}' +
    '@media (max-width:600px){#lsd-espera .lsd-espera-paisaje{height:170px}}' +
    '@media (max-height:720px) and (min-width:601px){#lsd-espera .lsd-espera-in{padding-top:18px}#lsd-espera .lsd-espera-logo{max-height:64px;margin-bottom:12px}' +
    '#lsd-espera .lsd-espera-t{font-size:clamp(26px,4.2vw,42px)}#lsd-espera .lsd-espera-sub{margin-top:6px;font-size:clamp(17px,2.4vw,22px)}#lsd-espera .lsd-espera-cd{margin-top:16px}' +
    '#lsd-espera .lsd-espera-num{font-size:clamp(44px,8vw,80px);border-radius:18px}#lsd-espera .lsd-espera-sep{font-size:clamp(34px,6vw,62px)}#lsd-espera .lsd-espera-msg{margin-top:14px}#lsd-espera .lsd-espera-paisaje{height:clamp(110px,22vh,150px)}}' +
    // Con vídeo: el vídeo es lo principal; titular, contador y mensaje más pequeños.
    '#lsd-espera.lsd-espera--video .lsd-espera-in{max-width:880px;padding-top:clamp(18px,3.5vh,40px)}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-logo{max-height:64px;margin-bottom:clamp(10px,2vh,18px)}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-t{font-size:clamp(24px,3.6vw,38px)}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-sub{margin-top:6px;font-size:clamp(16px,2vw,20px)}' +
    '#lsd-espera .lsd-espera-video{width:100%;max-width:min(820px,max(300px,calc((100vh - 480px) * 1.78)));margin:clamp(14px,2.6vh,24px) auto 0;padding:6px;box-sizing:border-box;border-radius:20px;background:#ffffff;border:1px solid #e2d3c5;box-shadow:0 18px 44px rgba(134,13,14,.14);animation:lsdEspUp .7s .24s ease both}' +
    '#lsd-espera .lsd-espera-video .lsd-embed{border-radius:15px}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-cd{margin-top:clamp(12px,2.2vh,20px);gap:8px}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-u{gap:5px}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-num{font-size:clamp(26px,3.6vw,36px);border-radius:12px;padding:.14em .22em;box-shadow:0 6px 16px rgba(134,13,14,.10),0 2px 0 #ead9c9}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-num::after{display:none}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-sep{font-size:clamp(22px,3vw,30px);margin-top:.12em}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-lbl{font-size:10px;letter-spacing:.16em}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-msg{margin-top:clamp(12px,2.2vh,20px);font-size:clamp(14px,1.7vw,16px);padding:10px 36px 10px 14px;gap:12px}' +
    '#lsd-espera.lsd-espera--video .lsd-espera-paisaje{height:clamp(90px,min(13vw,17vh),160px)}' +
    '@media (prefers-reduced-motion:reduce){#lsd-espera,#lsd-espera *{animation:none!important}}';
  // Comentarios de la preclase (muro debajo de cada clase). Estilos base sobrios: el diseño de la página los
  // viste (todas las clases empiezan por .lsd-com) y puede cambiar el color con --lsd-acento.
  // Bloque único con pestañas (una por clase): .lsd-com-bloque > .lsd-com-tabs (.lsd-com-tab[aria-selected]) > .lsd-com-panel > .lsd-com-in
  CSS += '.lsd-com-tabs{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6px;margin:0 0 14px;padding:4px;border-radius:14px;background:#f1e9e1}' +
    '.lsd-com-tab{display:inline-flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 8px;min-width:0;padding:11px 12px;border:0;border-radius:11px;background:transparent;font:inherit;font-weight:700;line-height:1.25;text-align:center;color:inherit;opacity:.7;cursor:pointer;transition:background .2s,opacity .2s,box-shadow .2s}' +
    '.lsd-com-tab:hover{opacity:1}.lsd-com-tab[aria-selected="true"]{background:#fff;opacity:1;box-shadow:0 2px 10px -4px rgba(0,0,0,.25);color:var(--lsd-com-ac,#b4552d)}' +
    '.lsd-com-tab:focus-visible{outline:2px solid var(--lsd-com-ac,#b4552d);outline-offset:2px}.lsd-com-tab.cerrada{opacity:.55}' +
    '.lsd-com-tab-n{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--lsd-com-ac,#b4552d);color:#fff;font-size:.75em}' +
    '.lsd-com-in{animation:lsdComIn .3s ease both}.lsd-com-head-in{margin-bottom:12px}.lsd-com-head-in .lsd-com-titulo{font-size:1.05em}' +
    '.lsd-com-in.lsd-com-cerrado{display:flex;align-items:center;gap:12px;padding:18px;border-radius:12px;background:#fff;border:1px dashed #e2d8cf}' +
    '@keyframes lsdComIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.lsd-com-in{animation:none}}';
  CSS += '.lsd-com{--lsd-com-ac:var(--lsd-acento,#b4552d);box-sizing:border-box;margin:18px 0 0;padding:18px;border-radius:16px;background:#fbf8f5;border:1px solid #ece3da;color:#2b2522;font-family:inherit}' +
    '.lsd-com *{box-sizing:border-box}.lsd-com-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}.lsd-com-ico{font-size:1.6em;line-height:1}' +
    '.lsd-com-kicker{margin:0;font-size:.78em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--lsd-com-ac)}.lsd-com-titulo{margin:2px 0 0;font-size:1.15em;line-height:1.3}' +
    '.lsd-com-n{margin-left:auto;font-size:.85em;opacity:.75;white-space:nowrap}' +
    '.lsd-com-form{padding:14px;border-radius:12px;background:#fff;border:1px solid #ece3da}.lsd-com-paso{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-weight:700;font-size:.95em}' +
    '.lsd-com-paso b{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--lsd-com-ac);color:#fff;font-size:.8em}' +
    '.lsd-com-preguntas{display:grid;gap:8px;margin-bottom:14px}.lsd-com-preg{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;padding:11px 12px;border-radius:10px;border:1.5px solid #e2d8cf;background:#fff;font:inherit;color:inherit;cursor:pointer}' +
    '.lsd-com-preg:hover{border-color:var(--lsd-com-ac)}.lsd-com-preg[aria-checked="true"]{border-color:var(--lsd-com-ac);background:#fff6f1;box-shadow:inset 0 0 0 1px var(--lsd-com-ac)}' +
    '.lsd-com-preg-n{flex:none;display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;border:1.5px solid currentColor;font-size:.8em;font-weight:700;opacity:.7}.lsd-com-preg[aria-checked="true"] .lsd-com-preg-n{background:var(--lsd-com-ac);border-color:var(--lsd-com-ac);color:#fff;opacity:1}' +
    '.lsd-com-respondes{display:block;margin:0 0 6px;font-size:.88em;opacity:.8}.lsd-com-respondes b{opacity:1}' +
    '.lsd-com-nombre{display:block;width:100%;margin:0 0 8px;padding:10px 14px;border-radius:10px;border:1.5px solid #e2d8cf;background:#fff;font:inherit;color:inherit}.lsd-com-nombre:focus{outline:none;border-color:var(--lsd-com-ac)}' +
    '.lsd-com-txt-in{display:block;width:100%;min-height:96px;padding:12px 14px;border-radius:10px;border:1.5px solid #e2d8cf;background:#fff;font:inherit;color:inherit;resize:vertical}.lsd-com-txt-in:focus{outline:none;border-color:var(--lsd-com-ac)}' +
    '.lsd-com-pie{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:10px}.lsd-com-aviso{font-size:.82em;opacity:.7}' +
    '.lsd-com-enviar{padding:12px 18px;border:0;border-radius:10px;background:var(--lsd-com-ac);color:#fff;font:inherit;font-weight:700;cursor:pointer}.lsd-com-enviar:disabled{opacity:.55;cursor:default}' +
    '.lsd-com-ok{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:#eaf6ee;color:#1f6b3a;font-weight:600}' +
    '.lsd-com-filtros{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 10px}.lsd-com-filtro{padding:6px 12px;border-radius:999px;border:1px solid #e2d8cf;background:#fff;font:inherit;font-size:.85em;color:inherit;cursor:pointer}.lsd-com-filtro[aria-pressed="true"]{background:var(--lsd-com-ac);border-color:var(--lsd-com-ac);color:#fff}' +
    '.lsd-com-lista{list-style:none;margin:0;padding:0;display:grid;gap:10px}.lsd-com-item{display:flex;gap:10px;padding:12px;border-radius:12px;background:#fff;border:1px solid #ece3da}' +
    '.lsd-com-item.destacado{border-color:var(--lsd-com-ac);box-shadow:0 0 0 1px var(--lsd-com-ac)}.lsd-com-item.mio{background:#fffaf6}' +
    '.lsd-com-av{flex:none;display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#efe6dd;font-weight:700}.lsd-com-av.marca{width:30px;height:30px;background:var(--lsd-com-ac);color:#fff;font-size:.85em}' +
    '.lsd-com-c{flex:1;min-width:0}.lsd-com-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.9em}.lsd-com-meta time{opacity:.6;font-size:.9em}' +
    '.lsd-com-chip{font-size:.75em;font-weight:700;padding:2px 8px;border-radius:999px;background:#f3ebe3}.lsd-com-chip.dest{background:var(--lsd-com-ac);color:#fff}' +
    '.lsd-com-q{margin:4px 0 0;font-size:.82em;opacity:.7}.lsd-com-texto{margin:4px 0 0;white-space:pre-line;overflow-wrap:anywhere;line-height:1.5}' +
    '.lsd-com-resp{display:flex;gap:8px;margin-top:10px;padding:10px;border-radius:10px;background:#faf3ee;border-left:3px solid var(--lsd-com-ac)}.lsd-com-resp p{margin:2px 0 0;white-space:pre-line;overflow-wrap:anywhere}' +
    '.lsd-com-vacio{margin:6px 0 0;padding:14px;text-align:center;border-radius:12px;border:1px dashed #e2d8cf;opacity:.85}.lsd-com-mas{display:block;margin:12px auto 0;padding:9px 16px;border-radius:999px;border:1px solid #e2d8cf;background:#fff;font:inherit;cursor:pointer}' +
    '.lsd-com-pag{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}.lsd-com-pag .lsd-com-mas{margin:12px 0 0}.lsd-com-mas span{opacity:.7}.lsd-com-menos{margin:12px 0 0;padding:9px 14px;border:0;background:none;font:inherit;text-decoration:underline;opacity:.75;cursor:pointer;color:inherit}' +
    '.lsd-com-largo{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.lsd-com-largo.lsd-com-abierto{display:block;-webkit-line-clamp:unset;overflow:visible}' +
    '.lsd-com-leer{margin:4px 0 0;padding:0;border:0;background:none;font:inherit;font-size:.9em;font-weight:700;color:var(--lsd-com-ac);cursor:pointer}' +
    '.lsd-com-cerrado{display:flex;gap:10px;align-items:center;opacity:.85}' +
    '.lsd-lista{display:flex;flex-direction:column;gap:16px}.lsd-lista-item{padding:18px;border-radius:16px;border:1px solid #e9dfd6;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.05)}' +
    '.lsd-lista-lock{background:#faf7f4}.lsd-lista-t{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-weight:700;font-size:1.05em}' +
    '.lsd-lista-n{flex:none;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#2b2320;color:#fff;font-size:.85em}' +
    '.lsd-lista-s{margin:0 0 10px;opacity:.8;line-height:1.5}.lsd-lista-video{position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000}' +
    '.lsd-lista-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.lsd-lista-mp4{width:100%;border-radius:12px}.lsd-lista-item audio{width:100%}' +
    '@media (max-width:600px){.lsd-com{padding:14px}.lsd-com-n{display:none}.lsd-com-enviar{width:100%}}';

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
    // Login con móvil (data-movil en el bloque; por defecto «si»): se pide el WhatsApp desde el principio y,
    // si su ficha de GHL no tiene teléfono, se guarda (para el setting y las plantillas).
    var conMovil = opts.movil && opts.movil !== 'no';
    if (conMovil) {
      f('phone').hidden = false;
      f('phone').required = opts.movil !== 'opcional';
      f('phone').placeholder = 'Tu WhatsApp (p. ej. 612 345 678)';
      if (opts.movilNota) {
        var nota = document.createElement('p');
        nota.className = 'lsd-movil-nota';
        nota.textContent = opts.movilNota;
        form.insertBefore(nota, btn);
      }
    }
    var turnstileToken = '';
    var turnstileShown = false;
    var esperaToken = null; // quien espera a que Cloudflare dé su visto bueno

    // Verificación anti-bots de Cloudflare (solo si está configurada en el dashboard). Solo se ve la casilla si
    // Cloudflare sospecha (interaction-only): casi siempre se resuelve sola, en segundo plano.
    function showTurnstile(siteKey) {
      if (!siteKey || turnstileShown) return;
      turnstileShown = true;
      var holder = document.createElement('div');
      holder.style.margin = '4px 0';
      form.insertBefore(holder, btn);
      function render() {
        window.turnstile.render(holder, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          callback: function (t) { turnstileToken = t; if (esperaToken) { esperaToken(); esperaToken = null; } },
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
    // Acceso con email y WhatsApp: la verificación se prepara ya, para registrar en el mismo paso a quien no lo estaba.
    if (opts.login && conMovil && opts.siteKey) showTurnstile(opts.siteKey);
    // Hasta 6 s a que Cloudflare termine (si aún está comprobando al pulsar).
    function conToken(seguir) {
      if (!turnstileShown || turnstileToken) return seguir();
      var hecho = false;
      var fin = function () { if (!hecho) { hecho = true; seguir(); } };
      esperaToken = fin;
      setTimeout(fin, 6000);
    }

    form.onsubmit = function (e) {
      e.preventDefault();
      conToken(enviar);
    };
    function enviar() {
      var email = f('email').value.trim().toLowerCase();
      btn.disabled = true;
      err.hidden = true;
      var payload = { email: email, launch: launch, hp: f('lsd_hp_zq').value };
      var movil = f('phone').value.trim();
      if (conMovil && movil && movil.replace(/\D/g, '').length < 8) {
        btn.disabled = false;
        err.textContent = 'Revisa tu número de WhatsApp (con el prefijo del país si no es de España).';
        err.hidden = false;
        return f('phone').focus();
      }
      if (conMovil && movil) payload.phone = movil;
      // Si la página tiene selector de prefijo y ha escrito el «+34…» dentro del campo, se envía así pero en pantalla
      // queda solo el número (si no, parece un prefijo repetido al lado del selector).
      var cc = f('phone').parentElement && f('phone').parentElement.querySelector('[data-code]');
      var codigo = cc && cc.getAttribute('data-code');
      if (codigo && movil.indexOf('+' + codigo) === 0) f('phone').value = movil.slice(codigo.length + 1);
      // Acceso con WhatsApp: en el mismo paso, si no estaba registrada, se registra (sin nombre si la página no lo pide).
      if (opts.login && conMovil && movil && !signup) {
        payload.alta = 1;
        payload.turnstile = turnstileToken;
        if (f('name').offsetParent === null || getComputedStyle(f('name')).display === 'none') payload.sinNombre = 1;
        else if (f('name').value.trim()) payload.name = f('name').value.trim();
      }
      if (signup) {
        payload.name = f('name').value.trim(); payload.phone = movil; payload.turnstile = turnstileToken; payload.alta = 1;
        // Si la página oculta el campo del nombre, el registro va solo con el email y el WhatsApp.
        var nombreVisible = f('name').offsetParent !== null && getComputedStyle(f('name')).display !== 'none';
        if (!nombreVisible) payload.sinNombre = 1;
        if (!movil) {
          btn.disabled = false;
          err.textContent = 'Escribe tu número de WhatsApp para registrarte.';
          err.hidden = false;
          return f('phone').focus();
        }
        if (turnstileShown && !turnstileToken) {
          btn.disabled = false;
          err.textContent = 'Marca la casilla «Verifica que eres un ser humano» y vuelve a pulsar.';
          err.hidden = false;
          return;
        }
      }
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
          // Acceso en un paso y Cloudflare no se ha resuelto solo: se enseña la casilla y se pide marcarla.
          if (!signup && r.error === 'turnstile') {
            if (window.turnstile) { try { window.turnstile.reset(); } catch (e3) { /* sin casilla */ } turnstileToken = ''; }
            err.textContent = 'Un momento: marca la casilla de verificación de abajo y vuelve a pulsar.';
            err.hidden = false;
            showTurnstile(r.siteKey);
            return;
          }
          if (signup) {
            err.textContent = r.error === 'turnstile' ? 'La verificación de Cloudflare ha caducado: márcala otra vez y vuelve a pulsar.' : payload.sinNombre ? 'Revisa tu número de WhatsApp (con el prefijo del país si no es de España).' : 'Revisa tu nombre y tu móvil.';
            // Un token de Cloudflare solo vale una vez: tras un intento fallido se vuelve a pedir la casilla.
            if (window.turnstile) { try { window.turnstile.reset(); } catch (e2) { /* sin casilla */ } turnstileToken = ''; }
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
    }
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
          // La música y la votación de la preclase se desbloquean al ver el 75 % de su clase.
          try { document.dispatchEvent(new CustomEvent('lsd:progreso', { detail: { video: video, pct: t } })); } catch (e) { /* navegador antiguo */ }
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
  var redirigido = false; // ya se está yendo a otra página: no se vuelve a redirigir
  function goTo(url, who) {
    if (redirigido) return;
    redirigido = true;
    var u = new URL(url, location.href);
    if (who && who.cid) u.searchParams.set('cid', who.cid);
    else if (who && who.email) u.searchParams.set('email', who.email);
    // La vista previa del dashboard se conserva al pasar de una página a otra (no al directo).
    if (params.get('lsd_preview') && u.pathname !== '/directo') u.searchParams.set('lsd_preview', params.get('lsd_preview'));
    location.replace(u.toString());
  }

  // ---------- Datos del lanzamiento configurados en el dashboard ----------
  var clockSkew = 0; // diferencia entre la hora del servidor y la del dispositivo
  var skewFijado = false;

  function fetchPage(launch, who, pagina) {
    var q = new URLSearchParams({ l: launch || 'auto' });
    // La preclase avisa de que es ella: a la hora del directo el servidor solo devuelve adónde ir (sin llamar a GHL).
    if (pagina) q.set('pagina', pagina);
    if (who && who.cid) q.set('cid', who.cid);
    else if (who && who.email) q.set('email', who.email); // sin cid: el servidor la busca por su email
    if (params.get('lsd_preview')) q.set('preview', params.get('lsd_preview'));
    return fetch(API + conCliente('/api/page?' + q.toString())).then(function (r) { return r.json(); }).then(function (d) {
      // En la vista previa la hora del servidor es fija: se toma solo la primera vez (si no, el contador salta atrás).
      if (d && d.now && (!d.preview || !skewFijado)) { clockSkew = d.now - Date.now(); skewFijado = true; }
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

  // <div data-lsd-countdown-boxes="directo|directo2…|clase1|clase2|vip"></div>
  function renderCountdownBoxes(data) {
    document.querySelectorAll('[data-lsd-countdown-boxes]').forEach(function (el) {
      var k = el.getAttribute('data-lsd-countdown-boxes');
      var at = k === 'directo' || k === 'vip' ? data.vip.closesAt : k === 'fase' ? data.countdownTo : (data.directos || {})[k] || (data.videos[k] || {}).unlockAt || ((data.recursos || {})[k] || {}).unlockAt;
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

  // URL de reproductor a partir de un enlace de Vimeo (también oculto, con hash) o de YouTube.
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

  // Vídeos sin medir (el de la página de gracias, el de confirmar la llamada…): <div data-lsd-embed="gracias|llamada"></div>
  // La URL de Vimeo o YouTube sale del dashboard; si no hay, el elemento se oculta.
  function pintarEmbeds(embeds) {
    document.querySelectorAll('[data-lsd-embed]').forEach(function (el) {
      var src = embedSrc((embeds || {})[el.getAttribute('data-lsd-embed')]);
      if (!src) return show(el, false);
      show(el, true);
      if (el.getAttribute('data-lsd-embed-src') === src) return;
      el.setAttribute('data-lsd-embed-src', src);
      el.innerHTML = '<div class="lsd-embed"><iframe src="' + esc(src) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" title="Vídeo"></iframe></div>';
    });
  }

  var calendarios = { lista: [], ics: '' };
  function menuCalendario(e) {
    var lista = calendarios.lista;
    if (!lista || lista.length < 2) return; // un solo directo: el enlace de siempre
    e.preventDefault();
    var btn = e.currentTarget;
    var abierto = document.getElementById('lsd-cal-menu');
    if (abierto) { var mismo = abierto.lsdBtn === btn; abierto.parentNode.removeChild(abierto); if (mismo) return; }
    var m = document.createElement('div');
    m.id = 'lsd-cal-menu';
    m.className = 'lsd-cal-menu';
    m.setAttribute('role', 'menu');
    m.lsdBtn = btn;
    m.innerHTML = '<p class="lsd-cal-t">Añade los ' + lista.length + ' directos a tu calendario</p><p class="lsd-cal-s">En Google, pulsa cada uno y dale a «Guardar» (Google guarda uno cada vez).</p>' + lista.map(function (d) {
      return '<a class="lsd-cal-op" role="menuitem" href="' + esc(d.google) + '" target="_blank" rel="noopener"><strong>📅 ' + esc(d.nombre) + '</strong><span>' + esc(d.cuando) + ' · Google Calendar</span></a>';
    }).join('') + (calendarios.ics ? '<a class="lsd-cal-op lsd-cal-ics" role="menuitem" href="' + esc(calendarios.ics) + '"><strong>🍎 Apple / Outlook</strong><span>Los ' + lista.length + ' directos de una vez</span></a>' : '');
    btn.insertAdjacentElement('afterend', m);
    m.addEventListener('click', function (ev) { if (ev.target.closest('a')) { var op = ev.target.closest('a'); op.classList.add('lsd-cal-hecho'); } });
    setTimeout(function () {
      document.addEventListener('click', function fuera(ev) {
        if (!document.getElementById('lsd-cal-menu')) return document.removeEventListener('click', fuera);
        if (!m.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) { if (m.parentNode) m.parentNode.removeChild(m); document.removeEventListener('click', fuera); }
      });
    }, 0);
  }

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

    pintarEmbeds(data.embeds);

    // Barra de urgencia: <div data-lsd-bar></div>
    document.querySelectorAll('[data-lsd-bar]').forEach(function (el) {
      var b = data.bar || {};
      var text = esc(b.text || '').replace('{cuenta}', cdSpan(data.countdownTo));
      var btn = b.button ? '<a class="lsd-bar-btn" href="' + esc(linkWho(b.button.href)) + '"' + (b.button.key === 'whatsapp' ? ' target="_blank" rel="noopener"' : '') + '>' + esc(b.button.label || defaultLabel(b.button.key)) + '</a>' : '';
      el.innerHTML = '<span class="lsd-bar-text">' + text + '</span>' + btn;
      el.setAttribute('data-lsd-phase-now', data.phase);
      show(el, Boolean(b.text));
    });

    calendarios = { lista: data.calendarios || [], ics: data.links['calendario-ics'] || '' };
    // Enlaces: <a data-lsd-link="vip|whatsapp|directo|grabacion|venta|pago|llamada">
    document.querySelectorAll('[data-lsd-link]').forEach(function (el) {
      var href = data.links[el.getAttribute('data-lsd-link')];
      if (href) { el.setAttribute('href', linkWho(href)); show(el, true); } else show(el, false);
      // La encuesta se abre en otra pestaña: al volver, la página detecta que ya está hecha.
      var lk = el.getAttribute('data-lsd-link');
      if ((lk === 'encuesta' || lk === 'test' || lk === 'descargable' || lk === 'whatsapp' || lk === 'whatsapp-dudas') && !el.getAttribute('target')) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
      // Añadir al calendario con varios directos: el botón abre un menú con uno por día (Google solo admite un
      // evento por enlace) y el archivo con todos (Apple / Outlook).
      if (lk === 'calendario' && !el.getAttribute('data-lsd-cal')) { el.setAttribute('data-lsd-cal', '1'); el.addEventListener('click', menuCalendario); }
      // El descargable cuenta como abierto al pulsarlo (etiqueta <código>_descarga).
      if (lk === 'descargable' && !el.getAttribute('data-lsd-medido')) {
        el.setAttribute('data-lsd-medido', '1');
        el.addEventListener('click', function () { if (who) post('/api/track', { launch: data.code, video: 'descarga', pct: 0, cid: who.cid, email: who.email }); });
      }
    });

    // Imágenes de las etapas: <img data-lsd-img="clase1"> (o un div: se le pone un <img> dentro). Sin imagen, se oculta.
    document.querySelectorAll('[data-lsd-img]').forEach(function (el) {
      var src = (data.imagenes || {})[el.getAttribute('data-lsd-img')];
      if (!src) return show(el, false);
      show(el, true);
      var img = el.tagName === 'IMG' ? el : el.querySelector('img');
      if (!img) { img = document.createElement('img'); img.alt = ''; el.appendChild(img); }
      if (img.getAttribute('src') !== src) { img.loading = 'lazy'; img.src = src; }
    });

    // Textos: <span data-lsd-text="fechaDirecto|horaDirecto|directo|clase1|clase2|replay|cierreVip|cierreCarrito|precioVip">
    document.querySelectorAll('[data-lsd-text]').forEach(function (el) {
      var v = data.texts[el.getAttribute('data-lsd-text')];
      if (v != null) el.textContent = v;
    });

    // Cuentas atrás sueltas: <span data-lsd-countdown="directo|clase1|clase2|replay|vip|fase">
    document.querySelectorAll('[data-lsd-countdown]').forEach(function (el) {
      var k = el.getAttribute('data-lsd-countdown');
      var at = k === 'fase' ? data.countdownTo : k === 'vip' ? data.vip.closesAt : k === 'directo' ? data.vip.closesAt : (data.directos || {})[k] || (data.videos[k] || {}).unlockAt || ((data.recursos || {})[k] || {}).unlockAt;
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
    // Recursos de la preclase: data-lsd-if="test-bloqueado|test-falta-encuesta|test-disponible|test-hecho|musica-bloqueada|
    // musica-disponible|votacion-bloqueada|votacion-disponible|votacion-hecha|votacion-abierta|descargable-bloqueado|descargable-disponible"
    var rec = data.recursos || {};
    var vista = function (r) { return Boolean(r && (r.claseVista || progresoLocal(data.code, r.tras) >= (r.umbral || 75))); };
    if (rec.test) { var ctp = condsTest(rec.test, vista); Object.keys(ctp).forEach(function (c) { conds[c] = ctp[c]; }); }
    if (rec.musica) { conds['musica-bloqueada'] = !(rec.musica.url && vista(rec.musica)); conds['musica-disponible'] = Boolean(rec.musica.url && vista(rec.musica)); }
    if (rec.votacion) { conds['votacion-bloqueada'] = !(rec.votacion.claseDisponible && vista(rec.votacion)); conds['votacion-disponible'] = Boolean(rec.votacion.claseDisponible && vista(rec.votacion) && !rec.votacion.respondida); conds['votacion-hecha'] = Boolean(rec.votacion.respondida); conds['votacion-abierta'] = Boolean((rec.votacion.claseDisponible && vista(rec.votacion)) || rec.votacion.respondida); }
    if (rec.descargable) { conds['descargable-bloqueado'] = !rec.descargable.unlocked; conds['descargable-disponible'] = Boolean(rec.descargable.unlocked); }
    document.querySelectorAll('[data-lsd-if]').forEach(function (el) {
      var c = el.getAttribute('data-lsd-if');
      // Un recurso que no está activo en el dashboard (test, música, votación, descargable): sus bloques no se ven.
      show(el, Object.prototype.hasOwnProperty.call(conds, c) ? conds[c] : !/^(test|musica|votacion|descargable)-/.test(c));
    });

    renderRecursos(data, who);

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

  // Lo visto de un vídeo en este navegador (0-100), aunque la etiqueta aún no haya llegado a GHL.
  function progresoLocal(launch, video) {
    if (!launch || !video) return 0;
    var saved = store('lsd_' + launch + '_' + video) || {};
    return Object.keys(saved.b || {}).length;
  }

  // Recursos de la preclase:
  //   <div data-lsd-audio="musica"></div>  música (bloqueada hasta ver el 75 % de su clase)
  //   <div data-lsd-votacion></div>        votación: una o varias preguntas, tipo test o libres (bloqueada igual;
  //                                        al responder, los % de las tipo test y su respuesta a las libres)
  //   <div data-lsd-etapa="clase1|test|clase2|encuesta|directo|descargable"> → atributo data-lsd-estado
  //       (bloqueada | disponible | hecha) para el diseño; <span data-lsd-etapa-n="test"></span> → su número
  var ultimaPagina = null;
  // Estado del test: disponible / falta la encuesta / bloqueado / hecho. Si va debajo de una clase (tras), además
  // hace falta haber visto el 75 % de esa clase, como la música y la votación.
  function condsTest(t, vista) {
    var visto = !t.tras || vista(t);
    var abierto = Boolean(t.unlocked && visto);
    return {
      'test-bloqueado': !abierto && !t.done,
      'test-falta-encuesta': Boolean(abierto && t.faltaEncuesta && !t.done),
      'test-disponible': Boolean(abierto && !t.faltaEncuesta && !t.done),
      'test-hecho': Boolean(t.done),
    };
  }
  // Iconos de los recursos debajo de cada clase.
  var ICONO_REC = {
    musica: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    votacion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    test: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/></svg>',
  };
  // <div data-lsd-recursos="clase2"></div>: los recursos que en el dashboard van debajo de esa clase (música,
  // votación, test), cada uno con su título. Desde que la clase está disponible se ven con candado; al ver el 75 %
  // de la clase se abren. Con la clase aún cerrada (o sin recursos), el hueco se oculta.
  // Títulos opcionales: data-titulo-musica, data-titulo-votacion, data-titulo-test; botón: data-boton-test.
  function pintarRecursosClase(rec, vista) {
    document.querySelectorAll('[data-lsd-recursos]').forEach(function (el) {
      var k = el.getAttribute('data-lsd-recursos');
      var partes = [];
      var huella = [];
      var bloque = function (id, titulo, html) { return '<div class="lsd-recurso lsd-recurso-' + id + '"><p class="lsd-recurso-t"><span class="lsd-recurso-ico">' + ICONO_REC[id] + '</span>' + esc(titulo) + '</p>' + html + '</div>'; };
      // Con la clase ya disponible, el recurso se ve con candado hasta haberla visto (así se sabe que está ahí).
      var candado = function (txt) { return '<p class="lsd-recurso-aviso">🔒 ' + esc(txt) + '</p>'; };
      var txtVer = el.getAttribute('data-texto-bloqueado') || 'Se desbloquea al ver la clase (al menos el 75 %).';
      var m = rec.musica;
      if (m && m.tras === k && m.claseDisponible) {
        var tm = el.getAttribute('data-titulo-musica') || m.nombre || 'Tu música';
        if (m.url && vista(m)) { partes.push(bloque('musica', tm, '<div data-lsd-audio="musica"></div>')); huella.push('m'); }
        else { partes.push(bloque('musica', tm, candado(txtVer))); huella.push('m0'); }
      }
      var v = rec.votacion;
      if (v && v.tras === k && (v.claseDisponible || v.respondida)) {
        var tv = el.getAttribute('data-titulo-votacion') || 'Tu voz en el directo';
        if (v.respondida || vista(v)) { partes.push(bloque('votacion', tv, '<div data-lsd-votacion></div>')); huella.push('v'); }
        else { partes.push(bloque('votacion', tv, candado(txtVer))); huella.push('v0'); }
      }
      var t = rec.test;
      if (t && t.tras === k && (t.claseDisponible || t.done)) {
        var tt = el.getAttribute('data-titulo-test') || t.nombre || 'Tu test';
        var ct = condsTest(t, vista);
        if (ct['test-hecho']) { partes.push(bloque('test', tt, '<p class="lsd-recurso-hecho">✓ ' + esc(el.getAttribute('data-texto-test-hecho') || '¡Test completado!') + '</p>')); huella.push('th'); }
        else if (!vista(t)) { partes.push(bloque('test', tt, candado(txtVer))); huella.push('t0'); }
        else if (!t.fechaOk) { partes.push(bloque('test', tt, candado('Se abre el ' + (t.unlockText || 'día indicado') + '.'))); huella.push('tf'); }
        else if (ct['test-falta-encuesta']) { partes.push(bloque('test', tt, candado(el.getAttribute('data-texto-test-encuesta') || 'Para hacer el test, rellena primero la encuesta.'))); huella.push('te'); }
        else if (ct['test-disponible'] && t.url) { partes.push(bloque('test', tt, '<a class="lsd-recurso-btn" href="' + esc(t.url) + '" target="_blank" rel="noopener">' + esc(el.getAttribute('data-boton-test') || 'Hacer el test') + '</a>')); huella.push('td'); }
      }
      var h = huella.join(',');
      if (el.getAttribute('data-lsd-rec-estado') !== h) { el.setAttribute('data-lsd-rec-estado', h); el.innerHTML = partes.join(''); }
      show(el, partes.length > 0);
    });
  }

  // Preclase de varios recursos (en vez de clases): <div data-lsd-lista-recursos></div> pinta la lista entera, cada
  // recurso en su tarjeta (vídeo, audio, descargable o enlace) con candado y fecha hasta que se desbloquea.
  // Textos opcionales: data-texto-encuesta (si falta la encuesta).
  function embedVideo(url) {
    var m = /vimeo\.com\/(?:video\/)?(\d+)(?:\/([0-9a-f]+))?/i.exec(url);
    if (m) return 'https://player.vimeo.com/video/' + m[1] + (m[2] ? '?h=' + m[2] : '');
    m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(url);
    if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    return '';
  }
  var ICONO_LISTA = { video: '🎬', audio: '🎧', descargable: '📄', enlace: '🔗' };
  var BOTON_LISTA = { video: 'Ver el vídeo', audio: 'Escuchar', descargable: 'Descargar', enlace: 'Abrir' };
  // Consumo de cada recurso de la lista (etiquetas <lanzamiento>_rec<N>_abrio / _50 / _90): el botón (descargable o
  // enlace) al pulsarlo; el audio y el vídeo MP4, play y lo visto; Vimeo, con su reproductor (play, 50 y 90 %);
  // YouTube, al darle al play (cuando el foco pasa al vídeo).
  function medirRecursoLista(item, x, launch, who) {
    if (!who || !item) return;
    var video = 'rec' + x.n;
    var unaVez = function () { if (store('lsd_' + launch + '_' + video + '_abrio')) return; store('lsd_' + launch + '_' + video + '_abrio', 1); post('/api/track', { launch: launch, video: video, pct: 0, cid: who.cid, email: who.email }); };
    var btn = item.querySelector('.lsd-recurso-btn');
    if (btn) btn.addEventListener('click', unaVez);
    var media = item.querySelector('audio, video');
    if (media) medirMedia(media, launch, who, video);
    var ifr = item.querySelector('.lsd-lista-video iframe');
    if (!ifr) return;
    if (/vimeo\.com/.test(ifr.src)) {
      loadVimeo(function () {
        try {
          var key = 'lsd_' + launch + '_' + video;
          var saved = store(key) || {};
          var buckets = saved.b || {};
          var sent = saved.s || {};
          var last = null;
          var guardar = function () { store(key, { b: buckets, s: sent }); };
          var enviar = function (p) { if (sent[p]) return; sent[p] = true; guardar(); post('/api/track', { launch: launch, video: video, pct: p, cid: who.cid, email: who.email }); };
          var pl = new window.Vimeo.Player(ifr);
          pl.on('play', function () { enviar(0); });
          pl.on('timeupdate', function (d) {
            var t = d.seconds, dur = d.duration;
            if (dur && last !== null && t >= last && t - last <= 3) {
              for (var i = Math.floor((last / dur) * 100); i <= Math.min(99, Math.floor((t / dur) * 100)); i++) buckets[i] = 1;
            }
            last = t;
            var pct = Object.keys(buckets).length;
            if (pct >= 50) enviar(50);
            if (pct >= 90) enviar(90);
          });
          pl.on('seeked', function (d) { last = d.seconds; });
          pl.on('pause', guardar);
        } catch (e) { /* sin reproductor de Vimeo: se mide al darle al play */ }
      });
    }
    // YouTube (y Vimeo de respaldo): al pulsar dentro del vídeo, la página pierde el foco y lo gana el iframe.
    window.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement === ifr) unaVez(); }, 0); });
  }

  function pintarListaRecursos(lista, launch, who) {
    document.querySelectorAll('[data-lsd-lista-recursos]').forEach(function (el) {
      if (!lista || !lista.length) { show(el, false); return; }
      var huella = (who ? 'u' : 'a') + lista.map(function (x) { return x.id + (x.url ? 'on' : x.faltaEncuesta && x.unlocked ? 'enc' : 'lock'); }).join(',');
      show(el, true);
      if (el.getAttribute('data-lsd-lista-estado') === huella) return;
      el.setAttribute('data-lsd-lista-estado', huella);
      var encTxt = el.getAttribute('data-texto-encuesta') || 'Rellena primero la encuesta para desbloquearlo.';
      el.innerHTML = '<div class="lsd-lista">' + lista.map(function (x) {
        var cuerpo;
        if (x.url) {
          var emb = x.tipo === 'video' ? embedVideo(x.url) : '';
          if (x.tipo === 'video' && emb) cuerpo = '<div class="lsd-lista-video"><iframe src="' + esc(emb) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" title="' + esc(x.nombre || 'Vídeo') + '"></iframe></div>';
          else if (x.tipo === 'video' && /\.(mp4|webm|mov)(\?|$)/i.test(x.url)) cuerpo = '<video class="lsd-lista-mp4" controls preload="metadata" src="' + esc(x.url) + '"></video>';
          else if (x.tipo === 'audio') cuerpo = '<audio controls preload="none" src="' + esc(x.url) + '"></audio>';
          else cuerpo = '<a class="lsd-recurso-btn" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(BOTON_LISTA[x.tipo] || 'Abrir') + '</a>';
        } else if (x.unlocked && x.faltaEncuesta) cuerpo = '<p class="lsd-recurso-aviso">🔒 ' + esc(encTxt) + '</p>';
        else cuerpo = '<p class="lsd-recurso-aviso">🔒 ' + (x.unlockText ? 'Disponible el ' + esc(x.unlockText) + (x.unlockAt ? ' · faltan ' + cdSpan(x.unlockAt) : '') : 'Muy pronto disponible') + '</p>';
        return '<div class="lsd-lista-item' + (x.url ? '' : ' lsd-lista-lock') + (x.hecho ? ' lsd-lista-hecho' : '') + '" data-lsd-recurso="' + x.n + '"><p class="lsd-lista-t"><span class="lsd-lista-n">' + x.n + '</span><span>' + (ICONO_LISTA[x.tipo] || '•') + ' ' + esc(x.nombre || 'Recurso ' + x.n) + '</span></p>' +
          (x.texto ? '<p class="lsd-lista-s">' + esc(x.texto) + '</p>' : '') + cuerpo + '</div>';
      }).join('') + '</div>';
      var items = el.querySelectorAll('.lsd-lista-item');
      lista.forEach(function (x, i) { if (x.url) medirRecursoLista(items[i], x, launch, who); });
      startCountdowns();
    });
  }

  function renderRecursos(data, who) {
    ultimaPagina = { data: data, who: who };
    var rec = data.recursos || {};
    pintarListaRecursos(rec.lista, data.code, who);
    var claseTxt = function (k) { return 'la clase ' + String(k || '').replace('clase', ''); };
    var vista = function (r) { return Boolean(r && (r.claseVista || progresoLocal(data.code, r.tras) >= (r.umbral || 75))); };
    var lockHtml = function (texto, sub) { return '<div class="lsd-rec lsd-rec-lock"><span class="lsd-locked-icon">🔒</span><div><p class="lsd-rec-t">' + esc(texto) + '</p>' + (sub ? '<p class="lsd-rec-s">' + esc(sub) + '</p>' : '') + '</div></div>'; };
    pintarRecursosClase(rec, vista); // antes que la música y la votación: sus huecos los rellenan los bloques de abajo

    document.querySelectorAll('[data-lsd-audio]').forEach(function (el) {
      var r = rec.musica;
      if (!r) return show(el, false);
      var ok = r.url && vista(r);
      // Bloqueada: no se enseña nada (el vídeo ya invita a verlo). Con data-mostrar-bloqueo, el candado.
      show(el, Boolean(ok || el.hasAttribute('data-mostrar-bloqueo')));
      // La identidad va en el estado: si se pintó antes de identificarla, se vuelve a pintar (y a medir) con ella.
      var estado = (who ? 'u' : 'a') + (ok ? 'on' : r.claseDisponible ? 'falta' : 'clase');
      if (el.getAttribute('data-lsd-estado-audio') === estado) return;
      el.setAttribute('data-lsd-estado-audio', estado);
      if (!ok && !el.hasAttribute('data-mostrar-bloqueo')) { el.innerHTML = ''; return; }
      if (!ok) {
        var pct = progresoLocal(data.code, r.tras);
        el.innerHTML = lockHtml(el.getAttribute('data-texto-bloqueado') || 'Se desbloquea al ver el ' + (r.umbral || 75) + ' % de ' + claseTxt(r.tras),
          estado === 'falta' ? (pct ? 'Llevas el ' + pct + ' % de ' + claseTxt(r.tras) + '.' : 'Dale al play a ' + claseTxt(r.tras) + ' y vuelve aquí.') : 'Primero tiene que estar disponible ' + claseTxt(r.tras) + '.');
        return;
      }
      el.innerHTML = '<div class="lsd-rec">' + (r.nombre ? '<p class="lsd-rec-t">🎵 ' + esc(r.nombre) + '</p>' : '') + (r.texto ? '<p class="lsd-rec-s">' + esc(r.texto) + '</p>' : '') + '<audio controls preload="none" src="' + esc(r.url) + '"></audio></div>';
      medirAudio(el.querySelector('audio'), data.code, who);
    });

    document.querySelectorAll('[data-lsd-votacion]').forEach(function (el) {
      var r = rec.votacion;
      if (!r) return show(el, false);
      var abierta = r.claseDisponible && vista(r);
      show(el, Boolean(abierta || r.respondida || el.hasAttribute('data-mostrar-bloqueo')));
      var estado = (who ? 'u' : 'a') + (r.respondida && r.resultados ? 'res' + JSON.stringify(r.misRespuestas) + r.resultados.total : abierta ? 'votar' : 'lock');
      if (el.getAttribute('data-lsd-estado-vot') === estado) return;
      el.setAttribute('data-lsd-estado-vot', estado);
      if (r.respondida && r.resultados) { el.innerHTML = votacionResultados(r); return; }
      if (!abierta && !el.hasAttribute('data-mostrar-bloqueo')) { el.innerHTML = ''; return; }
      if (!abierta) { el.innerHTML = lockHtml(el.getAttribute('data-texto-bloqueado') || 'La votación se abre al ver el ' + (r.umbral || 75) + ' % de ' + claseTxt(r.tras), ''); return; }
      // Una sola pregunta tipo test: se responde con un clic. Si hay más (o alguna libre), con «Enviar».
      var solo = r.preguntas.length === 1 && r.preguntas[0].tipo === 'opciones';
      el.innerHTML = '<div class="lsd-rec lsd-vot">' + r.preguntas.map(function (q) {
        return '<div class="lsd-vot-q" data-q="' + esc(q.id) + '"><p class="lsd-rec-t">' + esc(q.pregunta) + '</p>' + (q.tipo === 'libre'
          ? '<textarea class="lsd-vot-libre" rows="3" maxlength="1000" placeholder="' + esc(el.getAttribute('data-placeholder') || 'Escribe tu respuesta…') + '"></textarea>'
          : '<div class="lsd-vot-ops">' + q.opciones.map(function (o) { return '<button type="button" class="lsd-vot-op" aria-pressed="false" data-q="' + esc(q.id) + '" data-op="' + esc(o.id) + '">' + esc(o.texto) + '</button>'; }).join('') + '</div>') + '</div>';
      }).join('') + (solo ? '' : '<button type="button" class="lsd-vot-enviar">' + esc(el.getAttribute('data-boton') || 'Enviar respuestas') + '</button>') + '<p class="lsd-err" hidden></p></div>';
      var sel = {};
      var err = el.querySelector('.lsd-err');
      var botones = function (on) { el.querySelectorAll('button, textarea').forEach(function (x) { x.disabled = !on; }); };
      var enviar = function () {
        if (!who) return;
        var respuestas = {};
        r.preguntas.forEach(function (q) {
          if (q.tipo === 'libre') { var t = el.querySelector('[data-q="' + q.id + '"] textarea'); if (t && t.value.trim()) respuestas[q.id] = t.value.trim(); }
          else if (sel[q.id]) respuestas[q.id] = sel[q.id];
        });
        var falta = r.preguntas.filter(function (q) { return q.tipo === 'opciones' && !respuestas[q.id]; }).length;
        if (falta || !Object.keys(respuestas).length) { err.textContent = falta ? 'Elige una opción en cada pregunta.' : 'Escribe tu respuesta.'; err.hidden = false; return; }
        err.hidden = true;
        botones(false);
        post('/api/votacion', { launch: data.code, cid: who.cid, email: who.email, respuestas: respuestas }).then(function (res) {
          if (!res || !res.ok) throw new Error((res && res.error) || 'No se pudo enviar');
          r.misRespuestas = res.misRespuestas;
          r.respondida = true;
          r.resultados = res.resultados;
          el.setAttribute('data-lsd-estado-vot', (who ? 'u' : 'a') + 'res' + JSON.stringify(r.misRespuestas) + r.resultados.total);
          el.innerHTML = votacionResultados(r);
          renderRecursos(data, who); // condiciones votacion-hecha…
        }).catch(function (e) { botones(true); err.textContent = e.message; err.hidden = false; });
      };
      el.querySelectorAll('[data-op]').forEach(function (b) {
        b.addEventListener('click', function () {
          var q = b.getAttribute('data-q');
          sel[q] = b.getAttribute('data-op');
          el.querySelectorAll('[data-op][data-q="' + q + '"]').forEach(function (x) { var on = x === b; x.classList.toggle('sel', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
          if (solo) enviar();
        });
      });
      var envBtn = el.querySelector('.lsd-vot-enviar');
      if (envBtn) envBtn.addEventListener('click', enviar);
    });

    // Condiciones de los recursos (también al desbloquearse sin recargar).
    var cr = {};
    if (rec.musica) { cr['musica-bloqueada'] = !(rec.musica.url && vista(rec.musica)); cr['musica-disponible'] = !cr['musica-bloqueada']; }
    if (rec.votacion) { var va = rec.votacion.claseDisponible && vista(rec.votacion); var vr = Boolean(rec.votacion.respondida); cr['votacion-bloqueada'] = !va && !vr; cr['votacion-disponible'] = Boolean(va && !vr); cr['votacion-hecha'] = vr; cr['votacion-abierta'] = Boolean(va || vr); }
    if (rec.test) { var ctr = condsTest(rec.test, vista); Object.keys(ctr).forEach(function (c) { cr[c] = ctr[c]; }); }
    document.querySelectorAll('[data-lsd-if]').forEach(function (el) {
      var c = el.getAttribute('data-lsd-if');
      if (Object.prototype.hasOwnProperty.call(cr, c)) show(el, cr[c]);
    });

    pintarComentarios(data, who);

    // Etapas: estado para el diseño y su número (las de vídeo se marcan hechas al ver el 75 % aquí mismo).
    var etapas = data.etapas || [];
    document.querySelectorAll('[data-lsd-etapa]').forEach(function (el) {
      var e = etapas.filter(function (x) { return x.id === el.getAttribute('data-lsd-etapa'); })[0];
      if (!e) return show(el, false);
      show(el, true);
      var estado = e.estado;
      if (e.tipo === 'clase' && estado === 'disponible' && progresoLocal(data.code, e.id) >= 75) estado = 'hecha';
      el.setAttribute('data-lsd-estado', estado);
    });
    document.querySelectorAll('[data-lsd-etapa-n]').forEach(function (el) {
      var e = etapas.filter(function (x) { return x.id === el.getAttribute('data-lsd-etapa-n'); })[0];
      if (e) el.textContent = e.n;
    });
  }

  // Después de responder: los % de cada pregunta tipo test (con la suya marcada) y su respuesta a las libres.
  function votacionResultados(r) {
    var res = r.resultados;
    var mias = r.misRespuestas || {};
    return '<div class="lsd-rec lsd-vot">' + r.preguntas.map(function (q) {
      var rq = (res.preguntas || {})[q.id] || { opciones: [] };
      if (q.tipo === 'libre') {
        return '<div class="lsd-vot-q"><p class="lsd-rec-t">' + esc(q.pregunta) + '</p>' + (mias[q.id] ? '<div class="lsd-vot-mia"><span>Tu respuesta</span><p>' + esc(mias[q.id]) + '</p></div>' : '<p class="lsd-rec-s">Sin respuesta.</p>') + '</div>';
      }
      return '<div class="lsd-vot-q"><p class="lsd-rec-t">' + esc(q.pregunta) + '</p><div class="lsd-vot-ops">' + rq.opciones.map(function (o) {
        var p = Math.round(o.pct * 100);
        var mio = o.id === mias[q.id];
        return '<div class="lsd-vot-res' + (mio ? ' mio' : '') + '"><i style="width:' + p + '%"></i><span><span>' + (mio ? '✓ ' : '') + esc(o.texto) + '</span><strong>' + p + ' %</strong></span></div>';
      }).join('') + '</div></div>';
    }).join('') + '<p class="lsd-vot-total">' + res.total + (res.total === 1 ? ' respuesta' : ' respuestas') + ' · gracias por participar</p></div>';
  }

  // Comentarios de la preclase: un solo bloque <div data-lsd-comentarios="todas"></div> debajo de las clases, con una
  // pestaña por clase (se abre en la última clase disponible), o el formato antiguo <div data-lsd-comentarios="clase1">.
  // Paso 1: elegir a qué pregunta de la clase responde (si hay una sola, ya está elegida). Paso 2: escribir y
  // «Publicar». Debajo, el muro de esa clase (destacados primero, filtrable por pregunta) con las respuestas
  // del equipo. Los datos se piden a /api/comentarios (y se refrescan cada 90 s mientras la página está abierta).
  // Diagnóstico (?lsd_debug=1 en la URL): una caja abajo que dice qué falta para que se vean los bloques del
  // dashboard (sobre todo el de comentarios). No cambia nada; solo lee.
  function diagnostico() {
    var baseEl = document.querySelector('[data-lsd-page], [data-lsd-video]');
    var launchAttr = params.get('l') || (baseEl && baseEl.getAttribute('data-launch')) || 'auto';
    var caja = document.createElement('div');
    caja.setAttribute('style', 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;max-width:560px;margin:0 auto;padding:14px 16px;border-radius:14px;background:#111;color:#fff;font:14px/1.5 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.4)');
    var lineas = [];
    var poner = function () { caja.innerHTML = '<strong style="font-size:15px">🔎 Diagnóstico del dashboard</strong>' + lineas.map(function (l) { return '<div style="margin-top:6px">' + l + '</div>'; }).join('') + '<div style="margin-top:8px;opacity:.6;font-size:12px">Quita ?lsd_debug=1 de la dirección para ocultar esta caja.</div>'; };
    var bien = function (t) { lineas.push('✅ ' + t); poner(); };
    var mal = function (t) { lineas.push('❌ ' + t); poner(); };
    document.body.appendChild(caja);
    bien('El código del dashboard (tracker.js) está cargado.');
    var bloques = document.querySelectorAll('[data-lsd-comentarios]').length;
    if (bloques) bien('Bloque de comentarios encontrado en la página (' + bloques + ').'); else mal('No hay ningún panel de comentarios (&lt;div data-lsd-comentarios="todas"&gt;) en la página: pega el código personalizado.');
    if (baseEl) bien('Bloque base de la preclase encontrado.'); else mal('Falta el bloque base de la preclase: sin él no se pinta nada del dashboard en esta página (ni comentarios). Pega &lt;div data-lsd-page="recursos" data-launch="auto"&gt;&lt;/div&gt; junto al panel de comentarios (está en Configuración → Códigos).');
    var w = identity();
    if (w) bien('Lead identificada (' + (w.email ? 'por email' : 'por su enlace') + ').');
    else { lineas.push('ℹ️ Aún no sabe qué lead eres: el panel se ve igual, pero para comentar hay que entrar con el enlace del email o por el login.'); poner(); }
    fetchPage(launchAttr, w && w.cid ? { cid: w.cid } : null).then(function (d) {
      if (!d || d.error) { mal('No encuentra el lanzamiento de esta página (' + launchAttr + '): revisa data-launch o las URLs del lanzamiento en el dashboard.'); return; }
      bien('Lanzamiento: ' + d.code + '.');
      // Recursos debajo de cada clase: qué hay activado en el dashboard y si la página tiene sus huecos.
      var huecos = Array.prototype.map.call(document.querySelectorAll('[data-lsd-recursos]'), function (x) { return x.getAttribute('data-lsd-recursos'); });
      if (huecos.length) bien('Huecos de recursos en la página: ' + huecos.join(', ').replace(/clase/g, 'Clase ') + '.');
      else mal('La página no tiene los huecos de recursos debajo de las clases (data-lsd-recursos): pega el código nuevo de las clases.');
      var rc = d.recursos || {};
      var nombreClase = function (k) { return k ? k.replace('clase', 'Clase ') : ''; };
      var lineaRec = function (nom, r, extra) {
        if (!r) { lineas.push('➖ ' + nom + ': no está activado en el dashboard (o le falta el enlace / las preguntas).'); poner(); return; }
        if (!r.tras) { lineas.push('ℹ️ ' + nom + ': activado como etapa propia (no va debajo de ninguna clase).'); poner(); return; }
        var abierta = r.claseDisponible ? 'su clase está disponible' : 'su clase aún no está disponible';
        (r.claseDisponible ? bien : function (t) { lineas.push('🔒 ' + t); poner(); })(nom + ': debajo de la ' + nombreClase(r.tras) + ' · ' + abierta + (extra ? ' · ' + extra : '') + '.');
      };
      lineaRec('Música', rc.musica);
      lineaRec('Votación', rc.votacion);
      lineaRec('Test', rc.test, rc.test && !rc.test.fechaOk ? 'se abre el ' + rc.test.unlockText : rc.test && rc.test.faltaEncuesta ? 'falta la encuesta' : '');
      return fetch(API + conCliente('/api/comentarios?l=' + encodeURIComponent(d.code))).then(function (r) { return r.json(); }).then(function (c) {
        if (!c || !c.activa) { mal('Los comentarios NO están activados en el dashboard para este lanzamiento, o ninguna clase tiene preguntas: Configuración → Preclase → Comentarios.'); return; }
        var ks = Object.keys(c.clases || {});
        bien('Comentarios activados: ' + ks.map(function (k) { return k.replace('clase', 'Clase ') + (c.clases[k].abierta ? ' (abierta)' : ' (aún cerrada)'); }).join(', ') + '.');
      });
    }).catch(function () { mal('No se puede contactar con el dashboard.'); });
  }

  var com = { data: null, en: 0, cargando: false, code: '', cid: '' };
  // Se lanza siempre que la URL lleve ?lsd_debug=1, haya o no bloques del dashboard en la página.
  if (params.get('lsd_debug')) setTimeout(diagnostico, 1500);
  function cargarComentarios(code, who, despues) {
    if (com.cargando) return;
    com.cargando = true;
    var cid = who && who.cid ? who.cid : '';
    var q = 'l=' + encodeURIComponent(code) + (cid ? '&cid=' + encodeURIComponent(cid) : '');
    fetch(API + conCliente('/api/comentarios?' + q)).then(function (r) { return r.json(); }).then(function (d) {
      com.data = d; com.en = Date.now(); com.code = code; com.cid = cid;
    }).catch(function () { com.en = Date.now(); }).then(function () { com.cargando = false; if (despues) despues(); });
  }
  var haceCuanto = function (iso) {
    var m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 1) return 'ahora';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.round(m / 60);
    if (h < 24) return 'hace ' + h + ' h';
    var d = Math.round(h / 24);
    return 'hace ' + d + (d === 1 ? ' día' : ' días');
  };
  // Nombre para firmar los comentarios cuando GHL no lo tiene (común a todos los paneles de la página).
  var comNombre = { pide: false, valor: '' };
  function pintarComentarios(data, who) {
    var els = document.querySelectorAll('[data-lsd-comentarios]');
    if (!els.length) return;
    // Se piden otra vez si cambia el lanzamiento o la lead (para marcar los suyos) o cada 90 s. Al llegar, se
    // pintan con lo último que se sabe de la página (la lead puede haberse identificado mientras tanto).
    var cidAhora = who && who.cid ? who.cid : '';
    if (!com.data || com.code !== data.code || (cidAhora && com.cid !== cidAhora) || Date.now() - com.en > 90000) {
      if (!com.cargando) cargarComentarios(data.code, who, function () { var u = ultimaPagina || { data: data, who: who }; pintarComentarios(u.data, u.who); });
      if (!com.data) return;
    }
    var d = com.data;
    els.forEach(function (el) {
      var k = el.getAttribute('data-lsd-comentarios') || 'clase1';
      if (!d || !d.activa || !d.clases) return show(el, false);
      if (k === 'todas') return pintarBloqueCom(el, d, data, who);
      var c = d.clases[k];
      if (!c) return show(el, false);
      show(el, true);
      pintarClaseCom(el, k, c, el, data, who, d, false);
    });
  }
  // Nombre de la pestaña de una clase (lo que se configure o «Preguntas de la Clase N»).
  var pestanaDe = function (k, c) { return c.pestana || 'Preguntas de la Clase ' + k.replace('clase', ''); };
  function pintarBloqueCom(el, d, data, who) {
    var ks = Object.keys(d.clases).sort();
    if (!ks.length) return show(el, false);
    show(el, true);
    var abiertas = ks.filter(function (k) { return d.clases[k].abierta; });
    if (!el._lsdTab || ks.indexOf(el._lsdTab) < 0) el._lsdTab = abiertas.length ? abiertas[abiertas.length - 1] : ks[0];
    var total = ks.reduce(function (a, k) { return a + (d.clases[k].total || 0); }, 0);
    var huella = ks.map(function (k) { return k + (d.clases[k].abierta ? 'a' : 'c') + d.clases[k].total; }).join(',') + '|' + el._lsdTab;
    if (el.getAttribute('data-lsd-com-tabs') !== huella) {
      // Antes de cambiar de pestaña se guarda lo que estuviera escribiendo.
      var ta = el.querySelector('.lsd-com-txt-in');
      var bag = el._lsdComSt || {};
      var previa = el.querySelector('.lsd-com-in');
      if (ta && previa && bag[previa.getAttribute('data-clase')]) bag[previa.getAttribute('data-clase')].texto = ta.value;
      el.setAttribute('data-lsd-com-tabs', huella);
      el.innerHTML = '<section class="lsd-com lsd-com-bloque"><header class="lsd-com-head"><span class="lsd-com-ico">💬</span><div><p class="lsd-com-kicker">' + esc(el.getAttribute('data-kicker') || 'Comparte tu respuesta') + '</p><h3 class="lsd-com-titulo">' + esc(el.getAttribute('data-titulo') || d.titulo || 'Comparte lo que te han removido las clases') + '</h3></div><span class="lsd-com-n">' + total + (total === 1 ? ' comentario' : ' comentarios') + '</span></header>' +
        '<div class="lsd-com-tabs" role="tablist" aria-label="Preguntas de cada clase">' + ks.map(function (k) {
          var c = d.clases[k];
          return '<button type="button" class="lsd-com-tab' + (c.abierta ? '' : ' cerrada') + '" role="tab" id="lsd-com-tab-' + k + '" aria-controls="lsd-com-panel" aria-selected="' + (k === el._lsdTab) + '" data-tab="' + k + '">' + (c.abierta ? '' : '<span aria-hidden="true">🔒</span>') + '<span class="lsd-com-tab-t">' + esc(pestanaDe(k, c)) + '</span>' + (c.total ? '<span class="lsd-com-tab-n">' + c.total + '</span>' : '') + '</button>';
        }).join('') + '</div><div class="lsd-com-panel" id="lsd-com-panel" role="tabpanel" aria-labelledby="lsd-com-tab-' + el._lsdTab + '"></div></section>';
      el.querySelectorAll('[data-tab]').forEach(function (b) {
        b.addEventListener('click', function () {
          var t = el.querySelector('.lsd-com-txt-in');
          if (t && el._lsdComSt && el._lsdComSt[el._lsdTab]) el._lsdComSt[el._lsdTab].texto = t.value;
          el._lsdTab = b.getAttribute('data-tab');
          el.removeAttribute('data-lsd-com-tabs');
          pintarBloqueCom(el, d, data, who);
          var nueva = el.querySelector('[data-tab="' + el._lsdTab + '"]');
          if (nueva) nueva.focus();
        });
        // Flechas izquierda / derecha entre pestañas.
        b.addEventListener('keydown', function (e) {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          var i = ks.indexOf(b.getAttribute('data-tab')) + (e.key === 'ArrowRight' ? 1 : -1);
          var sig = el.querySelector('[data-tab="' + ks[(i + ks.length) % ks.length] + '"]');
          if (sig) { e.preventDefault(); sig.click(); }
        });
      });
    }
    pintarClaseCom(el.querySelector('.lsd-com-panel'), el._lsdTab, d.clases[el._lsdTab], el, data, who, d, true);
  }
  // Una clase: el formulario (elegir pregunta y escribir) y su muro. `attrs`: el elemento con los data-* de textos;
  // `enBloque`: dentro del bloque con pestañas (sin su propia caja).
  function pintarClaseCom(el, k, c, attrs, data, who, d, enBloque) {
      var n = k.replace('clase', '');
      var bag = attrs._lsdComSt || (attrs._lsdComSt = {});
      // data-una-respuesta: las preguntas se muestran como lista y se responde a todas en un solo comentario (no
      // hay que elegir; se guarda con la primera pregunta).
      var una = attrs.hasAttribute('data-una-respuesta');
      // Cuántos comentarios se ven de entrada y cuántos más con cada «Ver más comentarios» (sin scroll infinito):
      // 5 y 5, o los de data-comentarios-inicio / data-comentarios-paso en el bloque. Los largos, recortados con «Leer más».
      var inicio = Math.max(1, parseInt(attrs.getAttribute('data-comentarios-inicio'), 10) || 5);
      var paso = Math.max(1, parseInt(attrs.getAttribute('data-comentarios-paso'), 10) || 5);
      var st = bag[k] || (bag[k] = { sel: c.preguntas.length === 1 || una ? c.preguntas[0].id : '', filtro: '', max: inicio, texto: '' });
      if (una && !st.sel) st.sel = c.preguntas[0].id;
      // Clase aún no disponible: un aviso y nada más.
      if (!c.abierta) {
        if (el.getAttribute('data-lsd-com-estado') === 'cerrado') return;
        el.setAttribute('data-lsd-com-estado', 'cerrado');
        el.innerHTML = '<div class="' + (enBloque ? 'lsd-com-in' : 'lsd-com') + ' lsd-com-cerrado" data-clase="' + esc(k) + '"><span class="lsd-com-ico">🔒</span><p class="lsd-rec-s">' + esc(attrs.getAttribute('data-texto-bloqueado') || 'Las preguntas de la clase ' + n + ' se abren cuando esté disponible la clase.') + '</p></div>';
        return;
      }
      // Solo se repinta si cambian los comentarios (sin perder lo que esté escribiendo).
      var huella = k + (who ? 'u' : 'a') + c.total + '|' + c.comentarios.map(function (x) { return x.id + (x.respuesta ? 'r' : '') + (x.destacado ? 'd' : ''); }).join(',') + '|' + st.sel + '|' + st.filtro + '|' + st.max;
      if (el.getAttribute('data-lsd-com-estado') === huella) return;
      el.setAttribute('data-lsd-com-estado', huella);
      var ta = el.querySelector('.lsd-com-txt-in');
      if (ta) st.texto = ta.value;
      var preg = function (id) { for (var i = 0; i < c.preguntas.length; i++) if (c.preguntas[i].id === id) return { n: i + 1, texto: c.preguntas[i].texto }; return null; };
      var sel = preg(st.sel);
      var titulo = (enBloque ? '' : attrs.getAttribute('data-titulo')) || (c.preguntas.length === 1 ? c.preguntas[0].texto : 'Cuéntanos qué te ha removido esta clase');
      var form = !who
        ? '<p class="lsd-com-vacio">Para comentar, entra en esta página desde el enlace de tu email.</p>'
        : '<div class="lsd-com-form">' +
          (c.preguntas.length > 1
            ? '<p class="lsd-com-paso"><b>1</b> Elige la pregunta que quieres responder</p><div class="lsd-com-preguntas" role="radiogroup" aria-label="Pregunta">' + c.preguntas.map(function (q, i) {
              return '<button type="button" class="lsd-com-preg" role="radio" aria-checked="' + (q.id === st.sel) + '" data-preg="' + esc(q.id) + '"><span class="lsd-com-preg-n">' + (i + 1) + '</span><span>' + esc(q.texto) + '</span></button>';
            }).join('') + '</div><p class="lsd-com-paso"><b>2</b> Escribe tu respuesta</p>'
            : '') +
          '<p class="lsd-com-respondes">' + (sel ? (c.preguntas.length > 1 ? 'Respondes a la pregunta ' + sel.n + ': <b>' + esc(sel.texto) + '</b>' : '<b>' + esc(sel.texto) + '</b>') : 'Primero elige arriba la pregunta 👆') + '</p>' +
          (comNombre.pide ? '<input class="lsd-com-nombre" maxlength="30" autocomplete="given-name" placeholder="Tu nombre (así firmarás tu respuesta)" value="' + esc(comNombre.valor) + '">' : '') +
          '<textarea class="lsd-com-txt-in" maxlength="1500" placeholder="' + esc(attrs.getAttribute('data-placeholder') || 'Escribe aquí tu respuesta…') + '"' + (sel ? '' : ' disabled') + '>' + esc(st.texto) + '</textarea>' +
          '<div class="lsd-com-pie"><span class="lsd-com-aviso">Se publica con tu nombre de pila y lo verán las demás alumnas.</span><button type="button" class="lsd-com-enviar"' + (sel ? '' : ' disabled') + '>' + esc(attrs.getAttribute('data-boton') || 'Publicar mi respuesta') + '</button></div>' +
          '<p class="lsd-err" hidden></p>' + (st.ok ? '<p class="lsd-com-ok">✓ ¡Publicado! Gracias por compartirlo.</p>' : '') + '</div>';
      var lista = c.comentarios.filter(function (x) { return !st.filtro || x.pregunta === st.filtro; });
      var cuenta = function (id) { return c.comentarios.filter(function (x) { return x.pregunta === id; }).length; };
      var filtros = c.preguntas.length > 1 && c.comentarios.length
        ? '<div class="lsd-com-filtros" role="group" aria-label="Ver comentarios de">' + '<button type="button" class="lsd-com-filtro" data-filtro="" aria-pressed="' + (!st.filtro) + '">Todas (' + c.comentarios.length + ')</button>' +
          c.preguntas.map(function (q, i) { return '<button type="button" class="lsd-com-filtro" data-filtro="' + esc(q.id) + '" aria-pressed="' + (st.filtro === q.id) + '">Pregunta ' + (i + 1) + ' (' + cuenta(q.id) + ')</button>'; }).join('') + '</div>'
        : '';
      var firma = d.firma || 'El equipo';
      var item = function (x) {
        var q = preg(x.pregunta);
        return '<li class="lsd-com-item' + (x.destacado ? ' destacado' : '') + (x.mio ? ' mio' : '') + '"><span class="lsd-com-av">' + esc((x.nombre || '?').charAt(0).toUpperCase()) + '</span><div class="lsd-com-c">' +
          '<div class="lsd-com-meta"><b>' + esc(x.nombre) + '</b>' + (x.mio ? '<span class="lsd-com-chip">Tú</span>' : '') + (x.destacado ? '<span class="lsd-com-chip dest">⭐ Destacado</span>' : '') + '<time datetime="' + esc(x.en) + '">' + haceCuanto(x.en) + '</time></div>' +
          (q && c.preguntas.length > 1 ? '<p class="lsd-com-q">Pregunta ' + q.n + ' · ' + esc(q.texto) + '</p>' : '') +
          '<p class="lsd-com-texto' + (x.texto.length > 280 ? ' lsd-com-largo' : '') + '">' + esc(x.texto) + '</p>' + (x.texto.length > 280 ? '<button type="button" class="lsd-com-leer">Leer más</button>' : '') +
          (x.respuesta ? '<div class="lsd-com-resp"><span class="lsd-com-av marca">' + esc(firma.charAt(0).toUpperCase()) + '</span><div><b>' + esc(firma) + '</b> <span class="lsd-com-chip">Equipo</span><p>' + esc(x.respuesta) + '</p></div></div>' : '') +
          '</div></li>';
      };
      var cabeza = enBloque
        ? '<header class="lsd-com-head lsd-com-head-in"><div><h4 class="lsd-com-titulo">' + esc(titulo) + '</h4></div><span class="lsd-com-n">' + c.total + (c.total === 1 ? ' comentario' : ' comentarios') + '</span></header>'
        : '<header class="lsd-com-head"><span class="lsd-com-ico">💬</span><div><p class="lsd-com-kicker">' + esc(attrs.getAttribute('data-kicker') || 'Clase ' + n + ' · Comparte tu respuesta') + '</p><h3 class="lsd-com-titulo">' + esc(titulo) + '</h3></div><span class="lsd-com-n">' + c.total + (c.total === 1 ? ' comentario' : ' comentarios') + '</span></header>';
      el.innerHTML = (enBloque ? '<div class="lsd-com-in" data-clase="' + esc(k) + '">' : '<section class="lsd-com" data-clase="' + esc(k) + '">') + cabeza +
        form + filtros +
        (lista.length ? '<ol class="lsd-com-lista">' + lista.slice(0, st.max).map(item).join('') + '</ol>' + '<div class="lsd-com-pag">' + (lista.length > st.max ? '<button type="button" class="lsd-com-mas">Ver más comentarios <span>(quedan ' + (lista.length - st.max) + ')</span></button>' : '') + (st.max > inicio && lista.length > inicio ? '<button type="button" class="lsd-com-menos">Ver menos</button>' : '') + '</div>' : '<p class="lsd-com-vacio">' + (c.comentarios.length ? 'Aún no hay respuestas a esta pregunta.' : 'Sé la primera en responder ✨') + '</p>') +
        (enBloque ? '</div>' : '</section>');
      var repinta = function () { el.removeAttribute('data-lsd-com-estado'); pintarComentarios(data, who); };
      el.querySelectorAll('[data-preg]').forEach(function (b) { b.addEventListener('click', function () { var t = el.querySelector('.lsd-com-txt-in'); if (t) st.texto = t.value; st.sel = b.getAttribute('data-preg'); st.ok = false; repinta(); var t2 = el.querySelector('.lsd-com-txt-in'); if (t2) t2.focus(); }); });
      el.querySelectorAll('[data-filtro]').forEach(function (b) { b.addEventListener('click', function () { var t = el.querySelector('.lsd-com-txt-in'); if (t) st.texto = t.value; st.filtro = b.getAttribute('data-filtro'); st.max = inicio; repinta(); }); });
      var mas = el.querySelector('.lsd-com-mas');
      if (mas) mas.addEventListener('click', function () { var t = el.querySelector('.lsd-com-txt-in'); if (t) st.texto = t.value; st.max += paso; repinta(); });
      var menos = el.querySelector('.lsd-com-menos');
      if (menos) menos.addEventListener('click', function () {
        var t = el.querySelector('.lsd-com-txt-in'); if (t) st.texto = t.value;
        st.max = inicio; repinta();
        var l0 = el.querySelector('.lsd-com-lista'); if (l0 && l0.scrollIntoView) l0.scrollIntoView({ block: 'nearest' });
      });
      el.querySelectorAll('.lsd-com-leer').forEach(function (b) { b.addEventListener('click', function () { var p = b.previousElementSibling; var abierto = p.classList.toggle('lsd-com-abierto'); b.textContent = abierto ? 'Leer menos' : 'Leer más'; }); });
      var btn = el.querySelector('.lsd-com-enviar');
      if (btn) btn.addEventListener('click', function () {
        var t = el.querySelector('.lsd-com-txt-in');
        var err = el.querySelector('.lsd-err');
        var texto = t ? t.value.trim() : '';
        var nIn = el.querySelector('.lsd-com-nombre');
        if (nIn) comNombre.valor = nIn.value.trim();
        if (!st.sel) { err.textContent = 'Elige primero a qué pregunta respondes.'; err.hidden = false; return; }
        if (texto.length < 2) { err.textContent = 'Escribe tu respuesta.'; err.hidden = false; return; }
        if (comNombre.pide && comNombre.valor.length < 2) { err.textContent = 'Escribe tu nombre para firmar tu respuesta.'; err.hidden = false; if (nIn) nIn.focus(); return; }
        err.hidden = true;
        btn.disabled = true;
        btn.textContent = 'Publicando…';
        post('/api/comentarios', { launch: data.code, clase: k, pregunta: st.sel, texto: texto, cid: who.cid, email: who.email, nombre: comNombre.pide ? comNombre.valor : undefined }).then(function (res) {
          if (res && res.needsName) {
            // No sabemos su nombre (se registró solo con el email): se lo pedimos una vez y se guarda en su ficha.
            comNombre.pide = true; st.texto = texto; repinta();
            var e2 = el.querySelector('.lsd-err'); var n2 = el.querySelector('.lsd-com-nombre');
            if (e2) { e2.textContent = res.error || 'Escribe tu nombre para firmar tu respuesta.'; e2.hidden = false; }
            if (n2) n2.focus();
            return;
          }
          if (!res || !res.ok) throw new Error((res && res.error) || 'No se ha podido publicar. Inténtalo de nuevo.');
          comNombre.pide = false;
          com.data = res; com.en = Date.now(); com.cid = who.cid || com.cid;
          st.texto = ''; st.ok = true; st.filtro = '';
          var tPub = el.querySelector('.lsd-com-txt-in'); if (tPub) tPub.value = ''; // si no, al repintar se recupera lo publicado
          if (c.preguntas.length > 1 && !una) st.sel = '';
          repinta();
        }).catch(function (e) { btn.disabled = false; btn.textContent = attrs.getAttribute('data-boton') || 'Publicar mi respuesta'; err.textContent = e.message; err.hidden = false; });
      });
  }

  // Música: cuenta los segundos realmente escuchados (como los vídeos) y avisa al reproducir, al 50 % y al 90 %.
  function medirAudio(audio, launch, who) { medirMedia(audio, launch, who, 'musica'); }
  // Mide un <audio> o <video>: play (0) y lo escuchado / visto de verdad (50 y 90 %, sin contar saltos).
  // `video`: 'musica' o el recurso de la lista ('rec1', 'rec2'…).
  function medirMedia(audio, launch, who, video) {
    if (!audio || !who || audio.getAttribute('data-lsd-medido')) return;
    audio.setAttribute('data-lsd-medido', '1');
    var key = 'lsd_' + launch + '_' + video;
    var saved = store(key) || {};
    var buckets = saved.b || {};
    var sent = saved.s || {};
    var last = null;
    var save = function () { store(key, { b: buckets, s: sent }); };
    var enviar = function (p) { if (sent[p]) return; sent[p] = true; save(); post('/api/track', { launch: launch, video: video, pct: p, cid: who.cid, email: who.email }); };
    audio.addEventListener('play', function () { enviar(0); });
    audio.addEventListener('timeupdate', function () {
      var d = audio.duration;
      var t = audio.currentTime;
      if (d && last !== null && t >= last && t - last <= 3) {
        var from = Math.floor((last / d) * 100);
        var to = Math.min(99, Math.floor((t / d) * 100));
        for (var i = from; i <= to; i++) buckets[i] = 1;
      }
      last = t;
      var pct = Object.keys(buckets).length;
      if (pct >= 50) enviar(50);
      if (pct >= 90) enviar(90);
    });
    audio.addEventListener('seeked', function () { last = audio.currentTime; });
    audio.addEventListener('pause', save);
  }
  // Al llegar al 75 % de una clase, se desbloquean su música y su votación sin recargar.
  document.addEventListener('lsd:progreso', function () { if (ultimaPagina) renderRecursos(ultimaPagina.data, ultimaPagina.who); });

  function defaultLabel(key) {
    return { test: 'Hacer el test', descargable: 'Descargar', whatsapp: 'Unirme al grupo', vip: 'Quiero mi entrada VIP', directo: 'Entrar al directo', grabacion: 'Ver la grabación', venta: 'Conocer Raíces', pago: 'Unirme a Raíces', 'pago-fraccionado': 'Pagar a plazos', llamada: 'Reservar llamada', calendario: 'Añadir al calendario', encuesta: 'Rellenar la encuesta' }[key] || 'Ir';
  }

  // Página gestionada desde el dashboard (recursos / grabación). Vuelve a pedir los datos cuando
  // cambia de fase o se desbloquea un vídeo, y redirige (recursos → directo → grabación).
  // ---------- Pantalla de espera: los 59 minutos antes del directo ----------
  // La página preclase entera se tapa con el logo, «¡Empezamos en unos minutos!», una cuenta atrás de
  // minutos y segundos y el aviso de que se la llevará al directo; al llegar a cero, va al directo.
  // Textos (Configuración → Preclase): espera-titulo, espera-subtitulo, espera-mensaje; logo: imagen «espera».
  // Colores: variables CSS --lsd-espera-fondo, --lsd-espera-titulo, --lsd-espera-acento, --lsd-espera-texto.
  var ESPERA_MIN = 59;
  function esperaDirecto(data) {
    if (data.espera && data.espera.activa === false) return null; // desactivada en Configuración → Preclase
    var m = /^dia_directo(\d?)$/.exec(data.phase || '');
    var key = m ? 'directo' + m[1] : '';
    if (!m || !data.countdownTo || !data.links[key]) return null;
    // La cuenta atrás acaba unos minutos antes de la hora (Configuración → Preclase → Pantalla de espera): entran al
    // directo antes, poco a poco, en vez de todas a la hora en punto.
    var antes = Math.max(0, Math.min(30, Number((data.espera || {}).antesMin) || 0));
    return { at: data.countdownTo - antes * 60000, desde: data.countdownTo - ESPERA_MIN * 60000, key: key };
  }
  var esperaTimer = null;
  // Popups de encuesta con la estética de un cliente (sus estilos solo se cargan si se usan). Por cliente (el ?c= del
  // script) o, en una página, con data-encuesta-estilo="resistencia" (o ="normal") en el bloque base.
  var TEMA_ENCUESTA = { discendo: 'resistencia' };
  var RES_POP_CSS = '.res-pop,.res-pop *{box-sizing:border-box;margin:0;padding:0} .res-pop{--gold1:#FFD27A;--gold2:#FFA500;--gold3:#FF6A1A;--navy:#062942; position:fixed;inset:0;z-index:2147482990;display:flex;padding:20px;overflow-y:auto;-webkit-overflow-scrolling:touch; font-family:"Poppins",Arial,sans-serif;-webkit-font-smoothing:antialiased; background:var(--res-pop-fondo,rgba(255,255,255,.12)); opacity:0;visibility:hidden;transition:opacity .35s ease,visibility 0s linear .35s} .res-pop.is-open{opacity:1;visibility:visible;transition:opacity .35s ease} .res-pop-card{position:relative;width:100%; padding:58px 28px 26px;border-radius:28px;text-align:center;color:#fff;isolation:isolate; background:radial-gradient(90% 55% at 50% 0%,rgba(255,150,40,.22),transparent 65%), repeating-linear-gradient(135deg,rgba(255,255,255,.022) 0 2px,transparent 2px 13px), linear-gradient(180deg,#0d3150 0%,#072238 100%); box-shadow:0 0 0 1px rgba(255,255,255,.06),0 50px 100px -30px rgba(0,0,0,.9),0 0 80px -20px rgba(255,140,30,.55); transform:translateY(24px) scale(.96);transition:transform .45s cubic-bezier(.2,.9,.25,1.15)} .res-pop.is-open .res-pop-card{transform:none} .res-pop-card::before{content:"";position:absolute;inset:0;border-radius:28px;padding:1.5px; background:conic-gradient(from var(--res-pop-a,0deg),rgba(255,165,0,.1),var(--gold2),rgba(255,106,26,.35),rgba(255,165,0,.1),rgba(255,165,0,.1)); -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude; animation:resPopSpin 6s linear infinite;pointer-events:none} @property --res-pop-a{syntax:"<angle>";inherits:false;initial-value:0deg} .res-pop-emb{position:absolute;left:50%;top:-38px;transform:translateX(-50%);width:84px;height:84px;border-radius:50%; display:flex;align-items:center;justify-content:center; background:radial-gradient(circle at 50% 35%,#123d61,#06213a);border:1.5px solid rgba(255,165,0,.7); box-shadow:0 0 0 8px rgba(255,165,0,.08),0 0 40px rgba(255,140,30,.6)} .res-pop-emb::after{content:"";position:absolute;inset:-10px;border-radius:50%;border:1px solid rgba(255,165,0,.45);animation:resPopRing 2.6s ease-out infinite} .res-pop-emb img{width:38px;height:auto;animation:resPopFlick 3.2s ease-in-out infinite} .res-pop-card{overflow:visible} .res-pop-wrap{position:relative;width:100%;max-width:480px;margin:auto;padding-top:38px} .res-pop-eye{display:inline-flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--gold1)} .res-pop-eye::before,.res-pop-eye::after{content:"";width:22px;height:1px;background:linear-gradient(90deg,transparent,var(--gold2))} .res-pop-eye::after{background:linear-gradient(90deg,var(--gold2),transparent)} .res-pop-h{margin-top:12px;font-size:26px;line-height:1.18;font-weight:800;color:#fff;letter-spacing:-.01em} .res-pop-h span{background:linear-gradient(180deg,var(--gold1) 0%,var(--gold2) 50%,var(--gold3) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:var(--gold2)} .res-pop-list{list-style:none;display:flex;flex-direction:column;gap:12px;margin:22px 0 0;text-align:left} .res-pop-list li{display:flex;align-items:flex-start;gap:12px;padding:13px 14px;border-radius:16px;background:rgba(3,17,31,.45);border:1px solid rgba(255,165,0,.22); font-size:14.5px;line-height:1.55;font-weight:300;color:#E7EEF5;opacity:0;transform:translateY(8px);transition:opacity .45s ease,transform .45s ease} .res-pop.is-open .res-pop-list li{opacity:1;transform:none} .res-pop.is-open .res-pop-list li:nth-child(1){transition-delay:.18s} .res-pop.is-open .res-pop-list li:nth-child(2){transition-delay:.3s} .res-pop-list strong{font-weight:700;color:#fff} .res-pop-ck{flex:none;width:24px;height:24px;margin-top:1px;border-radius:50%;display:flex;align-items:center;justify-content:center; background:linear-gradient(135deg,var(--gold1),var(--gold2) 55%,var(--gold3));color:var(--navy);box-shadow:0 0 14px -2px rgba(255,120,20,.8)} .res-pop-ck svg{width:13px;height:13px} .res-pop-cta{position:relative;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:24px;padding:18px 24px;border:0;border-radius:999px;cursor:pointer; background:linear-gradient(135deg,var(--gold1) 0%,var(--gold2) 50%,var(--gold3) 100%);color:var(--navy)!important;text-decoration:none!important; font-family:inherit;font-size:17px;font-weight:800;line-height:1.2;letter-spacing:.01em;overflow:hidden;isolation:isolate; box-shadow:0 16px 36px -12px rgba(255,130,20,.8),inset 0 1px 0 rgba(255,255,255,.5);animation:resPopPulse 2.4s ease-out infinite;transition:transform .25s ease;-webkit-tap-highlight-color:transparent} .res-pop-cta::before{content:"";position:absolute;top:-20%;left:-60%;width:45%;height:140%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.85),transparent);transform:skewX(-20deg);animation:resPopShine 2.8s ease-in-out infinite;z-index:-1} .res-pop-cta:hover{transform:translateY(-2px) scale(1.02)} .res-pop-cta:focus-visible{outline:3px solid #fff;outline-offset:4px} .res-pop-time{flex:none;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:rgba(6,41,66,.14);font-size:13px;font-weight:700} .res-pop-time svg{width:14px;height:14px} .res-pop-done{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;padding:8px 12px;border:0;background:none;cursor:pointer; font-family:inherit;font-size:14px;font-weight:600;color:#C9D6E2;text-decoration:underline;text-underline-offset:4px;text-decoration-color:rgba(255,210,122,.5);transition:color .2s ease} .res-pop-done:hover{color:var(--gold1)} .res-pop-done:focus-visible{outline:2px solid var(--gold2);outline-offset:3px;border-radius:6px} .res-pop-spin{display:none;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,210,122,.3);border-top-color:var(--gold2);animation:resPopRot .8s linear infinite} .res-pop.is-checking .res-pop-spin{display:inline-block} .res-pop.is-checking .res-pop-done{pointer-events:none;opacity:.8} .res-pop-msg{display:none;align-items:flex-start;gap:10px;margin-top:12px;padding:12px 14px;border-radius:14px;text-align:left; background:rgba(255,165,0,.08);border:1px solid rgba(255,165,0,.4);font-size:13.5px;line-height:1.5;color:#FFD9A0} .res-pop-msg svg{flex:none;width:18px;height:18px;margin-top:1px;color:var(--gold2)} .res-pop.is-pending .res-pop-msg{display:flex;animation:resPopIn .35s ease} @keyframes resPopSpin{to{--res-pop-a:360deg}} @keyframes resPopRing{0%{transform:scale(.92);opacity:.9}100%{transform:scale(1.35);opacity:0}} @keyframes resPopFlick{0%,100%{filter:drop-shadow(0 0 10px rgba(255,150,40,.6))}40%{filter:drop-shadow(0 0 18px rgba(255,150,40,.9))}70%{filter:drop-shadow(0 0 8px rgba(255,150,40,.45))}} @keyframes resPopShine{0%{left:-60%}55%,100%{left:130%}} @keyframes resPopPulse{0%{box-shadow:0 0 0 0 rgba(255,165,0,.5),0 16px 36px -12px rgba(255,130,20,.8)}70%{box-shadow:0 0 0 16px rgba(255,165,0,0),0 16px 36px -12px rgba(255,130,20,.8)}100%{box-shadow:0 0 0 0 rgba(255,165,0,0),0 16px 36px -12px rgba(255,130,20,.8)}} @keyframes resPopRot{to{transform:rotate(360deg)}} @keyframes resPopIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}} @media (min-width:769px){ .res-pop-card{padding:62px 40px 30px} .res-pop-h{font-size:30px} .res-pop-list li{font-size:15px} } @media (max-width:420px){ .res-pop-cta{font-size:16px;padding:17px 16px;gap:8px} .res-pop-time{font-size:12px;padding:3px 8px} } @media (max-width:380px){ .res-pop{padding:14px} .res-pop-card{padding:54px 18px 22px} .res-pop-h{font-size:23px} .res-pop-cta{font-size:16px;padding:16px 18px;flex-wrap:wrap;gap:6px} } @media (prefers-reduced-motion:reduce){.res-pop *,.res-pop *::before,.res-pop *::after{animation:none!important;transition:none!important}.res-pop-list li{opacity:1;transform:none}}';
  var ICO_CK = '<span class="res-pop-ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
  // «La Resistencia» (Discendo): tarjeta azul noche con la antorcha, dos puntos y el botón dorado. → el elemento.
  function popupResistencia(data, href) {
    if (!document.getElementById('lsd-res-pop-css')) {
      var fuente = document.createElement('link');
      fuente.rel = 'stylesheet';
      fuente.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700;800&display=swap';
      document.head.appendChild(fuente);
      var st = document.createElement('style');
      st.id = 'lsd-res-pop-css';
      st.textContent = RES_POP_CSS;
      document.head.appendChild(st);
    }
    var n = ((data.recursos || {}).lista || []).length;
    var el = document.createElement('div');
    el.className = 'res-pop';
    el.innerHTML = '<div class="res-pop-wrap"><div class="res-pop-card">' +
      '<span class="res-pop-emb" aria-hidden="true"><img src="' + API + '/img/antorcha-resistencia.png" alt=""></span>' +
      '<p class="res-pop-eye">Tu llave de acceso</p>' +
      '<h2 class="res-pop-h" id="lsd-enc-t">Responde y <span>desbloquea</span> tus recursos' + (data.name ? ' de ' + esc(data.name) : '') + '</h2>' +
      '<ul class="res-pop-list">' +
        '<li>' + ICO_CK + '<span>Queremos conocerte antes del primer directo. Con tus respuestas <strong>adaptaremos el contenido de los directos</strong>.</span></li>' +
        '<li>' + ICO_CK + '<span><strong>Desbloquearás ' + (n ? 'los ' + n + ' recursos gratuitos' : 'los recursos gratuitos') + '</strong> para ir bien preparado a los directos.</span></li>' +
      '</ul>' +
      '<a class="res-pop-cta lsd-enc-btn" href="' + esc(href) + '" target="_blank" rel="noopener">Personalizar experiencia <span class="res-pop-time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>1 min</span></a>' +
      '<button type="button" class="res-pop-done lsd-enc-ya"><span class="res-pop-spin" aria-hidden="true"></span>Ya la he rellenado</button>' +
      '<p class="res-pop-msg lsd-enc-msg" role="status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg><span>Aún no nos ha llegado. Si acabas de terminarla, espera unos segundos y vuelve a pulsar.</span></p>' +
      '</div></div>';
    return el;
  }

  // El copy de la encuesta tal como está en la propia página de la preclase: su sección (la que lleva
  // data-encuesta-popup, data-lsd-etapa="encuesta", data-lsd-if="encuesta-pendiente" o el botón de la encuesta) →
  // { titulo, texto } con su primer título y su primer párrafo. Vacío si la página no la tiene.
  function copyEncuestaPagina() {
    var dentroPopup = function (x) { return x.closest && x.closest('#lsd-encuesta'); };
    var cands = Array.prototype.slice.call(document.querySelectorAll('[data-encuesta-popup], [data-lsd-etapa="encuesta"], [data-lsd-if="encuesta-pendiente"], [data-lsd-link="encuesta"]'))
      .filter(function (x) { return !dentroPopup(x); });
    var txt = function (x) { return x ? String(x.textContent || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim() : ''; };
    for (var k = 0; k < cands.length; k++) {
      // Del elemento hacia arriba (hasta 6 niveles), la primera caja que tenga un título; sin pasar a la página entera.
      var caja = cands[k];
      for (var n = 0; caja && caja !== document.body && n < 7; n++, caja = caja.parentElement) {
        var hs = caja.querySelectorAll('h1,h2,h3,h4');
        if (!hs.length) continue;
        if (hs.length > 3) break; // ya es media página: no es la sección de la encuesta
        var titulo = txt(hs[0]);
        var ps = Array.prototype.filter.call(caja.querySelectorAll('p'), function (p) { return txt(p) && !p.closest('a,button') && !p.querySelector('a,button'); });
        if (titulo) return { titulo: titulo.slice(0, 160), texto: ps.slice(0, 2).map(txt).join('\n').slice(0, 500) };
        break;
      }
    }
    return { titulo: '', texto: '' };
  }

  // Encuesta primero: en la preclase (todos los lanzamientos de todos los clientes), si el lanzamiento tiene encuesta y
  // quien entra aún no la ha rellenado, al iniciar sesión sale este popup encima de la página: el mismo copy de la
  // encuesta que hay en la página (si no, los textos de Configuración «encuesta-titulo» / «encuesta-texto») y el botón
  // «Personalizar experiencia», que abre la encuesta en otra pestaña. Al volver (o con «Ya la he rellenado») se
  // comprueba y se quita solo; también cada 8 s. Sin él en una página: data-encuesta-primero="no" en el bloque base.
  // Con data-encuesta-dentro="si", en vez del popup, la pantalla completa con la encuesta dentro.
  function pantallaEncuesta(data, who, comprobar) {
    var el = document.getElementById('lsd-encuesta');
    var base = document.querySelector('[data-lsd-page]');
    var enc = data.encuesta || {};
    var href = (data.links || {}).encuesta;
    var poner = Boolean(who && (who.cid || who.email) && enc.required && !enc.done && href && !(base && base.getAttribute('data-encuesta-primero') === 'no'));
    if (!poner) {
      if (who && (who.cid || who.email) && enc.required && !enc.done && !href && window.console) console.warn('[lsd] el lanzamiento pide encuesta pero no tiene su URL: ponla en Configuración (URL de la encuesta) para que salga al entrar.');
      if (el) { clearInterval(el.lsdTimer); el.parentNode.removeChild(el); if (!document.getElementById('lsd-espera')) document.documentElement.style.overflow = ''; }
      return;
    }
    if (el && el.classList.contains('res-pop')) {
      el.querySelector('.lsd-enc-btn').setAttribute('href', href);
      if (el.classList.contains('is-checking')) { el.classList.remove('is-checking'); el.classList.add('is-pending'); }
      return;
    }
    if (el) { el.querySelector('.lsd-enc-btn').setAttribute('href', href); var m = el.querySelector('.lsd-enc-msg'); if (m.getAttribute('data-esperando')) { m.removeAttribute('data-esperando'); m.textContent = 'Aún no nos ha llegado. Si acabas de terminarla, espera unos segundos y vuelve a pulsar.'; } return; }
    var t = data.texts || {};
    var nombre = ''; // el nombre va en el enlace de la encuesta (para rellenarla); se saluda con él
    try { nombre = String(new URL(href, location.href).searchParams.get('first_name') || '').trim().split(' ')[0].slice(0, 30); } catch (e) { /* sin nombre */ }
    var dentro = Boolean(base && base.getAttribute('data-encuesta-dentro') === 'si');
    var tema = (base && base.getAttribute('data-encuesta-estilo')) || TEMA_ENCUESTA[data.cliente || CLIENTE] || TEMA_ENCUESTA[CLIENTE] || '';
    if (tema === 'resistencia' && !dentro) {
      el = popupResistencia(data, href);
      el.id = 'lsd-encuesta';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'lsd-enc-t');
      el.querySelector('.lsd-enc-ya').addEventListener('click', function () {
        el.classList.remove('is-pending');
        el.classList.add('is-checking');
        comprobar();
      });
      document.body.appendChild(el);
      document.documentElement.style.overflow = 'hidden';
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('is-open'); }); });
      return;
    }
    var pagina = dentro ? { titulo: '', texto: '' } : copyEncuestaPagina();
    var titulo = pagina.titulo || t['encuesta-titulo'] || ((nombre ? nombre + ', a' : 'A') + 'ntes de entrar, cuéntanos un poco sobre ti');
    var texto = pagina.titulo ? pagina.texto : t['encuesta-texto'] || (dentro ? 'Rellena esta encuesta de un minuto. En cuanto la termines, se abre tu área con todo el contenido.' : 'Para entrar tienes que completar la encuesta. Es solo un minuto y así personalizamos tu experiencia.');
    var boton = (base && base.getAttribute('data-encuesta-boton')) || 'Personalizar experiencia';
    el = document.createElement('div');
    el.id = 'lsd-encuesta';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'lsd-enc-t');
    el.className = dentro ? 'lsd-enc-dentro' : 'lsd-enc-popup';
    el.innerHTML = '<div class="lsd-enc-c"><p class="lsd-enc-ico" aria-hidden="true">📝</p>' + (dentro ? '<p class="lsd-enc-paso">Paso 1 · antes de empezar</p>' : '') +
      '<h2 id="lsd-enc-t">' + esc(titulo) + '</h2>' +
      (texto ? '<p class="lsd-enc-txt">' + esc(texto) + '</p>' : '') +
      (dentro ? '<div class="lsd-enc-marco"><iframe src="' + esc(href) + '" title="Encuesta" loading="eager" allow="clipboard-write"></iframe></div>' : '') +
      '<a class="lsd-enc-btn' + (dentro ? ' lsd-enc-btn-sec' : '') + '" href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(dentro ? '¿No se ve la encuesta? Ábrela aquí' : boton) + '</a>' +
      '<button type="button" class="lsd-enc-ya">Ya la he rellenado</button><p class="lsd-enc-msg" aria-live="polite"></p></div>';
    el.querySelector('.lsd-enc-ya').addEventListener('click', function () {
      var m = el.querySelector('.lsd-enc-msg');
      m.textContent = 'Comprobando…';
      m.setAttribute('data-esperando', '1');
      comprobar();
    });
    if (!dentro) el.querySelector('.lsd-enc-btn').addEventListener('click', function () {
      el.querySelector('.lsd-enc-msg').textContent = 'Cuando la termines, vuelve a esta pestaña: se abrirá sola.';
    });
    document.body.appendChild(el);
    document.documentElement.style.overflow = 'hidden';
    // Si ya llegó la encuesta se comprueba al volver a la pestaña, al pulsar «Ya la he rellenado» y, con la página
    // abierta, cada vez más espaciado (15 s, 30 s, 1 min… lo hace cycle()): sin comprobaciones fijas, que con cientos
    // de leads a la vez agotarían el límite de GHL. Con la encuesta dentro, también al enviarla (a los 3 s).
    var ifr = el.querySelector('iframe'), cargas = 0;
    if (ifr) ifr.addEventListener('load', function () { cargas++; if (cargas > 1) setTimeout(comprobar, 3000); });
  }

  function quitarEspera() {
    var el = document.getElementById('lsd-espera');
    if (!el) return;
    clearInterval(esperaTimer);
    el.parentNode.removeChild(el);
    document.documentElement.style.overflow = '';
    Array.prototype.forEach.call(document.querySelectorAll('[data-lsd-oculto]'), function (c) { c.removeAttribute('aria-hidden'); c.removeAttribute('data-lsd-oculto'); });
  }
  // La peregrina recorre el camino (14 s por vuelta), siguiendo la curva del trazo.
  function andarPeregrina(el) {
    var camino = el.querySelector('.lsd-esp-trazo');
    var pg = el.querySelector('.lsd-esp-pg');
    if (!camino || !pg || !camino.getTotalLength) return;
    var largo = camino.getTotalLength();
    var quieta = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var colocar = function (f) {
      var pt = camino.getPointAtLength(f * largo);
      var bote = quieta ? 0 : Math.abs(Math.sin(f * largo / 9)) * -3; // pasito a pasito
      pg.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + (pt.y - 4 + bote).toFixed(1) + ')');
    };
    if (quieta) return colocar(0.42);
    var inicio = null;
    var ultimo = 0;
    var paso = function (ts) {
      if (!el.parentNode) return; // se quitó la pantalla
      if (inicio == null) inicio = ts;
      // ~30 fotogramas por segundo bastan (y ahorran batería en móviles).
      if (ts - ultimo >= 33) { ultimo = ts; colocar(((ts - inicio) % 14000) / 14000); }
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  // «Quédate aquí,» (lo que va antes de la primera coma) en negrita; el resto, normal.
  function mensajeEspera(txt) {
    var i = txt.indexOf(',');
    return i > 0 && i < 40 ? '<strong>' + esc(txt.slice(0, i + 1)) + '</strong>' + esc(txt.slice(i + 1)) : esc(txt);
  }

  // ---------- Entrada al directo sin atascos ----------
  // Mientras espera, se la inscribe en Zoom en un momento al azar (como mucho 10 min después de abrir la
  // pantalla y siempre antes del último minuto), y su enlace personal se guarda en el navegador. A la hora
  // exacta entra directa a su enlace de Zoom: cientos a la vez no cuestan ni una llamada a GHL ni a Zoom.
  var kDe = function (key) { return key === 'directo' ? 1 : Number(String(key).replace('directo', '')) || 1; };
  var claveZoom = function (code, key) { return 'lsd_zoom_' + code + '_' + kDe(key); };
  // Enlace de Zoom guardado en este navegador para esa lead y esa reunión (si se cambió la reunión, no vale).
  function zoomGuardado(data, key, who) {
    var z = store(claveZoom(data.code, key));
    if (!z || !z.url || !who || z.cid !== who.cid) return null;
    var id = (data.zoom || {})[key];
    var m = /\/w\/(\d+)/.exec(z.url);
    return !id || !m || m[1] === id ? z.url : null;
  }
  function prepararZoom(data, esp, who) {
    if (params.get('lsd_preview') || !who || !who.cid) return;
    var clave = claveZoom(data.code, esp.key);
    if (zoomGuardado(data, esp.key, who)) return;
    var queda = esp.at - serverNow();
    var margen = queda - 90000;
    var espera = margen > 0 ? Math.random() * Math.min(margen, 600000) : Math.random() * Math.max(0, Math.min(20000, queda - 5000));
    var intentar = function (n) {
      var otraVez = function () { if (n < 2 && esp.at - serverNow() > 60000) setTimeout(function () { intentar(n + 1); }, 20000 + Math.random() * 40000); };
      post('/api/directo-zoom', { op: 'prep', launch: data.code, k: kDe(esp.key), cid: who.cid }).then(function (r) {
        if (r && r.joinUrl) store(clave, { cid: who.cid, url: r.joinUrl }); else if (!r || !r.motivo || r.motivo === 'zoom') otraVez();
      }).catch(otraVez);
    };
    setTimeout(function () { intentar(0); }, espera);
  }
  // Inscripción en Zoom por adelantado: la primera vez que entra en la preclase (cualquier día antes del
  // directo) se la inscribe por detrás en el próximo directo y se guarda su enlace. Así, a la hora del directo,
  // entra al instante y la carga se reparte en la semana. Como mucho un intento cada 6 h por dispositivo; la
  // pantalla de espera y el clic siguen de respaldo.
  // Lanzamientos de varios vídeos en directo (cada uno con su reunión de Zoom): se la inscribe en todos los que quedan,
  // uno detrás de otro (no a la vez), cada uno con su enlace personal.
  function inscribirPorAdelantado(data, who) {
    if (params.get('lsd_preview') || !who || !who.cid || !data.directos) return;
    var ahora = serverNow();
    var keys = Object.keys(data.directos).filter(function (k) { return data.directos[k] > ahora && data.links[k]; })
      .sort(function (a, b) { return data.directos[a] - data.directos[b]; });
    var retraso = 2000 + Math.random() * 8000;
    keys.forEach(function (key) {
      var clave = claveZoom(data.code, key);
      if (zoomGuardado(data, key, who)) return;
      var intento = store(clave + '_intento');
      if (intento && intento.cid === who.cid && ahora - intento.t < 6 * 3600000) return;
      store(clave + '_intento', { cid: who.cid, t: ahora });
      setTimeout(function () {
        post('/api/directo-zoom', { op: 'prep', launch: data.code, k: kDe(key), cid: who.cid }).then(function (r) {
          if (r && r.joinUrl) store(clave, { cid: who.cid, url: r.joinUrl });
        }).catch(function () { /* se reintentará en otra visita o en la pantalla de espera */ });
      }, retraso);
      retraso += 3000 + Math.random() * 4000;
    });
  }
  // Al directo: con su enlace de Zoom ya guardado, directa (y se apunta que entró); si no, por /directo.
  function irAlDirecto(data, key, who) {
    var url = zoomGuardado(data, key, who);
    if (!params.get('lsd_preview') && who && who.cid && url && /^https:\/\/([a-z0-9-]+\.)*zoom\.us\//i.test(url)) {
      if (redirigido) return;
      redirigido = true;
      post('/api/directo-zoom', { op: 'click', launch: data.code, k: kDe(key), cid: who.cid });
      location.replace(url);
      return;
    }
    goTo(data.links[key], who);
  }

  function mostrarEspera(data, esp, who) {
    var el = document.getElementById('lsd-espera');
    var t = data.texts || {};
    if (!el) {
      el = document.createElement('div');
      el.id = 'lsd-espera';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'lsd-espera-t');
      var logo = (data.imagenes || {}).espera;
      var videoEsp = embedSrc((data.espera || {}).video);
      if (videoEsp) el.className = 'lsd-espera--video';
      el.innerHTML = '<div class="lsd-espera-in">' +
        (logo ? '<img class="lsd-espera-logo" src="' + esc(logo) + '" alt="">' : '') +
        '<h2 class="lsd-espera-t" id="lsd-espera-t">' + esc(t['espera-titulo'] || '¡Empezamos en unos minutos!') + '</h2>' +
        '<p class="lsd-espera-sub">' + esc(t['espera-subtitulo'] || 'Prepárate') + '</p>' +
        // Vídeo opcional (Configuración → Preclase): con vídeo, el contador se hace pequeño y el vídeo destaca.
        (videoEsp ? '<div class="lsd-espera-video"><div class="lsd-embed"><iframe src="' + esc(videoEsp) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="Vídeo"></iframe></div></div>' : '') +
        '<div class="lsd-espera-cd" aria-live="off">' +
        '<div class="lsd-espera-u"><span class="lsd-espera-num" data-u="m">00</span><span class="lsd-espera-lbl">minutos</span></div>' +
        '<span class="lsd-espera-sep" aria-hidden="true">:</span>' +
        '<div class="lsd-espera-u"><span class="lsd-espera-num" data-u="s">00</span><span class="lsd-espera-lbl">segundos</span></div></div>' +
        '<p class="lsd-espera-msg"><span class="lsd-espera-dot" aria-hidden="true"></span><span>' + mensajeEspera(t['espera-mensaje'] || 'Quédate aquí, serás redirigida al directo en cuanto el contador llegue a cero.') + '</span></p>' +
        '</div>' +
        // El camino de El Camino, con la peregrina andando (el mismo paisaje que la etapa 1).
        '<div class="lsd-espera-paisaje" aria-hidden="true"><svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice">' +
        '<circle class="lsd-esp-sol" cx="900" cy="96" r="32" fill="#f3d9bf"/>' +
        '<g class="lsd-esp-nube" fill="#ffffff" opacity=".9"><ellipse cx="120" cy="92" rx="38" ry="11"/><ellipse cx="146" cy="84" rx="22" ry="11"/></g>' +
        '<g class="lsd-esp-nube lsd-esp-nube--2" fill="#ffffff" opacity=".8"><ellipse cx="420" cy="80" rx="30" ry="9"/><ellipse cx="438" cy="74" rx="16" ry="8"/></g>' +
        '<path d="M0 132 C 160 96, 300 116, 460 102 S 760 70, 920 92 S 1120 84, 1200 74 V220 H0Z" fill="#ead9c9"/>' +
        '<path d="M0 172 C 200 148, 400 162, 600 148 S 960 132, 1200 142 V220 H0Z" fill="#dfc7b0"/>' +
        '<path d="M-20 196 C 150 188, 250 136, 400 142 S 640 178, 770 134 S 1010 84, 1220 96" fill="none" stroke="#f8f0e8" stroke-width="24" stroke-linecap="round"/>' +
        '<path class="lsd-esp-trazo" d="M-20 196 C 150 188, 250 136, 400 142 S 640 178, 770 134 S 1010 84, 1220 96" fill="none" stroke="#c49b79" stroke-width="3" stroke-linecap="round"/>' +
        '<g class="lsd-esp-cipres"><path d="M230 168c-7-14-7-36 0-52 7 16 7 38 0 52Z" fill="#8a7a55"/></g>' +
        '<g class="lsd-esp-cipres lsd-esp-cipres--b"><path d="M1032 118c-6-12-6-31 0-45 6 14 6 33 0 45Z" fill="#8a7a55"/><path d="M1050 118c-5-10-5-24 0-35 5 11 5 25 0 35Z" fill="#9c8c66"/></g>' +
        '<g class="lsd-esp-cipres"><path d="M640 176c-5-10-5-26 0-38 5 12 5 28 0 38Z" fill="#9c8c66"/></g>' +
        '<g opacity=".55" fill="#ffffff"><circle cx="560" cy="190" r="2.4"/><circle cx="590" cy="198" r="1.8"/><circle cx="140" cy="206" r="2"/><circle cx="1100" cy="170" r="1.8"/></g>' +
        '<g class="lsd-esp-peregrina"><g class="lsd-esp-pg">' +
        '<ellipse cx="0" cy="17" rx="11" ry="3" fill="#4a2c20" opacity=".15"/>' +
        '<circle r="15" fill="#860d0e" stroke="#ffffff" stroke-width="3"/>' +
        '<g transform="translate(-8.4 -9) scale(.7)"><path d="M12 21.5 3.2 10.4C4.6 5.3 8 3 12 3s7.4 2.3 8.8 7.4L12 21.5Z" fill="#ffffff"/><path d="M12 20 12 4.5M12 20 8.6 5.4M12 20 15.4 5.4M12 20 5.6 8.2M12 20 18.4 8.2" stroke="#860d0e" stroke-width="1" stroke-linecap="round" opacity=".55"/></g>' +
        '</g></g></svg></div>';
      document.body.appendChild(el);
      document.documentElement.style.overflow = 'hidden';
      prepararZoom(data, esp, who);
      // Para el panel «En directo» del dashboard: quién está esperando (solo D1, sin GHL).
      if (!params.get('lsd_preview') && who && who.cid) post('/api/directo-zoom', { op: 'espera', launch: data.code, k: kDe(esp.key), cid: who.cid });
      // Lectores de pantalla: solo la pantalla de espera (lo de debajo queda oculto mientras tanto).
      Array.prototype.forEach.call(document.body.children, function (c) { if (c !== el && !c.hasAttribute('aria-hidden')) { c.setAttribute('aria-hidden', 'true'); c.setAttribute('data-lsd-oculto', '1'); } });
      el.setAttribute('tabindex', '-1');
      el.focus();
      andarPeregrina(el);
    }
    var mm = el.querySelector('[data-u="m"]');
    var ss = el.querySelector('[data-u="s"]');
    var ido = false;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var tick = function () {
      var left = Math.max(0, esp.at - serverNow());
      var sec = Math.ceil(left / 1000);
      mm.textContent = pad(Math.floor(sec / 60));
      ss.textContent = pad(sec % 60);
      if (left <= 0 && !ido) {
        ido = true;
        clearInterval(esperaTimer);
        // Vista previa del dashboard: no se entra de verdad al directo (ni se registra en Zoom).
        if (params.get('lsd_preview')) { var msg = el.querySelector('.lsd-espera-msg span:last-child'); if (msg) msg.textContent = 'Vista previa: aquí entraría al directo.'; return; }
        irAlDirecto(data, esp.key, who);
      }
    };
    clearInterval(esperaTimer);
    tick();
    esperaTimer = setInterval(tick, 500);
  }

  // Barra fija arriba del todo (páginas de replay y de venta), configurada en el dashboard:
  // bar = { text (con {cuenta}), fin (ms), boton: { label, href } | null, color }. Al llegar a cero, alCero(el).
  // Sustituye a las barras <div data-lsd-bar> de la página. Sin bar, se quita.
  var bfTimer = null;
  function barraFija(bar, alCero) {
    var el = document.getElementById('lsd-rb');
    clearInterval(bfTimer);
    if (!bar) {
      if (el) { el.parentNode.removeChild(el); document.body.style.paddingTop = ''; }
      return null;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'lsd-rb';
      el.className = 'lsd-rb';
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', 'Cuenta atrás');
      document.body.insertBefore(el, document.body.firstChild);
    }
    if (bar.color) el.style.setProperty('--lsd-rb', bar.color); else el.style.removeProperty('--lsd-rb');
    el.innerHTML = '<span class="lsd-bar-text">' + esc(bar.text).replace('{cuenta}', cdSpan(bar.fin)) + '</span>'
      + (bar.boton && bar.boton.href ? '<a class="lsd-bar-btn" href="' + esc(bar.boton.href) + '">' + esc(bar.boton.label) + '</a>' : '');
    document.querySelectorAll('[data-lsd-bar]').forEach(function (b) { show(b, false); });
    document.body.style.paddingTop = el.offsetHeight + 'px';
    if (!barraFija.resize) { barraFija.resize = true; window.addEventListener('resize', function () { var b = document.getElementById('lsd-rb'); if (b) document.body.style.paddingTop = b.offsetHeight + 'px'; }); }
    startCountdowns();
    bfTimer = setInterval(function () {
      if (serverNow() < bar.fin) return;
      clearInterval(bfTimer);
      alCero(el);
    }, 500);
    return el;
  }

  // Página de replay: cuenta atrás hasta una fecha fija o X minutos desde que la lead abrió la grabación
  // (se recuerda en el navegador: recargar no la reinicia). Al llegar a cero lleva a la página de venta.
  function barraReplay(data, who) {
    var rb = data.replayBarra;
    // Solo en la página de la grabación del vídeo de venta (en los de varios vídeos, el último).
    if (!rb || !data.links.venta || !document.querySelector('[data-lsd-video="' + rb.video + '"]')) return barraFija(null);
    var fin = rb.at;
    if (!fin && rb.minutos) {
      var key = 'lsd_rb_' + data.code;
      var desde = store(key);
      if (!desde || !desde.t) { desde = { t: serverNow() }; store(key, desde); }
      fin = desde.t + rb.minutos * 60000;
    }
    if (!fin) return;
    var preview = Boolean(params.get('lsd_preview'));
    // Ya pasó (vuelve otro día o se le acabaron sus minutos): directa a la página de venta.
    if (fin <= serverNow() && !preview) return goTo(data.links.venta, who);
    barraFija({ text: rb.text, fin: fin, boton: rb.boton ? { label: rb.boton, href: data.links.venta } : null, color: rb.color }, function (el) {
      if (preview) { el.querySelector('.lsd-bar-text').textContent = 'Vista previa: aquí iría a la página de venta.'; return; }
      goTo(data.links.venta, who);
    });
  }

  // Página de venta: varios tramos seguidos, cada uno con su texto y su cuenta atrás hasta su fin
  // (p. ej. «Último día para llevarte el bonus» y, al día siguiente, «Último día para entrar»).
  // Al acabar un tramo pasa solo al siguiente; después del último, la barra se quita.
  function barraVenta(data) {
    var vb = data.ventaBarra;
    var tramo = vb && vb.tramos.filter(function (t) { return t.hasta > serverNow(); })[0];
    if (!tramo) return barraFija(null);
    barraFija({ text: tramo.text, fin: tramo.hasta, boton: tramo.boton, color: vb.color }, function () { barraVenta(data); });
  }

  // Primera respuesta de /api/page (la de init): si ya llevaba la identidad de la lead, el primer ciclo
  // la reutiliza en vez de volver a pedirla (una petición menos por cada carga de página).
  var primeraRespuesta = null;
  function runManagedPage(kind, launchAttr, who, onVideo) {
    var timer = null;
    var intentos = 0; // comprobaciones seguidas de la encuesta / el test sin cambios
    var ultimoRecheck = 0;
    function cycle() {
      var p = primeraRespuesta;
      primeraRespuesta = null;
      var reutilizar = p && who && who.cid && p.cid === who.cid && p.kind === kind && p.code === launchAttr && Date.now() - p.at < 30000;
      (reutilizar ? Promise.resolve(p.data) : fetchPage(launchAttr, who, kind)).then(function (data) {
        if (redirigido) return;
        if (!data || (data.error && !data.code)) return reintentar();
        fallos = 0;
        if (kind === 'recursos' && data.redirectTo && data.links[data.redirectTo]) {
          return /^directo\d?$/.test(data.redirectTo) ? irAlDirecto(data, data.redirectTo, who) : goTo(data.links[data.redirectTo], who);
        }
        renderPage(data, who, function (el) { onVideo(el, data.code); });
        if (kind === 'grabacion') barraReplay(data, who);
        // Los 59 minutos antes del directo, la preclase se convierte en la pantalla de espera.
        var esp = kind === 'recursos' ? esperaDirecto(data) : null;
        if (esp && serverNow() >= esp.desde) mostrarEspera(data, esp, who); else { quitarEspera(); if (kind === 'recursos') inscribirPorAdelantado(data, who); }
        if (kind === 'recursos' && !data.reintentar) pantallaEncuesta(data, who, function () { intentos = 0; clearTimeout(timer); cycle(); });
        // Próximo cambio: fase o desbloqueo de vídeo (o el momento de enseñar la pantalla de espera).
        var rec = data.recursos || {};
        var next = [data.changesAt, esp && esp.desde].concat(Object.keys(data.videos).map(function (k) { return data.videos[k].unlockAt; }), Object.keys(rec).map(function (k) { return rec[k] && rec[k].unlockAt; }))
          .filter(function (t) { return t && t > data.now; }).sort(function (a, b) { return a - b; })[0];
        clearTimeout(timer);
        // Encuesta o test pendientes: se comprueba al volver a la pestaña (se rellenan en otra) y, además,
        // cada vez más espaciado (15 s, 30 s, 1 min, 2 min y luego cada 5 min; el test empieza en 1 min)
        // para no gastar peticiones con la página abierta y olvidada.
        var encPend = Boolean(data.encuesta && data.encuesta.required && !data.encuesta.done);
        var testPend = Boolean(data.recursos && data.recursos.test && data.recursos.test.unlocked && !data.recursos.test.done);
        waitingEncuesta = Boolean((encPend || testPend) && who && (who.cid || who.email));
        if (!waitingEncuesta) intentos = 0;
        if (waitingEncuesta && !document.hidden) {
          var pasos = encPend ? [15, 30, 60, 120, 300] : [60, 120, 300];
          next = Math.min(next || Infinity, serverNow() + pasos[Math.min(intentos, pasos.length - 1)] * 1000);
          intentos++;
        }
        // GHL no contestó (mucha gente a la vez): se vuelve a preguntar en 20-50 s, cada página a su hora.
        if (data.reintentar) next = Math.min(next || Infinity, serverNow() + 20000 + Math.random() * 30000);
        if (next) timer = setTimeout(cycle, Math.min(next - serverNow() + 1500, 2147483000));
      }).catch(reintentar);
    }
    // Sin respuesta o con error (sin conexión o el servidor saturado): se reintenta solo, cada vez más espaciado y
    // con algo de azar para que cientos de páginas no vuelvan a pedir a la vez (5-10 s, 10-20 s… hasta 2-4 min).
    var fallos = 0;
    function reintentar() {
      if (redirigido) return;
      var base = Math.min(5000 * Math.pow(2, fallos), 120000);
      fallos++;
      clearTimeout(timer);
      timer = setTimeout(cycle, base + Math.random() * base);
    }
    var waitingEncuesta = false;
    // Al volver a la pestaña (focus y visibilitychange llegan juntos): una sola comprobación.
    function recheck() {
      if (!waitingEncuesta || document.hidden || Date.now() - ultimoRecheck < 5000) return;
      ultimoRecheck = Date.now();
      intentos = 0;
      clearTimeout(timer);
      cycle();
    }
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
      ? fetchPage(attr, null).then(function (d) { return { code: d.code, redirect: el.getAttribute('data-redirect') || (d.links && d.links.recursos), error: d.error, turnstile: d.turnstile || '' }; })
      : Promise.resolve({ code: attr, redirect: el.getAttribute('data-redirect') });
    ready.catch(function () { return { code: attr, redirect: el.getAttribute('data-redirect') }; }).then(function (cfg) {
      // Viene de otra página del lanzamiento que pedía entrar (la grabación, la venta…): al acabar, vuelve a ella.
      // Solo a una página del mismo dominio que el login (nada de enviar a webs ajenas).
      var volver = params.get('volver');
      if (volver) {
        try { var vu = new URL(volver, location.href); if (/^https?:$/.test(vu.protocol) && vu.host === location.host) cfg = Object.assign({}, cfg, { redirect: vu.toString() }); } catch (e) { /* URL rara: se queda la de siempre */ }
      }
      // Sin página a la que ir (no hay lanzamiento en curso o le falta la URL de la página preclase en el
      // dashboard), se avisa en vez de «redirigir» a la misma página.
      var sinDestino = function () {
        if (window.console) console.warn('[lsd] login sin página de destino: pon la «URL de la página preclase» del lanzamiento en curso (Configuración → Preclase) o data-redirect="https://…" en el bloque.', cfg);
        var e = el.querySelector('.lsd-err');
        if (!e) { e = document.createElement('p'); e.className = 'lsd-err'; el.appendChild(e); }
        e.textContent = 'Ya tienes acceso, pero ahora mismo no podemos llevarte a las clases. Inténtalo de nuevo en unos minutos.';
        e.hidden = false;
      };
      var ir = function (who) { if (!cfg.redirect) return sinDestino(); goTo(cfg.redirect, who); };
      var cid = params.get('cid');
      if (cid && !/^\{\{/.test(cid) && cfg.redirect) { store(STORE, { cid: cid }); return goTo(cfg.redirect, { cid: cid }); } // viene de un email de GHL
      var stored = store(STORE) || {};
      var preset = params.get('email') || '';
      gate(el, cfg.code, ir, preset || '', {
        login: true,
        movil: el.getAttribute('data-movil') || 'si',
        movilNota: el.getAttribute('data-movil-nota') || 'Te avisaremos por WhatsApp cuando se abra cada clase y antes del directo.',
        title: el.getAttribute('data-title') || 'Accede a las clases con tu email y tu WhatsApp',
        button: el.getAttribute('data-button') || 'Acceder',
        siteKey: cfg.turnstile || '',
      });
      // Si este navegador ya la conoce, dejamos su email escrito (pero puede cambiarlo).
      if (!preset && stored.email) { var inp = el.querySelector('input[name="email"]'); if (inp) inp.value = stored.email; }
    });
  }

  // Textos, cajetines de pago, enlaces de los botones y bonus de acción rápida de las páginas de venta y de pago.
  function rellenarVenta(data) {
    var texts = data.texts || {};
    document.querySelectorAll('[data-lsd-text]').forEach(function (t) {
      var k = t.getAttribute('data-lsd-text');
      if (!Object.prototype.hasOwnProperty.call(texts, k)) return;
      t.textContent = texts[k];
      show(t, Boolean(texts[k]));
    });
    document.querySelectorAll('[data-lsd-caja]').forEach(function (c) {
      var link = (data.links || {})[c.getAttribute('data-lsd-caja') === 'fraccionado' ? 'pago-fraccionado' : 'pago'];
      show(c, Boolean(link));
    });
    // Botones de la página de venta: <a data-lsd-link="pago|pago-fraccionado|llamada|whatsapp-dudas">.
    // Sin enlace configurado, el botón se oculta.
    var links = data.links || {};
    document.querySelectorAll('[data-lsd-link]').forEach(function (a) {
      var k = a.getAttribute('data-lsd-link');
      if (!Object.prototype.hasOwnProperty.call(links, k)) return;
      if (!links[k]) return show(a, false);
      a.setAttribute('href', links[k]);
      show(a, true);
      if ((k === 'whatsapp' || k === 'whatsapp-dudas') && !a.getAttribute('target')) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
    });
    if (data.bonus) bonusAccionRapida(data.bonus, data.texts);
    if (data.carrito) fasesVenta(data);
  }

  // Página de venta: <div data-lsd-venta data-launch="auto"></div> apunta la visita (sin llamar a GHL)
  // para «Setting hoy» del dashboard: quién la visitó y no ha comprado. Necesita saber quién es: ?cid=
  // en el enlace (los de la preclase y la grabación ya lo llevan) o que el navegador la recuerde.
  // Páginas de venta (<div data-lsd-venta>) y de pago (<div data-lsd-pago>): respuesta ligera, sin llamar a GHL.
  // Pintan su barra fija por tramos, los enlaces de los botones y los textos y precios de los cajetines de pago
  // (<span data-lsd-text="pago-unico-precio">…; <div data-lsd-caja="unico|fraccionado"> se oculta sin enlace).
  function initVenta(el, pagina) {
    if (el.getAttribute('data-lsd-ready')) return;
    el.setAttribute('data-lsd-ready', '1');
    pagina = pagina || 'venta';
    var who = identity();
    var launch = params.get('l') || el.getAttribute('data-launch') || 'auto';
    // Titular y subtitular según la encuesta (<h1 data-lsd-text="titular">, <p data-lsd-text="subtitular">):
    // se ocultan hasta saber cuál le toca (como mucho 2,5 s; si no, se queda el texto escrito en la página).
    var personalizados = pagina === 'venta' ? Array.prototype.slice.call(document.querySelectorAll('[data-lsd-text="titular"], [data-lsd-text="subtitular"]')) : [];
    personalizados.forEach(function (t) { t.style.visibility = 'hidden'; });
    var mostrarTitulares = function () { personalizados.forEach(function (t) { t.style.visibility = ''; }); personalizados = []; };
    setTimeout(mostrarTitulares, 2500);
    fetchPage(launch, who, pagina).then(function (data) {
      if (!data || data.error) return mostrarTitulares();
      rellenarVenta(data);
      mostrarTitulares();
      // GHL a veces pinta algunos bloques de código (secciones de más abajo) después de que AlquimIA haya leído la
      // página: durante 30 s, si aparece un bloque nuevo con códigos de AlquimIA, se rellena también.
      if (window.MutationObserver) {
        var pendiente = null;
        var obs = new MutationObserver(function (cambios) {
          var nuevo = cambios.some(function (c) { return Array.prototype.some.call(c.addedNodes, function (n) { return n.nodeType === 1 && (n.matches('[data-lsd-text],[data-lsd-link],[data-lsd-bonus],[data-lsd-bonus-cerrado],[data-lsd-countdown-bonus],[data-lsd-countdown-boxes-bonus],[data-lsd-caja],[data-lsd-fase-venta],[data-lsd-countdown-carrito],[data-lsd-countdown-boxes-carrito]') || n.querySelector('[data-lsd-text],[data-lsd-link],[data-lsd-bonus],[data-lsd-bonus-cerrado],[data-lsd-countdown-bonus],[data-lsd-countdown-boxes-bonus],[data-lsd-caja],[data-lsd-fase-venta],[data-lsd-countdown-carrito],[data-lsd-countdown-boxes-carrito]')); }); });
          if (!nuevo) return;
          clearTimeout(pendiente);
          pendiente = setTimeout(function () { rellenarVenta(data); }, 150);
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(function () { obs.disconnect(); }, 30000);
      }
      if (data.embeds) { injectCss(); pintarEmbeds(data.embeds); }
      if (!data.ventaBarra) return;
      injectCss();
      barraVenta(data);
    }).catch(function () { mostrarTitulares(); /* sin conexión: sin barra y con el titular de la página */ });
    // Visitas a la página de venta (para «Setting hoy») y a la de pago (= inició el pago).
    if (pagina === 'llamada' || !who || !who.cid || params.get('lsd_preview')) return;
    visitaUnaVez(launch, who.cid, pagina, 10 * 60 * 1000);
  }

  // Fases del carrito en las páginas de venta y de pago (para una barra de urgencia que va cambiando sola):
  //   <div data-lsd-fase-venta="bar">          mientras dura el primer bonus de acción rápida
  //   <div data-lsd-fase-venta="abierto">      plazas abiertas (después del BAR, hasta las últimas 24 h)
  //   <div data-lsd-fase-venta="ultimo-dia">   las últimas 24 h antes del cierre
  //   <div data-lsd-fase-venta="cerrado">      con el carrito ya cerrado
  //   (varias a la vez separadas por espacios: data-lsd-fase-venta="abierto ultimo-dia"). Con «antes» (aún sin abrir)
  //   también. Cuenta atrás al cierre: <span data-lsd-countdown-carrito></span> o <div data-lsd-countdown-boxes-carrito>.
  //   En <html> queda la clase lsd-fase-<fase> por si el diseño cambia de color en cada fase.
  // «bar» = el bonus de acción rápida que está en marcha ahora (el que acaba antes, si hay varios a la vez: p. ej. el
  // BAR en directo y después el de 48 h); si ya no queda ninguno, el último que hubo.
  function barActivo(lista) {
    var orden = (lista || []).slice().sort(function (a, b) { return a.hasta - b.hasta; });
    return orden.filter(function (b) { return serverNow() < b.hasta; })[0] || orden[orden.length - 1];
  }
  var faseTimers = false;
  function faseVentaDe(data) {
    var now = serverNow();
    var c = data.carrito || {};
    var bar = barActivo(data.bonus);
    if (c.cierre && now >= c.cierre) return 'cerrado';
    if (c.apertura && now < c.apertura) return 'antes';
    if (bar && now < bar.hasta) return 'bar';
    if (c.cierre && c.cierre - now <= 24 * 3600000) return 'ultimo-dia';
    return 'abierto';
  }
  function fasesVenta(data) {
    var fase = faseVentaDe(data);
    document.querySelectorAll('[data-lsd-fase-venta]').forEach(function (el) {
      show(el, el.getAttribute('data-lsd-fase-venta').split(/\s+/).indexOf(fase) >= 0);
    });
    var html = document.documentElement;
    html.className = html.className.replace(/\blsd-fase-[a-z-]+\b/g, '').trim() + ' lsd-fase-' + fase;
    var cierre = (data.carrito || {}).cierre;
    var abierto = Boolean(cierre) && serverNow() < cierre;
    document.querySelectorAll('[data-lsd-countdown-carrito]').forEach(function (el) {
      if (!abierto) { el.innerHTML = ''; return; }
      if (!el.querySelector('[data-lsd-cd="' + cierre + '"]')) el.innerHTML = cdSpan(cierre);
    });
    document.querySelectorAll('[data-lsd-countdown-boxes-carrito]').forEach(function (el) {
      if (!abierto) { el.innerHTML = ''; el.removeAttribute('data-lsd-cdb-at'); return; }
      if (Number(el.getAttribute('data-lsd-cdb-at')) === cierre) return;
      el.setAttribute('data-lsd-cdb-at', cierre);
      var unit = function (u, label) { return '<div class="lsd-cdb-unit"><span class="lsd-cdb-num" data-u="' + u + '">00</span><span class="lsd-cdb-label">' + label + '</span></div>'; };
      el.innerHTML = '<div class="lsd-cdb">' + unit('d', 'días') + unit('h', 'horas') + unit('m', 'min') + unit('s', 'seg') + '</div>';
    });
    injectCss();
    startCountdowns();
    if (faseTimers) return;
    faseTimers = true;
    // En cada cambio de fase (abre el carrito, termina el BAR, empiezan las últimas 24 h, cierra), se repinta sola.
    var c = data.carrito || {};
    [c.apertura, c.cierre && c.cierre - 24 * 3600000, c.cierre].concat((data.bonus || []).map(function (b) { return b.hasta; })).forEach(function (t) {
      var ms = t - serverNow();
      if (t && ms > 0 && ms < 2147483000) setTimeout(function () { fasesVenta(data); }, ms + 500);
    });
  }

  // Bonus de acción rápida (BAR) en las páginas de venta y de pago, con el fin puesto en Configuración → Oferta:
  //   <div data-lsd-bonus="bar_48h">…</div>          se ve hasta que termina (y se oculta solo al llegar a cero)
  //   <div data-lsd-bonus-cerrado="bar_48h">…</div>  se ve cuando ya ha terminado
  //   <span data-lsd-countdown-bonus="bar_48h"></span>        cuenta atrás en texto (1 d 23 h 05 min · 5:04:03)
  //   <div data-lsd-countdown-boxes-bonus="bar_48h"></div>    cuenta atrás en cajas (días / horas / min / seg)
  // El tipo es bar_directo, bar_24h o bar_48h; «bar» vale para el primero que haya. Sin ese bonus, se oculta todo.
  var barTimers = false;
  function bonusAccionRapida(lista, texts) {
    var de = function (k) { return k === 'bar' ? barActivo(lista) : lista.filter(function (b) { return b.tipo === k; })[0]; };
    var abierto = function (b) { return Boolean(b) && serverNow() < b.hasta; };
    var pintar = function () {
      // Los textos de «bar» (nombre, fin…) son los del BAR que está en marcha ahora.
      var act = barActivo(lista);
      if (act && texts) ['nombre', 'fin', 'fecha', 'hora'].forEach(function (k) {
        var v = texts[act.tipo + '-' + k];
        if (v != null) document.querySelectorAll('[data-lsd-text="bar-' + k + '"]').forEach(function (t) { t.textContent = v; });
      });
      document.querySelectorAll('[data-lsd-bonus]').forEach(function (el) { show(el, abierto(de(el.getAttribute('data-lsd-bonus')))); });
      document.querySelectorAll('[data-lsd-bonus-cerrado]').forEach(function (el) { var b = de(el.getAttribute('data-lsd-bonus-cerrado')); show(el, Boolean(b) && !abierto(b)); });
      document.querySelectorAll('[data-lsd-countdown-bonus]').forEach(function (el) {
        var b = de(el.getAttribute('data-lsd-countdown-bonus'));
        if (!abierto(b)) { el.innerHTML = ''; show(el, false); return; }
        if (!el.querySelector('[data-lsd-cd="' + b.hasta + '"]')) el.innerHTML = cdSpan(b.hasta);
        show(el, true);
      });
      document.querySelectorAll('[data-lsd-countdown-boxes-bonus]').forEach(function (el) {
        var b = de(el.getAttribute('data-lsd-countdown-boxes-bonus'));
        if (!abierto(b)) { el.innerHTML = ''; el.removeAttribute('data-lsd-cdb-at'); show(el, false); return; }
        show(el, true);
        if (Number(el.getAttribute('data-lsd-cdb-at')) === b.hasta) return;
        el.setAttribute('data-lsd-cdb-at', b.hasta);
        var unit = function (u, label) { return '<div class="lsd-cdb-unit"><span class="lsd-cdb-num" data-u="' + u + '">00</span><span class="lsd-cdb-label">' + label + '</span></div>'; };
        el.innerHTML = '<div class="lsd-cdb">' + unit('d', 'días') + unit('h', 'horas') + unit('m', 'min') + unit('s', 'seg') + '</div>';
      });
    };
    injectCss();
    pintar();
    startCountdowns();
    // Al terminar cada uno, se cambia solo (la sección del bonus se oculta y sale la de «terminado»).
    if (barTimers) return;
    barTimers = true;
    lista.forEach(function (b) {
      var ms = b.hasta - serverNow();
      if (ms > 0 && ms < 2147483000) setTimeout(pintar, ms + 500);
    });
  }

  // Test A/B de una página (GHL reparte el tráfico entre sus variantes): el bloque de la página lleva
  // data-lsd-variante="a|b|…". Se recuerda en el navegador qué variante vio y se apunta su visita; en la página de
  // gracias (registro hecho o compra), su conversión con esa variante. ambito: 'lanz' (ref = código o 'auto') o
  // 'directa' (ref = id del embudo).
  function abClave(ambito, ref) { return ambito === 'lanz' ? 'lsd_ab_lanz' : 'lsd_ab_directa_' + ref; }
  function abVisita(ambito, ref, variante, vid) {
    variante = String(variante || '').trim().toLowerCase();
    if (!/^[a-z0-9]{1,12}$/.test(variante) || params.get('lsd_preview')) return;
    var clave = abClave(ambito, ref);
    var antes = store(clave);
    if (antes && antes.ref === ref && antes.variante === variante && Date.now() - antes.at < 24 * 60 * 60 * 1000) return;
    store(clave, { ref: ref, variante: variante, at: Date.now() });
    post('/api/ab', { op: 'visita', ambito: ambito, ref: ref, variante: variante, v: vid });
  }
  function abConversion(ambito, ref, vid, cid) {
    var clave = abClave(ambito, ref);
    var x = store(clave);
    if (!x || !x.variante || params.get('lsd_preview') || store(clave + '_conv') === x.at) return;
    store(clave + '_conv', x.at);
    post('/api/ab', { op: 'conversion', ambito: ambito, ref: x.ref || ref, variante: x.variante, v: vid, cid: cid || undefined });
  }
  function idVisitante() {
    var vid = store('lsd_vid');
    if (!vid) { vid = 'v' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store('lsd_vid', vid); }
    return vid;
  }

  // Apunta una visita como mucho una vez cada `cadaMs` por navegador, página y lanzamiento: el servidor ya
  // las deduplica, así que recargar la página no gasta otra petición a Cloudflare.
  function visitaUnaVez(launch, cid, pagina, cadaMs) {
    var clave = 'lsd_vis_' + pagina + '_' + launch + '_' + cid;
    var antes = store(clave);
    if (antes && Date.now() - antes < cadaMs) return;
    store(clave, Date.now());
    post('/api/visita', { launch: launch, cid: cid, pagina: pagina });
  }

  function init() {
    // Plan B del directo (botón directo a Zoom pegado en la página de GHL): solo se ve si este script no carga
    // (p. ej. un bloqueo de red a Cloudflare). Si carga, se oculta y todo va como siempre.
    var respaldos = document.querySelectorAll('[data-lsd-respaldo]');
    for (var r = 0; r < respaldos.length; r++) respaldos[r].style.display = 'none';
    var login = document.querySelector('[data-lsd-login]');
    if (login) initLogin(login);
    var venta = document.querySelector('[data-lsd-venta]');
    if (venta) initVenta(venta, 'venta');
    var pago = document.querySelector('[data-lsd-pago]');
    if (pago) initVenta(pago, 'pago');
    // Página de registro: cuenta visitantes únicos (id anónimo del navegador) para la conversión de la página.
    var registro = document.querySelector('[data-lsd-registro]');
    if (registro && !params.get('lsd_preview')) {
      var launchR = params.get('l') || registro.getAttribute('data-launch') || 'auto';
      var vid = store('lsd_vid');
      if (!vid) { vid = 'v' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store('lsd_vid', vid); }
      // El servidor la cuenta una sola vez por navegador y lanzamiento (aunque recargue).
      visitaUnaVez(launchR, vid, 'registro', 24 * 60 * 60 * 1000);
      // Test A/B de la página de registro: <div data-lsd-registro data-lsd-variante="b" …>
      if (registro.getAttribute('data-lsd-variante')) abVisita('lanz', launchR, registro.getAttribute('data-lsd-variante'), vid);
    }
    // Venta directa (low ticket): <div data-lsd-directa="venta|checkout|upsell|downsell|gracias" data-embudo="id">
    // cuenta visitantes únicos de cada página (id anónimo del navegador; una vez al día por página).
    document.querySelectorAll('[data-lsd-directa]').forEach(function (el) {
      if (params.get('lsd_preview')) return;
      var emb = params.get('d') || el.getAttribute('data-embudo') || '';
      var pag = el.getAttribute('data-lsd-directa') || 'venta';
      if (!emb) return;
      var vd = store('lsd_vid');
      if (!vd) { vd = 'v' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store('lsd_vid', vd); }
      // Test A/B de la página de venta (data-lsd-variante en su bloque); la compra se apunta en la de gracias.
      if (pag === 'venta' && el.getAttribute('data-lsd-variante')) abVisita('directa', emb, el.getAttribute('data-lsd-variante'), vd);
      if (pag === 'gracias') abConversion('directa', emb, vd);
      var clave = 'lsd_vd_' + emb + '_' + pag;
      var antes = store(clave);
      if (antes && Date.now() - antes < 24 * 60 * 60 * 1000) return;
      store(clave, Date.now());
      post('/api/directa', { op: 'visita', d: emb, pagina: pag, v: vd });
    });
    // Gracias por agendar la llamada: el vídeo de confirmación y los enlaces.
    var llamada = document.querySelector('[data-lsd-llamada]');
    if (llamada) initVenta(llamada, 'llamada');

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
        // Al login, con la página de vuelta (la grabación, la venta…): al entrar vuelve aquí y no a la preclase.
        if (loginUrl) {
          var aqui = new URL(location.href);
          ['cid', 'email', 'lsd_preview'].forEach(function (k) { aqui.searchParams.delete(k); });
          var dest = new URL(loginUrl, location.href);
          if (kind !== 'recursos' && dest.pathname !== aqui.pathname) dest.searchParams.set('volver', aqui.toString());
          return goTo(dest.toString(), presetEmail ? { email: presetEmail } : null);
        }
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
    // Si la página trae ?cid= (p. ej. la de gracias tras el registro) o el navegador ya la conoce,
    // los enlaces (checkout de la VIP, directo…) llevan su identidad para medir quién compra.
    if (kind === 'registro' || kind === 'publica' || kind === 'gracias') {
      var whoPub = identity();
      // Gracias tras el registro: la conversión del test A/B de la página de registro (si vio una variante).
      if (kind === 'gracias') abConversion('lanz', launchAttr, idVisitante(), whoPub && whoPub.cid);
      fetchPage(launchAttr, whoPub).then(function (d) {
        if (d && !d.error) renderPage(d, whoPub, function () {}, true);
      }).catch(function () { /* sin datos: se queda el texto del diseño */ });
      return;
    }
    var attrLogin = loginAttrEl ? loginAttrEl.getAttribute('data-login') : '';
    if (!managed && launchAttr !== 'auto') return begin(launchAttr, attrLogin);
    // Con el dashboard: primero sabemos qué lanzamiento es (y su URL de login). Si el navegador ya conoce
    // a la lead, la petición va con su identidad y la página la reutiliza (no se pide dos veces).
    var who0 = identity();
    var con = who0 && who0.cid ? { cid: who0.cid } : null;
    fetchPage(launchAttr, con, con ? kind : undefined).then(function (d) {
      if (!d || d.error) return begin(launchAttr, attrLogin);
      if (con) primeraRespuesta = { data: d, cid: con.cid, kind: kind, code: d.code, at: Date.now() };
      // Fechas, cuenta atrás, barra y botones se pintan ya (son públicos), antes de identificarla.
      try { renderPage(d, null, function () {}, true); } catch (e) { /* sigue igual */ }
      begin(d.code, attrLogin || d.links.login);
    }).catch(function () { begin(launchAttr, attrLogin); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Constructores como GHL a veces meten los «códigos personalizados» después de cargar la página: si aparece
  // un bloque del dashboard nuevo (comentarios, votación, música, textos…) y ya tenemos los datos, se pinta también.
  if (window.MutationObserver) {
    var pendiente = null;
    new MutationObserver(function (cambios) {
      var nuevo = cambios.some(function (c) {
        return Array.prototype.some.call(c.addedNodes, function (n) {
          return n.nodeType === 1 && (n.matches('[data-lsd-comentarios],[data-lsd-recursos],[data-lsd-if],[data-lsd-text],[data-lsd-img]') || n.querySelector('[data-lsd-comentarios],[data-lsd-recursos],[data-lsd-if],[data-lsd-text],[data-lsd-img]'));
        });
      });
      if (!nuevo || !ultimaPagina) return;
      clearTimeout(pendiente);
      pendiente = setTimeout(function () { try { renderRecursos(ultimaPagina.data, ultimaPagina.who); } catch (e) { /* nada */ } }, 300);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
