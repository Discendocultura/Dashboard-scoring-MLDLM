// La configuración del cliente de ejemplo (datos inventados): un lanzamiento con webinar en pleno carrito, una VSL
// siempre abierta y un meteórico, con las etiquetas de los datos de prueba (lib/mock.js) y las fechas alrededor de
// hoy, para que todas las pestañas tengan algo que enseñar. No se guarda en ningún sitio: se construye al leerla.
import { dayInMadrid } from '../public/js/scoring.js';

const dia = (n) => {
  const d = new Date(`${dayInMadrid(new Date().toISOString())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function configEjemplo(base) {
  return {
    ...base,
    marca: { ...(base.marca || {}), producto: 'Programa Raíces' },
    embudos: [
      { id: 'lanz', tipo: 'lanzamientos', nombre: 'Lanzamiento de ejemplo', formato: 'webinar', clases: 2, vip: true, preclase: true },
      { id: 'vsl', tipo: 'vsl', nombre: 'VSL de ejemplo' },
      { id: 'meteo', tipo: 'meteorico', nombre: 'Meteóricos de ejemplo' },
    ],
    vsls: { vsl: { name: 'VSL de ejemplo', subtipo: 'vsl', registroTag: 'et-registro-vsl-búsqueda', vioTag: 'et-ve-vsl-raices', compraTag: 'et-compra-raices-vsl', compraDateField: 'mockFechaCompraVsl', precioPrograma: 997 } },
    launches: {
      ejemplo: {
        name: 'Lanzamiento de ejemplo', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', compraTag: 'clienta-raices', encuestaTag: 'demo-encuesta', compraDateField: 'mockFechaCompraRaices',
        inicioCaptacion: dia(-10), fechaDirecto: dia(-2), horaDirecto: '18:00', aperturaCarrito: `${dia(-2)}T19:30`, cierreCarrito: `${dia(4)}T23:59`,
        precioVip: 47, precioPrograma: 997, inversion: 1500, embudo: 'lanz', objetivos: { ventas: 500 }, createdAt: `${dia(-12)}T10:00:00.000Z`,
        oferta: { entregables: [{ nombre: 'Programa', tipo: 'grabado', valor: 1200 }], bonus: [{ nombre: 'Sesión en directo', tipo: 'bar_48h', valor: 200 }] },
      },
    },
    meteoricos: {
      flash: { name: 'Flash de ejemplo', embudo: 'meteo', producto: 'Mini curso', precio: 97, compraTag: 'clienta-raices', calentamiento: dia(-2), apertura: `${dia(-1)}T10:00`, cierre: `${dia(2)}T23:59`,
        paquete: { entregables: [{ nombre: 'Mini curso', tipo: 'grabado' }], bonus: [{ nombre: 'Sesión', tipo: 'bar_30m' }] } },
    },
  };
}
