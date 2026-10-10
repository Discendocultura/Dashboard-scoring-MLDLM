import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objetivosDe, ganadoresTexto, PROMPTS_ANUNCIOS, promptMagnific, promptCopys } from '../public/js/anuncios.js';

const ctx = (extra = {}) => ({ objetivo: objetivosDe('lanzamientos')[0], tipoTexto: 'Lanzamiento', nombreEmbudo: 'Octubre', marca: 'MLDLM', datos: ['- Directo el martes'], urls: { 'Página de registro': 'https://a.com/r' }, contexto: 'FICHA', diseno: '- Color principal: #860d0e', ganadores: '', notas: '', ...extra });

test('anuncios: objetivos según el tipo de embudo', () => {
  assert.deepEqual(objetivosDe('lanzamientos').map((o) => o.id), ['captacion', 'consumo', 'venta']);
  assert.deepEqual(objetivosDe('directa').map((o) => o.id), ['venta', 'consumo']);
  assert.ok(objetivosDe('meteorico').every((o) => o.id !== 'captacion'));
  assert.equal(objetivosDe('raro')[0].id, 'captacion');
});

test('anuncios: ganadores por ventas y, si no, por leads', () => {
  const t = ganadoresTexto([
    { label: 'Leads baratos', leads: 300, compras: 0, conversion: 0 },
    { label: 'Vende', leads: 100, compras: 9, conversion: 0.09, spend: 500, cac: 55.5, roas: 4.2 },
    { label: 'Poco', leads: 2, compras: 0, conversion: 0 },
  ]);
  assert.match(t, /más VENDEN:\n- «Vende»: 100 leads, 9 ventas \(9 %\) · inversión 500 € · coste por venta 56 € · ROAS 4,2x/);
  assert.match(t, /más LEADS traen[^\n]*\n- «Leads baratos»: 300 leads/);
  assert.doesNotMatch(t, /«Poco»/); // con menos de 5 leads no cuenta
  assert.equal(ganadoresTexto([]), '');
});

test('anuncios: los prompts llevan objetivo, ficha, estilo, ganadores o su ausencia, y las reglas de Meta', () => {
  for (const p of PROMPTS_ANUNCIOS) {
    const txt = p.fn(ctx());
    assert.match(txt, /Captación al directo/, p.id);
    assert.match(txt, /<marca>\nFICHA\n<\/marca>/, p.id);
    assert.match(txt, /aún no hay histórico/, p.id);
    assert.match(txt, /políticas de Meta/, p.id);
    assert.doesNotMatch(txt, /\n{3,}/, p.id);
  }
  assert.match(promptMagnific(ctx({ ganadores: '- «Vende»' })), /ANUNCIOS GANADORES[\s\S]*«Vende»[\s\S]*simulate_cost[\s\S]*9:16/);
  assert.match(promptCopys(ctx()), /3 TEXTOS PRINCIPALES con emojis/);
  assert.match(PROMPTS_ANUNCIOS[0].fn(ctx()), /PASO 1[\s\S]*PASO 2[\s\S]*PASO 3/);
});
