// Inteligencia de negocio: los cálculos (sin pedir nada a nadie), a partir de las «fotos» de cada pieza del negocio.
// Una pieza es un lanzamiento, un mes de una VSL o de una venta directa, o un meteórico:
//   { id, tipo, embudo, embudoNombre, nombre, desde, hasta, cerrada, registros, ventas, facturacion, inversion,
//     compras: [[contactId, importe, díaCompra, díasDesdeRegistro|null, momento|null]] }
// momento (lanzamientos): 'directo' (el día del vídeo de venta), 'primero' (el día siguiente), 'ultimo' (el día del
// cierre) o 'medio'. agregar() devuelve todo lo que pinta la pestaña: números clave (y los del periodo anterior),
// recomendaciones, ciclo de compra, recompra y camino entre productos, actividad, la serie por mes, cada embudo y
// cada producto (con sus números, de dónde vienen y adónde van sus clientes y sus propias recomendaciones).
// El producto de cada embudo sale de Marca y avatar (`productos`: embudoId → { id, nombre }); sin él, el embudo es su
// propio producto. Cada meteórico es un producto aparte. Una venta directa vende su propio producto y puede llevar a
// otro (`objetivo`, p. ej. el reto → Raíces): su ficha dice cuántos de sus compradores acaban comprándolo.

const DIA = 86_400_000;
const dias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA);
const sumarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const div = (a, b) => (b ? a / b : null);
const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const PERIODOS_NEGOCIO = ['12m', 'ano', 'todo'];
export const TRAMOS_CICLO = [
  { id: 'd0', label: 'El mismo día', max: 0 }, { id: 'd3', label: '1-3 días', max: 3 }, { id: 'd7', label: '4-7 días', max: 7 },
  { id: 'd14', label: '8-14 días', max: 14 }, { id: 'd30', label: '15-30 días', max: 30 }, { id: 'mas', label: 'Más de 30 días', max: Infinity },
];
export const MOMENTOS = [
  { id: 'directo', label: 'En el directo' }, { id: 'primero', label: 'Primer día de carrito' },
  { id: 'medio', label: 'Durante el carrito' }, { id: 'ultimo', label: 'Último día' },
];
// Por debajo de esto, el bloque sale con «Pocos datos todavía».
export const MINIMOS = { ventas: 10, ciclo: 15, recompra: 20 };

// Rango del periodo y el del periodo anterior (de la misma duración). «todo»: sin anterior.
export function rangosNegocio(periodo, hoy) {
  if (periodo === 'todo') return { actual: { desde: '0000-01-01', hasta: hoy }, anterior: null };
  if (periodo === 'ano') {
    const desde = `${hoy.slice(0, 4)}-01-01`;
    const n = dias(desde, hoy);
    const antDesde = `${Number(hoy.slice(0, 4)) - 1}-01-01`;
    return { actual: { desde, hasta: hoy }, anterior: { desde: antDesde, hasta: sumarDias(antDesde, n) } };
  }
  const desde = sumarDias(hoy, -364);
  return { actual: { desde, hasta: hoy }, anterior: { desde: sumarDias(desde, -365), hasta: sumarDias(desde, -1) } };
}

// Una pieza cuenta en un periodo si termina dentro (un lanzamiento, en el mes en que cierra).
const enRango = (p, r) => Boolean(r) && p.hasta >= r.desde && p.hasta <= r.hasta;

function numeros(piezas, todas, r) {
  const ps = piezas.filter((p) => enRango(p, r));
  const facturacion = ps.reduce((t, p) => t + (p.facturacion || 0), 0);
  const ventas = ps.reduce((t, p) => t + (p.ventas || 0), 0);
  const conInv = ps.filter((p) => p.inversion > 0);
  const inversion = conInv.reduce((t, p) => t + p.inversion, 0);
  const regPagados = conInv.reduce((t, p) => t + (p.registros || 0), 0);
  const factPagadas = conInv.reduce((t, p) => t + (p.facturacion || 0), 0);
  const clientes = new Set(ps.flatMap((p) => (p.compras || []).map((c) => c[0])));
  // Clientes nuevos: su primera compra (en todo el histórico) cae en este periodo.
  const primera = primerasCompras(todas);
  const nuevos = [...clientes].filter((id) => enRango({ hasta: primera.get(id) || '' }, r)).length;
  // Con ventas y sin facturación faltan los precios: sin ROAS (no es que pierda dinero).
  const sinPrecios = ventas > 0 && !facturacion;
  return {
    facturacion, ventas, inversion: inversion || null, registros: ps.reduce((t, p) => t + (p.registros || 0), 0),
    clientes: clientes.size, nuevos, sinPrecios,
    cpl: div(inversion, regPagados), roas: sinPrecios ? null : div(factPagadas, inversion), cac: inversion && nuevos ? inversion / nuevos : null,
  };
}

function primerasCompras(piezas) {
  const m = new Map();
  for (const p of piezas) {
    for (const [id, , dia] of p.compras || []) {
      const d = dia || p.hasta;
      if (!m.has(id) || d < m.get(id)) m.set(id, d);
    }
  }
  return m;
}

// Lo que deja cada cliente en todo el histórico, con sus compras en orden.
function porCliente(piezas) {
  const m = new Map();
  for (const p of piezas) {
    for (const [id, importe, dia] of p.compras || []) {
      const c = m.get(id) || { total: 0, compras: [] };
      c.total += importe || 0;
      c.compras.push({ dia: dia || p.hasta, pieza: p });
      m.set(id, c);
    }
  }
  for (const c of m.values()) c.compras.sort((a, b) => a.dia.localeCompare(b.dia));
  return m;
}

// El producto de una pieza: { id, nombre }.
export function productoDePieza(p, productos = {}) {
  if (p.tipo === 'meteorico') return { id: `meteo:${p.nombre}`, nombre: `⚡ ${p.nombre}`, tipo: 'meteorico' };
  const asig = productos[p.embudo];
  if (asig?.tipo === 'directa') return { id: asig.id, nombre: asig.nombre, tipo: 'directa', ...(asig.objetivo ? { objetivo: asig.objetivo } : {}) };
  if (asig) return { id: `prod:${asig.id}`, nombre: asig.nombre, tipo: 'producto' };
  return { id: `emb:${p.embudo || p.tipo}`, nombre: p.embudoNombre || (p.tipo === 'lanzamiento' ? 'Lanzamiento' : p.nombre), tipo: 'embudo' };
}

// Facturación, ventas, inversión… de un grupo de piezas.
function sumas(xs) {
  const sum = (k) => xs.reduce((t, p) => t + (p[k] || 0), 0);
  const inv = xs.filter((p) => p.inversion > 0);
  const inversion = inv.reduce((t, p) => t + p.inversion, 0);
  const conReg = xs.filter((p) => p.registros > 0);
  const sinPrecios = sum('ventas') > 0 && !sum('facturacion');
  return {
    facturacion: sum('facturacion'), ventas: sum('ventas'), registros: sum('registros'), inversion: inversion || null, sinPrecios,
    cpl: div(inversion, inv.reduce((t, p) => t + (p.registros || 0), 0)), roas: sinPrecios ? null : div(inv.reduce((t, p) => t + (p.facturacion || 0), 0), inversion),
    conversion: conReg.length ? div(conReg.reduce((t, p) => t + (p.ventas || 0), 0), conReg.reduce((t, p) => t + p.registros, 0)) : null,
  };
}

export function agregar(piezas, { periodo = '12m', hoy, embudos = [], productos = {} } = {}) {
  const productoDe = (p) => productoDePieza(p, productos).nombre;
  const todas = piezas.filter((p) => p && p.hasta);
  const conDatos = todas.filter((p) => (p.registros || 0) + (p.ventas || 0) > 0);
  if (!conDatos.length) return { vacio: true };
  const { actual, anterior } = rangosNegocio(PERIODOS_NEGOCIO.includes(periodo) ? periodo : '12m', hoy);
  const ps = todas.filter((p) => enRango(p, actual));
  const n = numeros(todas, todas, actual);
  const prev = anterior ? numeros(todas, todas, anterior) : null;

  // LTV (todo el histórico): lo que deja de media cada cliente a lo largo de su vida.
  const clientes = porCliente(todas);
  const totalHist = [...clientes.values()].reduce((t, c) => t + c.total, 0);
  const ltv = clientes.size && totalHist ? totalHist / clientes.size : null;
  const ltvCac = ltv && n.cac ? ltv / n.cac : null;

  // Ciclo de compra (compras del periodo con fecha de compra y de registro).
  const ciclos = ps.flatMap((p) => (p.compras || []).map((c) => c[3]).filter((d) => Number.isFinite(d) && d >= 0));
  const comprasPeriodo = ps.reduce((t, p) => t + (p.compras || []).length, 0);
  const tramos = TRAMOS_CICLO.map((t, i) => ({ ...t, n: ciclos.filter((d) => d <= t.max && (i === 0 || d > TRAMOS_CICLO[i - 1].max)).length }));
  const momentos = MOMENTOS.map((m) => ({ ...m, n: ps.filter((p) => p.tipo === 'lanzamiento').flatMap((p) => p.compras || []).filter((c) => c[4] === m.id).length }));

  // Recompra y camino entre productos (todo el histórico: hace falta tiempo para volver a comprar).
  const multi = [...clientes.values()].filter((c) => new Set(c.compras.map((x) => x.pieza.id)).size > 1);
  const unaVez = [...clientes.values()].filter((c) => !multi.includes(c));
  const hastaSegunda = multi.map((c) => { const segunda = c.compras.find((x) => x.pieza.id !== c.compras[0].pieza.id); return dias(c.compras[0].dia, segunda.dia); }).filter((d) => d >= 0);
  const pasos = new Map();
  for (const c of multi) {
    const seq = [];
    for (const x of c.compras) { const pr = productoDe(x.pieza); if (seq.at(-1) !== pr) seq.push(pr); }
    for (let i = 1; i < seq.length; i++) { const k = `${seq[i - 1]} → ${seq[i]}`; pasos.set(k, (pasos.get(k) || 0) + 1); }
  }
  const media = (xs) => (xs.length ? xs.reduce((t, c) => t + c.total, 0) / xs.length : null);

  // Actividad
  const lanzamientos = todas.filter((p) => p.tipo === 'lanzamiento');
  const haceUnAno = sumarDias(hoy, -365);
  const activos = new Set(todas.filter((p) => !p.cerrada || p.hasta >= sumarDias(hoy, -60)).map((p) => p.embudo));

  // Serie por mes (facturación, inversión y ROAS): el periodo, como mucho los últimos 24 meses.
  const meses = new Map();
  for (const p of ps) {
    const k = p.hasta.slice(0, 7);
    const m = meses.get(k) || { mes: k, facturacion: 0, inversion: 0 };
    m.facturacion += p.facturacion || 0;
    m.inversion += p.inversion || 0;
    meses.set(k, m);
  }
  const serie = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-24).map((m) => ({ ...m, roas: div(m.facturacion, m.inversion) }));

  // Cada embudo en una línea (en el periodo), con su tendencia frente a la pieza o los meses anteriores.
  const porEmbudo = embudos.map((e) => {
    const suyas = ps.filter((p) => p.embudo === e.id).sort((a, b) => a.hasta.localeCompare(b.hasta));
    if (!suyas.length) return null;
    const sum = (k) => suyas.reduce((t, p) => t + (p[k] || 0), 0);
    const inv = suyas.filter((p) => p.inversion > 0);
    const inversion = inv.reduce((t, p) => t + p.inversion, 0);
    const roasDe = (xs) => { const i = xs.reduce((t, p) => t + (p.inversion || 0), 0); return i ? xs.reduce((t, p) => t + (p.facturacion || 0), 0) / i : null; };
    const k = e.tipo === 'lanzamientos' ? 1 : 3; // lanzamiento: el último frente al anterior; VSL o venta directa: 3 meses frente a 3
    const ult = roasDe(suyas.slice(-k));
    const antes = roasDe(suyas.slice(-2 * k, -k));
    const sinPrecios = sum('ventas') > 0 && !sum('facturacion');
    return {
      id: e.id, tipo: e.tipo, nombre: e.nombre, activo: activos.has(e.id), piezas: suyas.length, sinPrecios,
      registros: sum('registros'), ventas: sum('ventas'), facturacion: sum('facturacion'), inversion: inversion || null,
      cpl: div(inversion, inv.reduce((t, p) => t + (p.registros || 0), 0)), roas: sinPrecios ? null : div(inv.reduce((t, p) => t + (p.facturacion || 0), 0), inversion),
      conversion: div(sum('ventas'), sum('registros')),
      tendencia: ult != null && antes != null && antes > 0 ? (ult - antes) / antes : null,
    };
  }).filter(Boolean).sort((a, b) => b.facturacion - a.facturacion);
  const conRoas = porEmbudo.filter((e) => e.roas != null && e.inversion >= 100);
  const mejor = conRoas.length > 1 ? conRoas.reduce((a, b) => (b.roas > a.roas ? b : a)) : null;
  for (const e of porEmbudo) { e.mejor = Boolean(mejor && e.id === mejor.id); e.pierde = e.roas != null && e.roas < 1 && e.inversion >= 100; }

  // Cada producto: sus números del periodo (y del anterior), lo que deja quien lo compra, de dónde vienen y
  // adónde van sus clientes (todo el histórico), su ciclo, su serie por mes y sus recomendaciones.
  const prodDe = (p) => productoDePieza(p, productos);
  const prodsMap = new Map();
  for (const p of todas) { const pr = prodDe(p); if (!prodsMap.has(pr.id)) prodsMap.set(pr.id, { ...pr, piezas: [] }); prodsMap.get(pr.id).piezas.push(p); }
  const porProducto = [...prodsMap.values()].map((pr) => {
    const enPeriodo = pr.piezas.filter((p) => enRango(p, actual));
    if (!enPeriodo.length) return null;
    const ahora = sumas(enPeriodo);
    const antes = anterior ? sumas(pr.piezas.filter((p) => enRango(p, anterior))) : null;
    const compradoresPer = new Set(enPeriodo.flatMap((p) => (p.compras || []).map((c) => c[0])));
    // Quien lo ha comprado alguna vez: lo que deja en total y qué compra antes y después.
    const deEste = (x) => prodDe(x.pieza).id === pr.id;
    const compradores = [...clientes.values()].filter((c) => c.compras.some(deEste));
    const antesDe = new Map();
    const despuesDe = new Map();
    const diasSig = [];
    let conDespues = 0;
    for (const c of compradores) {
      const i = c.compras.findIndex(deEste);
      const previo = c.compras.slice(0, i).reverse().find((x) => !deEste(x));
      if (previo) { const n = productoDe(previo.pieza); antesDe.set(n, (antesDe.get(n) || 0) + 1); }
      const sig = c.compras.slice(i + 1).find((x) => !deEste(x));
      if (sig) { conDespues++; const n = productoDe(sig.pieza); despuesDe.set(n, (despuesDe.get(n) || 0) + 1); diasSig.push(dias(c.compras[i].dia, sig.dia)); }
    }
    const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([nombre, n]) => ({ nombre, n }));
    // El producto al que quiere llevar (venta directa): cuántos de sus compradores lo compran después y cuándo.
    let objetivo = null;
    if (pr.objetivo) {
      const esObj = (x) => { const o = prodDe(x.pieza); return o.id !== pr.id && (pr.objetivo.id ? o.id === `prod:${pr.objetivo.id}` : o.nombre.toLowerCase() === pr.objetivo.nombre.toLowerCase()); };
      const diasObj = [];
      let nObj = 0;
      for (const c of compradores) {
        const i = c.compras.findIndex(deEste);
        const o = c.compras.slice(i + 1).find(esObj);
        if (o) { nObj++; diasObj.push(dias(c.compras[i].dia, o.dia)); }
      }
      objetivo = { nombre: pr.objetivo.nombre, n: nObj, pct: div(nObj, compradores.length), dias: mediana(diasObj.filter((x) => x >= 0)) };
    }
    const ciclosP = enPeriodo.flatMap((p) => (p.compras || []).map((c) => c[3]).filter((d) => Number.isFinite(d) && d >= 0));
    const mesesP = new Map();
    for (const p of enPeriodo) mesesP.set(p.hasta.slice(0, 7), (mesesP.get(p.hasta.slice(0, 7)) || 0) + (p.facturacion || 0));
    const embIds = [...new Set(pr.piezas.map((p) => p.embudo).filter(Boolean))];
    return {
      id: pr.id, nombre: pr.nombre, tipo: pr.tipo, ...ahora, clientes: compradoresPer.size,
      ticket: div(ahora.facturacion, ahora.ventas), cuota: div(ahora.facturacion, n.facturacion),
      previo: antes && (antes.ventas || antes.facturacion) ? { facturacion: antes.facturacion, ventas: antes.ventas, roas: antes.roas, cpl: antes.cpl, conversion: antes.conversion } : null,
      lanzamientos: enPeriodo.filter((p) => p.tipo === 'lanzamiento').length,
      embudos: embIds.map((id) => embudos.find((e) => e.id === id)).filter(Boolean).map((e) => ({ id: e.id, nombre: e.nombre, tipo: e.tipo })),
      ltvComprador: media(compradores), compradores: compradores.length,
      despues: { pct: div(conDespues, compradores.length), n: conDespues, dias: mediana(diasSig.filter((d) => d >= 0)), top: top(despuesDe) },
      antes: { n: [...antesDe.values()].reduce((t, x) => t + x, 0), top: top(antesDe) }, objetivo,
      ciclo: { mediana: mediana(ciclosP), n: ciclosP.length },
      serie: [...mesesP].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([mes, facturacion]) => ({ mes, facturacion })),
      pocos: ahora.ventas < MINIMOS.ventas,
    };
  }).filter(Boolean).sort((a, b) => b.facturacion - a.facturacion || b.ventas - a.ventas);
  for (const pr of porProducto) pr.recomendaciones = recomendacionesProducto(pr, porProducto);

  const out = {
    vacio: false, periodo, rango: actual, anterior,
    numeros: { ...n, ltv, ltvCac }, previo: prev,
    ciclo: { mediana: mediana(ciclos), n: ciclos.length, cobertura: div(ciclos.length, comprasPeriodo), tramos, momentos, pocos: ciclos.length < MINIMOS.ciclo },
    recompra: {
      clientes: clientes.size, repiten: multi.length, pct: div(multi.length, clientes.size),
      ltvRepite: media(multi), ltvUnaVez: media(unaVez), diasSegunda: mediana(hastaSegunda),
      caminos: [...pasos].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([camino, n]) => ({ camino, n })),
      pocos: clientes.size < MINIMOS.recompra,
    },
    actividad: {
      lanzamientos: lanzamientos.length, lanzamientosPeriodo: lanzamientos.filter((p) => enRango(p, actual)).length,
      ultimoAno: lanzamientos.filter((p) => p.hasta >= haceUnAno).length,
      embudos: embudos.length, activos: activos.size,
    },
    serie, embudos: porEmbudo, productos: porProducto,
    pocos: n.ventas < MINIMOS.ventas,
  };
  out.recomendaciones = recomendaciones(out, todas);
  return out;
}

// Como mucho 3, de la más a la menos importante: cada una con su dato y qué hacer.
export function recomendaciones(a, piezas) {
  const r = [];
  const pct = (x) => `${Math.round(x * 100)} %`;
  const roas = (x) => x.toFixed(1).replace('.', ',');
  const sinPrecio = a.embudos.filter((e) => e.sinPrecios);
  if (sinPrecio.length) r.push({ prio: 0, ico: '💶', titulo: `Pon los precios de ${sinPrecio.length === 1 ? `«${sinPrecio[0].nombre}»` : `${sinPrecio.length} embudos`}`, texto: 'Hay ventas pero sin precio en su configuración: sin precios no se puede calcular la facturación, el ROAS ni lo que deja cada cliente.' });
  const pierde = a.embudos.filter((e) => e.pierde);
  for (const e of pierde) r.push({ prio: 1, ico: '⚠️', titulo: `«${e.nombre}» pierde dinero`, texto: `Por cada euro en anuncios vuelven ${roas(e.roas)}. Revisa la oferta y los anuncios antes de seguir invirtiendo, o pasa ese presupuesto al embudo que mejor funciona.` });
  const conRoas = a.embudos.filter((e) => e.roas != null && e.inversion >= 100);
  if (conRoas.length > 1) {
    const mejor = conRoas.reduce((x, y) => (y.roas > x.roas ? y : x));
    const peor = conRoas.reduce((x, y) => (y.roas < x.roas ? y : x));
    if (mejor.id !== peor.id && peor.roas > 0 && mejor.roas / peor.roas >= 1.5 && !peor.pierde) r.push({ prio: 2, ico: '💸', titulo: `Pasa presupuesto a «${mejor.nombre}»`, texto: `Te da un ROAS de ${roas(mejor.roas)} y «${peor.nombre}» de ${roas(peor.roas)}: cada euro rinde más ahí.` });
  }
  const { ltvCac } = a.numeros;
  if (ltvCac != null && ltvCac >= 3) r.push({ prio: 3, ico: '🚀', titulo: 'Puedes invertir más en anuncios', texto: `Un cliente te deja ${roas(ltvCac)} veces lo que cuesta conseguirlo. Sube la inversión poco a poco mientras el coste por cliente aguante.` });
  else if (ltvCac != null && ltvCac < 1.5) r.push({ prio: 2, ico: '🧮', titulo: 'Conseguir clientes te sale caro', texto: `Un cliente deja solo ${roas(ltvCac)} veces lo que cuesta. Sube el valor (otro producto, un upsell, una subida de precio) o baja el coste por lead.` });
  const rc = a.recompra;
  if (!rc.pocos && rc.pct != null && rc.pct >= 0.15) r.push({ prio: 3, ico: '🔁', titulo: 'Tus clientes vuelven: dales algo más', texto: `El ${pct(rc.pct)} vuelve a comprar${rc.diasSegunda != null ? `, a los ${Math.round(rc.diasSegunda)} días de media` : ''}. Lanza un meteórico o una oferta solo para tus clientes.` });
  else if (!rc.pocos && rc.pct != null && rc.pct < 0.08) r.push({ prio: 3, ico: '🪜', titulo: 'Casi nadie compra dos veces', texto: `Solo el ${pct(rc.pct)} repite. Prepara el siguiente paso (un producto de continuidad o un upsell) para tus clientes.` });
  // Coste por lead de los dos últimos lanzamientos frente a los de antes.
  const lz = piezas.filter((p) => p.tipo === 'lanzamiento' && p.inversion > 0 && p.registros > 0).sort((x, y) => x.hasta.localeCompare(y.hasta));
  if (lz.length >= 4) {
    const cpl = (xs) => xs.reduce((t, p) => t + p.inversion, 0) / xs.reduce((t, p) => t + p.registros, 0);
    const ult = cpl(lz.slice(-2));
    const antes = cpl(lz.slice(0, -2));
    if (ult >= antes * 1.25) r.push({ prio: 2, ico: '🎨', titulo: 'El coste por lead está subiendo', texto: `En los dos últimos lanzamientos, ${Math.round((ult / antes - 1) * 100)} % más caro que antes. Toca renovar los anuncios (creatividades y ángulos nuevos).` });
    else if (ult <= antes * 0.8) r.push({ prio: 4, ico: '📈', titulo: 'Tus anuncios están más baratos que nunca', texto: `El coste por lead ha bajado un ${Math.round((1 - ult / antes) * 100)} %: buen momento para escalar la inversión.` });
  }
  const c = a.ciclo;
  if (!c.pocos) {
    const total = c.tramos.reduce((t, x) => t + x.n, 0);
    const pronto = c.tramos.slice(0, 3).reduce((t, x) => t + x.n, 0) / total;
    const tarde = c.tramos.slice(4).reduce((t, x) => t + x.n, 0) / total;
    if (pronto >= 0.75) r.push({ prio: 4, ico: '⏱️', titulo: 'Se compra en la primera semana', texto: `El ${pct(pronto)} compra en 7 días o menos desde que se registra. Concentra el seguimiento y la presión en esa primera semana.` });
    else if (tarde >= 0.3) r.push({ prio: 4, ico: '🌱', titulo: 'Mucha gente tarda en decidirse', texto: `El ${pct(tarde)} compra pasados 15 días. Alarga el seguimiento (emails, WhatsApp, retargeting) en vez de darlos por perdidos.` });
  }
  const m = c.momentos;
  const totM = m.reduce((t, x) => t + x.n, 0);
  const ult = m.find((x) => x.id === 'ultimo');
  if (totM >= MINIMOS.ciclo && ult && ult.n / totM >= 0.35) r.push({ prio: 4, ico: '⏳', titulo: 'El último día es el día fuerte', texto: `El ${pct(ult.n / totM)} de las ventas de tus lanzamientos llega el día del cierre: prepara ese día (emails, WhatsApp y un directo de cierre).` });
  return r.sort((x, y) => x.prio - y.prio).slice(0, 3).map(({ prio, ...x }) => x);
}

// Las de un producto (como mucho 3, de la más a la menos importante), comparándolo con los demás.
export function recomendacionesProducto(pr, todos = []) {
  const r = [];
  const pct = (x) => `${Math.round(x * 100)} %`;
  const x1 = (x) => x.toFixed(1).replace('.', ',');
  const nom = `«${pr.nombre}»`;
  if (pr.sinPrecios) r.push({ prio: 0, ico: '💶', titulo: 'Ponle precio', texto: `Tiene ventas pero sin precio en la configuración de su embudo: sin él no se ve lo que factura ${nom}, su ROAS ni lo que deja cada cliente.` });
  if (pr.roas != null && pr.roas < 1 && pr.inversion >= 100) r.push({ prio: 1, ico: '⚠️', titulo: 'Pierde dinero en anuncios', texto: `Por cada euro invertido vuelven ${x1(pr.roas)}. Revisa la oferta y los anuncios antes de seguir invirtiendo en ${nom}.` });
  else if (pr.roas != null && pr.roas >= 3 && pr.inversion >= 100) r.push({ prio: 2, ico: '🚀', titulo: 'Escala la inversión', texto: `Cada euro en anuncios te devuelve ${x1(pr.roas)}. Sube el presupuesto de ${nom} poco a poco mientras el coste por lead aguante.` });
  const conConv = todos.filter((x) => x.conversion != null && x.registros >= 50);
  if (pr.conversion != null && pr.registros >= 50 && conConv.length > 1) {
    const mediaConv = conConv.reduce((t, x) => t + x.conversion, 0) / conConv.length;
    if (pr.conversion < mediaConv * 0.6) r.push({ prio: 2, ico: '🛒', titulo: 'Convierte menos que tus otros productos', texto: `Compra el ${pct(pr.conversion)} de los registrados (la media de tus productos es ${pct(mediaConv)}). Revisa la página de venta, el precio y el seguimiento de ${nom}.` });
    else if (pr.conversion > mediaConv * 1.4) r.push({ prio: 3, ico: '🏆', titulo: 'Es el que mejor convierte', texto: `Compra el ${pct(pr.conversion)} de los registrados, por encima de tu media (${pct(mediaConv)}): llévale más tráfico.` });
  }
  const o = pr.objetivo;
  if (o && pr.compradores >= 10) {
    if (o.pct >= 0.15) r.push({ prio: 3, ico: '🎯', titulo: `El ${pct(o.pct)} acaba comprando «${o.nombre}»`, texto: `${o.n} de ${pr.compradores} compradores de ${nom} dan el salto${o.dias != null ? `, a los ${Math.round(o.dias)} días de media` : ''}. Funciona: llévale más compradores (más inversión en ${nom}).` });
    else r.push({ prio: 1, ico: '🎯', titulo: `Pocos pasan a «${o.nombre}»`, texto: `Solo el ${pct(o.pct || 0)} de quien compra ${nom} compra después «${o.nombre}». Refuerza el paso: seguimiento por WhatsApp a sus compradores, invitación al próximo lanzamiento y una oferta solo para ellos.` });
  }
  const d = pr.despues;
  if (!o && d.pct != null && pr.compradores >= 10 && d.pct >= 0.15 && d.top[0]) r.push({ prio: 3, ico: '🔗', titulo: `Ofrece «${d.top[0].nombre}» justo después`, texto: `El ${pct(d.pct)} de quien compra ${nom} acaba comprando otra cosa${d.dias != null ? ` (a los ${Math.round(d.dias)} días de media)` : ''}, sobre todo «${d.top[0].nombre}». Ofrécelo a todos sus compradores, antes.` });
  else if (!o && d.pct != null && pr.compradores >= 20 && d.pct < 0.05) r.push({ prio: 3, ico: '🪜', titulo: 'Sus clientes no compran nada más', texto: `Solo el ${pct(d.pct)} de quien compra ${nom} vuelve a comprarte. Prepárale un siguiente paso (continuidad, upsell o un meteórico solo para ellos).` });
  if (todos.length > 1 && pr.cuota != null && pr.cuota >= 0.6) r.push({ prio: 4, ico: '🧺', titulo: 'Tu negocio depende de él', texto: `Es el ${pct(pr.cuota)} de lo que facturas. Si un lanzamiento suyo sale mal se nota en todo: refuerza tus otros productos.` });
  const p = pr.previo;
  if (p && p.facturacion > 0 && pr.facturacion >= 0) {
    const c = (pr.facturacion - p.facturacion) / p.facturacion;
    if (c <= -0.25) r.push({ prio: 2, ico: '📉', titulo: `Factura un ${pct(-c)} menos`, texto: `Que en el periodo anterior. Mira qué cambió (anuncios, oferta, fechas) comparando sus lanzamientos o meses.` });
    else if (c >= 0.25) r.push({ prio: 4, ico: '📈', titulo: `Crece un ${pct(c)}`, texto: `Frente al periodo anterior. Lo que estás haciendo con ${nom} funciona: apunta qué ha cambiado para repetirlo.` });
  }
  if (pr.ciclo.n >= MINIMOS.ciclo && pr.ciclo.mediana > 14) r.push({ prio: 4, ico: '🌱', titulo: 'Sus compradores se lo piensan', texto: `Pasan ${Math.round(pr.ciclo.mediana)} días de media desde que se registran hasta que compran. Alarga el seguimiento (emails, WhatsApp, retargeting).` });
  return r.sort((a, b) => a.prio - b.prio).slice(0, 3).map(({ prio, ...x }) => x);
}
