// El lector de Skool más nuevo, como script (lo carga el marcador «AlquimIA · Skool» desde la página de Miembros de
// Skool; ver public/js/skool-lector.js). Público: es el mismo código que va dentro del marcador, sin datos de nadie.
//   GET /api/skool-lector → define window.__alqLectorNuevo(origen, cliente)
import { _lector } from '../public/js/skool-lector.js';

export function GET() {
  const js = `window.__alqLectorNuevo = ${_lector.toString()};`;
  return new Response(js, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
    },
  });
}
