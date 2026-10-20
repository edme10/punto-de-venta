// Historial de ventas: consulta, devoluciones parciales, cancelación y reimpresión.
import {
  q, q1, cfg, sesion, puede, exigir, abrirModal, alerta, confirmar, formulario, toast,
  esc, dinero, cant, fmtHora, fmtFechaHora, fechaISO, redondear, ahoraISO,
} from '../core.js';
import { pasosInventario, pasosCredito } from '../servicios.js';
import { imprimirVenta, nombreForma } from '../ticket.js';

export function historialVentas() {
  const m = abrirModal({
    titulo: 'Historial de ventas',
    ancho: 1100,
    clase: 'modal-historial',
    html: `
      <div class="historial">
        <div class="historial-izq">
          <input data-buscar placeholder="Buscar por folio o nombre del ticket (% = todas)">
          <div class="tabla-scroll historial-lista">
            <table class="tabla seleccionable"><thead><tr><th>Folio</th><th class="num">Arts</th><th>Hora</th><th class="num">Total</th></tr></thead><tbody></tbody></table>
          </div>
          <div class="fila">
            <label>Del día</label><input type="date" data-fecha value="${fechaISO()}">
            <button class="btn" data-hoy>Hoy</button>
          </div>
          <div class="fila">
            <label>Cajero</label><select data-cajero><option value="">Todos</option></select>
          </div>
          <div class="nota"><span class="leyenda-credito"></span> Ventas a crédito</div>
        </div>
        <div class="historial-der" data-detalle><p class="vacio">Selecciona una venta</p></div>
      </div>
      <div class="botones"><button class="btn" data-cerrar><kbd>ESC</kbd>Cerrar ventana</button></div>`,
    onKey: (e, m) => {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.tagName !== 'SELECT') {
        mover(e.key === 'ArrowDown' ? 1 : -1);
        return true;
      }
    },
  });
  const c = m.cuerpo;
  const tbody = c.querySelector('tbody');
  const buscarEl = c.querySelector('[data-buscar]');
  const fechaEl = c.querySelector('[data-fecha]');
  const cajeroEl = c.querySelector('[data-cajero]');
  let ventas = [];
  let sel = -1;

  q('SELECT id, nombre FROM usuarios ORDER BY nombre').then(us => {
    cajeroEl.innerHTML += us.map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('');
  });

  async function cargar() {
    const texto = buscarEl.value.trim();
    const cond = [];
    const params = [];
    if (texto === '%') {
      /* todas */
    } else if (texto) {
      cond.push("(CAST(v.id AS TEXT) = ? OR v.nombre_ticket LIKE ?)");
      params.push(texto, '%' + texto + '%');
    } else {
      cond.push('date(v.fecha) = ?');
      params.push(fechaEl.value);
    }
    if (cajeroEl.value) {
      cond.push('v.usuario_id = ?');
      params.push(Number(cajeroEl.value));
    }
    ventas = await q(
      `SELECT v.* FROM ventas v ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY v.id DESC LIMIT 1000`,
      params
    );
    sel = ventas.length ? 0 : -1;
    pintarLista();
    detalle();
  }

  function pintarLista() {
    tbody.innerHTML =
      ventas
        .map(
          (v, i) => `<tr data-i="${i}" class="${i === sel ? 'sel' : ''} ${v.saldo_pendiente > 0 || v.forma_pago === 'CREDITO' ? 'credito' : ''} ${v.estado === 'CANCELADA' ? 'cancelada' : ''}">
          <td>${v.id}</td><td class="num">${cant(v.articulos)}</td><td>${texto === '%' ? fmtFechaHora(v.fecha) : fmtHora(v.fecha)}</td>
          <td class="num">${dinero(v.total + v.comision)}</td></tr>`
        )
        .join('') || '<tr><td colspan="4" class="vacio">No hay ventas</td></tr>';
    tbody.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });
  }
  let texto = '';

  function mover(d) {
    if (!ventas.length) return;
    sel = Math.max(0, Math.min(ventas.length - 1, sel + d));
    pintarLista();
    detalle();
  }

  let renglonSel = -1;
  async function detalle() {
    const cont = c.querySelector('[data-detalle]');
    const v = ventas[sel];
    if (!v) {
      cont.innerHTML = '<p class="vacio">Selecciona una venta</p>';
      return;
    }
    const info = await q1(
      `SELECT u.nombre AS cajero, TRIM(cl.nombres || ' ' || COALESCE(cl.apellidos, '')) AS cliente
       FROM ventas v JOIN usuarios u ON u.id = v.usuario_id LEFT JOIN clientes cl ON cl.id = v.cliente_id WHERE v.id = ?`,
      [v.id]
    );
    const renglones = await q('SELECT * FROM venta_renglones WHERE venta_id = ? ORDER BY id', [v.id]);
    const pagos = await q('SELECT * FROM venta_pagos WHERE venta_id = ?', [v.id]);
    const devs = await q('SELECT COALESCE(SUM(monto), 0) AS m FROM devoluciones WHERE venta_id = ?', [v.id]);
    renglonSel = -1;
    cont.innerHTML = `
      <div class="ticket-encabezado">
        <h3>${esc(cfg('folio_leyenda'))} ${v.id} ${v.estado === 'CANCELADA' ? '<span class="etiqueta rojo">CANCELADA</span>' : ''}</h3>
        <div class="fila">
          <span>Cajero: <b>${esc(info.cajero)}</b></span>
          <span>Cliente: <b>${esc(info.cliente || '')}</b></span>
          <span>${fmtFechaHora(v.fecha)}</span>
          <span class="etiqueta azul">${esc(nombreForma(v.forma_pago))}</span>
        </div>
      </div>
      <div class="tabla-scroll alto-340">
        <table class="tabla seleccionable"><thead><tr><th class="num">Cant.</th><th>Descripción</th><th class="num">Precio</th><th class="num">Importe</th><th class="num">Devuelto</th></tr></thead>
        <tbody data-renglones>${renglones
          .map(
            (r, i) => `<tr data-r="${i}"><td class="num">${cant(r.cantidad)}</td><td>${esc(r.descripcion)}</td>
              <td class="num">${dinero(r.precio)}</td><td class="num">${dinero(r.importe)}</td><td class="num">${r.devuelto ? cant(r.devuelto) : ''}</td></tr>`
          )
          .join('')}</tbody></table>
      </div>
      <div class="historial-totales">
        <div>${pagos.map(p => `${esc(nombreForma(p.forma))}: <b>${dinero(p.monto)}</b>`).join(' · ')}</div>
        ${v.pago_con ? `<div>Pagó con: <b>${dinero(v.pago_con)}</b> · Cambio: <b>${dinero(v.cambio)}</b></div>` : ''}
        ${devs[0].m ? `<div>Devuelto: <b class="rojo">${dinero(devs[0].m)}</b></div>` : ''}
        ${v.saldo_pendiente > 0 ? `<div>Saldo pendiente a crédito: <b>${dinero(v.saldo_pendiente)}</b></div>` : ''}
        <div class="total-grande">Total: ${dinero(v.total + v.comision)}</div>
      </div>
      <div class="botones">
        <button class="btn" data-notas ${v.notas ? '' : 'disabled'}>Notas</button>
        <span class="espaciador"></span>
        <button class="btn" data-devolver ${v.estado === 'CANCELADA' ? 'disabled' : ''}>↩ Devolver artículo seleccionado</button>
        <button class="btn btn-peligro" data-cancelar-venta ${v.estado === 'CANCELADA' ? 'disabled' : ''}>Cancelar venta</button>
        <button class="btn" data-copia>🖨 Imprimir copia</button>
      </div>`;
    const tb = cont.querySelector('[data-renglones]');
    tb.onclick = e => {
      const tr = e.target.closest('tr[data-r]');
      if (!tr) return;
      renglonSel = Number(tr.dataset.r);
      tb.querySelectorAll('tr').forEach(x => x.classList.toggle('sel', x === tr));
    };
    cont.querySelector('[data-notas]').onclick = () => alerta(esc(v.notas), 'Notas de la venta');
    cont.querySelector('[data-copia]').onclick = () => imprimirVenta(v.id, { copia: true });
    cont.querySelector('[data-devolver]').onclick = async () => {
      if (renglonSel < 0) return toast('Selecciona el artículo a devolver', 'aviso');
      if (await devolver(v, renglones[renglonSel])) await recargarSeleccion();
    };
    cont.querySelector('[data-cancelar-venta]').onclick = async () => {
      if (await cancelarVenta(v, renglones)) await recargarSeleccion();
    };
  }

  async function recargarSeleccion() {
    const id = ventas[sel]?.id;
    const nueva = await q1('SELECT * FROM ventas WHERE id = ?', [id]);
    if (nueva) ventas[sel] = nueva;
    pintarLista();
    detalle();
  }

  tbody.onclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    sel = Number(tr.dataset.i);
    pintarLista();
    detalle();
  };
  let t;
  buscarEl.oninput = () => {
    texto = buscarEl.value.trim();
    clearTimeout(t);
    t = setTimeout(cargar, 200);
  };
  fechaEl.onchange = cajeroEl.onchange = cargar;
  c.querySelector('[data-hoy]').onclick = () => {
    fechaEl.value = fechaISO();
    buscarEl.value = '';
    texto = '';
    cargar();
  };
  c.querySelector('[data-cerrar]').onclick = () => m.cerrar(null);
  cargar();
  return m.promesa;
}

// Reparte un monto a devolver entre el saldo a crédito pendiente de la venta y efectivo.
async function pasosReembolso(venta, monto, renglon, cantidad, costo, tipo) {
  const pasos = [];
  const v = await q1('SELECT saldo_pendiente, cliente_id FROM ventas WHERE id = ?', [venta.id]);
  const aCredito = Math.min(monto, v.saldo_pendiente);
  const enEfectivo = redondear(monto - aCredito, 2);
  const ahora = ahoraISO();
  const ins = (m, forma, c) => ({
    sql: `INSERT INTO devoluciones (venta_id, renglon_id, cantidad, monto, costo, forma_reembolso, tipo, turno_id, usuario_id, fecha)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [venta.id, renglon?.id ?? null, c, redondear(m, 2), redondear(costo * (m / monto || 0), 4), forma, tipo, sesion.turno.id, sesion.usuario.id, ahora],
  });
  if (aCredito > 0) {
    pasos.push(ins(aCredito, 'CREDITO', enEfectivo > 0 ? 0 : cantidad));
    pasos.push({ sql: 'UPDATE ventas SET saldo_pendiente = ? WHERE id = ?', params: [redondear(v.saldo_pendiente - aCredito, 2), venta.id] });
    pasos.push(
      ...(await pasosCredito(v.cliente_id, 'DEVOLUCION', -aCredito, {
        venta_id: venta.id,
        comentario: `${tipo === 'CANCELACION' ? 'Cancelación' : 'Devolución'} ${cfg('folio_leyenda')} ${venta.id}`,
      }))
    );
  }
  if (enEfectivo > 0) pasos.push(ins(enEfectivo, 'EFECTIVO', cantidad));
  return { pasos, enEfectivo };
}

async function devolver(venta, r) {
  if (!exigir('venta_cancelar')) return false;
  const disponible = redondear(r.cantidad - r.devuelto, 3);
  if (disponible <= 0) {
    await alerta('Este artículo ya fue devuelto por completo.');
    return false;
  }
  const res = await formulario({
    titulo: 'Devolver artículo',
    nota: `<b>${esc(r.descripcion)}</b><br>Vendidos: ${cant(r.cantidad)} · Ya devueltos: ${cant(r.devuelto)}`,
    campos: [{ nombre: 'cantidad', etiqueta: '¿Cuántos devuelve?', tipo: 'numero', valor: disponible }],
    aceptar: 'Devolver',
  });
  if (!res || res.cantidad <= 0) return false;
  if (res.cantidad > disponible + 0.0001) {
    await alerta(`Solo se pueden devolver ${cant(disponible)}.`);
    return false;
  }
  const monto = redondear((r.importe / r.cantidad) * res.cantidad, 2);
  const { pasos, enEfectivo } = await pasosReembolso(venta, monto, r, res.cantidad, r.costo * res.cantidad, 'DEVOLUCION');
  pasos.push({ sql: 'UPDATE venta_renglones SET devuelto = devuelto + ? WHERE id = ?', params: [res.cantidad, r.id] });
  if (r.producto_id)
    pasos.push(...(await pasosInventario([{ producto_id: r.producto_id, cantidad: res.cantidad }], 'DEVOLUCION', `Devolución ${cfg('folio_leyenda')} ${venta.id}`)));
  await window.api.tx(pasos);
  await alerta(
    `Devolución registrada por <b>${dinero(monto)}</b>.` + (enEfectivo > 0 ? `<br>Entrega <b>${dinero(enEfectivo)}</b> en efectivo al cliente.` : '<br>Se descontó del saldo a crédito del cliente.'),
    'Devolución'
  );
  return true;
}

async function cancelarVenta(venta, renglones) {
  if (!exigir('venta_cancelar')) return false;
  const pendiente = renglones.filter(r => r.cantidad - r.devuelto > 0);
  const monto = redondear(
    pendiente.reduce((a, r) => a + (r.importe / r.cantidad) * (r.cantidad - r.devuelto), 0) + (venta.redondeo || 0),
    2
  );
  const ok = await confirmar(
    `¿Cancelar la venta <b>${venta.id}</b>? Se devolverán <b>${dinero(monto)}</b> y los productos regresarán al inventario.`,
    { titulo: 'Cancelar venta', si: 'Sí, cancelar venta', no: 'No', peligro: true }
  );
  if (!ok) return false;
  const costo = pendiente.reduce((a, r) => a + r.costo * (r.cantidad - r.devuelto), 0);
  const { pasos, enEfectivo } = await pasosReembolso(venta, monto, null, 0, costo, 'CANCELACION');
  for (const r of pendiente) pasos.push({ sql: 'UPDATE venta_renglones SET devuelto = cantidad WHERE id = ?', params: [r.id] });
  pasos.push(
    ...(await pasosInventario(
      pendiente.filter(r => r.producto_id).map(r => ({ producto_id: r.producto_id, cantidad: r.cantidad - r.devuelto })),
      'DEVOLUCION',
      `Cancelación ${cfg('folio_leyenda')} ${venta.id}`
    ))
  );
  pasos.push({
    sql: "UPDATE ventas SET estado = 'CANCELADA', cancelada_fecha = ?, cancelada_turno_id = ? WHERE id = ?",
    params: [ahoraISO(), sesion.turno.id, venta.id],
  });
  await window.api.tx(pasos);
  await alerta(
    `Venta cancelada.` + (enEfectivo > 0 ? ` Entrega <b>${dinero(enEfectivo)}</b> en efectivo al cliente.` : ''),
    'Cancelación'
  );
  return true;
}
