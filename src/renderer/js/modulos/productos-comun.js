// Utilidades compartidas por las vistas del módulo Productos.
import { q, q1, run, sesion, ahoraISO, redondear } from '../core.js';

export const TIPOS_VENTA = { U: 'Unidad', G: 'Granel', K: 'Kit' };

// Devuelve el id del departamento con ese nombre; lo crea si no existe. '' = sin departamento.
export async function departamentoId(nombre) {
  nombre = String(nombre || '').trim();
  if (!nombre) return null;
  const d = await q1('SELECT id FROM departamentos WHERE nombre = ? COLLATE NOCASE', [nombre]);
  if (d) return d.id;
  return (await run('INSERT INTO departamentos (nombre) VALUES (?)', [nombre])).id;
}

export async function proveedorId(nombre) {
  nombre = String(nombre || '').trim();
  if (!nombre) return null;
  const p = await q1('SELECT id FROM proveedores WHERE nombre = ? COLLATE NOCASE AND activo = 1', [nombre]);
  if (p) return p.id;
  return (await run('INSERT INTO proveedores (nombre) VALUES (?)', [nombre])).id;
}

// Pasos para registrar cambios de costo/precio/mayoreo en el kardex.
export function pasosCambiosPrecio(anterior, nuevo) {
  const pasos = [];
  const ahora = ahoraISO();
  for (const campo of ['costo', 'precio', 'mayoreo']) {
    if (nuevo[campo] == null || anterior[campo] == null) continue;
    if (redondear(anterior[campo], 4) === redondear(nuevo[campo], 4)) continue;
    pasos.push({
      sql: 'INSERT INTO cambios_precio (producto_id, campo, anterior, nuevo, usuario_id, fecha) VALUES (?, ?, ?, ?, ?, ?)',
      params: [anterior.id, campo, anterior[campo], nuevo[campo], sesion.usuario?.id, ahora],
    });
  }
  return pasos;
}

// Borrado lógico: libera el código para que pueda reutilizarse.
export const pasoEliminar = p => ({
  sql: "UPDATE productos SET activo = 0, favorito = 0, codigo = codigo || '~borrado~' || id WHERE id = ?",
  params: [p.id],
});

export async function quitarDeKitsYPromos(id) {
  return [
    { sql: 'DELETE FROM promociones WHERE producto_id = ?', params: [id] },
    { sql: 'DELETE FROM lista_compras WHERE producto_id = ?', params: [id] },
  ];
}

// Columnas de la plantilla de importación/exportación.
export const COLUMNAS_PLANTILLA = [
  ['codigo', 'Código'],
  ['descripcion', 'Descripción'],
  ['tipo_venta', 'Tipo de venta'],
  ['unidad', 'Unidad'],
  ['costo', 'Precio costo'],
  ['precio', 'Precio venta'],
  ['mayoreo', 'Precio mayoreo'],
  ['departamento', 'Departamento'],
  ['proveedor', 'Proveedor'],
  ['existencia', 'Inventario'],
  ['minimo', 'Inventario mínimo'],
  ['maximo', 'Inventario máximo'],
  ['impuestos', 'Impuestos'],
];

export async function filasExportacion(ids = null) {
  const filas = await q(
    `SELECT p.*, d.nombre AS departamento, pr.nombre AS proveedor,
       (SELECT GROUP_CONCAT(i.nombre, '|') FROM producto_impuestos pi JOIN impuestos i ON i.id = pi.impuesto_id WHERE pi.producto_id = p.id) AS impuestos
     FROM productos p LEFT JOIN departamentos d ON d.id = p.departamento_id LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
     WHERE p.activo = 1 ${ids ? `AND p.id IN (${ids.map(() => '?').join(',')})` : ''} ORDER BY p.descripcion`,
    ids || []
  );
  return filas.map(p => ({ ...p, tipo_venta: TIPOS_VENTA[p.tipo_venta] || p.tipo_venta, existencia: p.usa_inventario ? p.existencia : '' }));
}
