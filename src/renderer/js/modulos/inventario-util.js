// Utilidades compartidas por los módulos Inventario y Compras: tablas ordenables
// y entradas de mercancía con actualización de costo y precios.
import { q, cfg, sesion, esc, dinero, cant, redondear, ahoraISO } from '../core.js';
import { pasosInventario, nuevoCosto, calcularGanancia } from '../servicios.js';

export const NOMBRE_TIPO = { ENTRADA: 'Entrada', SALIDA: 'Salida', AJUSTE: 'Ajuste', DEVOLUCION: 'Devolución' };

// ---------------------------------------------------------------- Tabla ordenable
// columnas: [{k, t, num, fmt(valor, fila) -> html, ancho, sinOrden}]
// opciones: {filas, vacio, seleccionable, onSeleccion(fila, i), onDoble(fila, i), claseFila(fila), pie (html de <tfoot>), check}
export function pintarTabla(cont, opciones) {
  const { columnas, filas, vacio = 'Sin datos', seleccionable = false, onSeleccion, onDoble, claseFila, pie, check } = opciones;
  const estado = (cont._tabla = cont._tabla || { orden: null, asc: true, sel: -1, marcados: new Set() });
  estado.filas = filas;
  let vista = filas.map((f, i) => ({ f, i }));
  if (estado.orden) {
    const k = estado.orden;
    vista.sort((a, b) => {
      const x = a.f[k];
      const y = b.f[k];
      const r = typeof x === 'number' || typeof y === 'number' ? (Number(x) || 0) - (Number(y) || 0) : String(x ?? '').localeCompare(String(y ?? ''), 'es');
      return estado.asc ? r : -r;
    });
  }
  const celda = (c, f) => {
    const v = f[c.k];
    return `<td class="${c.num ? 'num' : ''}">${c.fmt ? c.fmt(v, f) : esc(v ?? '')}</td>`;
  };
  cont.innerHTML = `
    <table class="tabla ${seleccionable ? 'seleccionable' : ''}">
      <thead><tr>
        ${check ? `<th style="width:30px"><input type="checkbox" data-todos></th>` : ''}
        ${columnas
          .map(
            c => `<th class="${c.num ? 'num' : ''}" ${c.sinOrden ? '' : `data-orden="${c.k}"`} ${c.ancho ? `style="width:${c.ancho}"` : ''}>${esc(c.t)}${
              estado.orden === c.k ? (estado.asc ? ' ▲' : ' ▼') : ''
            }</th>`
          )
          .join('')}
      </tr></thead>
      <tbody>${
        vista
          .map(
            ({ f, i }) => `<tr data-i="${i}" class="${i === estado.sel ? 'sel' : ''} ${claseFila ? claseFila(f) : ''}">
              ${check ? `<td><input type="checkbox" data-check="${i}" ${estado.marcados.has(i) ? 'checked' : ''}></td>` : ''}
              ${columnas.map(c => celda(c, f)).join('')}</tr>`
          )
          .join('') || `<tr><td colspan="${columnas.length + (check ? 1 : 0)}" class="vacio">${esc(vacio)}</td></tr>`
      }</tbody>
      ${pie ? `<tfoot>${pie}</tfoot>` : ''}
    </table>`;
  cont.querySelectorAll('th[data-orden]').forEach(
    th =>
      (th.onclick = () => {
        if (estado.orden === th.dataset.orden) estado.asc = !estado.asc;
        else {
          estado.orden = th.dataset.orden;
          estado.asc = true;
        }
        pintarTabla(cont, opciones);
      })
  );
  const todos = cont.querySelector('[data-todos]');
  if (todos) {
    todos.checked = filas.length > 0 && estado.marcados.size === filas.length;
    todos.onchange = () => {
      estado.marcados = todos.checked ? new Set(filas.map((_, i) => i)) : new Set();
      cont.querySelectorAll('[data-check]').forEach(c => (c.checked = todos.checked));
    };
  }
  cont.querySelectorAll('[data-check]').forEach(
    c =>
      (c.onchange = () => {
        const i = Number(c.dataset.check);
        if (c.checked) estado.marcados.add(i);
        else estado.marcados.delete(i);
      })
  );
  const tbody = cont.querySelector('tbody');
  tbody.onclick = e => {
    if (e.target.matches('input[type=checkbox]')) return;
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    estado.sel = Number(tr.dataset.i);
    tbody.querySelectorAll('tr').forEach(x => x.classList.toggle('sel', x === tr));
    if (onSeleccion) onSeleccion(filas[estado.sel], estado.sel);
  };
  tbody.ondblclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (tr && onDoble) onDoble(filas[Number(tr.dataset.i)], Number(tr.dataset.i));
  };
  return estado;
}

// Filas marcadas con casilla (o la seleccionada si no hay marcadas).
export function filasMarcadas(cont) {
  const e = cont._tabla;
  if (!e) return [];
  if (e.marcados.size) return [...e.marcados].sort((a, b) => a - b).map(i => e.filas[i]).filter(Boolean);
  return e.filas[e.sel] ? [e.filas[e.sel]] : [];
}

export const fmtDinero = v => dinero(v);
export const fmtCant = v => cant(v);

// ---------------------------------------------------------------- Departamentos
export async function opcionesDepartamentos(seleccionado = '') {
  const deps = await q('SELECT id, nombre FROM departamentos ORDER BY nombre');
  return (
    `<option value="">Todos</option><option value="0" ${seleccionado === '0' ? 'selected' : ''}>- Sin departamento -</option>` +
    deps.map(d => `<option value="${d.id}" ${String(d.id) === String(seleccionado) ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')
  );
}

// Condición SQL para el filtro de departamento ('' = todos, '0' = sin departamento).
export function condDepartamento(valor, alias = 'p') {
  if (valor === '' || valor == null) return { sql: '', params: [] };
  if (valor === '0') return { sql: ` AND ${alias}.departamento_id IS NULL`, params: [] };
  return { sql: ` AND ${alias}.departamento_id = ?`, params: [Number(valor)] };
}

// ---------------------------------------------------------------- Entradas y ajustes
// Contexto de una transacción con varias entradas: existencias y costos en curso por producto.
export const nuevoContexto = () => ({ existencias: new Map(), costos: new Map() });

// Genera los pasos para registrar una entrada (o ajuste) de un producto, actualizando
// costo (según método configurado), ganancia, precio, mayoreo, inventario y kardex de precios.
// datos: {cantidad, costo, precio, mayoreo, motivo, tipo: 'ENTRADA' | 'AJUSTE'}
export async function pasosEntradaProducto(p, datos, ctx = nuevoContexto()) {
  const { cantidad = 0, motivo = '', tipo = 'ENTRADA' } = datos;
  const existencia = ctx.existencias.has(p.id) ? ctx.existencias.get(p.id) : p.existencia;
  const costoActual = ctx.costos.has(p.id) ? ctx.costos.get(p.id) : p.costo;
  const costoEntrada = datos.costo ?? costoActual;
  let costo = costoEntrada;
  if (tipo === 'ENTRADA' && cantidad > 0) costo = nuevoCosto(existencia, costoActual, cantidad, costoEntrada);
  costo = redondear(costo, 4);
  const precio = redondear(datos.precio ?? p.precio, 4);
  const mayoreo = redondear(datos.mayoreo ?? p.mayoreo, 4);
  const pasos = [];
  if (cantidad) pasos.push(...(await pasosInventario([{ producto_id: p.id, cantidad, costo: costoEntrada }], tipo, motivo, ctx.existencias)));
  if (!ctx.existencias.has(p.id) && p.usa_inventario) ctx.existencias.set(p.id, redondear(existencia + cantidad, 3));
  ctx.costos.set(p.id, costo);

  const ahora = ahoraISO();
  const cambios = [
    ['costo', costoActual, costo],
    ['precio', p.precio, precio],
    ['mayoreo', p.mayoreo, mayoreo],
  ].filter(([, a, b]) => Math.abs((a || 0) - (b || 0)) > 0.00005);
  for (const [campo, anterior, nuevo] of cambios)
    pasos.push({
      sql: 'INSERT INTO cambios_precio (producto_id, campo, anterior, nuevo, usuario_id, fecha) VALUES (?, ?, ?, ?, ?, ?)',
      params: [p.id, campo, anterior, nuevo, sesion.usuario?.id, ahora],
    });
  if (cambios.length)
    pasos.push({
      sql: 'UPDATE productos SET costo = ?, ganancia = ?, precio = ?, mayoreo = ? WHERE id = ?',
      params: [costo, calcularGanancia(costo, precio), precio, mayoreo, p.id],
    });
  p.precio = precio;
  p.mayoreo = mayoreo;
  return pasos;
}

// Precio sugerido cuando cambia el costo: con margen automático configurado se recalcula.
export function margenAutomatico() {
  const m = Number(cfg('margen_auto'));
  return m > 0 ? m : null;
}

// Página tamaño carta para imprimir/guardar como PDF.
export function documentoCarta(titulo, cuerpoHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    @page { size: letter; margin: 15mm; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; }
    h1 { font-size: 18pt; margin: 0 0 4px; } h2 { font-size: 13pt; margin: 14px 0 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; }
    th { background: #eee; } .num { text-align: right; } .total td { font-weight: bold; }
    .datos { display: flex; justify-content: space-between; gap: 20px; }
  </style></head><body>${cuerpoHtml}</body></html>`;
}
