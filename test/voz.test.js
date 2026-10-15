import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recogerVoz, bloqueVoz, bloqueRevision, bloqueAprendizajes, afilar, sanitizeAprendizajes, NUNCA_DIGAS } from '../public/js/voz.js';

const encuesta = { preguntas: [
  { p: { id: 'q1', name: '¿Qué es lo que más te preocupa?', tipo: 'texto' }, libres: [
    { texto: 'No tener leche suficiente', compra: true }, { texto: 'no tener leche suficiente', compra: false },
    { texto: 'Escríbeme a ana@x.com o al 600 123 456', compra: false }, { texto: 'x', compra: false },
  ] },
  { p: { id: 'q2', name: 'Edad', tipo: 'edad' }, libres: [] },
] };

test('voz: frases literales agrupadas, anónimas y las de quien compró primero', () => {
  const v = recogerVoz({ encuesta, comentarios: [{ texto: 'Me ha encantado la clase de hoy, por fin entiendo el agarre' }, { texto: 'oculto', oculto: true }], motivos: [['Precio', 3], ['No es el momento', 1]] });
  assert.equal(v.preguntas.length, 1);
  assert.equal(v.preguntas[0].frases[0].n, 2);
  assert.equal(v.preguntas[0].frases[0].compras, 1);
  const txt = bloqueVoz(v, { origen: 'de «Octubre»' });
  assert.match(txt, /LA VOZ REAL DE SU PÚBLICO \(de «Octubre»\)/);
  assert.match(txt, /No tener leche suficiente \(×2\) \[COMPRÓ\]/);
  assert.doesNotMatch(txt, /ana@x\.com|600 123 456/);
  assert.match(txt, /\[email\]/);
  assert.match(txt, /por fin entiendo el agarre/);
  assert.match(txt, /Precio \(3\)/);
  assert.equal(bloqueVoz(recogerVoz({})), '');
});

test('revisión: lista por canal y lo que nunca debe decir', () => {
  for (const canal of ['whatsapp', 'email', 'anuncios', 'pagina']) {
    const r = bloqueRevision(canal);
    assert.match(r, /ANTES DE ENTREGAR/);
    assert.match(r, /Nada inventado/);
    for (const w of NUNCA_DIGAS.slice(0, 3)) assert.ok(r.includes(w));
  }
  assert.match(bloqueRevision('email'), /3 alternativas/);
  assert.equal(bloqueRevision('otro'), '');
});

test('qué funcionó: se guarda limpio y entra en el prompt del canal', () => {
  assert.equal(sanitizeAprendizajes({}), null);
  const a = sanitizeAprendizajes({ angulo: ' El miedo a no tener leche ', email: 'Asunto «La toma de las 3 a. m.»', anuncio: 'Vídeo selfie', nofunciono: 'Emails largos', raro: 'x' });
  assert.equal(a.angulo, 'El miedo a no tener leche');
  assert.equal(a.raro, undefined);
  const b = bloqueAprendizajes([{ nombre: 'Septiembre', aprendizajes: a }], 'email');
  assert.match(b, /LO QUE FUNCIONÓ/);
  assert.match(b, /La toma de las 3 a\. m\./);
  assert.doesNotMatch(b, /Vídeo selfie/); // el anuncio no va en el prompt de emails
  assert.match(bloqueAprendizajes([{ nombre: 'S', aprendizajes: a }], 'anuncios'), /Vídeo selfie/);
  const p = afilar('PROMPT BASE', { canal: 'whatsapp', voz: 'VOZ', aprendizajes: b });
  assert.ok(p.indexOf('VOZ') < p.indexOf('LO QUE FUNCIONÓ') && p.indexOf('LO QUE FUNCIONÓ') < p.indexOf('ANTES DE ENTREGAR'));
});
