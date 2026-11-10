// 📬 Email diario: reglas del calendario (tipos, franjas, lotes, HTML), la IA deja borradores por el conector, solo
// admin aprueba, la tarea de las 20:00 programa en GHL en lotes (o lo simula) y solo está en Discendo.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tipoSugerido, bloqueoDe, sendAtGhl, estimarLotes, decidirProgramacion, htmlEmail, cambiaTexto, conEmailDiario, limpiarConfig, sumarDias } from '../public/js/email-diario.js';
import { promptCowork } from '../public/js/email-diario-panel.js';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DIGEST_KEY: 'clave-larga-de-prueba-123' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
async function call(path, { method = 'GET', body, cookie, cliente } = {}) {
  const res = await route(new Request(`http://localhost${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(cliente ? { 'x-cliente': cliente } : {}), 'content-type': 'text/plain' },
    body: body ? JSON.stringify(body) : undefined,
  }), ENV);
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (password) => {
  const res = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password }) }), ENV);
  return res.headers.get('set-cookie')?.split(';')[0];
};

const ENT = [{ id: 'cronica', name: 'La Crónica', date: '2026-11-20', topic: 'Constantinopla' }, { id: 'vive', name: 'Vive la Historia', date: '' }];

test('tipos automáticos: urgencia a 7 días o menos del cierre, curiosidad de 8 a 21, si no ninguno', () => {
  assert.equal(tipoSugerido(ENT, '2026-11-20'), 'urgencia');
  assert.equal(tipoSugerido(ENT, '2026-11-13'), 'urgencia');
  assert.equal(tipoSugerido(ENT, '2026-11-12'), 'curiosidad');
  assert.equal(tipoSugerido(ENT, '2026-10-30'), 'curiosidad');
  assert.equal(tipoSugerido(ENT, '2026-10-29'), null);
  assert.equal(tipoSugerido(ENT, '2026-11-21'), null); // ya cerró
});

test('franjas, hora de GHL y lotes', () => {
  const bl = [{ id: 'b', label: 'Black Friday', from: '2026-11-16', to: '2026-11-22' }];
  assert.equal(bloqueoDe(bl, '2026-11-16').label, 'Black Friday');
  assert.equal(bloqueoDe(bl, '2026-11-23'), null);
  assert.equal(sendAtGhl('2026-11-11', '09:00'), '2026-11-11 09:00 AM');
  assert.equal(sendAtGhl('2026-11-11', '12:30'), '2026-11-11 12:30 PM');
  assert.equal(sendAtGhl('2026-11-11', '00:15'), '2026-11-11 12:15 AM');
  assert.equal(sendAtGhl('2026-11-11', '18:05'), '2026-11-11 06:05 PM');
  assert.deepEqual(estimarLotes(4200, { tamano: 100, cada: 5 }, '09:00'), { lotes: 42, minutos: 205, fin: '12:25', otroDia: false });
  assert.equal(estimarLotes(30000, { tamano: 100, cada: 5 }, '09:00').otroDia, true);
  // Los lotes siempre tienen un tamaño razonable y la simulación es lo que hay por defecto.
  assert.deepEqual(limpiarConfig({ lotes: { tamano: 999999, cada: 0 } }).lotes, { tamano: 100, cada: 5 });
  assert.equal(limpiarConfig({}).modo, 'simulacion');
});

test('la tarea de las 20:00 solo programa lo aprobado, con todo configurado', () => {
  const config = { audienceTag: 'claves', fromEmail: 'hola@x.com', fromName: 'X', ghlUserId: 'u1' };
  const aprobado = { subject: 'Hola', body: 'Texto', status: 'aprobado' };
  const dec = (emails, extra = {}) => decidirProgramacion({ config, bloqueos: [], emails, ...extra }, '2026-11-11');
  assert.equal(dec({ '2026-11-11': aprobado }).accion, 'programar');
  assert.match(dec({ '2026-11-11': { ...aprobado, status: 'borrador' } }).motivo, /no está aprobado/);
  assert.match(dec({}).motivo, /No hay email/);
  assert.equal(dec({ '2026-11-11': { ...aprobado, skip: true } }).accion, 'nada');
  assert.equal(dec({ '2026-11-11': { ...aprobado, status: 'programado' } }).accion, 'nada');
  assert.equal(dec({ '2026-11-11': aprobado }, { bloqueos: [{ label: 'BF', from: '2026-11-10', to: '2026-11-12' }] }).accion, 'nada');
  assert.match(decidirProgramacion({ config: { ...config, audienceTag: '' }, bloqueos: [], emails: { '2026-11-11': aprobado } }, '2026-11-11').motivo, /etiqueta de audiencia/);
});

test('HTML del email: texto escapado, negrita, enlaces, botón del CTA donde va [CTA] y el pie legal', () => {
  const ctas = [{ id: 'c1', name: 'Entrar a Claves', url: 'https://discendo.com/claves' }];
  const h = htmlEmail({ body: 'Hola <b>Ana</b>,\n\nEsto es **importante**: https://x.com/a.\n\n[CTA]\n\nUn abrazo', cta: 'c1' }, { ctas, pie: 'Discendo · Madrid\n\nDarte de baja', preheader: 'Vista previa' });
  assert.match(h, /Hola &lt;b&gt;Ana&lt;\/b&gt;,/);
  assert.match(h, /<strong>importante<\/strong>/);
  assert.match(h, /<a href="https:\/\/x\.com\/a"/);
  assert.ok(h.indexOf('Entrar a Claves') < h.indexOf('Un abrazo'), 'el botón va donde pone [CTA]');
  assert.match(h, /Discendo · Madrid/);
  assert.match(h, /display:none[^>]*>Vista previa/);
  assert.ok(htmlEmail({ body: 'Uno', cta: 'c1' }, { ctas }).indexOf('Entrar a Claves') > 0, 'sin [CTA], al final');
  assert.equal(cambiaTexto({ subject: 'a', body: 'b' }, { subject: 'a', body: 'b', skip: true }), false);
  assert.equal(cambiaTexto({ subject: 'a' }, { subject: 'b' }), true);
});

test('solo en Discendo, y el prompt de Cowork deja borradores sin aprobar ni enviar', () => {
  assert.equal(conEmailDiario('discendo'), true);
  assert.equal(conEmailDiario('mldlm'), false);
  const p = promptCowork('discendo');
  assert.match(p, /email_diario_contexto» \(cliente: "discendo"\)/);
  assert.match(p, /guardar_borrador_email/);
  assert.match(p, /Nunca apruebes, programes ni envíes nada/);
});

test('recorrido: la IA deja el borrador, admin aprueba, simulación, envío real en lotes y métricas', async () => {
  const admin = await login('admin');
  const setter = await login('setter');
  await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'guardar', cliente: { id: 'discendo', nombre: 'Discendo', locationId: 'RXK123' } } });
  // En otro cliente no existe.
  assert.equal((await call('/api/email-diario', { cookie: setter })).status, 404);
  assert.equal((await call('/api/email-diario', { cookie: admin, cliente: 'discendo' })).status, 200);

  const { runCliente } = await import('../lib/cliente.js');
  const { TOOLS } = await import('../lib/mcp-tools.js');
  const { hoyMadrid } = await import('../lib/email-diario.js');
  const manana = sumarDias(hoyMadrid(), 1);
  const disc = { id: 'discendo', nombre: 'Discendo', locationId: 'RXK123' };
  const tool = (n) => TOOLS.find((t) => t.name === n);
  const enDiscendo = (fn) => runCliente(disc, fn);

  // Ajustes (solo admin): audiencia, remitente, CTA, una fecha límite y una franja bloqueada pasado mañana.
  const ajustes = { config: { audienceTag: 'et-lista-general', fromEmail: 'hola@discendo.com', fromName: 'Discendo', ghlUserId: 'zWx1', pie: 'Pie legal', lotes: { tamano: 50, cada: 3 } },
    ctas: [{ id: 'claves', name: 'Entrar a Claves', url: 'https://discendo.com/claves' }],
    entregables: [{ id: 'cronica', topic: 'Constantinopla', date: sumarDias(manana, 3) }],
    bloqueos: [{ id: 'bf', label: 'Black Friday', from: sumarDias(manana, 1), to: sumarDias(manana, 2) }] };
  assert.equal((await call('/api/email-diario', { method: 'POST', cookie: admin, cliente: 'discendo', body: { op: 'ajustes', ...ajustes } })).status, 200);

  // La IA (Cowork) lee qué toca y deja el borrador.
  const ctx = await enDiscendo(() => tool('email_diario_contexto').run({}, { s: { role: 'admin' } }));
  assert.equal(ctx.dia, manana);
  assert.equal(ctx.puedeRedactar, true);
  assert.equal(ctx.tipo.id, 'urgencia');
  assert.equal(ctx.proximoCierre.tema, 'Constantinopla');
  assert.deepEqual(ctx.ctas.map((c) => c.id), ['claves']);
  const g = await enDiscendo(() => tool('guardar_borrador_email').run({ dia: manana, asunto: 'Quedan 3 días', preheader: 'Constantinopla', cuerpo: 'Hola,\n\n[CTA]\n\nQuique', cta: 'claves', tipo: 'urgencia' }, { s: { role: 'admin' } }));
  assert.equal(g.estado, 'borrador');
  // No escribe en franjas bloqueadas ni días pasados.
  await assert.rejects(enDiscendo(() => tool('guardar_borrador_email').run({ dia: sumarDias(manana, 1), asunto: 'x', cuerpo: 'y' }, { s: { role: 'admin' } })), /franja bloqueada «Black Friday»/);
  await assert.rejects(enDiscendo(() => tool('guardar_borrador_email').run({ dia: hoyMadrid(), asunto: 'x', cuerpo: 'y' }, { s: { role: 'admin' } })), /de mañana en adelante/);

  // Sin aprobar, la tarea de las 20:00 no programa: avisa.
  const t0 = await call(`/api/email-diario?c=discendo&key=${ENV.DIGEST_KEY}&tarea=programar`);
  assert.equal(t0.data.accion, 'aviso');
  assert.equal((await call('/api/email-diario?c=discendo&key=mala-clave-de-prueba&tarea=programar')).status, 401);

  // Admin aprueba (el setter no puede: ni siquiera entra en Discendo).
  assert.notEqual((await call('/api/email-diario', { method: 'POST', cookie: setter, cliente: 'discendo', body: { op: 'aprobar', dia: manana } })).status, 200);
  const ap = await call('/api/email-diario', { method: 'POST', cookie: admin, cliente: 'discendo', body: { op: 'aprobar', dia: manana } });
  assert.equal(ap.data.email.status, 'aprobado');
  // Aprobado, la IA ya no lo pisa.
  await assert.rejects(enDiscendo(() => tool('guardar_borrador_email').run({ dia: manana, asunto: 'Otro', cuerpo: 'Otro' }, { s: { role: 'admin' } })), /ya está aprobado/);

  // Simulación (lo de por defecto): apunta lo que haría, en lotes, sin tocar GHL.
  const { campanasEmail } = await import('../lib/mock.js');
  const t1 = await call(`/api/email-diario?c=discendo&key=${ENV.DIGEST_KEY}&tarea=programar`);
  assert.equal(t1.data.accion, 'simulacion');
  assert.match(t1.data.resumen, /en lotes de 50 cada 3 min \(\d+ lotes?: termina hacia las \d\d:\d\d/);
  assert.equal(campanasEmail.size, 0);

  // Si se cambia el texto después de aprobarlo, vuelve a borrador.
  const ed = await call('/api/email-diario', { method: 'POST', cookie: admin, cliente: 'discendo', body: { op: 'email', dia: manana, email: { subject: 'Quedan 3 días para entrar', body: 'Hola,\n\n[CTA]\n\nQuique', cta: 'claves', type: 'urgencia' } } });
  assert.equal(ed.data.email.status, 'borrador');
  await call('/api/email-diario', { method: 'POST', cookie: admin, cliente: 'discendo', body: { op: 'aprobar', dia: manana } });

  // Envío real: crea la campaña con el HTML del calendario y la programa en lotes a la etiqueta.
  await call('/api/email-diario', { method: 'POST', cookie: admin, cliente: 'discendo', body: { op: 'ajustes', config: { modo: 'real' } } });
  const t2 = await call(`/api/email-diario?c=discendo&key=${ENV.DIGEST_KEY}&tarea=programar`);
  assert.equal(t2.data.accion, 'programado', JSON.stringify(t2.data));
  const camp = campanasEmail.get(t2.data.campana);
  assert.equal(camp.status, 'scheduled');
  assert.match(camp.html, /Entrar a Claves/);
  assert.match(camp.html, /Pie legal/);
  assert.equal(camp.programa.scheduleType, 'batch');
  assert.deepEqual(camp.programa.scheduleConfig.batch, { batchSize: 50, interval: 3, intervalUnit: 'minutes' });
  assert.equal(camp.programa.scheduleConfig.sendAt, `${manana} 09:00 AM`);
  assert.deepEqual(camp.programa.recipients, { type: 'tag', tagIds: ['tag-et-lista-general'], freezeList: true });
  assert.equal(camp.programa.emailMeta.subject, 'Quedan 3 días para entrar');
  // Programado ya no se toca, y la tarea no lo duplica.
  assert.equal((await call('/api/email-diario', { method: 'POST', cookie: admin, cliente: 'discendo', body: { op: 'email', dia: manana, email: { subject: 'x' } } })).status, 409);
  assert.equal((await call(`/api/email-diario?c=discendo&key=${ENV.DIGEST_KEY}&tarea=programar`)).data.accion, 'nada');
  assert.equal(campanasEmail.size, 1);

  // Registro y, cuando ya ha salido, las métricas de GHL.
  const mes = (await call(`/api/email-diario?mes=${manana.slice(0, 7)}`, { cookie: admin, cliente: 'discendo' })).data;
  assert.deepEqual(mes.registro.slice(0, 2).map((r) => r.accion), ['sin envío', 'programado']);
  const { actualizarMetricas } = await import('../lib/email-diario.js');
  const r = await enDiscendo(() => actualizarMetricas({ ahora: new Date(Date.parse(`${manana}T12:00:00Z`)) }));
  assert.equal(r.actualizados, 1);
  const dmes = (await call(`/api/email-diario?mes=${manana.slice(0, 7)}`, { cookie: admin, cliente: 'discendo' })).data;
  assert.equal(dmes.emails[manana].status, 'enviado');
  assert.equal(dmes.emails[manana].m.entregados, 1221);
});
