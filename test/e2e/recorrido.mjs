// Recorrido del dashboard en un navegador de verdad (Playwright), con los datos de prueba de GHL.
//   npm run test:e2e
// Arranca el servidor de prueba en un puerto libre, entra como admin y como setter, crea un cliente de
// prueba con un lanzamiento, una VSL, un embudo de meteóricos y un downsell, y pasa por todos los
// embudos, pestañas, subpestañas y diálogos de configuración comprobando que no salta ningún error.
// Playwright: el del proyecto si está instalado; si no, el de PLAYWRIGHT_MODULE (carpeta node_modules).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../..', import.meta.url));

async function cargarPlaywright() {
  try { return await import('playwright'); } catch { /* no está en el proyecto */ }
  const dir = process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/';
  try { return createRequire(dir.endsWith('/') ? dir : `${dir}/`)('playwright'); } catch {
    console.error('No encuentro Playwright: instálalo (npm i -D playwright) o pon PLAYWRIGHT_MODULE con su carpeta node_modules.');
    process.exit(2);
  }
}

const puertoLibre = () => new Promise((resolve) => { const s = createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

async function arrancarServidor(port) {
  const env = { ...process.env, PORT: String(port), GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'e2e-secret-e2e-secret' };
  const p = spawn(process.execPath, ['scripts/dev-server.js'], { cwd: raiz, env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('El servidor no arrancó')), 15000);
    p.stdout.on('data', (d) => { if (String(d).includes('Dashboard en')) { clearTimeout(t); resolve(); } });
    p.on('exit', (c) => reject(new Error(`El servidor se cerró (${c})`)));
  });
  return p;
}

const CONFIG = `
  const hoy = new Date(); const d = (n) => { const x = new Date(hoy); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  cfg.embudos = [
    { id: 'lanz', tipo: 'lanzamientos', nombre: 'Lanzamientos', formato: 'webinar', clases: 2, vip: true, preclase: true },
    { id: 'vsl', tipo: 'vsl', nombre: 'VSL' },
    { id: 'meteo', tipo: 'meteorico', nombre: 'Meteóricos' },
  ];
  cfg.vsls = { vsl: { name: 'VSL', subtipo: 'vsl', registroTag: 'et-registro-vsl-búsqueda', vioTag: 'et-ve-vsl-raices', compraTag: 'et-compra-raices-vsl', compraDateField: 'mockFechaCompraVsl' } };
  cfg.launches = {
    demo: { name: 'Demo', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', compraTag: 'clienta-raices', encuestaTag: 'demo-encuesta', compraDateField: 'mockFechaCompraRaices',
      inicioCaptacion: d(-10), fechaDirecto: d(-2), horaDirecto: '18:00', aperturaCarrito: d(-2) + 'T19:30', cierreCarrito: d(4) + 'T23:59',
      precioVip: 47, precioPrograma: 997, inversion: 1500, embudo: 'lanz', objetivos: { ventas: 500 },
      oferta: { entregables: [{ nombre: 'Programa', tipo: 'grabado', valor: 1200 }], bonus: [{ nombre: 'BAR', tipo: 'bar_48h', valor: 200 }] } },
    vacio: { name: 'Sin fechas ni etiquetas', registroTag: 'registro-inexistente', embudo: 'lanz' },
  };
  cfg.meteoricos = {
    flash1: { name: 'Flash', embudo: 'meteo', producto: 'Mini', precio: 97, compraTag: 'clienta-raices', calentamiento: d(-2), apertura: d(-1) + 'T10:00', cierre: d(2) + 'T23:59',
      paquete: { entregables: [{ nombre: 'Mini curso', tipo: 'grabado' }], bonus: [{ nombre: 'Sesión', tipo: 'bar_30m' }, { nombre: 'Guía', tipo: 'bar_1h' }] } },
    down1: { name: 'Downsell', lanzamiento: 'demo', producto: 'Mini', precio: 47, compraTag: 'compra-vip-demo', apertura: d(5) + 'T10:00', cierre: d(6) + 'T22:00' },
  };
  return cfg;`;

const fallos = [];
const paso = async (nombre, fn) => {
  try { await fn(); } catch (e) { fallos.push(`${nombre}: ${String(e.message).split('\n')[0]}`); }
};

async function main() {
  const { chromium } = await cargarPlaywright();
  const port = await puertoLibre();
  const base = `http://localhost:${port}`;
  const servidor = await arrancarServidor(port);
  const navegador = await chromium.launch();
  try {
    for (const [rol, password] of [['admin', 'admin'], ['setter', 'setter']]) {
      const page = await navegador.newPage({ viewport: { width: 1440, height: 1000 } });
      page.on('pageerror', (e) => fallos.push(`[${rol}] error de JavaScript: ${e.message} (${String(e.stack || '').split('\n')[1]?.trim() || ''})`));
      page.on('response', (r) => { if (r.status() >= 500 && r.url().includes('/api/')) fallos.push(`[${rol}] ${r.status()} en ${r.url().replace(base, '')}`); });
      await page.goto(`${base}/`);
      await page.waitForSelector('#login:not([hidden])');
      await page.fill('#login-password', password);
      await page.click('#login-form button[type=submit]');
      await page.waitForFunction(() => !document.querySelector('#app')?.hidden, null, { timeout: 15000 });
      if (rol === 'admin') {
        const r = await page.evaluate(async (mut) => {
          const h = { 'content-type': 'application/json', 'x-cliente': 'mldlm' };
          const cur = await (await fetch('/api/config', { headers: h })).json();
          const next = new Function('cfg', mut)(cur.config);
          next._version = cur.version;
          return (await fetch('/api/config', { method: 'POST', headers: h, body: JSON.stringify(next) })).status;
        }, CONFIG);
        if (r !== 200) throw new Error(`No se pudo guardar la configuración de prueba (${r})`);
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#app')?.hidden, null, { timeout: 15000 });
      }
      await page.waitForTimeout(1500);
      // Inicio
      if (await page.isVisible('#sb-inicio')) await paso(`[${rol}] inicio`, async () => { await page.click('#sb-inicio'); await page.waitForSelector('#inicio-embudos .inicio-emb', { timeout: 15000 }); });
      // Cada embudo, cada pestaña, subpestaña y categoría de métricas
      for (const emb of await page.$$eval('#sb-items [data-embudo]', (e) => e.map((x) => x.dataset.embudo))) {
        await paso(`[${rol}] embudo ${emb}`, async () => {
          await page.click(`#sb-items [data-embudo="${emb}"]`);
          await page.waitForTimeout(1500);
          const tabs = await page.$$eval('.views .view-tab', (e) => e.filter((x) => !x.hidden).map((x) => x.dataset.view ? `[data-view="${x.dataset.view}"]` : `[data-view-grupo="${x.dataset.viewGrupo}"]`));
          for (const t of tabs) {
            await page.click(`.views .view-tab${t}`);
            await page.waitForTimeout(500);
            for (const s of await page.$$eval('.subviews:not([hidden]):not(.msubs) .subview-tab', (e) => e.filter((x) => !x.hidden).map((x) => x.dataset.view))) {
              await page.click(`.subviews:not([hidden]):not(.msubs) .subview-tab[data-view="${s}"]`);
              await page.waitForTimeout(500);
            }
            for (const nav of await page.$$eval('[id^="view-"]:not([hidden]) .msubs', (e) => e.map((x) => x.id))) {
              for (const c of await page.$$eval(`#${nav} [data-msub-btn]`, (e) => e.map((x) => x.dataset.msubBtn))) {
                await page.click(`#${nav} [data-msub-btn="${c}"]`);
                await page.waitForTimeout(400);
              }
            }
          }
        });
      }
      // Diálogos de configuración (admin): cada pestaña
      if (rol === 'admin') {
        await paso('[admin] configuración del lanzamiento', async () => {
          await page.click('#sb-items [data-embudo="lanz"]');
          await page.waitForTimeout(1200);
          await page.click('#btn-config');
          await page.waitForSelector('#config-dialog[open]');
          for (const t of await page.$$eval('#config-dialog .tab', (e) => e.map((x) => x.dataset.tab))) await page.click(`#config-dialog .tab[data-tab="${t}"]`);
          await page.evaluate(() => document.querySelector('#config-dialog').close());
        });
        await paso('[admin] configuración del meteórico', async () => {
          await page.click('#sb-items [data-embudo="meteo"]');
          await page.waitForTimeout(1200);
          await page.click('.view-tab[data-view="meteoricos"]');
          await page.click('#meteo-config');
          await page.waitForSelector('#meteo-dialog[open]');
          for (const t of await page.$$eval('#meteo-dialog .tab', (e) => e.map((x) => x.dataset.tab))) await page.click(`#meteo-dialog .tab[data-tab="${t}"]`);
          await page.evaluate(() => document.querySelector('#meteo-dialog').close());
        });
      }
      // Móvil: sin desplazamiento horizontal de la página
      await paso(`[${rol}] móvil`, async () => {
        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForTimeout(500);
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('la página se sale por la derecha a 390 px');
      });
      await page.close();
    }
  } finally {
    await navegador.close();
    servidor.kill();
  }
  if (fallos.length) {
    console.error(`✗ ${fallos.length} fallo(s):\n${[...new Set(fallos)].map((f) => `  · ${f}`).join('\n')}`);
    process.exit(1);
  }
  console.log('✓ Recorrido completo sin errores (admin y setter).');
}

main().catch((e) => { console.error(e); process.exit(1); });
