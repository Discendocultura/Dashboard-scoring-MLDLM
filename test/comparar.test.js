import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indicadoresLanzamiento, mediaIndicadores, alertas, diferencias, ultimosMeses, indicadoresVsl } from '../public/js/comparar.js';
import { prevision } from '../public/js/calculadora.js';

const m = (total, compra, inversion, vip = 0, clase1 = 0) => ({ total, compra, vip, clase1, eco: { inversion, facturacion: compra * 1000, facturacionPrograma: compra * 1000 } });

test('comparar: indicadores, media y alertas', () => {
  const actual = indicadoresLanzamiento(m(1000, 30, 7000));
  const anterior = indicadoresLanzamiento(m(1000, 40, 5000));
  assert.equal(actual.cpl, 7);
  const a = alertas(actual, anterior, 'la última edición');
  const cpl = a.find((x) => x.id === 'cpl');
  assert.equal(cpl.nivel, 'mal');
  assert.equal(cpl.texto, 'El coste por lead va un 40 % por encima de la última edición');
  assert.equal(a[0].nivel, 'mal'); // primero lo malo
  assert.equal(diferencias(actual, anterior).registros.pct, 0);
  assert.ok(!a.some((x) => x.id === 'registros')); // sin cambio, sin alerta
  const med = mediaIndicadores([anterior, indicadoresLanzamiento(m(2000, 60, 8000))]);
  assert.equal(med.registros, 1500);
  assert.ok(alertas(actual, med, 'la media', { omitir: ['registros', 'ventas', 'facturacion'] }).every((x) => !['registros', 'ventas'].includes(x.id)));
  assert.deepEqual(ultimosMeses('2026-02-10', 3), ['2025-12', '2026-01', '2026-02']);
  assert.equal(indicadoresVsl({ registros: 100, compraCohorte: 5, ventas: 6, ingresos: 6000, cpl: 3, cpa: 50, roas: 20 }).convVenta, 0.05);
});

test('previsión: ventas finales con el ritmo, el histórico y las señales tempranas', () => {
  const hist = [
    { registros: 2000, convVenta: 0.03, convVip: 0.10, convClase1: 0.5 },
    { registros: 2500, convVenta: 0.04, convVip: 0.10, convClase1: 0.5 },
    { registros: 3000, convVenta: 0.05, convVip: 0.10, convClase1: 0.5 },
  ];
  // Igual que la media: 1000 + 100/día × 10 días = 2000 registros × 4 % = 80 ventas
  const p = prevision({ registros: 1000, vip: 100, clase1: 500, ventas: 0 }, hist, { diasCaptacion: 10, ritmoDiario: 100, objetivoVentas: 100 });
  assert.equal(p.regFinal, 2000);
  assert.equal(p.ventas, 80);
  assert.equal(p.bajo, 70);
  assert.equal(p.alto, 90);
  assert.equal(p.estado, 'no-llega');
  assert.equal(p.registrosExtra, 500);
  // Mejores señales (VIP y clase 1 al doble de lo normal) → más ventas previstas
  const q = prevision({ registros: 1000, vip: 200, clase1: 1000, ventas: 0 }, hist, { diasCaptacion: 10, ritmoDiario: 100, objetivoVentas: 100 });
  assert.ok(q.factor > 1.5 && q.ventas > 100);
  assert.equal(q.estado, 'sobrado');
  // Sin histórico y con el carrito cerrado aún: no se puede
  assert.equal(prevision({ registros: 500 }, []).calculable, false);
  // Sin histórico pero con el carrito abierto: con la conversión de esta edición
  assert.equal(prevision({ registros: 1000, ventas: 30, carritoAbierto: true }, []).ventas, 30);
});
