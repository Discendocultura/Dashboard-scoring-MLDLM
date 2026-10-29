import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeConfig } from '../lib/config-store.js';

test('pantalla de espera: entra al directo unos minutos antes (5 por defecto, de 0 a 30)', () => {
  const l = (espera) => sanitizeConfig({ launches: { lx: { name: 'X', registroTag: 'reg-x', ...(espera ? { espera } : {}) } } }).launches.lx.espera;
  assert.equal(l().antesMin, 5);
  assert.equal(l({ activa: true, antesMin: '' }).antesMin, 5);
  assert.equal(l({ activa: true, antesMin: '0' }).antesMin, 0);
  assert.equal(l({ activa: true, antesMin: 10 }).antesMin, 10);
  assert.equal(l({ activa: true, antesMin: 90 }).antesMin, 30);
  assert.equal(l({ activa: true, antesMin: -3 }).antesMin, 0);
});

test('pantalla de espera: la cuenta atrás del navegador acaba esos minutos antes de la hora', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../public/tracker.js', import.meta.url), 'utf8');
  const cuerpo = /function esperaDirecto\(data\) \{([\s\S]*?)\n  \}/.exec(src)[1];
  const esperaDirecto = new Function('data', 'var ESPERA_MIN = 59;' + cuerpo);
  const hora = Date.parse('2026-11-03T18:00:00Z');
  const data = (antesMin) => ({ phase: 'dia_directo', countdownTo: hora, links: { directo: 'https://x/directo' }, espera: { activa: true, antesMin } });
  assert.equal(esperaDirecto(data(5)).at, hora - 5 * 60000);
  assert.equal(esperaDirecto(data(5)).desde, hora - 59 * 60000);
  assert.equal(esperaDirecto(data(0)).at, hora);
  assert.equal(esperaDirecto({ ...data(5), espera: { activa: true } }).at, hora, 'servidor antiguo sin el dato: a la hora');
});

test('pantalla de espera: en lanzamientos de varios directos, solo en los elegidos (sin lista, en todos)', async () => {
  const l = (espera) => sanitizeConfig({ launches: { lx: { name: 'X', registroTag: 'reg-x', espera } } }).launches.lx.espera;
  assert.equal(l({ activa: true }).directos, undefined);
  assert.deepEqual(l({ activa: true, directos: ['3', 1, 1, 9, 'x'] }).directos, [1, 3]);
  const src = (await import('node:fs')).readFileSync(new URL('../public/tracker.js', import.meta.url), 'utf8');
  const esperaDirecto = new Function('data', 'var ESPERA_MIN = 59;' + /function esperaDirecto\(data\) \{([\s\S]*?)\n  \}/.exec(src)[1]);
  const hora = Date.parse('2026-11-04T18:00:00Z');
  const links = { directo: 'https://x/d1', directo2: 'https://x/d2', directo3: 'https://x/d3' };
  const dia = (phase, directos) => esperaDirecto({ phase, countdownTo: hora, links, espera: { activa: true, antesMin: 5, ...(directos ? { directos } : {}) } });
  assert.equal(dia('dia_directo').key, 'directo');
  assert.equal(dia('dia_directo2').key, 'directo2');
  assert.equal(dia('dia_directo3').key, 'directo3');
  assert.equal(dia('dia_directo', [2, 3]), null);
  assert.equal(dia('dia_directo2', [2, 3]).key, 'directo2');
  assert.equal(dia('dia_directo3', [1]), null);
});
