// Llamadas a Claude (API de Anthropic) para el asistente de IA del dashboard.
// La clave va en Cloudflare como secreto ANTHROPIC_API_KEY (nunca en el código).
// Con GHL_MOCK=1 y sin clave responde un texto de prueba (para probar en local sin gastar).
import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';

export const MODELO = 'claude-opus-5-5';

export const iaConfigurada = () => Boolean(env.ANTHROPIC_API_KEY) || env.GHL_MOCK === '1';

let falso = null;
// Para los tests: sustituye la llamada real por una función ({ system, messages, effort }) → texto.
export function usarClaudeFalso(fn) { falso = fn; }

let cliente = null;
let claveCliente = '';
function clienteAnthropic() {
  if (!cliente || claveCliente !== env.ANTHROPIC_API_KEY) {
    cliente = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
    claveCliente = env.ANTHROPIC_API_KEY;
  }
  return cliente;
}

const error = (status, publicMessage) => Object.assign(new Error(publicMessage), { status, publicMessage });

// Devuelve el texto de la respuesta. effort: 'low' (borradores cortos) | 'medium' | 'high'.
export async function preguntarClaude({ system, messages, effort = 'medium', maxTokens = 16000 }) {
  if (falso) return falso({ system, messages, effort });
  if (!env.ANTHROPIC_API_KEY) {
    if (env.GHL_MOCK === '1') return respuestaDePrueba(messages);
    throw error(503, 'El asistente no está activado: añade el secreto ANTHROPIC_API_KEY en Cloudflare (ver README).');
  }
  let res;
  try {
    res = await clienteAnthropic().beta.messages.create({
      model: MODELO,
      max_tokens: maxTokens,
      system,
      messages,
      thinking: { type: 'adaptive' },
      output_config: { effort },
      // Si el modelo declina por sus filtros de seguridad, la API reintenta sola con otro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw error(502, 'La clave ANTHROPIC_API_KEY no es válida.');
    if (e instanceof Anthropic.RateLimitError) throw error(429, 'El asistente está saturado: prueba en un minuto.');
    if (e instanceof Anthropic.APIError) throw error(502, `El asistente no ha podido responder (${e.status ?? 'sin conexión'}).`);
    throw e;
  }
  if (res.stop_reason === 'refusal') throw error(422, 'El asistente no puede responder a esa petición. Prueba a reformularla.');
  const texto = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!texto) throw error(502, 'El asistente no ha devuelto respuesta. Prueba otra vez.');
  return res.stop_reason === 'max_tokens' ? `${texto}\n\n(La respuesta se ha cortado por larga.)` : texto;
}

function respuestaDePrueba(messages) {
  const ultima = messages.at(-1)?.content;
  const pregunta = typeof ultima === 'string' ? ultima : '';
  if (pregunta.includes('BORRADOR_WHATSAPP')) return 'Hola {nombre} 😊 Vi que estuviste en la clase 1, ¿qué te pareció? Aquí tienes la grabación: {link_grabacion}';
  return 'Respuesta de prueba (modo local sin ANTHROPIC_API_KEY).\n\n- Los registros van **un 12 % por encima** de la edición anterior.\n- El coste por lead está en línea.\n\nSugerencia: refuerza el recordatorio del directo por WhatsApp.';
}
