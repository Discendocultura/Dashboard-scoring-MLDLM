// Registro de las plantillas de WhatsApp (de pago) enviadas desde el dashboard, por lanzamiento o embudo: cuántas,
// a quién, cuál y cuánto costaron. Con él se calcula el gasto y el retorno (Leads, Setting hoy y Rendimiento).
//   lsd_plantillas_wa_<código> = [{ at, tag, nombre, ids: [contactos], precio, por }]
import { leerJSON, guardarJSON, reintentando } from './store.js';

const clave = (code) => `lsd_plantillas_wa_${code}`;
const MAX = 2000; // envíos (cada uno, hasta 20 contactos)

export const leerEnviosPlantillas = (code) => leerJSON(clave(code), () => []).then((l) => (Array.isArray(l) ? l : []));

export async function registrarEnvioPlantillas(code, envio) {
  if (!envio.ids.length) return;
  await reintentando(async () => {
    const lista = await leerEnviosPlantillas(code);
    lista.push(envio);
    await guardarJSON(clave(code), lista.length > MAX ? lista.slice(-MAX) : lista, { motivo: '' });
  });
}

export { totalesEnvios } from '../public/js/plantillas-wa.js';
