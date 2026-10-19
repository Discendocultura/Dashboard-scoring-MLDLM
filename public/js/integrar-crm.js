// «Añadir cliente» por etapas: 1) sus datos, 2) CRM (GHL), 3) Meta, 4) Zoom, 5) SendFlow. En Meta, Zoom y SendFlow
// primero se elige qué usa el cliente (lo de la agencia, uno propio o nada) y solo si es propio hay pasos.
// Aquí van los textos y los pasos (sin DOM, para poder probarlos). Cada paso: { id, titulo, donde, html, campo? }.
import { CLOUDFLARE_EMAIL } from './embudos-def.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// Correo de la agencia con el que el cliente comparte su cuenta publicitaria de Meta.
export const META_EMAIL_AGENCIA = 'enrique.delacierva@gmail.com';
const sufijo = (id) => String(id || '').toUpperCase().replace(/-/g, '_');

// Lo que se pega en «Cuenta publicitaria de Meta»: solo los dígitos (sin «act_»). Acepta también la URL
// del Administrador de anuncios (…?act=123…) o el ID con espacios y lo deja limpio.
export function limpiarCuentaMeta(v) {
  const s = String(v || '').trim();
  const enUrl = s.match(/[?&]act=(\d+)/);
  return (enUrl ? enUrl[1] : s.replace(/^act_/i, '')).replace(/\D/g, '').slice(0, 30);
}

// ---------- Piezas visuales de los pasos ----------
// Ruta de menús: «Ajustes › Integraciones privadas» como chips.
export const ruta = (...partes) => `<span class="g-ruta">${partes.map((p) => `<b>${p}</b>`).join('<i aria-hidden="true">›</i>')}</span>`;
const copiar = (valor, txt = 'Copiar') => `<button type="button" class="g-copiar" data-copiar="${esc(valor)}" data-copiar-txt="${esc(txt)}">${esc(txt)}</button>`;
// Un valor para copiar tal cual (nombre de variable, permiso…): se ve en grande con su botón.
const valor = (v) => `<span class="g-valor"><code>${esc(v)}</code>${copiar(v)}</span>`;
const lista = (items) => `<ol class="g-lista">${items.map((x) => `<li>${x}</li>`).join('')}</ol>`;
const aviso = (t) => `<p class="g-aviso">⚠️ ${t}</p>`;
const ok = (t) => `<p class="g-ok">✅ ${t}</p>`;

// Pasos comunes de Cloudflare: guardar uno o varios secretos y volver a desplegar.
function pasosCloudflare(prefijo, variables, extra = '') {
  return [
    { id: `${prefijo}cloudflare`, titulo: variables.length > 1 ? 'Guárdalos en Cloudflare' : 'Guárdalo en Cloudflare', donde: 'Cloudflare',
      html: lista([
        `Entra en <a href="https://dash.cloudflare.com" target="_blank" rel="noopener">dash.cloudflare.com</a> con la cuenta de la agencia (<b>${CLOUDFLARE_EMAIL}</b>). El cliente no necesita Cloudflare.`,
        `Ve a ${ruta('Workers &amp; Pages', 'el proyecto de AlquimIA', 'Settings', 'Variables and Secrets')} y pulsa <b>Add</b>.`,
        `Tipo: <b>Secret</b>. ${variables.length > 1 ? 'Añade una por una, con estos nombres <b>exactos</b>:' : 'Nombre <b>exacto</b>:'}${variables.map((v) => valor(v)).join('')}`,
        'Como valor, pega lo que copiaste (sin espacios delante ni detrás) y pulsa <b>Save</b>.',
      ]) + extra },
    { id: `${prefijo}desplegar`, titulo: 'Vuelve a desplegar', donde: 'Cloudflare',
      html: lista([
        `En el mismo proyecto: ${ruta('Deployments')}.`,
        'En el último despliegue pulsa <b>⋯</b> → <b>Retry deployment</b>.',
        'Espera 1-2 minutos a que termine. Sin esto AlquimIA no ve lo nuevo.',
      ]) },
  ];
}

// ---------- CRM (GHL): siempre el suyo ----------
export function pasosIntegrarCrm(c) {
  const variable = `GHL_TOKEN_${sufijo(c.id)}`;
  const permisos = ['Contactos (ver y editar)', 'Custom Values (ver y editar)', 'Campos personalizados (ver)', 'Etiquetas (ver)', 'Conversaciones / mensajes (enviar)', 'Calendarios y eventos (ver y editar)', 'Oportunidades (ver y editar)'];
  return { variable, pasos: [
    { id: 'subcuenta', titulo: 'Abre su subcuenta de GHL', donde: 'GoHighLevel',
      html: lista([
        `Entra en GoHighLevel y cambia a la subcuenta de <b>${esc(c.nombre)}</b>.`,
        `Abre ${ruta('Ajustes', 'Información del negocio')} y comprueba que su <b>Location ID</b> es <code>${esc(c.locationId)}</code>.`,
        'Si no coincide, corrígelo en su tarjeta antes de seguir.',
      ]) },
    { id: 'integracion', titulo: 'Crea la integración privada', donde: 'GoHighLevel',
      html: lista([
        `En esa subcuenta: ${ruta('Ajustes', 'Integraciones privadas', 'Crear nueva integración')}.`,
        'Nombre: <b>AlquimIA</b>.',
        `Marca estos permisos:<span class="g-chips">${permisos.map((p) => `<span>${p}</span>`).join('')}</span>`,
        'Pulsa <b>Crear</b>.',
      ]) },
    { id: 'token', titulo: 'Copia el token', donde: 'GoHighLevel',
      html: lista([
        'GHL enseña el token <b>una sola vez</b>: empieza por <code>pit-</code>.',
        'Pulsa <b>Copiar</b> y no cierres la ventana hasta guardarlo en Cloudflare.',
      ]) + aviso('No lo pegues en ningún chat ni correo: va directo a Cloudflare en el paso siguiente. Si lo pierdes, crea otra integración.') },
    ...pasosCloudflare('', [variable]),
  ] };
}

// Ante un error de «Comprobar conexión» del CRM, a qué paso volver (id) y qué revisar.
export function pistaError(error) {
  const e = String(error || '');
  if (/Falta conectar|Faltan GHL_TOKEN/i.test(e)) return { paso: 'desplegar', texto: 'AlquimIA todavía no ve el token. Revisa que el nombre de la variable en Cloudflare sea exactamente el del paso 4 y que hiciste «Retry deployment» (paso 5); si acabas de hacerlo, espera un par de minutos y vuelve a comprobar.' };
  if (/rechazado el token|401|403|permis/i.test(e)) return { paso: 'integracion', texto: 'GHL no acepta el token. Suele ser porque se copió mal o faltan permisos: revisa los pasos 2 y 3 (crea otra integración si hace falta), pon el token nuevo en Cloudflare y repite el paso 5.' };
  if (/location|subcuenta|404|not found/i.test(e)) return { paso: 'subcuenta', texto: 'GHL no encuentra la subcuenta: revisa el Location ID del paso 1 (y que el token se creó en esa misma subcuenta).' };
  return { paso: null, texto: 'Revisa los pasos de arriba y vuelve a comprobar. Si sigue fallando, copia este mensaje y pásaselo a quien mantiene AlquimIA.' };
}

// ---------- Meta ----------
// Mensaje para el cliente (WhatsApp o email): que comparta su cuenta publicitaria con la agencia.
export function mensajeClienteMeta(nombre = '', email = META_EMAIL_AGENCIA) {
  return `Hola${nombre ? ` ${nombre}` : ''}: para llevar tus anuncios y ver sus resultados en AlquimIA necesitamos acceso a tu cuenta publicitaria de Meta. Son 2 minutos:

1. Entra en business.facebook.com → Configuración del negocio.
2. Ve a Usuarios → Personas → Añadir y escribe: ${email}
3. En «Asignar activos», elige Cuentas publicitarias → tu cuenta → activa «Control total» (o «Administrar campañas»).
4. Pulsa «Invitar».

Después, pásanos el identificador de tu cuenta publicitaria: es el número que sale debajo de su nombre en Configuración del negocio → Cuentas → Cuentas publicitarias.

¡Gracias!`;
}

// Ayuda corta del número de la cuenta (tarjeta del cliente).
export function ayudaMetaHtml(email = META_EMAIL_AGENCIA) {
  return `<p><strong>Qué poner:</strong> el <strong>identificador de la cuenta publicitaria</strong> del cliente, solo los números (p. ej. <code>1234567890123456</code>, sin <code>act_</code>). Si no hará anuncios, déjalo vacío.</p>
  <p><strong>⚠️ Antes, el cliente tiene que darnos acceso</strong> o AlquimIA no podrá leer su inversión:</p>
  <ol>
    <li>El cliente entra en <strong>business.facebook.com → Configuración del negocio → Usuarios → Personas → Añadir</strong>.</li>
    <li>Invita a <strong>${email}</strong> <button type="button" class="btn ghost small" data-copiar="${email}">Copiar</button>.</li>
    <li>En <strong>Activos → Cuentas publicitarias</strong>, marca su cuenta con <strong>control total</strong> (o «Administrar campañas») y envía la invitación. La agencia la acepta desde su correo.</li>
  </ol>
  <p><button type="button" class="btn small" data-copiar="${esc(mensajeClienteMeta('', email))}" data-copiar-txt="📋 Copiar mensaje para el cliente">📋 Copiar mensaje para el cliente</button> <small class="muted">Con estos pasos, listo para pegar en WhatsApp o en un email.</small></p>
  <p><strong>Dónde encontrar el número:</strong> en <strong>Configuración del negocio → Cuentas → Cuentas publicitarias</strong>, al elegir la cuenta sale debajo del nombre como «Identificador». También está en la dirección del Administrador de anuncios: <code>…?act=<strong>1234567890123456</strong></code>. Puedes pegar esa dirección entera: nos quedamos con el número.</p>`;
}

const pasoCuentaMeta = { id: 'meta-cuenta', titulo: 'Pon el número de su cuenta publicitaria', donde: 'Dashboard', campo: true,
  html: lista([
    `Es el <b>identificador de la cuenta publicitaria</b> (solo números, sin <code>act_</code>). Lo ves en ${ruta('Configuración del negocio', 'Cuentas', 'Cuentas publicitarias')}, debajo de su nombre.`,
    'También puedes pegar la dirección del Administrador de anuncios (<code>…?act=123…</code>): nos quedamos con el número.',
    'No sirve el ID del negocio ni el de la página.',
  ]) };

// modo 'agencia': la cuenta está en el portfolio de la agencia (o se le comparte) y usa el token de la agencia.
// modo 'propio': el cliente tiene su portfolio (como Discendo): su app, su usuario del sistema y su token.
export function pasosMeta(c, modo = 'agencia', email = META_EMAIL_AGENCIA) {
  if (modo === 'propio') {
    return [
      { id: 'meta-app', titulo: 'Una app en el portfolio del cliente', donde: 'Meta',
        html: lista([
          `En <a href="https://business.facebook.com" target="_blank" rel="noopener">business.facebook.com</a> cambia (arriba a la izquierda) al portfolio de <b>${esc(c.nombre)}</b> y abre ${ruta('Configuración del negocio', 'Cuentas', 'Apps')}.`,
          '<b>Si ya hay una app</b>, usa esa: pasa al paso siguiente.',
          `<b>Si no hay ninguna</b>: <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com</a> → ${ruta('Mis apps', 'Crear app')} → caso de uso <b>Otro</b> → tipo <b>Empresa</b> → nombre «AlquimIA ${esc(c.nombre)}» → en <b>Portfolio empresarial</b> elige el del cliente → <b>Crear app</b>.`,
          'Dentro de la app: <b>Añadir productos</b> → <b>Marketing API</b>.',
        ]) },
      { id: 'meta-usuario', titulo: 'Un usuario del sistema en su portfolio', donde: 'Meta',
        html: lista([
          `En el portfolio del cliente: ${ruta('Configuración del negocio', 'Usuarios', 'Usuarios del sistema')}.`,
          'Si no hay ninguno: <b>Añadir</b> → nombre «AlquimIA» → rol <b>Administrador</b> → Crear.',
        ]) },
      { id: 'meta-activos', titulo: 'Dale la app y la cuenta publicitaria', donde: 'Meta',
        html: lista([
          'En ese usuario del sistema pulsa <b>Asignar activos</b>.',
          `${ruta('Apps')} → la app del paso 1 → <b>Administrar app</b> → Guardar.`,
          `${ruta('Cuentas publicitarias')} → su cuenta → <b>Ver rendimiento</b> → Guardar.`,
        ]) },
      { id: 'meta-token', titulo: 'Genera el token', donde: 'Meta',
        html: lista([
          'En el mismo usuario del sistema: <b>Generar nuevo token</b>.',
          'App: <b>la del paso 1</b>.',
          'Caducidad: <b>Nunca</b>.',
          `Permiso: ${valor('ads_read')}`,
          'Pulsa <b>Generar token</b> y <b>cópialo</b>.',
        ]) + aviso('No lo pegues en ningún chat: va directo a Cloudflare.') },
      ...pasosCloudflare('meta-', [`META_ACCESS_TOKEN_${sufijo(c.id)}`]),
      pasoCuentaMeta,
    ];
  }
  return [
    { id: 'meta-pedir', titulo: 'Que la cuenta llegue al portfolio de la agencia', donde: 'Meta',
      html: `${ok('Si la cuenta publicitaria ya está en el portfolio de la agencia, este paso ya está hecho.')}
        <p>Si es del cliente, tiene que compartirla con la agencia. Envíale el mensaje con los pasos: ${copiar(mensajeClienteMeta(c.nombre, email), '📋 Copiar mensaje')}</p>
        ${lista([`Le pedimos que invite a <b>${esc(email)}</b> con su cuenta publicitaria en <b>control total</b>.`, `Llega un correo de Meta a <b>${esc(email)}</b>: ábrelo y pulsa <b>Aceptar invitación</b>.`])}` },
    { id: 'meta-asignar', titulo: 'Asígnala al usuario del sistema de la agencia', donde: 'Meta',
      html: lista([
        `En <a href="https://business.facebook.com" target="_blank" rel="noopener">business.facebook.com</a>, en el portfolio <b>de la agencia</b>: ${ruta('Configuración del negocio', 'Usuarios', 'Usuarios del sistema')}.`,
        'Abre el usuario del sistema de AlquimIA → <b>Asignar activos</b>.',
        `${ruta('Cuentas publicitarias')} → la cuenta del cliente → <b>Ver rendimiento</b> → Guardar.`,
      ]) + aviso('Si la cuenta no aparece en la lista, es que está en otro portfolio: elige arriba «Portfolio propio del cliente».') },
    pasoCuentaMeta,
  ];
}

// ---------- Zoom ----------
export const SCOPES_ZOOM = ['meeting:write:registrant:admin', 'meeting:read:list_registrants:admin', 'report:read:list_meeting_participants:admin', 'meeting:read:meeting:admin', 'meeting:write:meeting:admin', 'meeting:delete:meeting:admin'];
export function pasosZoom(c) {
  const s = sufijo(c.id);
  return [
    { id: 'zoom-cuenta', titulo: 'Entra en el Marketplace de Zoom', donde: 'Zoom',
      html: lista([
        'Necesitas una cuenta de Zoom <b>Pro o superior</b> del cliente.',
        `Entra en <a href="https://marketplace.zoom.us" target="_blank" rel="noopener">marketplace.zoom.us</a> con el usuario <b>propietario o administrador</b> de esa cuenta.`,
      ]) + aviso(`Si en el paso 2 no ves «Server-to-Server OAuth»: en zoom.us → ${ruta('Admin', 'Gestión de usuarios', 'Roles', 'Owner / Admin', 'Funciones avanzadas')} activa «Server-to-Server OAuth app».`) },
    { id: 'zoom-crear', titulo: 'Crea la app Server-to-Server', donde: 'Zoom',
      html: lista([
        `Arriba a la derecha: ${ruta('Develop', 'Build App')}.`,
        'Elige <b>Server-to-Server OAuth App</b> → <b>Create</b>.',
        `Nombre: <b>AlquimIA ${esc(c.nombre)}</b> → <b>Create</b>.`,
      ]) },
    { id: 'zoom-credenciales', titulo: 'Localiza las 3 credenciales', donde: 'Zoom',
      html: lista([
        'Se abre la pestaña <b>App Credentials</b> con: <b>Account ID</b>, <b>Client ID</b> y <b>Client Secret</b>.',
        '<b>Deja esta pestaña abierta</b>: las copiarás una a una en el paso 7.',
        'No las confundas: el Account ID y el Client ID son distintos.',
      ]) + aviso('No las pegues en ningún chat.') },
    { id: 'zoom-info', titulo: 'Rellena la información', donde: 'Zoom',
      html: lista([
        'Pestaña <b>Information</b>: rellena <b>Company Name</b>, <b>Developer Contact Name</b> y <b>Developer Contact Email</b> (son obligatorios) → <b>Continue</b>.',
        'Pestaña <b>Feature</b>: no toques nada → <b>Continue</b>.',
      ]) },
    { id: 'zoom-scopes', titulo: 'Añade los 6 permisos (scopes)', donde: 'Zoom',
      html: lista([
        'Pestaña <b>Scopes</b> → <b>Add Scopes</b>.',
        `Busca cada uno en el buscador (pulsa «Copiar» y pégalo) y márcalo:<span class="g-valores">${SCOPES_ZOOM.map((x) => valor(x)).join('')}</span>`,
        'Pulsa <b>Done</b> → <b>Continue</b>.',
      ]) },
    { id: 'zoom-activar', titulo: 'Actívala', donde: 'Zoom',
      html: lista([
        'Pestaña <b>Activation</b> → <b>Activate your app</b>.',
        'Debe decir que la app está activada.',
        'Si te dice que falta información, vuelve a <b>Information</b>, complétala y activa otra vez.',
      ]) },
    ...pasosCloudflare('zoom-', [`ZOOM_ACCOUNT_ID_${s}`, `ZOOM_CLIENT_ID_${s}`, `ZOOM_CLIENT_SECRET_${s}`],
      `<p class="g-nota">Cada una con su valor de <b>App Credentials</b>: Account ID → <code>ZOOM_ACCOUNT_ID_${s}</code>, Client ID → <code>ZOOM_CLIENT_ID_${s}</code>, Client Secret → <code>ZOOM_CLIENT_SECRET_${s}</code>. Si quien hace los directos no es el propietario de la cuenta, añade también <code>ZOOM_HOST_EMAIL_${s}</code> con su email.</p>`),
  ];
}

// ---------- SendFlow ----------
export function pasosSendflow(c) {
  return [
    { id: 'sf-entrar', titulo: 'Entra en su SendFlow', donde: 'SendFlow',
      html: lista([
        `Entra en <a href="https://sendflow.pro" target="_blank" rel="noopener">sendflow.pro</a> con la cuenta de <b>${esc(c.nombre)}</b>.`,
        'Su plan tiene que incluir <b>SendAPI</b>: si en el menú no aparece <b>API Keys</b>, hay que subir de plan.',
      ]) },
    { id: 'sf-clave', titulo: 'Crea la clave de la API', donde: 'SendFlow',
      html: lista([
        `En el menú: ${ruta('API Keys')} → <b>Crear nueva clave</b>.`,
        'Nombre: <b>AlquimIA</b> → crear.',
        'Copia la clave <b>entera</b>: empieza por <code>send_api-</code>.',
      ]) + aviso('Sin espacios ni comillas, y no la pegues en ningún chat.') },
    ...pasosCloudflare('sf-', [`SENDFLOW_API_KEY_${sufijo(c.id)}`]),
  ];
}

// ---------- Qué usa cada cliente ----------
export const SERVICIOS = {
  crm: { icono: '🔌', titulo: 'CRM (GHL)', corto: 'CRM' },
  meta: { icono: '📣', titulo: 'Meta Ads', corto: 'Meta', opciones: [
    { id: 'agencia', icono: '🏢', titulo: 'Cuenta en el portfolio de la agencia', texto: 'La cuenta publicitaria está en el portfolio de la agencia, o el cliente la comparte con él. Se usa el token de la agencia: solo hay que asignarla.' },
    { id: 'propio', icono: '🏠', titulo: 'Portfolio propio del cliente', texto: 'La cuenta está en el portfolio del cliente (como Discendo): app, usuario del sistema y token propios. 7 pasos.' },
    { id: 'ninguno', icono: '🚫', titulo: 'No hará anuncios', texto: 'Se puede conectar más adelante desde su tarjeta.' },
  ] },
  zoom: { icono: '🎥', titulo: 'Zoom', corto: 'Zoom', opciones: [
    { id: 'agencia', icono: '🏢', titulo: 'El Zoom de la agencia', texto: 'Los directos se crean en la cuenta de Zoom de la agencia. No hay que crear nada.' },
    { id: 'propio', icono: '🎥', titulo: 'Zoom propio del cliente', texto: 'Su propia cuenta de Zoom (Pro): se crea una app en 8 pasos.' },
    { id: 'ninguno', icono: '🚫', titulo: 'No usa Zoom', texto: 'Por ejemplo, si solo tiene VSL o directos fuera de Zoom.' },
  ] },
  sendflow: { icono: '💬', titulo: 'SendFlow (grupos de WhatsApp)', corto: 'SendFlow', opciones: [
    { id: 'agencia', icono: '🏢', titulo: 'El SendFlow de la agencia', texto: 'Sus grupos van en la cuenta de SendFlow de la agencia. No hay que crear nada.' },
    { id: 'propio', icono: '💬', titulo: 'SendFlow propio del cliente', texto: 'Su propia cuenta de SendFlow (con SendAPI): una clave en 4 pasos.' },
    { id: 'ninguno', icono: '🚫', titulo: 'No usa SendFlow', texto: 'Sin grupos de WhatsApp en AlquimIA.' },
  ] },
};
export const ETAPAS = ['crm', 'meta', 'zoom', 'sendflow'];

// Los pasos de una etapa según lo elegido (sin pasos: lo de la agencia o nada, salvo Meta de la agencia).
export function pasosDe(servicio, modo, c) {
  if (servicio === 'crm') return pasosIntegrarCrm(c).pasos;
  if (servicio === 'meta') return modo === 'ninguno' || !modo ? [] : pasosMeta(c, modo);
  if (modo !== 'propio') return [];
  return servicio === 'zoom' ? pasosZoom(c) : pasosSendflow(c);
}
