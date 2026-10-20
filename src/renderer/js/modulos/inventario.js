// Módulo Inventario (F4): entradas, ajustes, reportes de existencias, movimientos y kardex.
import {
  q, q1, run, tx, cfg, puede, exigir, alerta, confirmar, toast, esc, dinero, cant, num, numInput,
  redondear, fmtFecha, fmtHora, fmtFechaHora, fechaISO, ahoraISO, exportarCSV, selectorPeriodo, $,
} from '../core.js';
import { productoPorCodigo, calcularPrecio, calcularGanancia, nuevoCosto } from '../servicios.js';
import { buscarProducto, conectarCampoCodigo, conCalculadora } from '../componentes.js';
import { imprimirLineas, dos, separador, partir } from '../ticket.js';
import {
  NOMBRE_TIPO, pintarTabla, fmtDinero, fmtCant, opcionesDepartamentos, condDepartamento,
  pasosEntradaProducto, margenAutomatico,
} from './inventario-util.js';

const VISTAS = [
  { id: 'agregar', titulo: 'Agregar', permiso: 'inventario_agregar', fn: vistaAgregar },
  { id: 'ajustes', titulo: 'Ajustes', permiso: 'inventario_ajustar', fn: vistaAjustes },
  { id: 'bajos', titulo: 'Productos bajos en inventario', permiso: 'inventario_reportes', fn: vistaBajos },
  { id: 'reporte', titulo: 'Reporte de inventario', permiso: 'inventario_reportes', fn: vistaReporte },
  { id: 'movimientos', titulo: 'Reporte de movimientos', permiso: 'inventario_movimientos', fn: vistaMovimientos },
  { id: 'kardex', titulo: 'Kardex de inventario', permiso: 'inventario_reportes', fn: vistaKardex },
];

let vistaActual = 'agregar';

export async function montar(el) {
  el.innerHTML = `
    <div class="modulo-barra">Inventario <span class="sub-titulo" data-subtitulo></span></div>
    <div class="sub-barra">${VISTAS.map(v => `<button class="btn" data-vista="${v.id}">${esc(v.titulo)}</button>`).join('')}</div>
    <div class="modulo-cuerpo" data-cuerpo></div>`;
  const cuerpo = $('[data-cuerpo]', el);
  if (!cfg('usar_inventario')) {
    $('.sub-barra', el).hidden = true;
    cuerpo.innerHTML = `<div class="panel aviso-inventario">El control de inventario está desactivado.
      Actívalo en <b>Configuración ➜ Opciones habilitadas ➜ Utilizar inventarios para mis productos</b>.</div>`;
    return {};
  }
  const mostrar = async id => {
    const v = VISTAS.find(x => x.id === id);
    if (!v || !exigir(v.permiso)) return;
    vistaActual = id;
    el.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('activo', b.dataset.vista === id));
    $('[data-subtitulo]', el).textContent = '· ' + v.titulo;
    cuerpo.innerHTML = '';
    cuerpo._tabla = null;
    await v.fn(cuerpo);
  };
  el.querySelector('.sub-barra').onclick = e => {
    const b = e.target.closest('[data-vista]');
    if (b) mostrar(b.dataset.vista);
  };
  const inicial = VISTAS.find(v => v.id === vistaActual && puede(v.permiso)) || VISTAS.find(v => puede(v.permiso));
  if (inicial) await mostrar(inicial.id);
  else cuerpo.innerHTML = '<div class="panel">No tienes permisos para el módulo de inventario.</div>';
  return { onKey: () => false };
}

// ---------------------------------------------------------------- Formulario de producto (Agregar / Ajustes)
function campoCodigoHtml() {
  return `<label>Código del producto</label>
    <div class="fila"><input data-codigo placeholder="Escanea o escribe el código (F10 para buscar)" autocomplete="off">
    <button class="btn" type="button" data-buscar><kbd>F10</kbd>Buscar</button></div>
    <label>Descripción</label><div class="inv-desc" data-desc>—</div>
    <label>Existencia actual</label><div class="inv-exist" data-exist>—</div>`;
}

// Conecta el campo de código y el botón Buscar. alCargar(producto) se invoca al elegir uno válido.
function conectarCodigo(c, alCargar) {
  const input = $('[data-codigo]', c);
  const cargar = async p => {
    if (!p) return;
    if (p.tipo_venta === 'K') {
      await alerta('Los paquetes (kits) no manejan inventario propio; modifica el inventario de sus componentes.');
      input.select();
      return;
    }
    input.value = p.codigo;
    $('[data-desc]', c).textContent = p.descripcion;
    $('[data-exist]', c).innerHTML = p.usa_inventario
      ? `${cant(p.existencia)}${p.unidad ? ' ' + esc(p.unidad) : ''} <span class="nota">(mín. ${cant(p.minimo)} · máx. ${cant(p.maximo)})</span>`
      : '<span class="etiqueta naranja">No utiliza inventario</span>';
    await alCargar(p);
  };
  conectarCampoCodigo(input, cargar);
  $('[data-buscar]', c).onclick = async () => {
    const p = await buscarProducto();
    if (p) await cargar(await productoPorCodigo(p.codigo));
  };
  setTimeout(() => input.focus(), 0);
  return input;
}

// Vincula costo, ganancia %, precio venta: cambiar uno recalcula los otros.
function vincularPrecios(c, obtenerProducto) {
  const costo = $('[data-costo]', c);
  const ganancia = $('[data-ganancia]', c);
  const precio = $('[data-precio]', c);
  costo.addEventListener('input', () => {
    const p = obtenerProducto();
    if (!p) return;
    const m = margenAutomatico();
    if (m != null) {
      ganancia.value = numInput(m, 2);
      precio.value = numInput(calcularPrecio(num(costo.value), m), 2);
    } else ganancia.value = numInput(calcularGanancia(num(costo.value), num(precio.value)), 2);
  });
  ganancia.addEventListener('input', () => (precio.value = numInput(calcularPrecio(num(costo.value), num(ganancia.value)), 2)));
  precio.addEventListener('input', () => (ganancia.value = numInput(calcularGanancia(num(costo.value), num(precio.value)), 2)));
}

function llenarPrecios(c, p) {
  $('[data-costo]', c).value = numInput(p.costo, 2);
  $('[data-ganancia]', c).value = numInput(calcularGanancia(p.costo, p.precio), 2);
  $('[data-precio]', c).value = numInput(p.precio, 2);
  $('[data-mayoreo]', c).value = numInput(p.mayoreo, 2);
}

const camposPreciosHtml = () => `
  <label>Precio costo</label><div class="fila"><input class="num" data-costo></div>
  <label>Ganancia %</label><input class="num" data-ganancia>
  <label>Precio venta</label><input class="num" data-precio>
  <label>Precio mayoreo</label><input class="num" data-mayoreo>`;

// Avanza con ENTER entre los campos del formulario.
function enterAvanza(c, alFinal) {
  const inputs = [...c.querySelectorAll('input:not([data-codigo]), textarea')];
  inputs.forEach((i, n) =>
    i.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      if (n < inputs.length - 1) {
        inputs[n + 1].focus();
        inputs[n + 1].select?.();
      } else alFinal();
    })
  );
}

async function asegurarUsaInventario(p) {
  if (p.usa_inventario) return true;
  const ok = await confirmar(`<b>${esc(p.descripcion)}</b> no utiliza inventario. ¿Deseas que a partir de ahora lo utilice?`, {
    si: 'Sí, usar inventario',
    no: 'Cancelar',
  });
  if (!ok) return false;
  await run('UPDATE productos SET usa_inventario = 1 WHERE id = ?', [p.id]);
  p.usa_inventario = 1;
  return true;
}

// ---------------------------------------------------------------- Agregar
function vistaAgregar(c) {
  c.innerHTML = `
    <div class="panel inv-form">
      <h3>Agregar mercancía al inventario</h3>
      <div class="form-grid">
        ${campoCodigoHtml()}
        <label>Cantidad a agregar</label><div class="fila"><input class="num" data-cant></div>
        ${camposPreciosHtml()}
      </div>
      <p class="nota" data-nota></p>
      <div class="botones"><button class="btn btn-primario grande" data-ok disabled>Agregar cantidad a inventario</button></div>
    </div>`;
  let producto = null;
  conCalculadora($('[data-cant]', c));
  conCalculadora($('[data-costo]', c));
  vincularPrecios(c, () => producto);
  const nota = $('[data-nota]', c);
  const actualizarNota = () => {
    if (!producto) return (nota.textContent = '');
    const cantidad = num($('[data-cant]', c).value);
    const costo = num($('[data-costo]', c).value);
    if (cantidad > 0) {
      const nc = nuevoCosto(producto.existencia, producto.costo, cantidad, costo);
      nota.textContent = `Nueva existencia: ${cant(producto.existencia + cantidad)} · Costo resultante (${
        cfg('metodo_costo') === 'ULTIMO' ? 'último costo' : 'costo promedio'
      }): ${dinero(nc)}`;
    } else nota.textContent = '';
  };
  $('[data-cant]', c).addEventListener('input', actualizarNota);
  $('[data-costo]', c).addEventListener('input', actualizarNota);

  const input = conectarCodigo(c, p => {
    producto = p;
    llenarPrecios(c, p);
    $('[data-cant]', c).value = '';
    $('[data-ok]', c).disabled = false;
    actualizarNota();
    $('[data-cant]', c).focus();
  });

  const guardar = async () => {
    if (!producto) return;
    const cantidad = redondear(num($('[data-cant]', c).value), 3);
    if (!(cantidad > 0)) {
      $('[data-cant]', c).classList.add('error');
      $('[data-cant]', c).focus();
      return;
    }
    if (producto.tipo_venta !== 'G' && !Number.isInteger(cantidad)) {
      await alerta('Este producto se vende por unidad; la cantidad debe ser entera.');
      return;
    }
    if (!(await asegurarUsaInventario(producto))) return;
    const pasos = await pasosEntradaProducto(producto, {
      cantidad,
      costo: num($('[data-costo]', c).value),
      precio: num($('[data-precio]', c).value),
      mayoreo: num($('[data-mayoreo]', c).value),
      motivo: 'Entrada de mercancía',
      tipo: 'ENTRADA',
    });
    await tx(pasos);
    toast(`Se agregaron ${cant(cantidad)} a ${producto.descripcion}`);
    vistaAgregar(c);
  };
  enterAvanza(c, guardar);
  $('[data-ok]', c).onclick = guardar;
  input.focus();
}

// ---------------------------------------------------------------- Ajustes
function vistaAjustes(c) {
  c.innerHTML = `
    <div class="panel inv-form">
      <h3>Ajuste de inventario</h3>
      <p class="nota">Úsalo para mermas, daños, robos, consumo interno o para corregir el conteo físico.</p>
      <div class="form-grid">
        ${campoCodigoHtml()}
        <label>Diferencia (+/−)</label><div class="fila"><input class="num" data-dif></div>
        <label>Nueva cantidad</label><div class="fila"><input class="num" data-nueva></div>
        ${camposPreciosHtml()}
        <label>Motivo del ajuste</label><input data-motivo placeholder="Ej. Merma, producto dañado, conteo físico…">
      </div>
      <div class="resumen-ajuste" data-resumen hidden></div>
      <div class="botones"><button class="btn btn-primario grande" data-ok disabled>Realizar ajuste de inventario</button></div>
    </div>`;
  let producto = null;
  const dif = $('[data-dif]', c);
  const nueva = $('[data-nueva]', c);
  conCalculadora(dif);
  conCalculadora(nueva);
  conCalculadora($('[data-costo]', c));
  vincularPrecios(c, () => producto);

  const resumen = () => {
    const r = $('[data-resumen]', c);
    if (!producto) return (r.hidden = true);
    const d = num(dif.value);
    const lineas = [];
    if (d) lineas.push(`Existencia: ${cant(producto.existencia)} → <b>${cant(producto.existencia + d)}</b> (${d > 0 ? '+' : ''}${cant(d)})`);
    const comp = [
      ['Costo', producto.costo, num($('[data-costo]', c).value)],
      ['Precio venta', producto.precio, num($('[data-precio]', c).value)],
      ['Precio mayoreo', producto.mayoreo, num($('[data-mayoreo]', c).value)],
    ];
    for (const [n, a, b] of comp) if (Math.abs(a - b) > 0.00005) lineas.push(`${n}: ${dinero(a)} → <b>${dinero(b)}</b>`);
    r.hidden = !lineas.length;
    r.innerHTML = '<b>Resumen del ajuste</b><br>' + lineas.join('<br>');
  };
  dif.addEventListener('input', () => {
    if (producto) nueva.value = numInput(producto.existencia + num(dif.value), 3);
    resumen();
  });
  nueva.addEventListener('input', () => {
    if (producto) dif.value = numInput(num(nueva.value) - producto.existencia, 3);
    resumen();
  });
  c.querySelectorAll('[data-costo], [data-precio], [data-mayoreo], [data-ganancia]').forEach(i => i.addEventListener('input', resumen));

  conectarCodigo(c, p => {
    producto = p;
    llenarPrecios(c, p);
    dif.value = '0';
    nueva.value = numInput(p.existencia, 3);
    $('[data-ok]', c).disabled = false;
    resumen();
    dif.focus();
    dif.select();
  });

  const guardar = async () => {
    if (!producto) return;
    const d = redondear(num(dif.value), 3);
    const motivo = $('[data-motivo]', c).value.trim();
    const datos = {
      cantidad: d,
      costo: num($('[data-costo]', c).value),
      precio: num($('[data-precio]', c).value),
      mayoreo: num($('[data-mayoreo]', c).value),
      motivo: motivo || 'Ajuste de inventario',
      tipo: 'AJUSTE',
    };
    if (d && !motivo) {
      $('[data-motivo]', c).classList.add('error');
      $('[data-motivo]', c).focus();
      return toast('Escribe el motivo del ajuste', 'aviso');
    }
    if (d && !(await asegurarUsaInventario(producto))) return;
    const pasos = await pasosEntradaProducto(producto, datos);
    if (!pasos.length) return toast('No hay cambios que ajustar', 'aviso');
    if (producto.existencia + d < 0 && !(await confirmar('La existencia resultante es negativa. ¿Continuar?'))) return;
    await tx(pasos);
    toast('Ajuste realizado');
    vistaAjustes(c);
  };
  enterAvanza(c, guardar);
  $('[data-ok]', c).onclick = guardar;
}

// ---------------------------------------------------------------- Productos bajos en inventario
async function vistaBajos(c) {
  c.innerHTML = `
    <div class="fila barra-filtros">
      <label>Departamento</label><select data-dep>${await opcionesDepartamentos()}</select>
      <span class="espaciador"></span>
      <button class="btn" data-exportar>📤 Exportar a Excel</button>
    </div>
    <div class="tabla-scroll inv-tabla" data-tabla></div>`;
  const tabla = $('[data-tabla]', c);
  let filas = [];
  const cargar = async () => {
    const d = condDepartamento($('[data-dep]', c).value);
    filas = await q(
      `SELECT p.codigo, p.descripcion, p.precio, COALESCE(d.nombre, '- Sin departamento -') AS departamento,
              p.existencia, p.minimo, p.maximo
       FROM productos p LEFT JOIN departamentos d ON d.id = p.departamento_id
       WHERE p.activo = 1 AND p.usa_inventario = 1 AND p.tipo_venta <> 'K' AND p.existencia <= p.minimo ${d.sql}
       ORDER BY p.descripcion`,
      d.params
    );
    pintarTabla(tabla, {
      filas,
      vacio: 'No hay productos con existencia igual o menor al mínimo',
      columnas: [
        { k: 'codigo', t: 'Código' },
        { k: 'descripcion', t: 'Descripción' },
        { k: 'precio', t: 'Precio de venta', num: true, fmt: fmtDinero },
        { k: 'departamento', t: 'Departamento' },
        { k: 'existencia', t: 'Existencia', num: true, fmt: v => `<b class="${v <= 0 ? 'rojo' : ''}">${cant(v)}</b>` },
        { k: 'minimo', t: 'Inv. mínimo', num: true, fmt: fmtCant },
        { k: 'maximo', t: 'Inv. máximo', num: true, fmt: fmtCant },
      ],
    });
  };
  $('[data-dep]', c).onchange = cargar;
  $('[data-exportar]', c).onclick = () =>
    exportarCSV(`productos-bajos-${fechaISO()}`, [
      ['codigo', 'Código'], ['descripcion', 'Descripción'], ['precio', 'Precio venta'], ['departamento', 'Departamento'],
      ['existencia', 'Existencia'], ['minimo', 'Inv. mínimo'], ['maximo', 'Inv. máximo'],
    ], filas);
  await cargar();
}

// ---------------------------------------------------------------- Reporte de inventario
async function vistaReporte(c) {
  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="etq">Costo del inventario</div><div class="val" data-costo-total></div></div>
      <div class="kpi"><div class="etq">Cantidad de productos en inventario</div><div class="val" data-cant-total></div></div>
    </div>
    <div class="fila barra-filtros">
      <label>Departamento</label><select data-dep>${await opcionesDepartamentos()}</select>
      <span class="espaciador"></span>
      <button class="btn" data-modificar disabled>✏️ Modificar producto</button>
      <button class="btn" data-exportar>📤 Exportar</button>
      <button class="btn" data-imprimir>🖨 Imprimir…</button>
    </div>
    <div class="tabla-scroll inv-tabla" data-tabla></div>`;
  const tabla = $('[data-tabla]', c);
  let filas = [];
  let elegido = null;
  const modificar = async f => {
    if (!f || !exigir('productos_modificar')) return;
    const { irA } = await import('../app.js');
    irA('productos', { vista: 'modificar', codigo: f.codigo });
  };
  $('[data-modificar]', c).onclick = () => modificar(elegido);
  let totales = { costo: 0, cantidad: 0 };
  const cargar = async () => {
    const d = condDepartamento($('[data-dep]', c).value);
    filas = await q(
      `SELECT p.codigo, p.descripcion, p.costo, p.precio, p.existencia, p.minimo, p.maximo,
              COALESCE(d.nombre, '- Sin departamento -') AS departamento, p.costo * MAX(p.existencia, 0) AS valor
       FROM productos p LEFT JOIN departamentos d ON d.id = p.departamento_id
       WHERE p.activo = 1 AND p.usa_inventario = 1 AND p.tipo_venta <> 'K' ${d.sql}
       ORDER BY p.descripcion`,
      d.params
    );
    totales = filas.reduce((a, f) => ({ costo: a.costo + f.valor, cantidad: a.cantidad + Math.max(0, f.existencia) }), { costo: 0, cantidad: 0 });
    $('[data-costo-total]', c).textContent = dinero(totales.costo);
    $('[data-cant-total]', c).textContent = cant(totales.cantidad);
    pintarTabla(tabla, {
      filas,
      vacio: 'No hay productos que utilicen inventario',
      seleccionable: true,
      onSeleccion: f => {
        elegido = f;
        $('[data-modificar]', c).disabled = !f;
      },
      onDoble: modificar,
      claseFila: f => (f.existencia <= f.minimo ? 'bajo-minimo' : ''),
      columnas: [
        { k: 'codigo', t: 'Código' },
        { k: 'descripcion', t: 'Descripción' },
        { k: 'costo', t: 'Costo', num: true, fmt: fmtDinero },
        { k: 'precio', t: 'Precio venta', num: true, fmt: fmtDinero },
        { k: 'existencia', t: 'Existencia', num: true, fmt: fmtCant },
        { k: 'minimo', t: 'Inv. mínimo', num: true, fmt: fmtCant },
        { k: 'maximo', t: 'Inv. máximo', num: true, fmt: fmtCant },
        { k: 'valor', t: 'Valor (costo)', num: true, fmt: fmtDinero },
      ],
    });
  };
  $('[data-dep]', c).onchange = cargar;
  $('[data-exportar]', c).onclick = () =>
    exportarCSV(`reporte-inventario-${fechaISO()}`, [
      ['codigo', 'Código'], ['descripcion', 'Descripción'], ['departamento', 'Departamento'], ['costo', 'Costo'],
      ['precio', 'Precio venta'], ['existencia', 'Existencia'], ['minimo', 'Inv. mínimo'], ['maximo', 'Inv. máximo'], ['valor', 'Valor'],
    ], filas);
  $('[data-imprimir]', c).onclick = () => {
    const l = [{ t: 'REPORTE DE INVENTARIO', c: true, b: true }, { t: fmtFechaHora(ahoraISO()), c: true }, separador()];
    for (const f of filas) {
      l.push(...partir(f.descripcion));
      l.push(dos(`  ${cant(f.existencia)} x ${dinero(f.costo)}`, dinero(f.valor)));
    }
    l.push(separador(), dos('Productos:', cant(totales.cantidad)), { t: dos('Costo total:', dinero(totales.costo)), b: true }, '', '');
    imprimirLineas(l);
  };
  await cargar();
}

// ---------------------------------------------------------------- Reporte de movimientos
async function vistaMovimientos(c) {
  const cajeros = await q('SELECT id, nombre FROM usuarios ORDER BY nombre');
  c.innerHTML = `
    <div class="fila barra-filtros">
      <span data-periodo></span>
      <label>Movimientos</label>
      <select data-tipo>
        <option value="">Todos</option><option value="ENTRADA">Entradas</option><option value="SALIDA">Salidas</option>
        <option value="AJUSTE">Ajustes</option><option value="DEVOLUCION">Devoluciones</option>
      </select>
    </div>
    <div class="fila barra-filtros">
      <label>Cajero</label><select data-cajero><option value="">Todos</option>${cajeros.map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select>
      <label>Departamento</label><select data-dep>${await opcionesDepartamentos()}</select>
      <label>Producto</label><input data-prod placeholder="Código o descripción">
      <span class="espaciador"></span>
      <button class="btn" data-exportar>📤 Exportar movimientos</button>
      <button class="btn" data-imprimir>🖨 Imprimir</button>
    </div>
    <div class="tabla-scroll inv-tabla" data-tabla></div>`;
  const tabla = $('[data-tabla]', c);
  let rango = { desde: fechaISO(), hasta: fechaISO() };
  let filas = [];
  const cargar = async () => {
    const cond = ['date(m.fecha) BETWEEN ? AND ?'];
    const params = [rango.desde, rango.hasta];
    const tipo = $('[data-tipo]', c).value;
    if (tipo) cond.push('m.tipo = ?'), params.push(tipo);
    const caj = $('[data-cajero]', c).value;
    if (caj) cond.push('m.usuario_id = ?'), params.push(Number(caj));
    const prod = $('[data-prod]', c).value.trim();
    if (prod) cond.push('(p.descripcion LIKE ? OR p.codigo LIKE ?)'), params.push('%' + prod + '%', prod + '%');
    const d = condDepartamento($('[data-dep]', c).value);
    filas = await q(
      `SELECT m.*, p.codigo, p.descripcion, u.nombre AS cajero
       FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id LEFT JOIN usuarios u ON u.id = m.usuario_id
       WHERE ${cond.join(' AND ')} ${d.sql}
       ORDER BY m.fecha DESC, m.id DESC LIMIT 5000`,
      [...params, ...d.params]
    );
    for (const f of filas) f.tipo_nombre = NOMBRE_TIPO[f.tipo] || f.tipo;
    const variosDias = rango.desde !== rango.hasta;
    pintarTabla(tabla, {
      filas,
      vacio: 'No hay movimientos en el periodo',
      columnas: [
        { k: 'fecha', t: variosDias ? 'Fecha' : 'Hora', fmt: v => (variosDias ? fmtFechaHora(v) : fmtHora(v)) },
        { k: 'descripcion', t: 'Descripción del producto' },
        { k: 'motivo', t: 'Movimiento' },
        { k: 'es_kit', t: 'KIT', fmt: v => (v ? '<span class="etiqueta azul">KIT</span>' : '') },
        { k: 'habia', t: 'Había', num: true, fmt: fmtCant },
        { k: 'tipo_nombre', t: 'Tipo', fmt: (v, f) => `<span class="etiqueta ${colorTipo(f.tipo)}">${esc(v)}</span>` },
        { k: 'cantidad', t: 'Cantidad', num: true, fmt: v => `<b class="${v < 0 ? 'rojo' : 'verde-txt'}">${v > 0 ? '+' : ''}${cant(v)}</b>` },
        { k: 'hay', t: 'Hay', num: true, fmt: fmtCant },
        { k: 'cajero', t: 'Cajero' },
      ],
    });
  };
  selectorPeriodo($('[data-periodo]', c), r => {
    rango = r;
    cargar();
  });
  c.querySelectorAll('[data-tipo], [data-cajero], [data-dep]').forEach(s => (s.onchange = cargar));
  let t;
  $('[data-prod]', c).oninput = () => {
    clearTimeout(t);
    t = setTimeout(cargar, 250);
  };
  $('[data-exportar]', c).onclick = () =>
    exportarCSV(`movimientos-inventario-${rango.desde}-${rango.hasta}`, [
      ['fecha', 'Fecha'], ['codigo', 'Código'], ['descripcion', 'Descripción'], ['motivo', 'Movimiento'], ['es_kit', 'Kit'],
      ['habia', 'Había'], ['tipo_nombre', 'Tipo'], ['cantidad', 'Cantidad'], ['hay', 'Hay'], ['costo', 'Costo'], ['cajero', 'Cajero'],
    ], filas);
  $('[data-imprimir]', c).onclick = () => {
    const l = [{ t: 'MOVIMIENTOS DE INVENTARIO', c: true, b: true }, { t: `${fmtFecha(rango.desde)} - ${fmtFecha(rango.hasta)}`, c: true }, separador()];
    for (const f of filas) {
      l.push(...partir(f.descripcion));
      l.push(dos(`  ${fmtHora(f.fecha)} ${NOMBRE_TIPO[f.tipo]}`, `${f.cantidad > 0 ? '+' : ''}${cant(f.cantidad)} = ${cant(f.hay)}`));
    }
    l.push(separador(), dos('Movimientos:', String(filas.length)), '', '');
    imprimirLineas(l);
  };
}

const colorTipo = t => ({ ENTRADA: 'verde', SALIDA: 'rojo', AJUSTE: 'naranja', DEVOLUCION: 'azul' })[t] || '';

// ---------------------------------------------------------------- Kardex
async function vistaKardex(c) {
  c.innerHTML = `
    <div class="fila barra-filtros">
      <label>Código de producto</label>
      <input data-codigo placeholder="Código (F10 para buscar)" autocomplete="off">
      <button class="btn" data-buscar><kbd>F10</kbd>Buscar</button>
      <label>Periodo</label><span data-periodo></span>
      <span class="espaciador"></span>
      <button class="btn" data-exportar disabled>📤 Exportar</button>
      <button class="btn" data-imprimir disabled>🖨 Imprimir</button>
    </div>
    <div class="panel kardex-cabecera" data-cabecera hidden></div>
    <div class="tabla-scroll inv-tabla" data-tabla><p class="vacio">Escribe o busca un producto para ver su kardex.</p></div>`;
  let producto = null;
  let rango = { desde: fechaISO(), hasta: fechaISO() };
  let filas = [];
  const input = $('[data-codigo]', c);

  const cargar = async () => {
    if (!producto) return;
    const p = await q1(
      `SELECT p.*, COALESCE(d.nombre, '- Sin departamento -') AS departamento FROM productos p
       LEFT JOIN departamentos d ON d.id = p.departamento_id WHERE p.id = ?`,
      [producto.id]
    );
    const cab = $('[data-cabecera]', c);
    cab.hidden = false;
    cab.innerHTML = `<div class="fila">
      <div><div class="nota">Producto</div><b>${esc(p.descripcion)}</b> <span class="nota">(${esc(p.codigo)})</span></div>
      <div><div class="nota">Departamento</div>${esc(p.departamento)}</div>
      <div><div class="nota">Inv. mínimo</div>${cant(p.minimo)}</div>
      <div><div class="nota">Inv. máximo</div>${cant(p.maximo)}</div>
      <div><div class="nota">Existencia actual</div><b>${p.usa_inventario ? cant(p.existencia) : 'No usa inventario'}</b></div>
      <div><div class="nota">Costo actual</div>${dinero(p.costo)}</div>
      <div><div class="nota">Precio actual</div>${dinero(p.precio)}</div></div>`;

    const movs = await q(
      `SELECT m.*, u.nombre AS cajero FROM movimientos_inventario m LEFT JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.producto_id = ? AND date(m.fecha) BETWEEN ? AND ? ORDER BY m.fecha, m.id`,
      [p.id, rango.desde, rango.hasta]
    );
    const precios = await q(
      `SELECT cp.*, u.nombre AS cajero FROM cambios_precio cp LEFT JOIN usuarios u ON u.id = cp.usuario_id
       WHERE cp.producto_id = ? AND date(cp.fecha) BETWEEN ? AND ? ORDER BY cp.fecha, cp.id`,
      [p.id, rango.desde, rango.hasta]
    );
    const NOMBRE_CAMPO = { costo: 'costo', precio: 'precio de venta', mayoreo: 'precio de mayoreo' };
    filas = [
      ...movs.map(m => {
        const entrada = m.cantidad > 0;
        const cantidad = Math.abs(m.cantidad);
        return {
          fecha: m.fecha,
          orden: m.id * 2,
          descripcion: `${NOMBRE_TIPO[m.tipo] || m.tipo}${m.motivo ? ' · ' + m.motivo : ''}${m.es_kit ? ' (por KIT)' : ''}`,
          ent_cant: entrada ? cantidad : null,
          ent_costo: entrada ? m.costo : null,
          ent_total: entrada ? cantidad * m.costo : null,
          sal_cant: entrada ? null : cantidad,
          sal_costo: entrada ? null : m.costo,
          sal_total: entrada ? null : cantidad * m.costo,
          ex_cant: m.hay,
          ex_costo: m.costo,
          ex_total: m.hay * m.costo,
          cajero: m.cajero,
        };
      }),
      ...precios.map(cp => ({
        fecha: cp.fecha,
        orden: cp.id * 2 + 1,
        descripcion: `Cambio de ${NOMBRE_CAMPO[cp.campo] || cp.campo}: ${dinero(cp.anterior)} → ${dinero(cp.nuevo)}`,
        cambio: true,
        cajero: cp.cajero,
      })),
    ].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

    const v = (x, fmt) => (x == null ? '' : fmt(x));
    const tabla = $('[data-tabla]', c);
    tabla.innerHTML = `
      <table class="tabla kardex">
        <thead>
          <tr><th rowspan="2">Fecha</th><th rowspan="2">Descripción</th>
            <th colspan="3" class="grupo">Entradas</th><th colspan="3" class="grupo">Salidas</th><th colspan="3" class="grupo">Existencias</th>
            <th rowspan="2">Usuario</th></tr>
          <tr><th class="num">Cant.</th><th class="num">Costo</th><th class="num">Total</th>
            <th class="num">Cant.</th><th class="num">Costo</th><th class="num">Total</th>
            <th class="num">Cant.</th><th class="num">Costo</th><th class="num">Total</th></tr>
        </thead>
        <tbody>${
          filas
            .map(
              f => `<tr class="${f.cambio ? 'cambio-precio' : ''}">
              <td>${fmtFechaHora(f.fecha)}</td><td>${esc(f.descripcion)}</td>
              <td class="num">${v(f.ent_cant, cant)}</td><td class="num">${v(f.ent_costo, dinero)}</td><td class="num">${v(f.ent_total, dinero)}</td>
              <td class="num">${v(f.sal_cant, cant)}</td><td class="num">${v(f.sal_costo, dinero)}</td><td class="num">${v(f.sal_total, dinero)}</td>
              <td class="num"><b>${v(f.ex_cant, cant)}</b></td><td class="num">${v(f.ex_costo, dinero)}</td><td class="num">${v(f.ex_total, dinero)}</td>
              <td>${esc(f.cajero || '')}</td></tr>`
            )
            .join('') || '<tr><td colspan="12" class="vacio">Sin movimientos en el periodo</td></tr>'
        }</tbody>
      </table>`;
    $('[data-exportar]', c).disabled = $('[data-imprimir]', c).disabled = false;
  };

  const elegir = async p => {
    if (!p) return;
    producto = p;
    input.value = p.codigo;
    await cargar();
  };
  conectarCampoCodigo(input, elegir);
  $('[data-buscar]', c).onclick = async () => {
    const p = await buscarProducto();
    if (p) await elegir(await productoPorCodigo(p.codigo));
  };
  selectorPeriodo($('[data-periodo]', c), r => {
    rango = r;
    cargar();
  }, 'MES');
  $('[data-exportar]', c).onclick = () =>
    exportarCSV(`kardex-${producto.codigo}-${rango.desde}-${rango.hasta}`, [
      ['fecha', 'Fecha'], ['descripcion', 'Descripción'],
      ['ent_cant', 'Entrada cant.'], ['ent_costo', 'Entrada costo'], ['ent_total', 'Entrada total'],
      ['sal_cant', 'Salida cant.'], ['sal_costo', 'Salida costo'], ['sal_total', 'Salida total'],
      ['ex_cant', 'Existencia'], ['ex_costo', 'Costo unitario'], ['ex_total', 'Valor existencia'], ['cajero', 'Usuario'],
    ], filas);
  $('[data-imprimir]', c).onclick = () => {
    const l = [{ t: 'KARDEX DE INVENTARIO', c: true, b: true }, ...partir(producto.descripcion).map(t => ({ t, c: true })),
      { t: `${fmtFecha(rango.desde)} - ${fmtFecha(rango.hasta)}`, c: true }, separador()];
    for (const f of filas) {
      l.push(dos(fmtFechaHora(f.fecha), f.ex_cant == null ? '' : 'Hay ' + cant(f.ex_cant)));
      l.push(...partir('  ' + f.descripcion));
      if (f.ent_cant != null) l.push(dos('  Entrada', `${cant(f.ent_cant)} x ${dinero(f.ent_costo)}`));
      if (f.sal_cant != null) l.push(dos('  Salida', `${cant(f.sal_cant)} x ${dinero(f.sal_costo)}`));
    }
    l.push(separador(), '', '');
    imprimirLineas(l);
  };
  setTimeout(() => input.focus(), 0);
}
