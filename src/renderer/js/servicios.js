// Reglas de negocio compartidas: productos, precios, inventario, ventas y crédito.
import { q, q1, tx, cfg, sesion, redondear, redondearTotal, ahoraISO } from './core.js';

// ---------------------------------------------------------------- Productos
const SELECT_PRODUCTO = `
  SELECT p.*, d.nombre AS departamento, pr.nombre AS proveedor
  FROM productos p
  LEFT JOIN departamentos d ON d.id = p.departamento_id
  LEFT JOIN proveedores pr ON pr.id = p.proveedor_id`;

async function completarProducto(p) {
  if (!p) return null;
  p.tasas = await q(
    `SELECT i.id, i.nombre, i.tasa FROM producto_impuestos pi JOIN impuestos i ON i.id = pi.impuesto_id WHERE pi.producto_id = ?`,
    [p.id]
  );
  p.promociones = await q('SELECT * FROM promociones WHERE producto_id = ? ORDER BY desde', [p.id]);
  return p;
}

export async function productoPorCodigo(codigo) {
  const p = await q1(`${SELECT_PRODUCTO} WHERE p.codigo = ? COLLATE NOCASE AND p.activo = 1`, [String(codigo).trim()]);
  return completarProducto(p);
}

export async function productoPorId(id) {
  return completarProducto(await q1(`${SELECT_PRODUCTO} WHERE p.id = ?`, [id]));
}

// Busca productos por descripción. Prefijo '%' = contiene; si no, empieza con.
// También coincide por código exacto o por prefijo de código.
export async function buscarProductos(texto, limite = 200) {
  texto = String(texto || '').trim();
  let patron;
  if (texto.startsWith('%')) patron = '%' + texto.slice(1) + '%';
  else patron = texto + '%';
  return q(
    `${SELECT_PRODUCTO}
     WHERE p.activo = 1 AND (p.descripcion LIKE ? OR p.codigo LIKE ?)
     ORDER BY p.favorito DESC, p.descripcion
     LIMIT ?`,
    [patron, texto + '%', limite]
  );
}

// Suma de tasas de impuesto de un producto (0 si no se manejan impuestos).
export function tasaTotal(tasas) {
  if (!cfg('usar_impuestos') || !tasas) return 0;
  return tasas.reduce((a, t) => a + Number(t.tasa), 0);
}

// Precio que paga el cliente (con impuestos) a partir del precio registrado del producto.
export function precioFinal(precio, tasas) {
  if (!cfg('usar_impuestos') || cfg('precios_con_impuestos')) return precio;
  return redondear(precio * (1 + tasaTotal(tasas) / 100), 4);
}

export const calcularPrecio = (costo, ganancia) => redondear(costo * (1 + ganancia / 100), 4);
export const calcularGanancia = (costo, precio) => (costo > 0 ? redondear((precio / costo - 1) * 100, 2) : 0);

// Costo resultante tras una entrada de mercancía, según el método configurado.
export function nuevoCosto(existencia, costoActual, cantidadEntrada, costoEntrada) {
  if (cfg('metodo_costo') === 'ULTIMO') return costoEntrada;
  const ex = Math.max(0, existencia);
  const total = ex + cantidadEntrada;
  if (total <= 0) return costoEntrada;
  return redondear((ex * costoActual + cantidadEntrada * costoEntrada) / total, 4);
}

// ---------------------------------------------------------------- Inventario
// Genera los pasos de transacción para mover inventario.
// items: [{producto_id, cantidad (con signo), costo?}]. Los kits se expanden a sus componentes.
// existencias: Map opcional producto_id -> existencia actual (se actualiza).
export async function pasosInventario(items, tipo, motivo, existencias = new Map()) {
  if (!cfg('usar_inventario')) return [];
  const pasos = [];
  const ahora = ahoraISO();
  const expandidos = [];
  for (const it of items) {
    const p = await q1('SELECT id, tipo_venta, usa_inventario, existencia, costo FROM productos WHERE id = ?', [it.producto_id]);
    if (!p) continue;
    if (p.tipo_venta === 'K') {
      const comps = await q(
        `SELECT k.producto_id, k.cantidad, p.usa_inventario, p.existencia, p.costo
         FROM kit_componentes k JOIN productos p ON p.id = k.producto_id WHERE k.kit_id = ?`,
        [p.id]
      );
      for (const c of comps)
        expandidos.push({ prod: { id: c.producto_id, ...c }, cantidad: it.cantidad * c.cantidad, es_kit: 1, costo: c.costo });
    } else {
      expandidos.push({ prod: p, cantidad: it.cantidad, es_kit: 0, costo: it.costo ?? p.costo });
    }
  }
  for (const e of expandidos) {
    if (!e.prod.usa_inventario) continue;
    const id = e.prod.id;
    const habia = existencias.has(id) ? existencias.get(id) : e.prod.existencia;
    const hay = redondear(habia + e.cantidad, 3);
    existencias.set(id, hay);
    pasos.push({ sql: 'UPDATE productos SET existencia = ? WHERE id = ?', params: [hay, id] });
    pasos.push({
      sql: `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, habia, hay, costo, motivo, es_kit, usuario_id, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, tipo, e.cantidad, habia, hay, e.costo || 0, motivo, e.es_kit, sesion.usuario?.id, ahora],
    });
  }
  return pasos;
}

// Costo de un kit = suma de costos de sus componentes.
export async function costoKit(kitId) {
  const r = await q1(
    `SELECT COALESCE(SUM(k.cantidad * p.costo), 0) AS costo FROM kit_componentes k JOIN productos p ON p.id = k.producto_id WHERE k.kit_id = ?`,
    [kitId]
  );
  return r.costo;
}

// ---------------------------------------------------------------- Renglones del ticket
// Crea un renglón de ticket en memoria a partir de un producto.
export function nuevoRenglon(p, cantidad = 1) {
  return {
    producto_id: p.id,
    codigo: p.codigo,
    descripcion: p.descripcion,
    tipo_venta: p.tipo_venta,
    unidad: p.unidad || '',
    departamento_id: p.departamento_id,
    departamento: p.departamento,
    cantidad,
    precio: precioFinal(p.precio, p.tasas),
    mayoreo: p.mayoreo > 0 ? precioFinal(p.mayoreo, p.tasas) : 0,
    costo: p.costo,
    tasas: p.tasas || [],
    promociones: (p.promociones || []).map(pr => ({ ...pr, precio: precioFinal(pr.precio, p.tasas) })),
    usa_inventario: cfg('usar_inventario') && p.usa_inventario && p.tipo_venta !== 'K',
    existencia: p.existencia,
    es_kit: p.tipo_venta === 'K',
    es_mayoreo: false,
    precio_manual: null,
  };
}

// Artículo común (no registrado).
export function renglonComun(descripcion, cantidad, precio, tasas = []) {
  return {
    producto_id: null,
    codigo: '',
    descripcion,
    tipo_venta: 'U',
    unidad: '',
    departamento_id: null,
    departamento: null,
    cantidad,
    precio,
    mayoreo: 0,
    costo: 0,
    tasas,
    promociones: [],
    usa_inventario: false,
    existencia: null,
    es_kit: false,
    es_mayoreo: false,
    precio_manual: null,
  };
}

// Precio unitario efectivo: manual > promoción por cantidad > mayoreo > normal.
export function precioRenglon(r) {
  if (r.precio_manual != null) return r.precio_manual;
  const promo = r.promociones.find(p => r.cantidad >= p.desde && r.cantidad <= p.hasta);
  if (promo) return promo.precio;
  if (r.es_mayoreo && r.mayoreo > 0) return r.mayoreo;
  return r.precio;
}

export const importeRenglon = r => redondear(precioRenglon(r) * r.cantidad, 2);

export function totalesTicket(t) {
  let subtotal = 0;
  let impuestos = 0;
  let articulos = 0;
  let original = 0;
  const porImpuesto = {};
  for (const r of t.renglones) {
    const imp = importeRenglon(r);
    subtotal += imp;
    original += r.precio * r.cantidad;
    articulos += r.tipo_venta === 'G' ? 1 : r.cantidad;
    const tt = tasaTotal(r.tasas);
    if (tt > 0) {
      const base = imp / (1 + tt / 100);
      impuestos += imp - base;
      for (const x of r.tasas) {
        const k = `${x.nombre} (${x.tasa}%)`;
        porImpuesto[k] = porImpuesto[k] || { cobrado: 0, gravado: 0 };
        porImpuesto[k].cobrado += base * (x.tasa / 100);
        porImpuesto[k].gravado += base;
      }
    }
  }
  subtotal = redondear(subtotal, 2);
  const total = redondearTotal(subtotal);
  return {
    subtotal,
    impuestos: redondear(impuestos, 2),
    base: redondear(subtotal - impuestos, 2),
    porImpuesto,
    articulos: redondear(articulos, 3),
    descuento: redondear(original - subtotal, 2),
    total,
    redondeo: redondear(total - subtotal, 2),
  };
}

// ---------------------------------------------------------------- Registrar venta
// cobro: {forma, pagos: [{forma, monto, monto_extranjero, tipo_cambio, referencia}], pago_con, cambio, comision, notas, referencia, cliente}
// Devuelve el id (folio) de la venta.
export async function registrarVenta(ticket, cobro) {
  const tot = totalesTicket(ticket);
  const cliente = cobro.cliente || ticket.cliente;
  const credito = cobro.pagos.filter(p => p.forma === 'CREDITO').reduce((a, p) => a + p.monto, 0);
  const sig = await q1('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM ventas');
  const folio = sig.id;
  const ahora = ahoraISO();

  const pasos = [
    {
      sql: `INSERT INTO ventas (id, caja_id, turno_id, usuario_id, cliente_id, fecha, nombre_ticket, subtotal, descuento, impuestos,
              redondeo, total, comision, articulos, forma_pago, pago_con, cambio, saldo_pendiente, notas, referencia)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        folio,
        sesion.caja.id,
        sesion.turno.id,
        sesion.usuario.id,
        cliente?.id || 1,
        ahora,
        ticket.nombre,
        tot.subtotal,
        tot.descuento,
        tot.impuestos,
        tot.redondeo,
        tot.total,
        cobro.comision || 0,
        tot.articulos,
        cobro.forma,
        cobro.pago_con || 0,
        cobro.cambio || 0,
        redondear(credito, 2),
        cobro.notas || null,
        cobro.referencia || null,
      ],
    },
  ];

  const itemsInv = [];
  for (const r of ticket.renglones) {
    const imp = importeRenglon(r);
    const tt = tasaTotal(r.tasas);
    const impuesto = tt > 0 ? redondear(imp - imp / (1 + tt / 100), 4) : 0;
    const costo = r.es_kit && r.producto_id ? await costoKit(r.producto_id) : r.costo;
    pasos.push({
      sql: `INSERT INTO venta_renglones (venta_id, producto_id, codigo, descripcion, tipo_venta, unidad, departamento_id, cantidad,
              precio_original, precio, costo, importe, impuesto, tasas, es_mayoreo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        folio,
        r.producto_id,
        r.codigo,
        r.descripcion,
        r.tipo_venta,
        r.unidad,
        r.departamento_id,
        r.cantidad,
        r.precio,
        precioRenglon(r),
        costo || 0,
        imp,
        impuesto,
        JSON.stringify(r.tasas || []),
        r.es_mayoreo ? 1 : 0,
      ],
    });
    if (r.producto_id) itemsInv.push({ producto_id: r.producto_id, cantidad: -r.cantidad });
  }

  for (const p of cobro.pagos) {
    if (!p.monto) continue;
    pasos.push({
      sql: 'INSERT INTO venta_pagos (venta_id, forma, monto, monto_extranjero, tipo_cambio, referencia) VALUES (?, ?, ?, ?, ?, ?)',
      params: [folio, p.forma, redondear(p.monto, 2), p.monto_extranjero ?? null, p.tipo_cambio ?? null, p.referencia ?? null],
    });
  }

  pasos.push(...(await pasosInventario(itemsInv, 'SALIDA', `${cfg('folio_leyenda')} ${folio}`)));

  if (credito > 0 && cliente) {
    const c = await q1('SELECT saldo FROM clientes WHERE id = ?', [cliente.id]);
    const saldo = redondear(c.saldo + credito, 2);
    pasos.push({ sql: 'UPDATE clientes SET saldo = ? WHERE id = ?', params: [saldo, cliente.id] });
    pasos.push({
      sql: `INSERT INTO movimientos_credito (cliente_id, tipo, venta_id, monto, saldo, comentario, forma_pago, turno_id, usuario_id, fecha)
            VALUES (?, 'VENTA', ?, ?, ?, ?, 'CREDITO', ?, ?, ?)`,
      params: [cliente.id, folio, redondear(credito, 2), saldo, `Venta a crédito ${cfg('folio_leyenda')} ${folio}`, sesion.turno.id, sesion.usuario.id, ahora],
    });
  }

  await tx(pasos);
  return folio;
}

// ---------------------------------------------------------------- Crédito
// Registra un movimiento de crédito y actualiza el saldo del cliente.
// monto con signo (+ aumenta la deuda). Devuelve pasos de transacción.
export async function pasosCredito(clienteId, tipo, monto, { venta_id = null, ref_id = null, comentario = '', forma_pago = null } = {}) {
  const c = await q1('SELECT saldo FROM clientes WHERE id = ?', [clienteId]);
  const saldo = redondear(c.saldo + monto, 2);
  return [
    { sql: 'UPDATE clientes SET saldo = ? WHERE id = ?', params: [saldo, clienteId] },
    {
      sql: `INSERT INTO movimientos_credito (cliente_id, tipo, venta_id, ref_id, monto, saldo, comentario, forma_pago, turno_id, usuario_id, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [clienteId, tipo, venta_id, ref_id, redondear(monto, 2), saldo, comentario, forma_pago, sesion.turno?.id, sesion.usuario?.id, ahoraISO()],
    },
  ];
}

// ---------------------------------------------------------------- Caja
// Efectivo esperado en caja para un turno.
export async function efectivoEnCaja(turnoId) {
  const t = await q1('SELECT fondo FROM turnos WHERE id = ?', [turnoId]);
  const ventas = await q1(
    `SELECT COALESCE(SUM(vp.monto), 0) AS m FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
     WHERE v.turno_id = ? AND vp.forma IN ('EFECTIVO', 'DOLARES')`,
    [turnoId]
  );
  const abonos = await q1(
    `SELECT COALESCE(SUM(-monto), 0) AS m FROM movimientos_credito
     WHERE turno_id = ? AND tipo IN ('ABONO', 'LIQUIDAR', 'DEV_ABONO') AND forma_pago = 'EFECTIVO'`,
    [turnoId]
  );
  const caja = await q1(
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN monto ELSE -monto END), 0) AS m FROM movimientos_caja
     WHERE turno_id = ? AND cancelado = 0`,
    [turnoId]
  );
  const dev = await q1(`SELECT COALESCE(SUM(monto), 0) AS m FROM devoluciones WHERE turno_id = ? AND forma_reembolso = 'EFECTIVO'`, [turnoId]);
  return redondear((t?.fondo || 0) + ventas.m + abonos.m + caja.m - dev.m, 2);
}
