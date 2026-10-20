// Módulo Compras y Proveedores: compras sugeridas, lista de compras, órdenes de compra,
// recepción de mercancía, proveedores e histórico de costos.
import {
  q, q1, run, tx, cfg, sesion, puede, exigir, abrirModal, alerta, confirmar, formulario, toast,
  esc, dinero, cant, num, numInput, redondear, fmtFecha, fmtFechaHora, ahoraISO,
  exportarCSV, selectorPeriodo, $,
} from '../core.js';
import { productoPorCodigo, productoPorId, calcularPrecio, calcularGanancia } from '../servicios.js';
import { buscarProducto, conectarCampoCodigo, conCalculadora } from '../componentes.js';
import {
  pintarTabla, filasMarcadas, fmtDinero, fmtCant, opcionesDepartamentos, condDepartamento,
  pasosEntradaProducto, nuevoContexto, margenAutomatico, documentoCarta,
} from './inventario-util.js';

const puedeVerCompras = () => puede('compras_crear') || puede('compras_recibir');

const VISTAS = [
  { id: 'sugeridas', titulo: 'Compras sugeridas', fn: vistaSugeridas, permiso: 'compras_crear' },
  { id: 'lista', titulo: 'Lista de compras', fn: vistaLista, permiso: 'compras_crear' },
  { id: 'ordenes', titulo: 'Órdenes de compra', fn: vistaOrdenes },
  { id: 'proveedores', titulo: 'Proveedores', fn: vistaProveedores },
  { id: 'historico', titulo: 'Histórico de compras', fn: vistaHistorico },
];

const ESTADOS = {
  BORRADOR: ['En captura', 'naranja'],
  ENVIADA: ['Enviada', 'azul'],
  RECIBIDA: ['Recibida', 'verde'],
  CANCELADA: ['Cancelada', 'rojo'],
};
const etiquetaEstado = e => `<span class="etiqueta ${ESTADOS[e]?.[1] || ''}">${esc(ESTADOS[e]?.[0] || e)}</span>`;

let vistaActual = 'ordenes';
let cuerpo = null;
let mostrar = null;

export async function montar(el) {
  el.innerHTML = `
    <div class="modulo-barra">Compras <span class="sub-titulo" data-subtitulo></span></div>
    <div class="sub-barra">${VISTAS.map(v => `<button class="btn" data-vista="${v.id}">${esc(v.titulo)}</button>`).join('')}</div>
    <div class="modulo-cuerpo" data-cuerpo></div>`;
  cuerpo = $('[data-cuerpo]', el);
  if (!puedeVerCompras()) {
    $('.sub-barra', el).hidden = true;
    cuerpo.innerHTML = '<div class="panel">No tienes permiso para crear ni recibir órdenes de compra.</div>';
    return {};
  }
  mostrar = async (id, ...args) => {
    const v = VISTAS.find(x => x.id === id);
    if (!v || (v.permiso && !exigir(v.permiso))) return;
    vistaActual = id;
    el.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('activo', b.dataset.vista === id));
    $('[data-subtitulo]', el).textContent = '· ' + v.titulo;
    cuerpo.innerHTML = '';
    cuerpo._tabla = null;
    await v.fn(cuerpo, ...args);
  };
  el.querySelector('.sub-barra').onclick = e => {
    const b = e.target.closest('[data-vista]');
    if (b) mostrar(b.dataset.vista);
  };
  const v = VISTAS.find(x => x.id === vistaActual && (!x.permiso || puede(x.permiso))) || VISTAS.find(x => x.id === 'ordenes');
  await mostrar(v.id);
  return {
    onKey: () => false,
    desmontar() {
      cuerpo = null;
    },
  };
}

// ---------------------------------------------------------------- Proveedores (utilidades)
const listaProveedores = () => q('SELECT * FROM proveedores WHERE activo = 1 ORDER BY nombre');

async function crearProveedorRapido() {
  const r = await formulario({
    titulo: 'Nuevo proveedor',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre o razón social', requerido: true },
      { nombre: 'representante', etiqueta: 'Representante' },
      { nombre: 'telefono', etiqueta: 'Teléfono' },
      { nombre: 'email', etiqueta: 'Correo electrónico' },
    ],
    aceptar: 'Guardar proveedor',
  });
  if (!r) return null;
  const { id } = await run('INSERT INTO proveedores (nombre, representante, telefono, email) VALUES (?, ?, ?, ?)', [
    r.nombre, r.representante, r.telefono, r.email,
  ]);
  return id;
}

// Pide elegir un proveedor (o crear uno nuevo). Devuelve el id o null.
async function elegirProveedor({ titulo = 'Elegir proveedor', nota = '', valor = '' } = {}) {
  const provs = await listaProveedores();
  const r = await formulario({
    titulo,
    nota,
    campos: [
      {
        nombre: 'proveedor',
        etiqueta: 'Proveedor',
        tipo: 'select',
        valor: valor || provs[0]?.id || 'NUEVO',
        opciones: [...provs.map(p => [p.id, p.nombre]), ['NUEVO', '+ Nuevo proveedor…']],
      },
    ],
    aceptar: 'Aceptar',
  });
  if (!r) return null;
  if (r.proveedor === 'NUEVO') return crearProveedorRapido();
  return Number(r.proveedor);
}

// ---------------------------------------------------------------- Crear órdenes de compra
// items: [{producto_id, cantidad, proveedor_id, costo}]. Agrupa por proveedor y crea órdenes en captura.
async function crearOrdenes(items) {
  if (!exigir('compras_crear')) return [];
  if (!items.length) {
    toast('Selecciona al menos un producto', 'aviso');
    return [];
  }
  const sinProveedor = items.filter(i => !i.proveedor_id);
  if (sinProveedor.length) {
    const prov = await elegirProveedor({
      titulo: 'Productos sin proveedor',
      nota: `${sinProveedor.length} producto(s) no tienen proveedor asignado. Elige a quién se le pedirán.`,
    });
    if (!prov) return [];
    sinProveedor.forEach(i => (i.proveedor_id = prov));
  }
  const grupos = new Map();
  for (const i of items) {
    if (!grupos.has(i.proveedor_id)) grupos.set(i.proveedor_id, []);
    grupos.get(i.proveedor_id).push(i);
  }
  const ids = [];
  for (const [prov, renglones] of grupos) {
    const pasos = [
      {
        sql: "INSERT INTO ordenes_compra (proveedor_id, estado, usuario_id, creada) VALUES (?, 'BORRADOR', ?, ?)",
        params: [prov, sesion.usuario.id, ahoraISO()],
      },
      ...renglones.map(r => ({
        sql: 'INSERT INTO orden_renglones (orden_id, producto_id, cantidad, costo) VALUES (?, ?, ?, ?)',
        params: ['$ref:0', r.producto_id, r.cantidad, r.costo || 0],
      })),
    ];
    const res = await tx(pasos);
    ids.push(res[0]);
  }
  toast(ids.length === 1 ? `Se creó la orden de compra ${ids[0]}` : `Se crearon ${ids.length} órdenes de compra`);
  return ids;
}

// ---------------------------------------------------------------- Compras sugeridas
async function vistaSugeridas(c) {
  c.innerHTML = `
    <p class="nota">Productos con existencia igual o menor a su inventario mínimo. Cantidad sugerida = máximo − existencia.</p>
    <div class="fila barra-filtros">
      <label>Departamento</label><select data-dep>${await opcionesDepartamentos()}</select>
      <span class="espaciador"></span>
      <button class="btn" data-lista>🛒 Enviar a la lista de compras</button>
      <button class="btn btn-primario" data-orden>📝 Crear órdenes de compra</button>
    </div>
    <div class="tabla-scroll inv-tabla" data-tabla></div>`;
  if (!cfg('usar_inventario')) {
    c.innerHTML = '<div class="panel aviso-inventario">Las compras sugeridas requieren activar el control de inventario.</div>';
    return;
  }
  const tabla = $('[data-tabla]', c);
  let filas = [];
  const cargar = async () => {
    const d = condDepartamento($('[data-dep]', c).value);
    filas = await q(
      `SELECT p.id AS producto_id, p.codigo, p.descripcion, p.existencia, p.minimo, p.maximo, p.costo,
              p.proveedor_id, pr.nombre AS proveedor
       FROM productos p LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
       WHERE p.activo = 1 AND p.usa_inventario = 1 AND p.tipo_venta <> 'K' AND p.existencia <= p.minimo ${d.sql}
       ORDER BY pr.nombre, p.descripcion`,
      d.params
    );
    for (const f of filas) {
      const s = f.maximo > f.existencia ? f.maximo - f.existencia : f.minimo - f.existencia;
      f.sugerida = Math.max(1, Math.ceil(redondear(s, 3)));
    }
    tabla._tabla = null;
    pintarTabla(tabla, {
      filas,
      check: true,
      seleccionable: true,
      vacio: 'No hay productos por debajo de su mínimo',
      columnas: [
        { k: 'codigo', t: 'Código' },
        { k: 'descripcion', t: 'Descripción' },
        { k: 'existencia', t: 'Existencia', num: true, fmt: v => `<b class="${v <= 0 ? 'rojo' : ''}">${cant(v)}</b>` },
        { k: 'minimo', t: 'Mínimo', num: true, fmt: fmtCant },
        { k: 'maximo', t: 'Máximo', num: true, fmt: fmtCant },
        { k: 'sugerida', t: 'Sugerida', num: true, fmt: v => `<b>${cant(v)}</b>` },
        { k: 'costo', t: 'Costo', num: true, fmt: fmtDinero },
        { k: 'proveedor', t: 'Proveedor', fmt: v => (v ? esc(v) : '<span class="nota">Sin proveedor</span>') },
      ],
    });
  };
  $('[data-dep]', c).onchange = cargar;
  $('[data-lista]', c).onclick = async () => {
    const sel = filasMarcadas(tabla);
    if (!sel.length) return toast('Marca los productos a enviar', 'aviso');
    await enviarALista(sel.map(f => ({ producto_id: f.producto_id, cantidad: f.sugerida, proveedor_id: f.proveedor_id })));
    toast(`${sel.length} producto(s) enviados a la lista de compras`);
  };
  $('[data-orden]', c).onclick = async () => {
    const sel = filasMarcadas(tabla);
    const ids = await crearOrdenes(sel.map(f => ({ producto_id: f.producto_id, cantidad: f.sugerida, proveedor_id: f.proveedor_id, costo: f.costo })));
    if (ids.length) mostrar('ordenes', ids[0]);
  };
  await cargar();
}

async function enviarALista(items) {
  const pasos = items.map(i => ({
    sql: `INSERT INTO lista_compras (producto_id, cantidad, proveedor_id) VALUES (?, ?, ?)
          ON CONFLICT(producto_id) DO UPDATE SET cantidad = excluded.cantidad,
            proveedor_id = COALESCE(excluded.proveedor_id, lista_compras.proveedor_id)`,
    params: [i.producto_id, i.cantidad, i.proveedor_id || null],
  }));
  if (pasos.length) await tx(pasos);
}

// ---------------------------------------------------------------- Lista de compras
async function vistaLista(c) {
  c.innerHTML = `
    <div class="panel">
      <div class="fila">
        <label>Código</label><input data-codigo placeholder="Escanea o escribe (F10 para buscar)" autocomplete="off">
        <button class="btn" data-buscar><kbd>F10</kbd>Buscar</button>
        <label>Cantidad</label><input class="num corto" data-cant value="1">
        <button class="btn btn-primario" data-agregar>Agregar a la lista</button>
      </div>
    </div>
    <div class="fila barra-filtros">
      <button class="btn" data-modificar>✏️ Modificar</button>
      <button class="btn" data-asignar>🏷 Asignar proveedor</button>
      <button class="btn" data-quitar>✕ Quitar de la lista</button>
      <span class="espaciador"></span>
      <button class="btn btn-primario" data-crear>📝 Crear orden de compra</button>
    </div>
    <div class="tabla-scroll inv-tabla" data-tabla></div>`;
  const tabla = $('[data-tabla]', c);
  const input = $('[data-codigo]', c);
  let pendiente = null;
  let filas = [];

  const cargar = async () => {
    filas = await q(
      `SELECT l.id, l.producto_id, l.cantidad, l.proveedor_id, p.codigo, p.descripcion, p.existencia, p.minimo, p.maximo,
              p.costo, p.usa_inventario, pr.nombre AS proveedor, l.cantidad * p.costo AS importe
       FROM lista_compras l JOIN productos p ON p.id = l.producto_id LEFT JOIN proveedores pr ON pr.id = l.proveedor_id
       ORDER BY pr.nombre, p.descripcion`
    );
    tabla._tabla = null;
    const total = filas.reduce((a, f) => a + f.importe, 0);
    pintarTabla(tabla, {
      filas,
      check: true,
      seleccionable: true,
      vacio: 'La lista de compras está vacía',
      onDoble: f => modificar([f]),
      columnas: [
        { k: 'codigo', t: 'Código' },
        { k: 'descripcion', t: 'Descripción' },
        { k: 'existencia', t: 'Existencia', num: true, fmt: (v, f) => (f.usa_inventario ? cant(v) : 'Ilim') },
        { k: 'minimo', t: 'Mín.', num: true, fmt: fmtCant },
        { k: 'maximo', t: 'Máx.', num: true, fmt: fmtCant },
        { k: 'cantidad', t: 'Cantidad a ordenar', num: true, fmt: v => `<b>${cant(v)}</b>` },
        { k: 'proveedor', t: 'Proveedor', fmt: v => (v ? esc(v) : '<span class="nota">Sin proveedor</span>') },
        { k: 'costo', t: 'Costo', num: true, fmt: fmtDinero },
        { k: 'importe', t: 'Importe', num: true, fmt: fmtDinero },
      ],
      pie: filas.length ? `<tr><td colspan="9">Total estimado</td><td class="num">${dinero(total)}</td></tr>` : '',
    });
  };

  const agregar = async p => {
    p = p || pendiente;
    if (!p) return;
    const cantidad = num($('[data-cant]', c).value) || 1;
    await enviarALista([{ producto_id: p.id, cantidad, proveedor_id: p.proveedor_id }]);
    toast(`${p.descripcion} agregado a la lista`);
    input.value = '';
    $('[data-cant]', c).value = '1';
    pendiente = null;
    input.focus();
    await cargar();
  };
  conectarCampoCodigo(input, p => {
    pendiente = p;
    $('[data-cant]', c).focus();
    $('[data-cant]', c).select();
  });
  $('[data-cant]', c).addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      agregar();
    }
  });
  $('[data-buscar]', c).onclick = async () => {
    const p = await buscarProducto();
    if (p) {
      pendiente = await productoPorCodigo(p.codigo);
      input.value = p.codigo;
      $('[data-cant]', c).focus();
      $('[data-cant]', c).select();
    }
  };
  $('[data-agregar]', c).onclick = async () => {
    if (!pendiente && input.value.trim()) pendiente = await productoPorCodigo(input.value.trim());
    if (!pendiente) return toast('Escribe un código válido', 'aviso');
    agregar();
  };

  const modificar = async sel => {
    if (!sel.length) return toast('Selecciona un producto de la lista', 'aviso');
    const f = sel[0];
    const provs = await listaProveedores();
    const r = await formulario({
      titulo: 'Modificar producto de la lista',
      nota: `<b>${esc(f.descripcion)}</b>`,
      campos: [
        { nombre: 'cantidad', etiqueta: 'Cantidad a ordenar', tipo: 'numero', valor: f.cantidad },
        {
          nombre: 'proveedor',
          etiqueta: 'Proveedor',
          tipo: 'select',
          valor: f.proveedor_id || '',
          opciones: [['', '- Sin proveedor -'], ...provs.map(p => [p.id, p.nombre]), ['NUEVO', '+ Nuevo proveedor…']],
        },
      ],
      aceptar: 'Guardar',
    });
    if (!r) return;
    let prov = r.proveedor === '' ? null : r.proveedor === 'NUEVO' ? await crearProveedorRapido() : Number(r.proveedor);
    await run('UPDATE lista_compras SET cantidad = ?, proveedor_id = ? WHERE id = ?', [r.cantidad > 0 ? r.cantidad : f.cantidad, prov, f.id]);
    await cargar();
  };
  $('[data-modificar]', c).onclick = () => modificar(filasMarcadas(tabla));
  $('[data-asignar]', c).onclick = async () => {
    const sel = filasMarcadas(tabla);
    if (!sel.length) return toast('Marca los productos', 'aviso');
    const prov = await elegirProveedor({ titulo: 'Asignar proveedor', nota: `Se asignará a ${sel.length} producto(s).` });
    if (!prov) return;
    await tx(sel.map(f => ({ sql: 'UPDATE lista_compras SET proveedor_id = ? WHERE id = ?', params: [prov, f.id] })));
    await cargar();
  };
  $('[data-quitar]', c).onclick = async () => {
    const sel = filasMarcadas(tabla);
    if (!sel.length) return toast('Marca los productos', 'aviso');
    if (!(await confirmar(`¿Quitar ${sel.length} producto(s) de la lista de compras?`))) return;
    await tx(sel.map(f => ({ sql: 'DELETE FROM lista_compras WHERE id = ?', params: [f.id] })));
    await cargar();
  };
  $('[data-crear]', c).onclick = async () => {
    let sel = filasMarcadas(tabla);
    if (!tabla._tabla?.marcados.size && filas.length) {
      if (!(await confirmar('No marcaste productos. ¿Crear órdenes con <b>toda</b> la lista?', { si: 'Sí, toda la lista' }))) return;
      sel = filas;
    }
    const ids = await crearOrdenes(sel.map(f => ({ producto_id: f.producto_id, cantidad: f.cantidad, proveedor_id: f.proveedor_id, costo: f.costo })));
    if (!ids.length) return;
    await tx(sel.map(f => ({ sql: 'DELETE FROM lista_compras WHERE id = ?', params: [f.id] })));
    mostrar('ordenes', ids[0]);
  };
  await cargar();
  input.focus();
}

// ---------------------------------------------------------------- Órdenes de compra
const PERIODOS_ORDENES = [
  [7, '1 semana'], [14, '2 semanas'], [30, '1 mes'], [90, '3 meses'], [180, '6 meses'], [365, '1 año'], [0, 'Siempre'],
];
let periodoOrdenes = 30;

async function vistaOrdenes(c, seleccionarId = null) {
  c.innerHTML = `
    <div class="maestro-detalle compras-ordenes">
      <div class="panel ordenes-lista">
        <button class="btn btn-primario" data-nueva style="width:100%">＋ Nueva orden de compra</button>
        <div class="fila" style="margin-top:10px">
          <label>Mostrar órdenes desde</label>
          <select data-periodo>${PERIODOS_ORDENES.map(([v, t]) => `<option value="${v}" ${v === periodoOrdenes ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <input data-buscar placeholder="Buscar por folio o proveedor" style="width:100%;margin-top:8px">
        <div class="tabla-scroll" data-tabla style="margin-top:8px"></div>
      </div>
      <div data-detalle><div class="panel"><p class="vacio">Selecciona una orden de compra</p></div></div>
    </div>`;
  const tabla = $('[data-tabla]', c);
  const detalle = $('[data-detalle]', c);
  let filas = [];
  let selId = seleccionarId;

  const cargar = async () => {
    const cond = [];
    const params = [];
    if (periodoOrdenes > 0) cond.push(`o.creada >= datetime('now', 'localtime', ?)`), params.push(`-${periodoOrdenes} days`);
    const t = $('[data-buscar]', c).value.trim();
    if (t) cond.push('(CAST(o.id AS TEXT) = ? OR pr.nombre LIKE ?)'), params.push(t, '%' + t + '%');
    filas = await q(
      `SELECT o.*, pr.nombre AS proveedor,
              (SELECT COALESCE(SUM(cantidad * costo), 0) FROM orden_renglones r WHERE r.orden_id = o.id) AS total
       FROM ordenes_compra o JOIN proveedores pr ON pr.id = o.proveedor_id
       ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY o.id DESC`,
      params
    );
    const est = pintarTabla(tabla, {
      filas,
      seleccionable: true,
      vacio: 'No hay órdenes en el periodo',
      onSeleccion: f => {
        selId = f.id;
        mostrarDetalle(f.id);
      },
      onDoble: f => {
        if (f.estado === 'ENVIADA') recibir(f.id);
      },
      columnas: [
        { k: 'id', t: 'Folio', num: true },
        { k: 'proveedor', t: 'Proveedor' },
        { k: 'creada', t: 'Fecha', fmt: v => fmtFecha(v) },
        { k: 'estado', t: 'Estado', fmt: v => etiquetaEstado(v) },
      ],
    });
    const i = filas.findIndex(f => f.id === selId);
    if (i >= 0) {
      est.sel = i;
      tabla.querySelectorAll('tbody tr').forEach(tr => tr.classList.toggle('sel', Number(tr.dataset.i) === i));
      tabla.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });
    }
  };

  const refrescar = async () => {
    await cargar();
    if (selId) await mostrarDetalle(selId);
  };

  async function mostrarDetalle(id) {
    const o = await q1(
      `SELECT o.*, pr.nombre AS proveedor, pr.telefono, pr.email, pr.representante, u.nombre AS usuario
       FROM ordenes_compra o JOIN proveedores pr ON pr.id = o.proveedor_id LEFT JOIN usuarios u ON u.id = o.usuario_id WHERE o.id = ?`,
      [id]
    );
    if (!o) {
      detalle.innerHTML = '<div class="panel"><p class="vacio">Selecciona una orden de compra</p></div>';
      return;
    }
    const renglones = await renglonesOrden(id);
    const editable = o.estado === 'BORRADOR' && puede('compras_crear');
    const recibida = o.estado === 'RECIBIDA';
    const total = renglones.reduce((a, r) => a + r.cantidad * r.costo, 0);
    const totalRecibido = renglones.reduce((a, r) => a + (r.recibido || 0) * (r.costo_recibido || 0), 0);
    detalle.innerHTML = `
      <div class="panel orden-detalle">
        <div class="fila orden-encabezado">
          <h3>Orden de compra ${o.id} ${etiquetaEstado(o.estado)}</h3>
          <span class="espaciador"></span>
          <span class="nota">Creada ${fmtFechaHora(o.creada)}${o.enviada ? ` · Enviada ${fmtFechaHora(o.enviada)}` : ''}${
            o.recibida ? ` · Recibida ${fmtFechaHora(o.recibida)}` : ''
          }${o.cancelada ? ` · Cancelada ${fmtFechaHora(o.cancelada)}` : ''}</span>
        </div>
        <div class="fila"><span>Proveedor: <b>${esc(o.proveedor)}</b></span>
          ${o.representante ? `<span class="nota">${esc(o.representante)}</span>` : ''}
          ${o.telefono ? `<span class="nota">Tel. ${esc(o.telefono)}</span>` : ''}
          ${o.email ? `<span class="nota">${esc(o.email)}</span>` : ''}</div>
        ${
          editable
            ? `<div class="fila agregar-renglon">
                <input data-codigo placeholder="Código del producto (F10 para buscar)" autocomplete="off">
                <button class="btn" data-buscar-prod><kbd>F10</kbd>Buscar</button>
                <input class="num corto" data-cant value="1">
                <button class="btn" data-agregar-prod>Agregar</button></div>`
            : ''
        }
        <div class="tabla-scroll orden-renglones">
          <table class="tabla">
            <thead><tr><th>Código</th><th>Descripción</th><th class="num">Cantidad</th><th class="num">Costo</th><th class="num">Importe</th>
              ${recibida ? '<th class="num">Recibido</th><th class="num">Costo recibido</th>' : ''}${editable ? '<th></th>' : ''}</tr></thead>
            <tbody>${
              renglones
                .map(
                  r => `<tr data-r="${r.id}">
                  <td>${esc(r.codigo)}</td><td>${esc(r.descripcion)}</td>
                  <td class="num">${editable ? `<input class="num corto" data-campo="cantidad" value="${numInput(r.cantidad, 3)}">` : cant(r.cantidad)}</td>
                  <td class="num">${editable ? `<input class="num corto" data-campo="costo" value="${numInput(r.costo, 2)}">` : dinero(r.costo)}</td>
                  <td class="num">${dinero(r.cantidad * r.costo)}</td>
                  ${recibida ? `<td class="num">${cant(r.recibido || 0)}</td><td class="num">${dinero(r.costo_recibido || 0)}</td>` : ''}
                  ${editable ? `<td><button class="btn btn-icono" data-quitar="${r.id}" title="Quitar">✕</button></td>` : ''}</tr>`
                )
                .join('') || `<tr><td colspan="7" class="vacio">La orden no tiene productos</td></tr>`
            }</tbody>
            <tfoot><tr><td colspan="4">Total ${recibida ? 'ordenado' : 'estimado'}</td><td class="num">${dinero(total)}</td>
              ${recibida ? `<td>Total recibido</td><td class="num">${dinero(totalRecibido)}</td>` : ''}${editable ? '<td></td>' : ''}</tr></tfoot>
          </table>
        </div>
        <label>Notas para el proveedor</label>
        <textarea data-notas rows="2" ${editable ? '' : 'disabled'} style="width:100%">${esc(o.notas || '')}</textarea>
        <div class="botones">
          ${o.estado !== 'CANCELADA' ? '<button class="btn" data-imprimir>🖨 Imprimir / PDF</button><button class="btn" data-exportar>📤 Exportar</button>' : ''}
          <span class="espaciador"></span>
          ${['BORRADOR', 'ENVIADA'].includes(o.estado) && puede('compras_crear') ? '<button class="btn btn-peligro" data-cancelar-orden>Cancelar orden…</button>' : ''}
          ${editable ? '<button class="btn btn-primario" data-terminar>Terminar orden y enviar…</button>' : ''}
          ${o.estado === 'ENVIADA' && puede('compras_recibir') ? '<button class="btn btn-verde" data-recibir>📥 Recibir orden de compra</button>' : ''}
        </div>
      </div>`;

    if (editable) {
      const input = $('[data-codigo]', detalle);
      let pendiente = null;
      const agregarProd = async p => {
        p = p || pendiente;
        if (!p) return;
        if (p.tipo_venta === 'K') return alerta('Los paquetes (kits) no se compran; agrega sus componentes.');
        const cantidad = num($('[data-cant]', detalle).value) || 1;
        const ya = renglones.find(r => r.producto_id === p.id);
        if (ya) await run('UPDATE orden_renglones SET cantidad = cantidad + ? WHERE id = ?', [cantidad, ya.id]);
        else await run('INSERT INTO orden_renglones (orden_id, producto_id, cantidad, costo) VALUES (?, ?, ?, ?)', [o.id, p.id, cantidad, p.costo]);
        await mostrarDetalle(o.id);
        $('[data-codigo]', detalle)?.focus();
        cargar();
      };
      conectarCampoCodigo(input, p => {
        pendiente = p;
        $('[data-cant]', detalle).focus();
        $('[data-cant]', detalle).select();
      });
      $('[data-cant]', detalle).addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          agregarProd();
        }
      });
      $('[data-buscar-prod]', detalle).onclick = async () => {
        const p = await buscarProducto();
        if (p) {
          pendiente = await productoPorCodigo(p.codigo);
          input.value = p.codigo;
          $('[data-cant]', detalle).focus();
        }
      };
      $('[data-agregar-prod]', detalle).onclick = async () => {
        if (!pendiente && input.value.trim()) pendiente = await productoPorCodigo(input.value.trim());
        if (!pendiente) return toast('Escribe un código válido', 'aviso');
        agregarProd();
      };
      detalle.querySelectorAll('[data-campo]').forEach(i => {
        i.onchange = async () => {
          const id = Number(i.closest('tr').dataset.r);
          const v = num(i.value);
          if (i.dataset.campo === 'cantidad' && !(v > 0)) return mostrarDetalle(o.id);
          await run(`UPDATE orden_renglones SET ${i.dataset.campo === 'cantidad' ? 'cantidad' : 'costo'} = ? WHERE id = ?`, [Math.max(0, v), id]);
          await mostrarDetalle(o.id);
        };
        i.onkeydown = e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            i.blur();
          }
        };
      });
      detalle.querySelectorAll('[data-quitar]').forEach(
        b =>
          (b.onclick = async () => {
            await run('DELETE FROM orden_renglones WHERE id = ?', [Number(b.dataset.quitar)]);
            await mostrarDetalle(o.id);
          })
      );
      $('[data-notas]', detalle).onchange = e => run('UPDATE ordenes_compra SET notas = ? WHERE id = ?', [e.target.value, o.id]);
      $('[data-terminar]', detalle).onclick = async () => {
        await run('UPDATE ordenes_compra SET notas = ? WHERE id = ?', [$('[data-notas]', detalle).value, o.id]);
        if (!(await renglonesOrden(o.id)).length) return alerta('Agrega al menos un producto a la orden.');
        const ok = await confirmar(`¿Terminar la orden de compra <b>${o.id}</b>? Ya no podrás modificar sus productos.`, {
          titulo: 'Terminar orden',
          si: 'Sí, terminar y enviar orden',
          no: 'No',
        });
        if (!ok) return;
        await run("UPDATE ordenes_compra SET estado = 'ENVIADA', enviada = ? WHERE id = ?", [ahoraISO(), o.id]);
        await refrescar();
        await opcionesEnvio(o.id);
      };
    }
    $('[data-imprimir]', detalle)?.addEventListener('click', () => imprimirOrden(o.id));
    $('[data-exportar]', detalle)?.addEventListener('click', () => exportarOrden(o.id));
    $('[data-recibir]', detalle)?.addEventListener('click', () => recibir(o.id));
    $('[data-cancelar-orden]', detalle)?.addEventListener('click', async () => {
      const ok = await confirmar(`¿Cancelar la orden de compra <b>${o.id}</b>? (No se notificará al proveedor.)`, {
        titulo: 'Cancelar orden',
        si: 'Sí, cancelar orden',
        no: 'No',
        peligro: true,
      });
      if (!ok) return;
      await run("UPDATE ordenes_compra SET estado = 'CANCELADA', cancelada = ? WHERE id = ?", [ahoraISO(), o.id]);
      toast('Orden cancelada');
      await refrescar();
    });
  }

  async function recibir(id) {
    if (!exigir('compras_recibir')) return;
    if (await recibirOrden(id)) await refrescar();
  }

  $('[data-nueva]', c).onclick = async () => {
    if (!exigir('compras_crear')) return;
    const prov = await elegirProveedor({ titulo: 'Nueva orden de compra', nota: '¿A qué proveedor le harás el pedido?' });
    if (!prov) return;
    const { id } = await run("INSERT INTO ordenes_compra (proveedor_id, estado, usuario_id, creada) VALUES (?, 'BORRADOR', ?, ?)", [
      prov, sesion.usuario.id, ahoraISO(),
    ]);
    selId = id;
    await refrescar();
    $('[data-codigo]', detalle)?.focus();
  };
  $('[data-periodo]', c).onchange = e => {
    periodoOrdenes = Number(e.target.value);
    cargar();
  };
  let t;
  $('[data-buscar]', c).oninput = () => {
    clearTimeout(t);
    t = setTimeout(cargar, 200);
  };
  await cargar();
  if (selId) await mostrarDetalle(selId);
}

const renglonesOrden = id =>
  q(
    `SELECT r.*, p.codigo, p.descripcion, p.costo AS costo_actual, p.precio, p.mayoreo, p.unidad
     FROM orden_renglones r JOIN productos p ON p.id = r.producto_id WHERE r.orden_id = ? ORDER BY r.id`,
    [id]
  );

async function opcionesEnvio(id) {
  const m = abrirModal({
    titulo: `Orden de compra ${id} terminada`,
    ancho: 460,
    html: `<p class="mensaje">La orden quedó como <b>Enviada</b>. ¿Cómo deseas enviarla al proveedor?</p>
      <div class="opciones-salir">
        <button class="btn grande" data-imprimir>🖨 Imprimir o guardar como PDF (tamaño carta)</button>
        <button class="btn grande" data-exportar>📤 Exportar a Excel (CSV)</button>
        <button class="btn" data-fin>Finalizar sin enviar</button>
      </div>`,
  });
  m.cuerpo.querySelector('[data-imprimir]').onclick = () => {
    m.cerrar();
    imprimirOrden(id);
  };
  m.cuerpo.querySelector('[data-exportar]').onclick = () => {
    m.cerrar();
    exportarOrden(id);
  };
  m.cuerpo.querySelector('[data-fin]').onclick = () => m.cerrar();
  return m.promesa;
}

async function imprimirOrden(id) {
  const o = await q1(
    `SELECT o.*, pr.nombre AS proveedor, pr.representante, pr.telefono, pr.email
     FROM ordenes_compra o JOIN proveedores pr ON pr.id = o.proveedor_id WHERE o.id = ?`,
    [id]
  );
  const renglones = await renglonesOrden(id);
  const total = renglones.reduce((a, r) => a + r.cantidad * r.costo, 0);
  const negocio = (cfg('ticket_encabezado') || []).filter(Boolean);
  const html = documentoCarta(
    `Orden de compra ${id}`,
    `<div class="datos">
      <div><h1>${esc(cfg('negocio_nombre'))}</h1>${negocio.slice(1).map(l => `<div>${esc(l)}</div>`).join('')}</div>
      <div style="text-align:right"><h1>ORDEN DE COMPRA</h1><div>Folio: <b>${id}</b></div><div>Fecha: ${fmtFecha(o.enviada || o.creada)}</div></div>
    </div>
    <h2>Proveedor</h2>
    <div><b>${esc(o.proveedor)}</b>${o.representante ? ' · Atención: ' + esc(o.representante) : ''}</div>
    <div>${[o.telefono && 'Tel. ' + esc(o.telefono), o.email && esc(o.email)].filter(Boolean).join(' · ')}</div>
    <table><thead><tr><th>Código</th><th>Descripción</th><th class="num">Cantidad</th><th class="num">Costo unitario</th><th class="num">Importe</th></tr></thead>
    <tbody>${renglones
      .map(
        r => `<tr><td>${esc(r.codigo)}</td><td>${esc(r.descripcion)}</td><td class="num">${cant(r.cantidad)}${r.unidad ? ' ' + esc(r.unidad) : ''}</td>
          <td class="num">${dinero(r.costo)}</td><td class="num">${dinero(r.cantidad * r.costo)}</td></tr>`
      )
      .join('')}
    <tr class="total"><td colspan="4">Total</td><td class="num">${dinero(total)}</td></tr></tbody></table>
    ${o.notas ? `<h2>Notas</h2><div>${esc(o.notas).replace(/\n/g, '<br>')}</div>` : ''}`
  );
  const r = await window.api.imprimirTicket(html, { impresora: null });
  if (r !== true && r && r !== 'cancelled') toast('No se pudo imprimir: ' + r, 'error');
}

async function exportarOrden(id) {
  const renglones = await renglonesOrden(id);
  for (const r of renglones) r.importe = r.cantidad * r.costo;
  await exportarCSV(`orden-compra-${id}`, [
    ['codigo', 'Código'], ['descripcion', 'Descripción'], ['cantidad', 'Cantidad'], ['costo', 'Costo unitario'], ['importe', 'Importe'],
  ], renglones);
}

// ---------------------------------------------------------------- Recepción de órdenes
// Abre la ventana de recepción. Devuelve true si se concluyó.
async function recibirOrden(id) {
  const o = await q1(
    `SELECT o.*, pr.nombre AS proveedor FROM ordenes_compra o JOIN proveedores pr ON pr.id = o.proveedor_id WHERE o.id = ?`,
    [id]
  );
  if (!o || o.estado !== 'ENVIADA') return false;
  const margen = margenAutomatico();
  const renglones = (await renglonesOrden(id)).map(r => {
    const costo = r.costo || r.costo_actual;
    const precio = margen != null ? calcularPrecio(costo, margen) : r.precio;
    return { ...r, recibido: r.cantidad, costo_recibido: costo, precio_nuevo: precio, mayoreo_nuevo: r.mayoreo };
  });
  let sel = 0;
  const m = abrirModal({
    titulo: `Recibir orden de compra ${id} · ${esc(o.proveedor)}`,
    ancho: 1000,
    html: `
      <p class="nota">Revisa lo recibido. Doble clic (o ENTER) en un producto para modificar la cantidad recibida, el costo y los nuevos precios.</p>
      <div class="tabla-scroll alto-400"><table class="tabla seleccionable"><thead><tr>
        <th>Código</th><th>Descripción</th><th class="num">Pedido</th><th class="num">Recibí</th><th class="num">Costo</th>
        <th class="num">Ganancia</th><th class="num">Precio venta</th><th class="num">Mayoreo</th><th class="num">Importe</th></tr></thead>
        <tbody data-renglones></tbody><tfoot data-pie></tfoot></table></div>
      <div class="botones">
        <button class="btn" data-modificar>✏️ Modificar</button>
        <span class="espaciador"></span>
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-verde" data-concluir>Concluir recepción del pedido</button>
      </div>`,
    onKey: (e, m) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        sel = Math.max(0, Math.min(renglones.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
        pintar();
        return true;
      }
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        editar(sel);
        return true;
      }
    },
  });
  const tbody = m.cuerpo.querySelector('[data-renglones]');
  const pintar = () => {
    tbody.innerHTML = renglones
      .map(
        (r, i) => `<tr data-i="${i}" class="${i === sel ? 'sel' : ''} ${r.recibido < r.cantidad ? 'recibido-incompleto' : ''}">
        <td>${esc(r.codigo)}</td><td>${esc(r.descripcion)}</td><td class="num">${cant(r.cantidad)}</td>
        <td class="num"><b>${cant(r.recibido)}</b></td><td class="num">${dinero(r.costo_recibido)}</td>
        <td class="num">${numInput(calcularGanancia(r.costo_recibido, r.precio_nuevo), 2)}%</td>
        <td class="num ${Math.abs(r.precio_nuevo - r.precio) > 0.00005 ? 'precio-especial' : ''}">${dinero(r.precio_nuevo)}</td>
        <td class="num">${dinero(r.mayoreo_nuevo)}</td><td class="num">${dinero(r.recibido * r.costo_recibido)}</td></tr>`
      )
      .join('');
    const total = renglones.reduce((a, r) => a + r.recibido * r.costo_recibido, 0);
    m.cuerpo.querySelector('[data-pie]').innerHTML = `<tr><td colspan="8">Total recibido</td><td class="num">${dinero(total)}</td></tr>`;
    tbody.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const editar = async i => {
    const r = renglones[i];
    if (!r) return;
    const res = await dialogoRecepcion(r);
    if (res) Object.assign(r, res);
    pintar();
  };
  tbody.onclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (tr) {
      sel = Number(tr.dataset.i);
      pintar();
    }
  };
  tbody.ondblclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (tr) editar(Number(tr.dataset.i));
  };
  m.cuerpo.querySelector('[data-modificar]').onclick = () => editar(sel);
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(false);
  m.cuerpo.querySelector('[data-concluir]').onclick = async () => {
    const ok = await confirmar(`¿Terminar la recepción de la orden <b>${id}</b>? Se agregará la mercancía al inventario y se actualizarán costos y precios.`, {
      titulo: 'Concluir recepción',
      si: 'Sí, terminar y recibir la orden',
      no: 'No',
    });
    if (!ok) return;
    const ctx = nuevoContexto();
    const pasos = [];
    for (const r of renglones) {
      const p = await productoPorId(r.producto_id);
      if (r.recibido > 0) {
        if (cfg('usar_inventario') && !p.usa_inventario && p.tipo_venta !== 'K') {
          pasos.push({ sql: 'UPDATE productos SET usa_inventario = 1 WHERE id = ?', params: [p.id] });
          p.usa_inventario = 1;
        }
        // pasosInventario lee usa_inventario de la base; si se acaba de activar, se registra el movimiento manualmente.
        const pasosProd = await pasosEntradaProducto(
          p,
          { cantidad: r.recibido, costo: r.costo_recibido, precio: r.precio_nuevo, mayoreo: r.mayoreo_nuevo, motivo: `Orden de compra ${id}`, tipo: 'ENTRADA' },
          ctx
        );
        if (cfg('usar_inventario') && p.usa_inventario && !pasosProd.some(x => x.sql.includes('movimientos_inventario'))) {
          const habia = ctx.existencias.has(p.id) ? ctx.existencias.get(p.id) - r.recibido : p.existencia;
          const hay = redondear(habia + r.recibido, 3);
          ctx.existencias.set(p.id, hay);
          pasosProd.unshift(
            { sql: 'UPDATE productos SET existencia = ? WHERE id = ?', params: [hay, p.id] },
            {
              sql: `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, habia, hay, costo, motivo, usuario_id, fecha)
                    VALUES (?, 'ENTRADA', ?, ?, ?, ?, ?, ?, ?)`,
              params: [p.id, r.recibido, habia, hay, r.costo_recibido, `Orden de compra ${id}`, sesion.usuario.id, ahoraISO()],
            }
          );
        }
        pasos.push(...pasosProd);
        if (!p.proveedor_id) pasos.push({ sql: 'UPDATE productos SET proveedor_id = ? WHERE id = ?', params: [o.proveedor_id, p.id] });
      }
      pasos.push({
        sql: 'UPDATE orden_renglones SET recibido = ?, costo_recibido = ?, precio_nuevo = ?, mayoreo_nuevo = ? WHERE id = ?',
        params: [r.recibido, r.costo_recibido, r.precio_nuevo, r.mayoreo_nuevo, r.id],
      });
    }
    pasos.push({ sql: "UPDATE ordenes_compra SET estado = 'RECIBIDA', recibida = ? WHERE id = ?", params: [ahoraISO(), id] });
    try {
      await tx(pasos);
    } catch (err) {
      await alerta('No se pudo registrar la recepción: ' + esc(err.message), 'Error');
      return;
    }
    toast(`Orden ${id} recibida; inventario actualizado`);
    m.cerrar(true);
  };
  pintar();
  return m.promesa.then(v => !!v);
}

// Ventana de recepción de un renglón: recibí, costo, ganancia, nuevos precios.
function dialogoRecepcion(r) {
  const m = abrirModal({
    titulo: 'Recepción de producto',
    ancho: 480,
    html: `
      <p class="mensaje"><b>${esc(r.descripcion)}</b><br><span class="nota">Pedido: ${cant(r.cantidad)} · Costo anterior: ${dinero(r.costo_actual)} · Precio actual: ${dinero(r.precio)}</span></p>
      <div class="form-grid">
        <label>Recibí</label><div class="fila"><input class="num" data-recibi value="${numInput(r.recibido, 3)}" autofocus></div>
        <label>Con un costo de</label><div class="fila"><input class="num" data-costo value="${numInput(r.costo_recibido, 2)}"></div>
        <label>Ganancia %</label><input class="num" data-ganancia value="${numInput(calcularGanancia(r.costo_recibido, r.precio_nuevo), 2)}">
        <label>Nuevo precio venta</label><input class="num" data-precio value="${numInput(r.precio_nuevo, 2)}">
        <label>Nuevo precio mayoreo</label><input class="num" data-mayoreo value="${numInput(r.mayoreo_nuevo, 2)}">
      </div>
      <div class="botones"><button class="btn" data-cancelar>Cancelar</button><button class="btn btn-primario" data-ok>Aceptar</button></div>`,
  });
  const $m = s => m.cuerpo.querySelector(s);
  conCalculadora($m('[data-recibi]'));
  conCalculadora($m('[data-costo]'));
  const margen = margenAutomatico();
  $m('[data-costo]').addEventListener('input', () => {
    if (margen != null) {
      $m('[data-ganancia]').value = numInput(margen, 2);
      $m('[data-precio]').value = numInput(calcularPrecio(num($m('[data-costo]').value), margen), 2);
    } else $m('[data-ganancia]').value = numInput(calcularGanancia(num($m('[data-costo]').value), num($m('[data-precio]').value)), 2);
  });
  $m('[data-ganancia]').addEventListener('input', () => {
    $m('[data-precio]').value = numInput(calcularPrecio(num($m('[data-costo]').value), num($m('[data-ganancia]').value)), 2);
  });
  $m('[data-precio]').addEventListener('input', () => {
    $m('[data-ganancia]').value = numInput(calcularGanancia(num($m('[data-costo]').value), num($m('[data-precio]').value)), 2);
  });
  const aceptar = () => {
    const recibido = redondear(num($m('[data-recibi]').value), 3);
    if (recibido < 0) return;
    m.cerrar({
      recibido,
      costo_recibido: num($m('[data-costo]').value),
      precio_nuevo: num($m('[data-precio]').value),
      mayoreo_nuevo: num($m('[data-mayoreo]').value),
    });
  };
  const inputs = [...m.cuerpo.querySelectorAll('input')];
  inputs.forEach((i, n) =>
    i.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      if (n < inputs.length - 1) {
        inputs[n + 1].focus();
        inputs[n + 1].select();
      } else aceptar();
    })
  );
  $m('[data-ok]').onclick = aceptar;
  $m('[data-cancelar]').onclick = () => m.cerrar(null);
  return m.promesa;
}

// ---------------------------------------------------------------- Proveedores
async function vistaProveedores(c) {
  const editable = puede('compras_crear');
  c.innerHTML = `
    <div class="maestro-detalle">
      <div class="panel">
        <input data-buscar placeholder="Buscar proveedor" style="width:100%">
        <div class="tabla-scroll" data-tabla style="margin-top:8px"></div>
      </div>
      <div class="panel" data-form></div>
    </div>`;
  const tabla = $('[data-tabla]', c);
  const form = $('[data-form]', c);
  let filas = [];
  let actual = null;

  const cargar = async () => {
    const t = '%' + $('[data-buscar]', c).value.trim() + '%';
    filas = await q(
      `SELECT pr.*, (SELECT COUNT(*) FROM productos p WHERE p.proveedor_id = pr.id AND p.activo = 1) AS productos
       FROM proveedores pr WHERE pr.activo = 1 AND (pr.nombre LIKE ? OR pr.representante LIKE ? OR pr.telefono LIKE ?) ORDER BY pr.nombre`,
      [t, t, t]
    );
    const est = pintarTabla(tabla, {
      filas,
      seleccionable: true,
      vacio: 'No hay proveedores registrados',
      onSeleccion: f => pintarForm(f),
      columnas: [
        { k: 'nombre', t: 'Proveedor' },
        { k: 'telefono', t: 'Teléfono' },
        { k: 'productos', t: 'Productos', num: true },
      ],
    });
    if (actual) {
      const i = filas.findIndex(f => f.id === actual.id);
      est.sel = i;
      tabla.querySelectorAll('tbody tr').forEach(tr => tr.classList.toggle('sel', Number(tr.dataset.i) === i));
    }
  };

  const pintarForm = p => {
    actual = p;
    form.innerHTML = `
      <div class="fila"><h3 style="margin:0">${p ? esc(p.nombre) : 'Nuevo proveedor'}</h3><span class="espaciador"></span>
        ${editable ? '<button class="btn" data-nuevo>＋ Nuevo proveedor</button>' : ''}</div>
      <div class="form-grid" style="margin-top:12px">
        <label>Nombre o razón social</label><input data-c="nombre" value="${esc(p?.nombre || '')}">
        <label>Representante</label><input data-c="representante" value="${esc(p?.representante || '')}">
        <label>Teléfono</label><input data-c="telefono" value="${esc(p?.telefono || '')}">
        <label>Correo electrónico</label><input data-c="email" value="${esc(p?.email || '')}">
        <label>Notas</label><textarea data-c="notas" rows="3">${esc(p?.notas || '')}</textarea>
      </div>
      ${
        editable
          ? `<div class="botones">
              ${p ? '<button class="btn btn-peligro" data-eliminar>Eliminar proveedor</button>' : ''}
              <span class="espaciador"></span>
              <button class="btn btn-primario" data-guardar>Guardar proveedor</button></div>`
          : ''
      }`;
    if (!editable) form.querySelectorAll('[data-c]').forEach(i => (i.disabled = true));
    form.querySelector('[data-nuevo]')?.addEventListener('click', () => {
      pintarForm(null);
      cargar();
    });
    form.querySelector('[data-guardar]')?.addEventListener('click', async () => {
      const v = {};
      form.querySelectorAll('[data-c]').forEach(i => (v[i.dataset.c] = i.value.trim()));
      if (!v.nombre) {
        form.querySelector('[data-c=nombre]').classList.add('error');
        return form.querySelector('[data-c=nombre]').focus();
      }
      const params = [v.nombre, v.representante, v.telefono, v.email, v.notas];
      if (actual) await run('UPDATE proveedores SET nombre = ?, representante = ?, telefono = ?, email = ?, notas = ? WHERE id = ?', [...params, actual.id]);
      else {
        const { id } = await run('INSERT INTO proveedores (nombre, representante, telefono, email, notas) VALUES (?, ?, ?, ?, ?)', params);
        actual = { id };
      }
      toast('Proveedor guardado');
      await cargar();
      pintarForm(filas.find(f => f.id === actual.id) || null);
    });
    form.querySelector('[data-eliminar]')?.addEventListener('click', async () => {
      if (!(await confirmar(`¿Eliminar al proveedor <b>${esc(p.nombre)}</b>?`, { peligro: true, si: 'Eliminar' }))) return;
      await tx([
        { sql: 'UPDATE proveedores SET activo = 0 WHERE id = ?', params: [p.id] },
        { sql: 'UPDATE productos SET proveedor_id = NULL WHERE proveedor_id = ?', params: [p.id] },
        { sql: 'UPDATE lista_compras SET proveedor_id = NULL WHERE proveedor_id = ?', params: [p.id] },
      ]);
      toast('Proveedor eliminado');
      actual = null;
      await cargar();
      pintarForm(null);
    });
    setTimeout(() => form.querySelector('[data-c=nombre]')?.focus(), 0);
  };

  let t;
  $('[data-buscar]', c).oninput = () => {
    clearTimeout(t);
    t = setTimeout(cargar, 200);
  };
  await cargar();
  pintarForm(null);
}

// ---------------------------------------------------------------- Histórico de compras
async function vistaHistorico(c) {
  c.innerHTML = `
    <div class="fila barra-filtros">
      <label>Producto</label><input data-codigo placeholder="Código (F10 para buscar) — vacío = todos" autocomplete="off">
      <button class="btn" data-buscar><kbd>F10</kbd>Buscar</button>
      <button class="btn" data-todos>Todos</button>
      <label>Periodo</label><span data-periodo></span>
      <span class="espaciador"></span>
      <button class="btn" data-exportar>📤 Exportar</button>
    </div>
    <div data-resumen></div>
    <div class="tabla-scroll inv-tabla" data-tabla></div>`;
  const tabla = $('[data-tabla]', c);
  const input = $('[data-codigo]', c);
  let producto = null;
  let rango = null;
  let filas = [];

  const cargar = async () => {
    if (!rango) return;
    const cond = ["o.estado = 'RECIBIDA'", 'r.recibido > 0', 'date(o.recibida) BETWEEN ? AND ?'];
    const params = [rango.desde, rango.hasta];
    if (producto) cond.push('r.producto_id = ?'), params.push(producto.id);
    filas = await q(
      `SELECT o.recibida AS fecha, o.id AS folio, pr.nombre AS proveedor, p.codigo, p.descripcion,
              r.recibido, r.costo_recibido, r.recibido * r.costo_recibido AS importe
       FROM orden_renglones r JOIN ordenes_compra o ON o.id = r.orden_id JOIN proveedores pr ON pr.id = o.proveedor_id
       JOIN productos p ON p.id = r.producto_id WHERE ${cond.join(' AND ')} ORDER BY o.recibida DESC, r.id`,
      params
    );
    const resumen = $('[data-resumen]', c);
    if (producto && filas.length) {
      const porProv = {};
      for (const f of filas) if (!porProv[f.proveedor] || f.costo_recibido < porProv[f.proveedor]) porProv[f.proveedor] = f.costo_recibido;
      const mejor = Object.entries(porProv).sort((a, b) => a[1] - b[1])[0];
      resumen.innerHTML = `<div class="kpis">
        <div class="kpi"><div class="etq">Producto</div><div class="val chico">${esc(producto.descripcion)}</div></div>
        <div class="kpi"><div class="etq">Último costo de compra</div><div class="val">${dinero(filas[0].costo_recibido)}</div></div>
        <div class="kpi"><div class="etq">Mejor costo</div><div class="val">${dinero(mejor[1])}</div><div class="nota">${esc(mejor[0])}</div></div>
        <div class="kpi"><div class="etq">Costo actual</div><div class="val">${dinero(producto.costo)}</div></div></div>
        <div class="panel"><h3>Mejor costo por proveedor</h3><table class="lista-montos">${Object.entries(porProv)
          .sort((a, b) => a[1] - b[1])
          .map(([n, v]) => `<tr><td>${esc(n)}</td><td>${dinero(v)}</td></tr>`)
          .join('')}</table></div>`;
    } else resumen.innerHTML = producto ? `<p class="nota">Sin compras de <b>${esc(producto.descripcion)}</b> en el periodo.</p>` : '';
    pintarTabla(tabla, {
      filas,
      vacio: 'No hay compras recibidas en el periodo',
      columnas: [
        { k: 'fecha', t: 'Fecha', fmt: v => fmtFecha(v) },
        { k: 'folio', t: 'Orden', num: true },
        { k: 'proveedor', t: 'Proveedor' },
        { k: 'codigo', t: 'Código' },
        { k: 'descripcion', t: 'Descripción' },
        { k: 'recibido', t: 'Cantidad', num: true, fmt: fmtCant },
        { k: 'costo_recibido', t: 'Costo', num: true, fmt: fmtDinero },
        { k: 'importe', t: 'Importe', num: true, fmt: fmtDinero },
      ],
    });
  };
  const elegir = async p => {
    producto = p;
    input.value = p ? p.codigo : '';
    await cargar();
  };
  conectarCampoCodigo(input, elegir);
  $('[data-buscar]', c).onclick = async () => {
    const p = await buscarProducto();
    if (p) await elegir(await productoPorCodigo(p.codigo));
  };
  $('[data-todos]', c).onclick = () => elegir(null);
  selectorPeriodo($('[data-periodo]', c), r => {
    rango = r;
    cargar();
  }, 'ANIO');
  $('[data-exportar]', c).onclick = () =>
    exportarCSV(`historico-compras-${rango.desde}-${rango.hasta}`, [
      ['fecha', 'Fecha'], ['folio', 'Orden'], ['proveedor', 'Proveedor'], ['codigo', 'Código'], ['descripcion', 'Descripción'],
      ['recibido', 'Cantidad'], ['costo_recibido', 'Costo'], ['importe', 'Importe'],
    ], filas);
}

// Para uso de otros módulos (p. ej. Productos): agrega productos a la lista de compras.
export { enviarALista };