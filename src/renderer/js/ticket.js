// Construcción e impresión de tickets en texto monoespaciado.
import { q, q1, cfg, dinero, cant, esc, fmtFechaHora, toast } from './core.js';

const cols = () => Number(cfg('ticket_columnas')) || 32;

export const centrar = s => {
  s = String(s ?? '');
  const n = cols();
  if (s.length >= n) return s.slice(0, n);
  return ' '.repeat(Math.floor((n - s.length) / 2)) + s;
};

export const dos = (izq, der) => {
  izq = String(izq ?? '');
  der = String(der ?? '');
  const n = cols();
  const espacio = n - der.length - 1;
  if (izq.length > espacio) izq = izq.slice(0, Math.max(0, espacio));
  return izq + ' '.repeat(Math.max(1, n - izq.length - der.length)) + der;
};

export const separador = (c = '-') => c.repeat(cols());

// Parte un texto largo en renglones del ancho del ticket.
export function partir(s, ancho = cols()) {
  const res = [];
  let linea = '';
  for (const palabra of String(s ?? '').split(/\s+/)) {
    if ((linea + ' ' + palabra).trim().length > ancho) {
      if (linea) res.push(linea);
      linea = palabra.slice(0, ancho);
    } else linea = (linea + ' ' + palabra).trim();
  }
  if (linea) res.push(linea);
  return res.length ? res : [''];
}

// lineas: string | {t, b (negrita), c (centrar), g (grande)}
export function documentoTicket(lineas) {
  const negritaTodo = cfg('ticket_negritas') === 'TODO';
  const cuerpo = lineas
    .map(l => {
      if (typeof l === 'string') l = { t: l };
      if (l.img) return `<div class="c"><img src="${l.img}"></div>`;
      const txt = l.c ? centrar(l.t) : l.t;
      const b = l.b && cfg('ticket_negritas') !== 'NORMAL';
      return `<div class="${b || negritaTodo ? 'b' : ''} ${l.g ? 'g' : ''}">${esc(txt) || '&nbsp;'}</div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; }
    body { margin: 0; padding: 2mm; font-family: '${cfg('ticket_fuente')}', monospace; font-size: ${cfg('ticket_tamano')}pt; color: #000; background: #fff; }
    div { white-space: pre; line-height: 1.25; }
    .b { font-weight: bold; } .g { font-size: 1.3em; } .c { text-align: center; }
    img { max-width: 100%; filter: grayscale(1); }
  </style></head><body>${cuerpo}</body></html>`;
}

export async function imprimirLineas(lineas) {
  const imp = cfg('impresora');
  if (imp === '-') {
    toast('No hay impresora de tickets configurada', 'aviso');
    return false;
  }
  const html = documentoTicket(lineas);
  const r = await window.api.imprimirTicket(html, { impresora: imp || null });
  if (r !== true && r && r !== 'cancelled') toast('No se pudo imprimir: ' + r, 'error');
  return r === true;
}

function encabezado() {
  const l = [];
  for (let i = 0; i < Number(cfg('ticket_lineas_arriba')); i++) l.push('');
  if (cfg('ticket_logo')) l.push({ img: cfg('ticket_logo') });
  for (const e of cfg('ticket_encabezado') || []) if (e) l.push({ t: e, c: true });
  return l;
}

function pie() {
  const l = [''];
  for (const e of cfg('ticket_pie') || []) if (e) l.push({ t: e, c: true });
  for (let i = 0; i < Number(cfg('ticket_lineas_abajo')); i++) l.push('');
  return l;
}

const NOMBRES_FORMA = () => ({
  EFECTIVO: 'Efectivo',
  CREDITO: 'Crédito',
  DOLARES: 'Dólares',
  VALE: 'Vales',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: cfg('nombre_transferencia') || 'Transferencia',
  CHEQUE: 'Cheque',
  MIXTO: 'Mixto',
});
export const nombreForma = f => NOMBRES_FORMA()[f] || f;

export async function lineasVenta(ventaId, { copia = false } = {}) {
  const v = await q1(
    `SELECT v.*, u.nombre AS cajero, c.nombres || ' ' || COALESCE(c.apellidos, '') AS cliente_nombre, c.es_sistema,
            c.telefono, c.domicilio1, c.domicilio2, c.colonia, c.municipio, c.estado, c.nit, cj.nombre AS caja
     FROM ventas v JOIN usuarios u ON u.id = v.usuario_id LEFT JOIN clientes c ON c.id = v.cliente_id
     LEFT JOIN cajas cj ON cj.id = v.caja_id WHERE v.id = ?`,
    [ventaId]
  );
  if (!v) return null;
  const renglones = await q('SELECT * FROM venta_renglones WHERE venta_id = ? ORDER BY id', [ventaId]);
  const pagos = await q('SELECT * FROM venta_pagos WHERE venta_id = ?', [ventaId]);

  const l = encabezado();
  l.push('');
  if (copia) l.push({ t: '*** COPIA ***', c: true, b: true });
  if (v.estado === 'CANCELADA') l.push({ t: '*** CANCELADA ***', c: true, b: true });
  l.push(dos(`${cfg('folio_leyenda')} ${v.id}`, fmtFechaHora(v.fecha)));
  l.push(`Le atendió: ${v.cajero}`);
  if (!v.es_sistema && v.cliente_id) {
    l.push(`Cliente: ${v.cliente_nombre.trim()}`);
    if (cfg('ticket_datos_cliente')) {
      const campos = { telefono: 'Tel', domicilio1: '', domicilio2: '', colonia: '', municipio: '', estado: '', nit: 'NIT' };
      for (const c of cfg('ticket_campos_cliente') || []) {
        if (c === 'nombre' || !v[c]) continue;
        l.push(...partir((campos[c] ? campos[c] + ': ' : '') + v[c]));
      }
    }
  }
  l.push(separador());
  const conPrecio = cfg('ticket_precio_unitario');
  l.push(conPrecio ? dos('Cant Descripción', 'Importe') : dos('Cant Descripción', 'Importe'));
  l.push(separador());
  for (const r of renglones) {
    const cantidad = cant(r.cantidad) + (r.tipo_venta === 'G' && r.unidad ? r.unidad : '');
    const desc = `${cantidad} ${r.descripcion}`;
    if (cfg('ticket_descripcion_completa')) {
      const partes = partir(desc);
      partes.slice(0, -1).forEach(p => l.push(p));
      l.push(dos(partes[partes.length - 1], dinero(r.importe)));
    } else l.push(dos(desc, dinero(r.importe)));
    if (conPrecio && (r.cantidad !== 1 || r.precio !== r.precio_original))
      l.push(`   @ ${dinero(r.precio)}${r.precio < r.precio_original ? ` (antes ${dinero(r.precio_original)})` : ''}`);
    if (r.devuelto > 0) l.push(`   Devuelto: ${cant(r.devuelto)}`);
  }
  l.push(separador());
  l.push(dos('No. de artículos:', cant(v.articulos)));
  if (cfg('desglosar_impuestos') && v.impuestos > 0) {
    l.push(dos('Subtotal:', dinero(v.subtotal - v.impuestos)));
    l.push(dos('Impuestos:', dinero(v.impuestos)));
  }
  if (v.descuento > 0) l.push(dos('Ahorro:', dinero(v.descuento)));
  if (v.redondeo) l.push(dos('Redondeo:', dinero(v.redondeo)));
  if (v.comision) l.push(dos('Comisión tarjeta:', dinero(v.comision)));
  l.push({ t: dos('TOTAL:', dinero(v.total + v.comision)), b: true });
  for (const p of pagos) {
    let txt = dinero(p.monto);
    if (p.forma === 'DOLARES') txt = `US$${p.monto_extranjero} x ${p.tipo_cambio}`;
    l.push(dos(`${nombreForma(p.forma)}:`, txt));
  }
  if (v.forma_pago === 'EFECTIVO' || v.pago_con > 0) {
    if (v.pago_con) l.push(dos('Pagó con:', dinero(v.pago_con)));
    l.push(dos('Cambio:', dinero(v.cambio)));
  }
  if (v.referencia) l.push(...partir('Referencia: ' + v.referencia));
  if (v.notas) {
    l.push('');
    l.push(...partir(v.notas));
  }
  l.push(...pie());
  return l;
}

export async function imprimirVenta(ventaId, opciones = {}) {
  const l = await lineasVenta(ventaId, opciones);
  if (l) return imprimirLineas(l);
}

// Comprobante de abono / liquidación de crédito.
export async function imprimirAbono(movId) {
  const m = await q1(
    `SELECT mc.*, c.nombres || ' ' || COALESCE(c.apellidos, '') AS cliente, u.nombre AS cajero
     FROM movimientos_credito mc JOIN clientes c ON c.id = mc.cliente_id LEFT JOIN usuarios u ON u.id = mc.usuario_id WHERE mc.id = ?`,
    [movId]
  );
  const l = encabezado();
  l.push('', { t: m.tipo === 'LIQUIDAR' ? 'LIQUIDACIÓN DE ADEUDO' : 'COMPROBANTE DE ABONO', c: true, b: true }, '');
  l.push(dos(`Folio ${m.id}`, fmtFechaHora(m.fecha)));
  l.push(`Cliente: ${m.cliente.trim()}`, `Le atendió: ${m.cajero || ''}`, separador());
  l.push({ t: dos('Abono:', dinero(-m.monto)), b: true });
  l.push(dos('Forma de pago:', nombreForma(m.forma_pago)));
  l.push(dos('Saldo actual:', dinero(m.saldo)));
  if (m.comentario) l.push(...partir(m.comentario));
  l.push(...pie());
  return imprimirLineas(l);
}

export { encabezado as encabezadoTicket };
