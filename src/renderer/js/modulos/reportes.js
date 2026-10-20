// Módulo Reportes: ventas y ganancias por periodo, ventas por cliente.
import {
  q, puede, cfg, exportarCSV, selectorPeriodo, graficaBarras,
  esc, dinero, pct, fmtFecha, redondear, MESES_LARGOS, $, $$,
} from '../core.js';
import { nombreForma } from '../ticket.js';

let raiz = null;
let vista = 'ventas';
let rango = null;

export async function montar(el) {
  raiz = el;
  el.innerHTML = `
    <div class="modulo-barra">Reportes</div>
    <div class="sub-barra">
      <button class="btn" data-vista="ventas">📈 Reporte de ventas</button>
      <button class="btn" data-vista="clientes">👥 Ventas por cliente</button>
      <span class="espaciador"></span>
      <div data-periodo></div>
    </div>
    <div class="modulo-cuerpo" data-cuerpo></div>`;
  $$('[data-vista]', el).forEach(b => (b.onclick = () => cambiarVista(b.dataset.vista)));
  selectorPeriodo($('[data-periodo]', el), r => {
    rango = r;
    if (raiz) pintar();
  }, 'SEMANA');
  cambiarVista(vista);
  return {
    desmontar() {
      raiz = null;
    },
  };
}

function cambiarVista(v) {
  vista = v;
  $$('[data-vista]', raiz).forEach(b => b.classList.toggle('activo', b.dataset.vista === v));
  pintar();
}

let pintando = 0;
async function pintar() {
  if (!rango?.desde || !rango?.hasta) return;
  const n = ++pintando;
  const datos = await cargarDatos(rango);
  if (n !== pintando || !raiz) return;
  if (vista === 'ventas') pintarVentas(datos);
  else pintarClientes(datos);
}

// ---------------------------------------------------------------- Datos
const enLista = ids => (ids.length ? ids.join(',') : '0');

// Carga ventas, renglones, pagos y devoluciones del periodo. Las devoluciones
// se cuentan por la fecha en que se hicieron (igual que el corte).
async function cargarDatos({ desde, hasta }) {
  const ventas = await q(
    `SELECT v.id, v.fecha, v.total, v.comision, v.estado, v.cliente_id, v.impuestos
     FROM ventas v WHERE date(v.fecha) BETWEEN ? AND ? ORDER BY v.fecha`,
    [desde, hasta]
  );
  const ids = ventas.map(v => v.id);
  const renglones = await q(
    `SELECT r.*, COALESCE(d.nombre, '- Sin departamento -') AS departamento
     FROM venta_renglones r LEFT JOIN departamentos d ON d.id = r.departamento_id
     WHERE r.venta_id IN (${enLista(ids)})`
  );
  const pagos = await q(`SELECT forma, SUM(monto) AS monto FROM venta_pagos WHERE venta_id IN (${enLista(ids)}) GROUP BY forma`);
  const devoluciones = await q(`SELECT * FROM devoluciones WHERE date(fecha) BETWEEN ? AND ?`, [desde, hasta]);

  // Para repartir cancelaciones completas entre departamentos se necesitan los renglones de esas ventas.
  const idsCancel = [...new Set(devoluciones.filter(d => d.tipo === 'CANCELACION').map(d => d.venta_id))];
  const renglonesCancel = idsCancel.length
    ? await q(
        `SELECT r.*, COALESCE(d.nombre, '- Sin departamento -') AS departamento,
           (SELECT COALESCE(SUM(x.cantidad), 0) FROM devoluciones x WHERE x.renglon_id = r.id AND x.tipo = 'DEVOLUCION') AS dev_parcial
         FROM venta_renglones r LEFT JOIN departamentos d ON d.id = r.departamento_id WHERE r.venta_id IN (${enLista(idsCancel)})`
      )
    : [];
  const renglonesDev = await q(
    `SELECT r.id, r.venta_id, COALESCE(d.nombre, '- Sin departamento -') AS departamento
     FROM venta_renglones r LEFT JOIN departamentos d ON d.id = r.departamento_id
     WHERE r.id IN (${enLista(devoluciones.filter(d => d.renglon_id).map(d => d.renglon_id))})`
  );
  const ventasDev = await q(`SELECT id, cliente_id FROM ventas WHERE id IN (${enLista([...new Set(devoluciones.map(d => d.venta_id))])})`);
  return { desde, hasta, ventas, renglones, pagos, devoluciones, renglonesCancel, renglonesDev, ventasDev };
}

// Reparte cada devolución en {departamento, monto, costo}.
function devolucionesPorDepartamento(d) {
  const res = [];
  const depRenglon = new Map(d.renglonesDev.map(r => [r.id, r.departamento]));
  const porVenta = new Map();
  for (const r of d.renglonesCancel) {
    if (!porVenta.has(r.venta_id)) porVenta.set(r.venta_id, []);
    porVenta.get(r.venta_id).push(r);
  }
  for (const dev of d.devoluciones) {
    if (dev.renglon_id) {
      res.push({ departamento: depRenglon.get(dev.renglon_id) || '- Sin departamento -', monto: dev.monto, costo: dev.costo });
      continue;
    }
    // Cancelación completa: proporcional a lo que quedaba de cada renglón.
    const rs = (porVenta.get(dev.venta_id) || []).map(r => {
      const qty = Math.max(0, r.devuelto - r.dev_parcial);
      return { departamento: r.departamento, valor: (r.importe / r.cantidad) * qty, costo: r.costo * qty };
    });
    const totalValor = rs.reduce((a, r) => a + r.valor, 0);
    const totalCosto = rs.reduce((a, r) => a + r.costo, 0);
    if (!rs.length || totalValor <= 0) {
      res.push({ departamento: '- Sin departamento -', monto: dev.monto, costo: dev.costo });
      continue;
    }
    for (const r of rs) {
      res.push({
        departamento: r.departamento,
        monto: dev.monto * (r.valor / totalValor),
        costo: totalCosto > 0 ? dev.costo * (r.costo / totalCosto) : 0,
      });
    }
  }
  return res;
}

function diasEntre(desde, hasta) {
  return Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1;
}

// Agrupación según el tamaño del rango: día (≤ 31 días), mes (≤ 12 meses) o año.
function agrupador(desde, hasta) {
  const dias = diasEntre(desde, hasta);
  if (dias <= 31) return { nombre: 'día', clave: f => f.slice(0, 10), etiqueta: k => k.slice(8, 10) + '/' + k.slice(5, 7), larga: k => fmtFecha(k) };
  if (dias <= 366)
    return {
      nombre: 'mes',
      clave: f => f.slice(0, 7),
      etiqueta: k => MESES_LARGOS[Number(k.slice(5, 7)) - 1].slice(0, 3) + ' ' + k.slice(2, 4),
      larga: k => MESES_LARGOS[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(0, 4),
    };
  return { nombre: 'año', clave: f => f.slice(0, 4), etiqueta: k => k, larga: k => k };
}

// Lista de claves consecutivas del periodo (incluye las que no tienen ventas).
function clavesPeriodo(desde, hasta, ag) {
  const res = [];
  const d = new Date(desde + 'T00:00:00');
  const fin = new Date(hasta + 'T00:00:00');
  const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  while (d <= fin) {
    const k = ag.clave(iso(d));
    if (res[res.length - 1] !== k) res.push(k);
    if (ag.nombre === 'día') d.setDate(d.getDate() + 1);
    else if (ag.nombre === 'mes') d.setMonth(d.getMonth() + 1, 1);
    else d.setFullYear(d.getFullYear() + 1, 0, 1);
  }
  const ultima = ag.clave(hasta);
  if (res[res.length - 1] !== ultima) res.push(ultima);
  return res;
}

function sumar(mapa, clave, campo, valor) {
  if (!mapa.has(clave)) mapa.set(clave, { ventas: 0, ganancia: 0, num: 0 });
  mapa.get(clave)[campo] += valor;
}

// ---------------------------------------------------------------- Reporte de ventas
function pintarVentas(d) {
  const verGanancia = puede('ver_ganancia');
  const ag = agrupador(d.desde, d.hasta);
  const totalVentasBrutas = d.ventas.reduce((a, v) => a + v.total, 0);
  const totalDev = d.devoluciones.reduce((a, x) => a + x.monto, 0);
  const costoDev = d.devoluciones.reduce((a, x) => a + x.costo, 0);
  const ventasNetas = redondear(totalVentasBrutas - totalDev, 2);
  const numVentas = d.ventas.filter(v => v.estado !== 'CANCELADA').length;
  const gananciaBruta = d.renglones.reduce((a, r) => a + r.importe - r.costo * r.cantidad, 0);
  const ganancia = redondear(gananciaBruta - (totalDev - costoDev), 2);
  const utilidad = ventasNetas > 0 ? (ganancia / ventasNetas) * 100 : 0;
  const comisiones = d.ventas.reduce((a, v) => a + v.comision, 0);

  // Por periodo (día/mes/año)
  const porPeriodo = new Map();
  const fechaVenta = new Map(d.ventas.map(v => [v.id, v.fecha]));
  for (const v of d.ventas) {
    sumar(porPeriodo, ag.clave(v.fecha), 'ventas', v.total);
    if (v.estado !== 'CANCELADA') sumar(porPeriodo, ag.clave(v.fecha), 'num', 1);
  }
  for (const r of d.renglones) sumar(porPeriodo, ag.clave(fechaVenta.get(r.venta_id)), 'ganancia', r.importe - r.costo * r.cantidad);
  for (const x of d.devoluciones) {
    sumar(porPeriodo, ag.clave(x.fecha), 'ventas', -x.monto);
    sumar(porPeriodo, ag.clave(x.fecha), 'ganancia', -(x.monto - x.costo));
  }
  const claves = clavesPeriodo(d.desde, d.hasta, ag);
  const serie = claves.map(k => ({ clave: k, etiqueta: ag.etiqueta(k), valor: redondear(porPeriodo.get(k)?.ventas || 0, 2), ...(porPeriodo.get(k) || {}) }));

  // Por departamento
  const porDep = new Map();
  for (const r of d.renglones) {
    sumar(porDep, r.departamento, 'ventas', r.importe);
    sumar(porDep, r.departamento, 'ganancia', r.importe - r.costo * r.cantidad);
  }
  for (const x of devolucionesPorDepartamento(d)) {
    sumar(porDep, x.departamento, 'ventas', -x.monto);
    sumar(porDep, x.departamento, 'ganancia', -(x.monto - x.costo));
  }
  const deps = [...porDep.entries()].map(([nombre, v]) => ({ nombre, ...v })).filter(x => Math.abs(x.ventas) > 0.009 || Math.abs(x.ganancia) > 0.009);
  const topOtros = (lista, campo) => {
    const ord = [...lista].sort((a, b) => b[campo] - a[campo]);
    if (ord.length <= 7) return ord.map(x => ({ nombre: x.nombre, valor: x[campo] }));
    const top = ord.slice(0, 6).map(x => ({ nombre: x.nombre, valor: x[campo] }));
    top.push({ nombre: 'Otros…', valor: ord.slice(6).reduce((a, x) => a + x[campo], 0) });
    return top;
  };

  // Formas de pago
  const formas = d.pagos.map(p => ({ nombre: nombreForma(p.forma), forma: p.forma, valor: p.monto }));
  const devEf = d.devoluciones.filter(x => x.forma_reembolso === 'EFECTIVO').reduce((a, x) => a + x.monto, 0);
  const devCr = d.devoluciones.filter(x => x.forma_reembolso === 'CREDITO').reduce((a, x) => a + x.monto, 0);
  const bancos = d.pagos.filter(p => ['TARJETA', 'TRANSFERENCIA', 'CHEQUE'].includes(p.forma)).reduce((a, p) => a + p.monto, 0);

  // Impuestos (proporcional a lo no devuelto)
  const impuestos = {};
  if (cfg('usar_impuestos') || d.renglones.some(r => r.impuesto > 0)) {
    for (const r of d.renglones) {
      let tasas = [];
      try {
        tasas = JSON.parse(r.tasas || '[]');
      } catch {
        tasas = [];
      }
      const tt = tasas.reduce((a, t) => a + Number(t.tasa), 0);
      if (!tt) continue;
      const neto = r.importe * (r.cantidad > 0 ? (r.cantidad - r.devuelto) / r.cantidad : 0);
      const base = neto / (1 + tt / 100);
      for (const t of tasas) {
        const k = `${t.nombre} (${t.tasa}%)`;
        impuestos[k] = impuestos[k] || { cobrado: 0, gravado: 0 };
        impuestos[k].cobrado += base * (t.tasa / 100);
        impuestos[k].gravado += base;
      }
    }
  }

  const filaMontos = (lista, campo = 'valor') =>
    lista.map(x => `<tr class="${x[campo] < 0 ? 'resta' : ''}"><td>${esc(x.nombre)}</td><td>${dinero(x[campo])}</td></tr>`).join('');
  const barrasHorizontales = lista => {
    const max = Math.max(...lista.map(x => Math.abs(x.valor)), 1);
    return lista
      .map(
        x => `<div class="rep-barra"><span class="rep-barra-nombre">${esc(x.nombre)}</span>
        <span class="rep-barra-pista"><span style="width:${Math.max(0, (x.valor / max) * 100)}%"></span></span>
        <span class="rep-barra-valor">${dinero(x.valor)}</span></div>`
      )
      .join('') || '<p class="vacio">Sin datos</p>';
  };

  const cuerpo = $('[data-cuerpo]', raiz);
  cuerpo.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="etq">Ventas totales</div><div class="val">${dinero(ventasNetas)}</div><div class="nota">${numVentas} venta(s)</div></div>
      ${
        verGanancia
          ? `<div class="kpi"><div class="etq">Ganancia</div><div class="val">${dinero(ganancia)}</div><div class="nota">${pct(utilidad)} de utilidad promedio</div></div>`
          : ''
      }
      <div class="kpi"><div class="etq">Venta promedio</div><div class="val">${dinero(numVentas ? ventasNetas / numVentas : 0)}</div></div>
      ${totalDev > 0 ? `<div class="kpi"><div class="etq">Devoluciones</div><div class="val rojo">${dinero(totalDev)}</div></div>` : ''}
      <span class="espaciador"></span>
      <button class="btn" data-exportar>📤 Exportar</button>
    </div>
    <div class="panel">
      <h3>Gráfica de ventas por ${ag.nombre}</h3>
      ${graficaBarras(serie.filter(s => s.valor !== 0 || serie.length <= 31))}
    </div>
    <div class="dos-col rep-secciones">
      <div class="panel">
        <h3>Ventas por ${ag.nombre}</h3>
        <div class="tabla-scroll alto-340"><table class="tabla">
          <thead><tr><th>${ag.nombre[0].toUpperCase() + ag.nombre.slice(1)}</th><th class="num">Ventas</th><th class="num">Monto</th>${verGanancia ? '<th class="num">Ganancia</th>' : ''}</tr></thead>
          <tbody>${
            serie
              .filter(s => s.num || s.valor)
              .reverse()
              .map(
                s => `<tr><td>${esc(ag.larga(s.clave))}</td><td class="num">${s.num || 0}</td><td class="num">${dinero(s.valor)}</td>
                  ${verGanancia ? `<td class="num">${dinero(s.ganancia || 0)}</td>` : ''}</tr>`
              )
              .join('') || `<tr><td colspan="4" class="vacio">Sin ventas en el periodo</td></tr>`
          }</tbody>
        </table></div>
      </div>
      <div class="panel">
        <h3>Ventas por forma de pago</h3>
        <table class="lista-montos">
          ${filaMontos(formas)}
          ${devEf ? `<tr class="resta"><td>Devoluciones en efectivo</td><td>-${dinero(devEf)}</td></tr>` : ''}
          ${devCr ? `<tr class="resta"><td>Devoluciones a crédito</td><td>-${dinero(devCr)}</td></tr>` : ''}
          <tr class="total"><td>Total</td><td>${dinero(ventasNetas)}</td></tr>
        </table>
        <p class="nota">Bancos (tarjeta, transferencia, cheque): <b>${dinero(bancos)}</b>${comisiones ? ` · Comisiones por tarjeta cobradas: <b>${dinero(comisiones)}</b>` : ''}</p>
      </div>
      <div class="panel">
        <h3>Ventas por departamento</h3>
        ${barrasHorizontales(topOtros(deps, 'ventas'))}
      </div>
      ${
        verGanancia
          ? `<div class="panel">
              <h3>Ganancia por departamento</h3>
              ${barrasHorizontales(topOtros(deps, 'ganancia'))}
            </div>`
          : ''
      }
      ${
        Object.keys(impuestos).length
          ? `<div class="panel">
              <h3>Impuestos</h3>
              <table class="lista-montos">
                ${Object.entries(impuestos)
                  .map(([k, v]) => `<tr><td>${esc(k)} – Cobrado</td><td>${dinero(v.cobrado)}</td></tr><tr><td>${esc(k)} – Ventas gravadas</td><td>${dinero(v.gravado)}</td></tr>`)
                  .join('')}
              </table>
            </div>`
          : ''
      }
    </div>`;
  $('[data-exportar]', cuerpo).onclick = () =>
    exportarCSV(
      `reporte-ventas-${d.desde}-a-${d.hasta}`,
      [['periodo', ag.nombre[0].toUpperCase() + ag.nombre.slice(1)], ['num', 'Número de ventas'], ['monto', 'Monto'], ...(verGanancia ? [['ganancia', 'Ganancia']] : [])],
      serie.map(s => ({ periodo: ag.larga(s.clave), num: s.num || 0, monto: redondear(s.valor, 2), ganancia: redondear(s.ganancia || 0, 2) }))
    );
}

// ---------------------------------------------------------------- Ventas por cliente
let ordenClientes = { col: 'monto', desc: true };

async function pintarClientes(d) {
  const verGanancia = puede('ver_ganancia');
  const clientes = await q(
    `SELECT id, TRIM(nombres || ' ' || COALESCE(apellidos, '')) AS nombre FROM clientes WHERE id IN (${enLista([
      ...new Set([...d.ventas.map(v => v.cliente_id), ...d.ventasDev.map(v => v.cliente_id)].filter(Boolean)),
    ])})`
  );
  const nombre = new Map(clientes.map(c => [c.id, c.nombre]));
  const porCliente = new Map();
  const reg = id => {
    if (!porCliente.has(id)) porCliente.set(id, { id, nombre: nombre.get(id) || 'Público en general', num: 0, monto: 0, ganancia: 0 });
    return porCliente.get(id);
  };
  const clienteVenta = new Map(d.ventas.map(v => [v.id, v.cliente_id || 1]));
  for (const v of d.ventasDev) if (!clienteVenta.has(v.id)) clienteVenta.set(v.id, v.cliente_id || 1);
  for (const v of d.ventas) {
    const c = reg(v.cliente_id || 1);
    c.monto += v.total;
    if (v.estado !== 'CANCELADA') c.num++;
  }
  for (const r of d.renglones) reg(clienteVenta.get(r.venta_id)).ganancia += r.importe - r.costo * r.cantidad;
  for (const x of d.devoluciones) {
    const c = reg(clienteVenta.get(x.venta_id) || 1);
    c.monto -= x.monto;
    c.ganancia -= x.monto - x.costo;
  }
  const filas = [...porCliente.values()].filter(c => c.num || Math.abs(c.monto) > 0.009);
  const totalMonto = filas.reduce((a, f) => a + f.monto, 0);
  const totalGanancia = filas.reduce((a, f) => a + f.ganancia, 0);

  const cuerpo = $('[data-cuerpo]', raiz);
  const pintarTabla = () => {
    const { col, desc } = ordenClientes;
    filas.sort((a, b) =>
      typeof a[col] === 'string' ? (desc ? -1 : 1) * a[col].localeCompare(b[col]) : (desc ? -1 : 1) * (a[col] - b[col])
    );
    const fl = c => (ordenClientes.col === c ? (ordenClientes.desc ? ' ▼' : ' ▲') : '');
    cuerpo.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="etq">Clientes con compras</div><div class="val">${filas.length}</div></div>
        <div class="kpi"><div class="etq">Monto acumulado</div><div class="val">${dinero(totalMonto)}</div></div>
        ${verGanancia ? `<div class="kpi"><div class="etq">Ganancia</div><div class="val">${dinero(totalGanancia)}</div></div>` : ''}
        <span class="espaciador"></span>
        <button class="btn" data-exportar>📤 Exportar</button>
      </div>
      <div class="tabla-scroll">
        <table class="tabla">
          <thead><tr>
            <th data-orden="id">Folio${fl('id')}</th><th data-orden="nombre">Nombre${fl('nombre')}</th>
            <th class="num" data-orden="num">Número de ventas${fl('num')}</th><th class="num" data-orden="monto">Monto acumulado${fl('monto')}</th>
            ${verGanancia ? `<th class="num" data-orden="ganancia">Ganancia${fl('ganancia')}</th>` : ''}
          </tr></thead>
          <tbody>${
            filas
              .map(
                f => `<tr><td>${f.id}</td><td>${esc(f.nombre)}</td><td class="num">${f.num}</td><td class="num">${dinero(f.monto)}</td>
                  ${verGanancia ? `<td class="num">${dinero(f.ganancia)}</td>` : ''}</tr>`
              )
              .join('') || '<tr><td colspan="5" class="vacio">Sin ventas en el periodo</td></tr>'
          }</tbody>
          <tfoot><tr><td colspan="3">Total</td><td class="num">${dinero(totalMonto)}</td>${verGanancia ? `<td class="num">${dinero(totalGanancia)}</td>` : ''}</tr></tfoot>
        </table>
      </div>`;
    $$('th[data-orden]', cuerpo).forEach(
      th =>
        (th.onclick = () => {
          const c = th.dataset.orden;
          ordenClientes = { col: c, desc: ordenClientes.col === c ? !ordenClientes.desc : c !== 'nombre' };
          pintarTabla();
        })
    );
    $('[data-exportar]', cuerpo).onclick = () =>
      exportarCSV(
        `ventas-por-cliente-${d.desde}-a-${d.hasta}`,
        [['id', 'Folio'], ['nombre', 'Nombre'], ['num', 'Número de ventas'], ['monto', 'Monto acumulado'], ...(verGanancia ? [['ganancia', 'Ganancia']] : [])],
        filas.map(f => ({ ...f, monto: redondear(f.monto, 2), ganancia: redondear(f.ganancia, 2) }))
      );
  };
  pintarTabla();
}
