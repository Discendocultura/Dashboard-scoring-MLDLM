// Pone a cada archivo del dashboard su huella (?v=<sha1 de su contenido>) en index.html y marca.html:
// styles.css, tema.js, el script de entrada y, con un «import map», cada módulo de public/js.
// Así ningún navegador ni Cloudflare sirve un JS o CSS viejo junto a una página nueva
// (p. ej. el enlace «¿Olvidaste tu contraseña?» sin el código que lo hace funcionar).
// Uso: node scripts/huellas.js   (y `--comprobar` para solo comprobar; lo usa el test).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pub = new URL('../public/', import.meta.url);
const huella = (ruta) => createHash('sha1').update(readFileSync(new URL(ruta, pub))).digest('hex').slice(0, 10);

export function htmlConHuellas(html) {
  const modulos = readdirSync(new URL('js/', pub)).filter((f) => f.endsWith('.js')).sort();
  const mapa = Object.fromEntries(modulos.map((f) => [`/js/${f}`, `/js/${f}?v=${huella(`js/${f}`)}`]));
  const importMap = `<script type="importmap">${JSON.stringify({ imports: mapa })}</script>`;
  return html
    .replace(/\s*<script type="importmap">.*?<\/script>/s, '')
    .replace(/\/styles\.css(\?v=[0-9a-f]+)?"/, `/styles.css?v=${huella('styles.css')}"`)
    .replace(/\/tema\.js(\?v=[0-9a-f]+)?"/, `/tema.js?v=${huella('tema.js')}"`)
    .replace(/(\n\s*)<script type="module" src="\/js\/([\w-]+\.js)(\?v=[0-9a-f]+)?"><\/script>/,
      (_, sangria, f) => `${sangria}${importMap}${sangria}<script type="module" src="${mapa[`/js/${f}`]}"></script>`);
}

export const PAGINAS = ['index.html', 'marca.html'];

if (import.meta.url === `file://${process.argv[1]}`) {
  const comprobar = process.argv.includes('--comprobar');
  let mal = 0;
  for (const p of PAGINAS) {
    const actual = readFileSync(new URL(p, pub), 'utf8');
    const nuevo = htmlConHuellas(actual);
    if (nuevo === actual) continue;
    if (comprobar) { mal++; console.log(`${p}: huellas desactualizadas (ejecuta node scripts/huellas.js)`); } else { writeFileSync(new URL(p, pub), nuevo); console.log(`${p}: huellas actualizadas`); }
  }
  process.exit(mal ? 1 : 0);
}
