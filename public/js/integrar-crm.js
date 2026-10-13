// «Añadir cliente» en dos pasos: 1) sus datos, 2) Integrar el CRM (su GHL). Aquí van los textos de la
// ayuda de Meta y la lista de pasos para conectar su GHL, sin DOM, para poder probarlos.
import { CLOUDFLARE_EMAIL } from './embudos-def.js';

// Correo de la agencia con el que el cliente comparte su cuenta publicitaria de Meta.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export const META_EMAIL_AGENCIA = 'enrique.delacierva@gmail.com';

// Lo que se pega en «Cuenta publicitaria de Meta»: solo los dígitos (sin «act_»). Acepta también la URL
// del Administrador de anuncios (…?act=123…) o el ID con espacios y lo deja limpio.
export function limpiarCuentaMeta(v) {
  const s = String(v || '').trim();
  const enUrl = s.match(/[?&]act=(\d+)/);
  return (enUrl ? enUrl[1] : s.replace(/^act_/i, '')).replace(/\D/g, '').slice(0, 30);
}

// Ayuda de la cuenta de Meta: qué poner, dónde encontrarlo y que antes hay que dar acceso a la agencia.
export function ayudaMetaHtml(email = META_EMAIL_AGENCIA) {
  return `<p><strong>Qué poner:</strong> el <strong>identificador de la cuenta publicitaria</strong> del cliente, solo los números (p. ej. <code>1234567890123456</code>, sin <code>act_</code>). Si no hará anuncios, déjalo vacío.</p>
  <p><strong>⚠️ Antes, el cliente tiene que darnos acceso</strong> o el dashboard no podrá leer su inversión:</p>
  <ol>
    <li>El cliente entra en <strong>business.facebook.com → Configuración del negocio → Usuarios → Personas → Añadir</strong>.</li>
    <li>Invita a <strong>${email}</strong> <button type="button" class="btn ghost small" data-copiar="${email}">Copiar</button>.</li>
    <li>En <strong>Activos → Cuentas publicitarias</strong>, marca su cuenta con <strong>control total</strong> (o «Administrar campañas») y envía la invitación. La agencia la acepta desde su correo.</li>
  </ol>
  <p><strong>Dónde encontrar el número:</strong> en <strong>Configuración del negocio → Cuentas → Cuentas publicitarias</strong>, al elegir la cuenta sale debajo del nombre como «Identificador». También está en la dirección del Administrador de anuncios: <code>…?act=<strong>1234567890123456</strong></code>. Puedes pegar esa dirección entera: nos quedamos con el número.</p>`;
}

// Pasos de «Integrar el CRM» para un cliente { id, nombre, locationId }. Cada paso: { id, titulo, html }.
export function pasosIntegrarCrm(c) {
  const variable = `GHL_TOKEN_${String(c.id || '').toUpperCase().replace(/-/g, '_')}`;
  const copiar = (t) => `<button type="button" class="btn ghost small" data-copiar="${t}">Copiar</button>`;
  return { variable, pasos: [
    { id: 'subcuenta', titulo: 'Abre su subcuenta de GHL', html: `Entra en GoHighLevel y cambia a la subcuenta de <strong>${esc(c.nombre)}</strong>. Comprueba en <strong>Ajustes → Información del negocio</strong> que su <strong>Location ID</strong> es <code>${esc(c.locationId)}</code>. Si no coincide, corrígelo en su tarjeta antes de seguir.` },
    { id: 'integracion', titulo: 'Crea la integración privada', html: 'En esa subcuenta: <strong>Ajustes → Integraciones privadas (Private Integrations) → Crear nueva integración</strong>. Nombre: <strong>Dashboard</strong>. Marca estos permisos: <strong>Contactos</strong> (ver y editar), <strong>Custom Values</strong> (ver y editar), <strong>Campos personalizados</strong> (ver), <strong>Etiquetas</strong> (ver), <strong>Conversaciones / mensajes</strong> (enviar), <strong>Calendarios y eventos</strong> y <strong>Oportunidades</strong> (ver y editar).' },
    { id: 'token', titulo: 'Copia el token', html: 'Al crearla, GHL muestra el token <strong>una sola vez</strong>: empieza por <code>pit-</code>. Cópialo. <strong>No lo pegues en ningún chat ni correo</strong>: va directo a Cloudflare en el paso siguiente.' },
    { id: 'cloudflare', titulo: 'Guárdalo en Cloudflare', html: `Entra en <strong>dash.cloudflare.com</strong> con la cuenta de la agencia (<strong>${CLOUDFLARE_EMAIL}</strong>; el cliente no necesita Cloudflare) <strong>→ Workers &amp; Pages →</strong> el proyecto del dashboard <strong>→ Settings → Variables and Secrets → Add</strong>. Tipo <strong>Secret</strong>, nombre <code>${variable}</code> ${copiar(variable)} (exactamente así) y como valor el token. Guarda.` },
    { id: 'desplegar', titulo: 'Vuelve a desplegar', html: 'En el mismo proyecto, pestaña <strong>Deployments</strong>: en el último despliegue pulsa <strong>⋯ → Retry deployment</strong>. Espera 1-2 minutos a que termine (sin esto el dashboard no ve el token nuevo).' },
  ] };
}

// Ante un error de «Comprobar conexión», a qué paso hay que volver (id) y qué revisar.
export function pistaError(error) {
  const e = String(error || '');
  if (/Falta conectar|Faltan GHL_TOKEN/i.test(e)) return { paso: 'desplegar', texto: 'El dashboard todavía no ve el token. Revisa que el nombre de la variable en Cloudflare sea exactamente el del paso 4 y que hiciste «Retry deployment» (paso 5); si acabas de hacerlo, espera un par de minutos y vuelve a comprobar.' };
  if (/rechazado el token|401|403|permis/i.test(e)) return { paso: 'integracion', texto: 'GHL no acepta el token. Suele ser porque se copió mal o faltan permisos: revisa los pasos 2 y 3 (crea otra integración si hace falta), pon el token nuevo en Cloudflare y repite el paso 5.' };
  if (/location|subcuenta|404|not found/i.test(e)) return { paso: 'subcuenta', texto: 'GHL no encuentra la subcuenta: revisa el Location ID del paso 1 (y que el token se creó en esa misma subcuenta).' };
  return { paso: null, texto: 'Revisa los pasos de arriba y vuelve a comprobar. Si sigue fallando, copia este mensaje y pásaselo a quien mantiene el dashboard.' };
}
