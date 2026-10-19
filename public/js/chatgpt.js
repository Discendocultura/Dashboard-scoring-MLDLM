// El mismo prompt, adaptado a ChatGPT. Los prompts del dashboard están pensados para Claude (sus skills, sus
// conectores, «pégalo en Claude»); ChatGPT los entiende mejor así:
//   · sin skills (le decimos qué experto es) ni menciones a Claude;
//   · con las reglas al principio Y al final (en los prompts largos, ChatGPT olvida lo del principio);
//   · pidiéndole que no pregunte salvo que el prompt lo pida, que no resuma ni corte y que no use Canvas;
//   · en español de España (tiende al español latino) y sin sus muletillas;
//   · según el tipo: 'texto' (copy), 'codigo' (una página en HTML) o 'imagen' (que la genere él).
//   paraChatGPT(prompt, { tipo }) → texto

const SKILLS = [
  // «Usa tu skill de copy de venta (emails de lanzamiento) para escribir…» → «Como copywriter…, escribe…»
  [/Usa tu skill de copy de venta(?: \([^)]*\))? para escribir/g, 'Como copywriter experto en lanzamientos y respuesta directa, escribe'],
  [/\s*\(usa tu skill de copy de venta si la tienes\)/gi, ''],
  [/Usa tu skill de copy de venta si la tienes\.\s*/g, ''],
  [/\s*Si tienes la skill[^.\n]*\./g, ''],
  [/Si tienes el conector de Meta[^\n]*\n?/g, ''],
  [/\bpégalo en Claude\b/g, 'pégalo en ChatGPT'],
  [/\bClaude\b/g, 'ChatGPT'],
];

const REGLAS = {
  texto: [
    'Eres un copywriter experto en lanzamientos digitales y respuesta directa, y escribes para el mercado de España.',
    'Lee TODO el contexto antes de escribir: la marca, el avatar, la narrativa y los datos son la fuente de verdad.',
  ],
  codigo: [
    'Eres diseñador web de conversión y desarrollador front-end, y escribes el copy para el mercado de España.',
    'Responde con UN ÚNICO bloque de código ```html``` completo, de principio a fin, listo para copiar y pegar. Sin Canvas y sin explicaciones antes ni después.',
  ],
  imagen: [
    'Genera la imagen ahora con tu generador de imágenes: no me la describas ni me hagas preguntas antes.',
    'El texto que va en la imagen tiene que salir EXACTO, letra a letra, con sus tildes y signos (¿ ¡). Si no cabe bien, hazlo más pequeño, pero no lo cambies ni lo traduzcas.',
  ],
};
const COMUNES = [
  'Escribe en español de España (tú/vosotros, nunca «ustedes»; nada de expresiones latinoamericanas) y sin anglicismos innecesarios.',
  'No me hagas preguntas antes de empezar, salvo que el prompt te pida expresamente parar o preguntar: si falta un dato, pon [FALTA: …] y sigue.',
  'Entrégalo COMPLETO: no resumas, no acortes, no pongas «…», «etc.» ni «(resto igual)». Si no te cabe en una respuesta, para en un punto limpio y escribe «Sigo en el siguiente mensaje».',
  'Respeta al pie de la letra el FORMATO de salida que se pide (marcas, títulos, orden); AlquimIA lo lee tal cual.',
  'Nada de muletillas de IA: ni rayas largas (—) para enlazar frases, ni «No es X, es Y», ni «En el mundo actual», ni emojis de más.',
];
const FINAL = {
  texto: 'RECUERDA: español de España, el tono de la marca, el formato exacto que se pide, todo completo y [FALTA: …] donde falte un dato.',
  codigo: 'RECUERDA: un único bloque ```html``` completo, con los códigos de AlquimIA tal cual y [FALTA: …] donde falte un dato.',
  imagen: 'RECUERDA: genera la imagen directamente, con el texto exacto y en el formato pedido.',
};

export function paraChatGPT(prompt, { tipo = 'texto' } = {}) {
  const t = REGLAS[tipo] ? tipo : 'texto';
  let cuerpo = String(prompt || '');
  for (const [re, por] of SKILLS) cuerpo = cuerpo.replace(re, por);
  const reglas = t === 'imagen' ? REGLAS.imagen : [...REGLAS[t], ...COMUNES];
  return `INSTRUCCIONES PARA CHATGPT (léelas antes que nada):\n${reglas.map((r) => `- ${r}`).join('\n')}\n\n---\n\n${cuerpo.trim()}\n\n---\n${FINAL[t]}`;
}
