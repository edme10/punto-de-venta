// Módulo Créditos (F2): estado de cuenta, abonos, liquidaciones y reporte de saldos.
import {
  q, q1, run, tx, cfg, sesion, exigir, alerta, confirmar, formulario, toast, exportarCSV,
  esc, dinero, cant, iniciales, colorAvatar, fmtFecha, fmtFechaHora, redondear, ahoraISO, sumarDias, fechaISO, $, $$,
} from '../core.js';
import { dialogoCobro } from './ventas-cobro.js';
import { imprimirVenta, imprimirAbono, imprimirLineas, encabezadoTicket, dos, separador, partir, nombreForma } from '../ticket.js';

// Reparto de cada abono/liquidación entre las ventas a crédito (para poder revertirlo al cancelar).
const TABLA_APLICACIONES = `CREATE TABLE IF NOT EXISTS credito_aplicaciones (
  movimiento_id INTEGER NOT NULL,
  venta_id INTEGER NOT NULL,
  monto REAL NOT NULL
)`;

const NOMBRE = "TRIM(c.nombres || ' ' || COALESCE(c.apellidos, ''))";

const ETIQUETAS = {
  VENTA: ['VENTA', 'azul'],
  ABONO: ['ABONO', 'verde'],
  LIQUIDAR: ['LIQUIDAR', 'verde'],
  DEV_ABONO: ['DEV ABONO', 'naranja'],
  DEVOLUCION: ['DEVOLUCIÓN', 'rojo'],
};

let raiz = null;
let vista = 'estado';
let clienteId = null;
let movimientos = [];
let movSel = -1;
let periodo = 'SIEMPRE';
let ordenSaldos = { col: 'saldo', desc: true };

export async function montar(el, idCliente = null) {
  raiz = el;
  await run(TABLA_APLICACIONES);
  if (idCliente) clienteId = idCliente;
  el.innerHTML = `
    <div class="modulo-barra">Crédito a clientes</div>
    <div class="sub-barra">
      <button class="btn" data-vista="estado">📒 Estado de cuenta</button>
      <button class="btn" data-vista="saldos">📊 Reporte de saldos</button>
    </div>
    <div class="modulo-cuerpo" data-cuerpo></div>`;
  $$('[data-vista]', el).forEach(b => (b.onclick = () => cambiarVista(b.dataset.vista)));
  await cambiarVista(vista);
  return {
    onKey(e) {
      if (vista === 'estado' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.tagName !== 'SELECT') {
        if (!movimientos.length) return true;
        movSel = Math.max(0, Math.min(movimientos.length - 1, movSel + (e.key === 'ArrowDown' ? 1 : -1)));
        pintarMovimientos();
        return true;
      }
      return false;
    },
    desmontar() {
      raiz = null;
    },
  };
}

async function cambiarVista(v) {
  vista = v;
  $$('[data-vista]', raiz).forEach(b => b.classList.toggle('activo', b.dataset.vista === v));
  if (v === 'estado') await vistaEstado();
  else await vistaSaldos();
}

// ---------------------------------------------------------------- Estado de cuenta
async function vistaEstado() {
  const cuerpo = $('[data-cuerpo]', raiz);
  cuerpo.innerHTML = `
    <div class="cred-estado">
      <div class="panel cred-clientes">
        <input data-buscar placeholder="Buscar cliente (folio, nombre, teléfono)">
        <div class="cli-items" data-lista></div>
      </div>
      <div class="cred-detalle" data-estado></div>
    </div>`;
  const buscar = $('[data-buscar]', cuerpo);
  let t;
  buscar.oninput = () => {
    clearTimeout(t);
    t = setTimeout(() => cargarClientes(buscar.value.trim()), 150);
  };
  $('[data-lista]', cuerpo).onclick = e => {
    const it = e.target.closest('[data-id]');
    if (it) seleccionarCliente(Number(it.dataset.id));
  };
  await cargarClientes('');
  if (clienteId) await seleccionarCliente(clienteId);
  else pintarSinCliente();
  setTimeout(() => buscar.focus(), 0);
}

async function cargarClientes(texto) {
  const like = '%' + texto + '%';
  const filas = await q(
    `SELECT c.id, ${NOMBRE} AS nombre, c.telefono, c.saldo, c.credito FROM clientes c
     WHERE c.activo = 1 AND c.es_sistema = 0 AND (c.credito = 1 OR c.saldo <> 0)
       AND (? = '' OR CAST(c.id AS TEXT) = ? OR ${NOMBRE} LIKE ? OR c.telefono LIKE ?)
     ORDER BY c.saldo DESC, c.nombres LIMIT 300`,
    [texto, texto, like, like]
  );
  const lista = $('[data-lista]', raiz);
  if (!lista) return;
  lista.innerHTML =
    filas
      .map(
        c => `<div class="cli-item ${c.id === clienteId ? 'sel' : ''}" data-id="${c.id}">
          <span class="avatar chico" style="background:${colorAvatar(c.nombre)}">${esc(iniciales(c.nombre))}</span>
          <div class="cli-texto"><b>${esc(c.nombre)}</b><div class="nota">#${c.id} ${esc(c.telefono || '')}</div></div>
          <span class="cli-saldo ${c.saldo > 0 ? 'rojo' : ''}">${dinero(c.saldo)}</span>
        </div>`
      )
      .join('') || '<p class="vacio">No hay clientes con crédito.<br>Autoriza el crédito en el módulo Clientes.</p>';
}

function pintarSinCliente() {
  $('[data-estado]', raiz).innerHTML = '<div class="panel"><p class="vacio">Selecciona un cliente para ver su estado de cuenta.</p></div>';
}

async function seleccionarCliente(id) {
  clienteId = id;
  movSel = -1;
  $$('[data-lista] .cli-item', raiz).forEach(x => x.classList.toggle('sel', Number(x.dataset.id) === id));
  await pintarEstado();
}

function condicionPeriodo() {
  const hoy = fechaISO();
  const desde = { MES: sumarDias(hoy, -30), TRIMESTRE: sumarDias(hoy, -90), ANIO: hoy.slice(0, 4) + '-01-01' }[periodo];
  return desde ? { sql: 'AND date(mc.fecha) >= ?', params: [desde] } : { sql: '', params: [] };
}

async function pintarEstado() {
  const c = await q1(`SELECT c.*, ${NOMBRE} AS nombre FROM clientes c WHERE c.id = ?`, [clienteId]);
  const cont = $('[data-estado]', raiz);
  if (!c || !cont) return pintarSinCliente();
  const per = condicionPeriodo();
  movimientos = await q(
    `SELECT mc.*, u.nombre AS cajero FROM movimientos_credito mc LEFT JOIN usuarios u ON u.id = mc.usuario_id
     WHERE mc.cliente_id = ? ${per.sql} ORDER BY mc.id DESC`,
    [clienteId, ...per.params]
  );
  if (movSel >= movimientos.length) movSel = movimientos.length - 1;
  if (movSel < 0 && movimientos.length) movSel = 0;
  cont.innerHTML = `
    <div class="panel cred-cabecera">
      <span class="avatar" style="background:${colorAvatar(c.nombre)}">${esc(iniciales(c.nombre))}</span>
      <div class="cred-nombre">
        <h3>${esc(c.nombre)}</h3>
        <div class="nota">Folio ${c.id}${c.telefono ? ' · Tel. ' + esc(c.telefono) : ''}${c.credito ? '' : ' · <b class="rojo">Sin crédito autorizado</b>'}</div>
      </div>
      <div class="cred-saldo">
        <div class="etq">Saldo actual</div>
        <div class="val ${c.saldo > 0 ? 'rojo' : ''}">${dinero(c.saldo)}</div>
        <div class="nota">Límite: ${c.limite == null ? 'Sin límite' : dinero(c.limite)}</div>
      </div>
    </div>
    <div class="fila cred-acciones">
      <button class="btn btn-verde" data-abonar>💵 Abonar a deuda</button>
      <button class="btn btn-primario" data-liquidar>✔ Liquidar</button>
      <button class="btn" data-imprimir>🖨 Imprimir estado de cuenta</button>
      <span class="espaciador"></span>
      <label>Movimientos:</label>
      <select data-periodo>
        ${[['SIEMPRE', 'De siempre'], ['MES', 'Último mes'], ['TRIMESTRE', 'Últimos 3 meses'], ['ANIO', 'Este año']]
          .map(([v, t]) => `<option value="${v}" ${v === periodo ? 'selected' : ''}>${t}</option>`)
          .join('')}
      </select>
    </div>
    <div class="cred-cuerpo">
      <div class="tabla-scroll cred-movs">
        <table class="tabla seleccionable">
          <thead><tr><th>Fecha/Hora</th><th>Folio</th><th>Movimiento</th><th>Descripción</th>
            <th class="num">Monto</th><th class="num">Saldo</th><th>Cajero</th></tr></thead>
          <tbody data-movs></tbody>
        </table>
      </div>
      <div class="panel cred-mov-detalle" data-mov-detalle></div>
    </div>`;
  $('[data-abonar]', cont).onclick = () => abonar(c);
  $('[data-liquidar]', cont).onclick = () => liquidar(c);
  $('[data-imprimir]', cont).onclick = () => imprimirEstado(c);
  $('[data-periodo]', cont).onchange = e => {
    periodo = e.target.value;
    movSel = -1;
    pintarEstado();
  };
  $('[data-movs]', cont).onclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    movSel = Number(tr.dataset.i);
    pintarMovimientos();
  };
  pintarMovimientos();
}

function pintarMovimientos() {
  const tb = $('[data-movs]', raiz);
  if (!tb) return;
  tb.innerHTML =
    movimientos
      .map((m, i) => {
        const [txt, color] = ETIQUETAS[m.tipo] || [m.tipo, ''];
        return `<tr data-i="${i}" class="${i === movSel ? 'sel' : ''} ${m.cancelado ? 'cancelada' : ''}">
          <td>${fmtFechaHora(m.fecha)}</td><td>${m.venta_id && m.tipo === 'VENTA' ? m.venta_id : m.id}</td>
          <td><span class="etiqueta ${color}">${txt}</span></td>
          <td>${esc(m.comentario || '')}${m.forma_pago && m.tipo !== 'VENTA' ? ` <span class="nota">(${esc(nombreForma(m.forma_pago))})</span>` : ''}</td>
          <td class="num ${m.monto < 0 ? 'verde-txt' : ''}">${dinero(m.monto)}</td>
          <td class="num">${dinero(m.saldo)}</td><td>${esc(m.cajero || '')}</td></tr>`;
      })
      .join('') || '<tr><td colspan="7" class="vacio">Sin movimientos en el periodo</td></tr>';
  tb.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });
  detalleMovimiento();
}

async function detalleMovimiento() {
  const cont = $('[data-mov-detalle]', raiz);
  if (!cont) return;
  const m = movimientos[movSel];
  if (!m) {
    cont.innerHTML = '<p class="vacio">Selecciona un movimiento</p>';
    return;
  }
  let html = `<h3>${(ETIQUETAS[m.tipo] || [m.tipo])[0]} · Folio ${m.tipo === 'VENTA' && m.venta_id ? m.venta_id : m.id}
    ${m.cancelado ? '<span class="etiqueta rojo">CANCELADO</span>' : ''}</h3>
    <div class="nota">${fmtFechaHora(m.fecha)} · Cajero: ${esc(m.cajero || '')}</div>`;
  if (m.venta_id) {
    const v = await q1('SELECT * FROM ventas WHERE id = ?', [m.venta_id]);
    const rs = await q('SELECT * FROM venta_renglones WHERE venta_id = ? ORDER BY id', [m.venta_id]);
    html += `<div class="tabla-scroll alto-200" style="margin-top:8px"><table class="tabla">
      <thead><tr><th class="num">Cant.</th><th>Descripción</th><th class="num">Importe</th></tr></thead><tbody>
      ${rs.map(r => `<tr><td class="num">${cant(r.cantidad)}</td><td>${esc(r.descripcion)}</td><td class="num">${dinero(r.importe)}</td></tr>`).join('')}
      </tbody></table></div>
      <table class="lista-montos" style="margin-top:8px">
        <tr><td>Total</td><td><b>${dinero(v.total + v.comision)}</b></td></tr>
        <tr><td>Pago con</td><td>${esc(nombreForma(v.forma_pago))}${v.pago_con ? ' ' + dinero(v.pago_con) : ''}</td></tr>
        <tr><td>Monto pendiente</td><td><b class="${v.saldo_pendiente > 0 ? 'rojo' : ''}">${dinero(v.saldo_pendiente)}</b></td></tr>
      </table>`;
  } else {
    const aps = await q(
      'SELECT a.*, v.fecha FROM credito_aplicaciones a JOIN ventas v ON v.id = a.venta_id WHERE a.movimiento_id = ? ORDER BY a.venta_id',
      [m.ref_id && m.tipo === 'DEV_ABONO' ? m.ref_id : m.id]
    );
    html += `<table class="lista-montos" style="margin-top:8px">
      <tr><td>Monto</td><td><b>${dinero(Math.abs(m.monto))}</b></td></tr>
      ${m.forma_pago ? `<tr><td>Forma de pago</td><td>${esc(nombreForma(m.forma_pago))}</td></tr>` : ''}
      <tr><td>Saldo resultante</td><td>${dinero(m.saldo)}</td></tr>
      ${m.comentario ? `<tr><td colspan="2">${esc(m.comentario)}</td></tr>` : ''}
    </table>
    ${aps.length ? `<div class="nota" style="margin-top:8px">Aplicado a: ${aps.map(a => `${esc(cfg('folio_leyenda'))} ${a.venta_id} (${dinero(a.monto)})`).join(', ')}</div>` : ''}`;
  }
  const cancelable = (m.tipo === 'ABONO' || m.tipo === 'LIQUIDAR') && !m.cancelado;
  html += `<div class="botones">
    <button class="btn" data-reimprimir ${m.tipo === 'DEVOLUCION' ? 'disabled' : ''}>🖨 Re-imprimir</button>
    <button class="btn btn-peligro" data-cancelar ${cancelable ? '' : 'disabled'}>Cancelar</button>
  </div>`;
  cont.innerHTML = html;
  $('[data-reimprimir]', cont).onclick = () => (m.venta_id && m.tipo === 'VENTA' ? imprimirVenta(m.venta_id, { copia: true }) : imprimirAbono(m.id));
  $('[data-cancelar]', cont).onclick = () => cancelarAbono(m);
}

// ---------------------------------------------------------------- Abonos y liquidaciones
// Ventas del cliente con saldo pendiente, de la más antigua a la más reciente.
const ventasPendientes = cid =>
  q('SELECT id, saldo_pendiente, fecha FROM ventas WHERE cliente_id = ? AND saldo_pendiente > 0.0001 ORDER BY fecha, id', [cid]);

// Construye los pasos para registrar abonos (uno por cada pago del cobro).
// ventas: lista FIFO sobre la que se reparte el dinero.
function pasosAbonos(cliente, tipo, pagos, ventas, comentario) {
  const pasos = [];
  const movRefs = [];
  let saldo = cliente.saldo;
  const pend = ventas.map(v => ({ ...v }));
  const ahora = ahoraISO();
  for (const p of pagos) {
    if (!(p.monto > 0)) continue;
    saldo = redondear(saldo - p.monto, 2);
    pasos.push({
      sql: `INSERT INTO movimientos_credito (cliente_id, tipo, monto, saldo, comentario, forma_pago, turno_id, usuario_id, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [cliente.id, tipo, -redondear(p.monto, 2), saldo, comentario, p.forma, sesion.turno.id, sesion.usuario.id, ahora],
    });
    const ref = pasos.length - 1;
    movRefs.push(ref);
    let resto = p.monto;
    for (const v of pend) {
      if (resto <= 0.0001) break;
      if (v.saldo_pendiente <= 0.0001) continue;
      const aplica = redondear(Math.min(resto, v.saldo_pendiente), 2);
      v.saldo_pendiente = redondear(v.saldo_pendiente - aplica, 2);
      resto = redondear(resto - aplica, 2);
      pasos.push({ sql: 'UPDATE ventas SET saldo_pendiente = ? WHERE id = ?', params: [v.saldo_pendiente, v.id] });
      pasos.push({ sql: 'INSERT INTO credito_aplicaciones (movimiento_id, venta_id, monto) VALUES (?, ?, ?)', params: [`$ref:${ref}`, v.id, aplica] });
    }
  }
  pasos.push({ sql: 'UPDATE clientes SET saldo = ? WHERE id = ?', params: [saldo, cliente.id] });
  return { pasos, movRefs };
}

// Normaliza los pagos de un cobro (el efectivo neto ya viene descontado del cambio).
function pagosDeCobro(cobro, total) {
  const pagos = cobro.pagos.filter(p => p.monto > 0).map(p => ({ forma: p.forma, monto: p.monto }));
  const suma = pagos.reduce((a, p) => a + p.monto, 0);
  if (Math.abs(suma - total) > 0.009 && pagos.length === 1) pagos[0].monto = total;
  return pagos;
}

async function abonar(c) {
  if (!exigir('creditos_ver')) return;
  c = await q1(`SELECT c.*, ${NOMBRE} AS nombre FROM clientes c WHERE c.id = ?`, [c.id]);
  if (!(c.saldo > 0.009)) return alerta('El cliente no tiene saldo pendiente.');
  const m = movimientos[movSel];
  const ventaSel = m && m.tipo === 'VENTA' && !m.cancelado ? await q1('SELECT id, saldo_pendiente, fecha FROM ventas WHERE id = ?', [m.venta_id]) : null;
  const opciones = [['TODAS', 'A todas las ventas no liquidadas (de la más antigua a la más reciente)']];
  if (ventaSel && ventaSel.saldo_pendiente > 0.009)
    opciones.push(['SELECCIONADA', `Solamente a la venta seleccionada (${cfg('folio_leyenda')} ${ventaSel.id}, pendiente ${dinero(ventaSel.saldo_pendiente)})`]);
  const r = await formulario({
    titulo: 'Abonar a deuda',
    nota: `${esc(c.nombre)} · Saldo actual: <b>${dinero(c.saldo)}</b>`,
    ancho: 560,
    campos: [
      { nombre: 'monto', etiqueta: 'Cantidad a abonar', tipo: 'dinero', valor: 0, requerido: true },
      { nombre: 'aplicar', etiqueta: 'Aplicar el abono', tipo: 'select', valor: 'TODAS', opciones },
      { nombre: 'comentario', etiqueta: 'Comentarios (opcional)', valor: '' },
    ],
    validar: r => {
      if (!(r.monto > 0)) return 'Indica la cantidad a abonar.';
      if (r.monto > c.saldo + 0.009) return `El abono no puede ser mayor al saldo (${dinero(c.saldo)}). Usa "Liquidar" para pagar todo.`;
      if (r.aplicar === 'SELECCIONADA' && r.monto > ventaSel.saldo_pendiente + 0.009)
        return `El abono supera lo pendiente de la venta seleccionada (${dinero(ventaSel.saldo_pendiente)}).`;
      return null;
    },
    aceptar: 'Continuar al cobro',
  });
  if (!r) return;
  const monto = redondear(r.monto, 2);
  const cobro = await dialogoCobro({ total: monto, permitirCredito: false, titulo: 'COBRAR ABONO' });
  if (!cobro) return;
  const ventas = r.aplicar === 'SELECCIONADA' ? [ventaSel] : await ventasPendientes(c.id);
  const comentario = r.comentario || (r.aplicar === 'SELECCIONADA' ? `Abono a ${cfg('folio_leyenda')} ${ventaSel.id}` : 'Abono a deuda');
  await registrarAbonos(c, 'ABONO', pagosDeCobro(cobro, monto), ventas, comentario, cobro);
}

async function liquidar(c) {
  if (!exigir('creditos_ver')) return;
  c = await q1(`SELECT c.*, ${NOMBRE} AS nombre FROM clientes c WHERE c.id = ?`, [c.id]);
  if (!(c.saldo > 0.009)) return alerta('El cliente no tiene saldo pendiente.');
  const ok = await confirmar(`¿Liquidar el adeudo de <b>${esc(c.nombre)}</b> por <b>${dinero(c.saldo)}</b>?`, {
    titulo: 'Liquidar',
    si: 'Liquidar adeudo',
    no: 'Cancelar',
  });
  if (!ok) return;
  const monto = redondear(c.saldo, 2);
  const cobro = await dialogoCobro({ total: monto, permitirCredito: false, titulo: 'LIQUIDAR ADEUDO' });
  if (!cobro) return;
  await registrarAbonos(c, 'LIQUIDAR', pagosDeCobro(cobro, monto), await ventasPendientes(c.id), `Liquidación adeudo: ${dinero(monto)}`, cobro);
}

async function registrarAbonos(c, tipo, pagos, ventas, comentario, cobro) {
  const { pasos, movRefs } = pasosAbonos(c, tipo, pagos, ventas, comentario);
  let ids;
  try {
    ids = await tx(pasos);
  } catch (err) {
    console.error(err);
    return alerta('No se pudo registrar el abono: ' + esc(err.message), 'Error');
  }
  toast(tipo === 'LIQUIDAR' ? 'Adeudo liquidado' : 'Abono registrado');
  if (cobro.cambio > 0) toast(`Su cambio: ${dinero(cobro.cambio)}`);
  if (cobro.imprimir) for (const ref of movRefs) await imprimirAbono(ids[ref]);
  movSel = 0;
  await cargarClientes($('[data-buscar]', raiz)?.value.trim() || '');
  await pintarEstado();
}

async function cancelarAbono(m) {
  if (!exigir('creditos_ver')) return;
  const ok = await confirmar(
    `¿Cancelar el ${m.tipo === 'LIQUIDAR' ? 'pago de liquidación' : 'abono'} #${m.id} por <b>${dinero(-m.monto)}</b>?<br>
     El saldo del cliente aumentará nuevamente. Devuelve el dinero al cliente${m.forma_pago !== 'EFECTIVO' ? ' (se recomienda en efectivo)' : ''}.`,
    { titulo: 'Cancelar abono', si: 'Sí, cancelar abono', peligro: true }
  );
  if (!ok) return;
  const c = await q1('SELECT saldo FROM clientes WHERE id = ?', [m.cliente_id]);
  const aps = await q('SELECT * FROM credito_aplicaciones WHERE movimiento_id = ?', [m.id]);
  const saldo = redondear(c.saldo - m.monto, 2);
  const pasos = [
    { sql: 'UPDATE movimientos_credito SET cancelado = 1 WHERE id = ?', params: [m.id] },
    ...aps.map(a => ({ sql: 'UPDATE ventas SET saldo_pendiente = saldo_pendiente + ? WHERE id = ?', params: [a.monto, a.venta_id] })),
    { sql: 'UPDATE clientes SET saldo = ? WHERE id = ?', params: [saldo, m.cliente_id] },
    {
      sql: `INSERT INTO movimientos_credito (cliente_id, tipo, ref_id, monto, saldo, comentario, forma_pago, turno_id, usuario_id, fecha)
            VALUES (?, 'DEV_ABONO', ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [m.cliente_id, m.id, -m.monto, saldo, `Cancelación de abono #${m.id}`, m.forma_pago, sesion.turno.id, sesion.usuario.id, ahoraISO()],
    },
  ];
  await tx(pasos);
  toast('Abono cancelado');
  movSel = 0;
  await cargarClientes($('[data-buscar]', raiz)?.value.trim() || '');
  await pintarEstado();
}

// ---------------------------------------------------------------- Impresión del estado de cuenta
async function imprimirEstado(c) {
  const movs = [...movimientos].reverse();
  const l = encabezadoTicket();
  l.push('', { t: 'ESTADO DE CUENTA', c: true, b: true }, '');
  l.push(...partir(`Cliente: ${c.nombre} (#${c.id})`));
  l.push(dos('Fecha:', fmtFechaHora(ahoraISO())));
  l.push(dos('Límite:', c.limite == null ? 'Sin límite' : dinero(c.limite)));
  l.push(separador());
  for (const m of movs) {
    const etq = (ETIQUETAS[m.tipo] || [m.tipo])[0];
    l.push(dos(`${fmtFecha(m.fecha)} ${etq}${m.cancelado ? ' (C)' : ''}`, dinero(m.monto)));
    l.push(dos(`  #${m.tipo === 'VENTA' && m.venta_id ? m.venta_id : m.id}`, 'Saldo ' + dinero(m.saldo)));
  }
  l.push(separador());
  l.push({ t: dos('SALDO ACTUAL:', dinero(c.saldo)), b: true, g: true });
  l.push('', '', '');
  await imprimirLineas(l);
}

// ---------------------------------------------------------------- Reporte de saldos
async function vistaSaldos() {
  const filas = await q(
    `SELECT c.id, ${NOMBRE} AS nombre, TRIM(COALESCE(c.domicilio1, '') || ' ' || COALESCE(c.colonia, '') || ' ' || COALESCE(c.municipio, '')) AS direccion,
            c.telefono, c.limite, c.saldo,
            (SELECT MAX(fecha) FROM movimientos_credito m WHERE m.cliente_id = c.id AND m.tipo IN ('ABONO', 'LIQUIDAR') AND m.cancelado = 0) AS ultimo_pago
     FROM clientes c WHERE c.activo = 1 AND c.es_sistema = 0 AND (c.credito = 1 OR c.saldo <> 0)`
  );
  const total = redondear(filas.reduce((a, f) => a + f.saldo, 0), 2);
  const cuerpo = $('[data-cuerpo]', raiz);
  const ordenar = () => {
    const { col, desc } = ordenSaldos;
    filas.sort((a, b) => {
      let x = a[col];
      let y = b[col];
      if (col === 'limite') {
        x = x == null ? Infinity : x;
        y = y == null ? Infinity : y;
      }
      if (typeof x === 'string' || typeof y === 'string') return (desc ? -1 : 1) * String(x || '').localeCompare(String(y || ''));
      return (desc ? -1 : 1) * ((x ?? -Infinity) - (y ?? -Infinity));
    });
  };
  const pintar = () => {
    ordenar();
    const flecha = c => (ordenSaldos.col === c ? (ordenSaldos.desc ? ' ▼' : ' ▲') : '');
    cuerpo.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="etq">Total de créditos pendientes</div><div class="val">${dinero(total)}</div></div>
        <div class="kpi"><div class="etq">Clientes con saldo</div><div class="val">${filas.filter(f => f.saldo > 0.009).length}</div></div>
        <span class="espaciador"></span>
        <div class="fila">
          <button class="btn" data-imprimir>🖨 Imprimir reporte</button>
          <button class="btn" data-exportar>📤 Exportar</button>
        </div>
      </div>
      <div class="tabla-scroll">
        <table class="tabla seleccionable">
          <thead><tr>
            <th data-orden="id">Número${flecha('id')}</th><th data-orden="nombre">Nombre / Dirección${flecha('nombre')}</th>
            <th data-orden="telefono">Teléfono${flecha('telefono')}</th><th class="num" data-orden="limite">Límite de crédito${flecha('limite')}</th>
            <th class="num" data-orden="saldo">Saldo actual${flecha('saldo')}</th><th data-orden="ultimo_pago">Último pago${flecha('ultimo_pago')}</th>
          </tr></thead>
          <tbody>${
            filas
              .map(
                f => `<tr data-id="${f.id}"><td>${f.id}</td><td><b>${esc(f.nombre)}</b>${f.direccion ? `<div class="nota">${esc(f.direccion)}</div>` : ''}</td>
                <td>${esc(f.telefono || '')}</td><td class="num">${f.limite == null ? 'Sin límite' : dinero(f.limite)}</td>
                <td class="num ${f.saldo > 0 ? 'rojo' : ''}"><b>${dinero(f.saldo)}</b></td><td>${f.ultimo_pago ? fmtFecha(f.ultimo_pago) : '—'}</td></tr>`
              )
              .join('') || '<tr><td colspan="6" class="vacio">No hay clientes con crédito</td></tr>'
          }</tbody>
          <tfoot><tr><td colspan="4">Total</td><td class="num">${dinero(total)}</td><td></td></tr></tfoot>
        </table>
      </div>`;
    $$('th[data-orden]', cuerpo).forEach(
      th =>
        (th.onclick = () => {
          const col = th.dataset.orden;
          ordenSaldos = { col, desc: ordenSaldos.col === col ? !ordenSaldos.desc : col === 'saldo' };
          pintar();
        })
    );
    $('tbody', cuerpo).ondblclick = e => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      clienteId = Number(tr.dataset.id);
      cambiarVista('estado');
    };
    $('[data-imprimir]', cuerpo).onclick = async () => {
      const l = encabezadoTicket();
      l.push('', { t: 'REPORTE DE SALDOS', c: true, b: true }, dos('Fecha:', fmtFechaHora(ahoraISO())), separador());
      for (const f of filas.filter(f => Math.abs(f.saldo) > 0.009)) {
        l.push(dos(`#${f.id} ${f.nombre}`, dinero(f.saldo)));
        if (f.ultimo_pago) l.push(`   Último pago: ${fmtFecha(f.ultimo_pago)}`);
      }
      l.push(separador(), { t: dos('TOTAL:', dinero(total)), b: true }, '', '', '');
      await imprimirLineas(l);
    };
    $('[data-exportar]', cuerpo).onclick = () =>
      exportarCSV(
        'saldos-clientes',
        [
          ['id', 'Número'],
          ['nombre', 'Nombre'],
          ['direccion', 'Dirección'],
          ['telefono', 'Teléfono'],
          ['limite_txt', 'Límite de crédito'],
          ['saldo', 'Saldo actual'],
          ['ultimo_txt', 'Último pago'],
        ],
        filas.map(f => ({ ...f, limite_txt: f.limite == null ? 'Sin límite' : f.limite, ultimo_txt: f.ultimo_pago ? fmtFecha(f.ultimo_pago) : '' }))
      );
  };
  pintar();
}
