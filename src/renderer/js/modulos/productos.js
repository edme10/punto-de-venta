// Módulo Productos (F3): alta, modificación, eliminación, departamentos, promociones,
// ventas por período, importación y catálogo.
import {
  q, q1, run, tx, cfg, puede, exigir, alerta, confirmar, formulario, toast,
  esc, dinero, cant, pct, num, numInput, redondear, exportarCSV, selectorPeriodo, $, $$,
} from '../core.js';
import { productoPorCodigo, pasosInventario, calcularPrecio, calcularGanancia } from '../servicios.js';
import { buscarProducto, conectarCampoCodigo } from '../componentes.js';
import { imprimirLineas, dos, centrar, separador } from '../ticket.js';
import { TIPOS_VENTA, departamentoId, pasosCambiosPrecio, pasoEliminar, quitarDeKitsYPromos } from './productos-comun.js';
import { vistaCatalogo } from './productos-catalogo.js';
import { asistenteImportar } from './productos-importar.js';

const VISTAS = [
  ['nuevo', 'Nuevo', '➕'],
  ['modificar', 'Modificar', '✏️'],
  ['eliminar', 'Eliminar', '🗑'],
  ['departamentos', 'Departamentos', '🗂'],
  ['ventas', 'Ventas por período', '📊'],
  ['promociones', 'Promociones', '🏷'],
  ['importar', 'Importar', '📥'],
  ['catalogo', 'Catálogo', '📚'],
];

let raiz = null;
let vistaActual = 'catalogo';

// opciones: {vista, codigo} — permite que otros módulos abran "Modificar" con un producto.
export async function montar(el, opciones = {}) {
  raiz = el;
  el.innerHTML = `
    <div class="modulo-barra">Productos <span class="sub-titulo" data-subtitulo></span></div>
    <div class="sub-barra">
      ${VISTAS.map(([id, t, i]) => `<button class="btn" data-vista="${id}">${i} ${t}</button>`).join('')}
    </div>
    <div class="modulo-cuerpo" data-cuerpo></div>`;
  el.querySelector('.sub-barra').onclick = e => {
    const b = e.target.closest('[data-vista]');
    if (b) mostrar(b.dataset.vista);
  };
  await mostrar(opciones.vista || 'catalogo', opciones);
  return {
    onKey: () => false,
    desmontar() {
      raiz = null;
    },
  };
}

const PERMISO_VISTA = {
  nuevo: 'productos_crear',
  modificar: 'productos_modificar',
  eliminar: 'productos_eliminar',
  ventas: 'productos_reporte',
  promociones: 'productos_promociones',
  importar: 'productos_crear',
};

export async function mostrar(vista, opciones = {}) {
  if (!raiz) return;
  if (PERMISO_VISTA[vista] && !exigir(PERMISO_VISTA[vista])) return;
  vistaActual = vista;
  $$('[data-vista]', raiz).forEach(b => b.classList.toggle('activo', b.dataset.vista === vista));
  const cuerpo = $('[data-cuerpo]', raiz);
  cuerpo.innerHTML = '';
  cuerpo.className = 'modulo-cuerpo productos-' + vista;
  $('[data-subtitulo]', raiz).textContent = '· ' + VISTAS.find(v => v[0] === vista)[1];
  switch (vista) {
    case 'nuevo':
      return formularioProducto(cuerpo, null);
    case 'modificar':
      return vistaElegirProducto(cuerpo, 'modificar', opciones.codigo);
    case 'eliminar':
      return vistaElegirProducto(cuerpo, 'eliminar', opciones.codigo);
    case 'departamentos':
      return vistaDepartamentos(cuerpo);
    case 'ventas':
      return vistaVentasPeriodo(cuerpo);
    case 'promociones':
      return vistaPromociones(cuerpo);
    case 'importar':
      cuerpo.innerHTML = `<div class="panel"><h3>Importar productos</h3>
        <p class="nota">Importa tu catálogo desde un archivo CSV (Excel: "Guardar como → CSV").</p>
        <button class="btn btn-primario" data-abrir>📥 Abrir asistente de importación</button></div>`;
      cuerpo.querySelector('[data-abrir]').onclick = () => asistenteImportar();
      return asistenteImportar();
    case 'catalogo':
      return vistaCatalogo(cuerpo, { modificar: codigo => mostrar('modificar', { codigo }) });
  }
}

// ---------------------------------------------------------------- Elegir producto (Modificar / Eliminar)
async function vistaElegirProducto(cuerpo, modo, codigoInicial) {
  cuerpo.innerHTML = `
    <div class="panel elegir-producto">
      <label>Código del producto a ${modo === 'modificar' ? 'modificar' : 'eliminar'}:</label>
      <div class="fila">
        <input class="grande" data-codigo placeholder="Escanea o escribe el código y presiona ENTER (F10 para buscar)" autocomplete="off">
        <button class="btn" data-buscar>🔍 F10 Buscar</button>
      </div>
    </div>
    <div data-zona></div>`;
  const input = cuerpo.querySelector('[data-codigo]');
  const zona = cuerpo.querySelector('[data-zona]');
  const cargar = async p => {
    if (!p) return;
    input.value = p.codigo;
    if (modo === 'modificar') await formularioProducto(zona, p);
    else fichaEliminar(zona, p);
  };
  conectarCampoCodigo(input, cargar);
  cuerpo.querySelector('[data-buscar]').onclick = async () => {
    const p = await buscarProducto();
    if (p) await cargar(await productoPorCodigo(p.codigo));
  };
  if (codigoInicial) {
    const p = await productoPorCodigo(codigoInicial);
    if (p) await cargar(p);
    else toast('No existe un producto con ese código', 'error');
  } else setTimeout(() => input.focus(), 0);
}

function fichaEliminar(zona, p) {
  zona.innerHTML = `
    <div class="panel ficha-producto">
      <h3>${esc(p.descripcion)}</h3>
      <table class="lista-montos">
        <tr><td>Código</td><td>${esc(p.codigo)}</td></tr>
        <tr><td>Se vende</td><td>${TIPOS_VENTA[p.tipo_venta]}</td></tr>
        <tr><td>Precio costo</td><td>${dinero(p.costo)}</td></tr>
        <tr><td>Precio venta</td><td>${dinero(p.precio)}</td></tr>
        <tr><td>Departamento</td><td>${esc(p.departamento || '- Sin departamento -')}</td></tr>
        <tr><td>Existencia</td><td>${p.usa_inventario ? cant(p.existencia) : 'No usa inventario'}</td></tr>
      </table>
      <div class="botones"><button class="btn btn-peligro" data-eliminar>🗑 Eliminar este producto</button></div>
    </div>`;
  zona.querySelector('[data-eliminar]').onclick = async () => {
    const kits = await q(
      'SELECT p.descripcion FROM kit_componentes k JOIN productos p ON p.id = k.kit_id WHERE k.producto_id = ? AND p.activo = 1',
      [p.id]
    );
    const aviso = kits.length ? `<br><br>⚠️ Forma parte de los kits: <b>${kits.map(k => esc(k.descripcion)).join(', ')}</b>.` : '';
    if (!(await confirmar(`¿Eliminar el producto <b>${esc(p.descripcion)}</b>? Ya no podrá venderse.${aviso}`, { si: 'Eliminar', peligro: true })))
      return;
    await tx([pasoEliminar(p), ...(await quitarDeKitsYPromos(p.id))]);
    toast('Producto eliminado');
    mostrar('eliminar');
  };
}

// ---------------------------------------------------------------- Formulario de producto
async function formularioProducto(cont, prod) {
  const nuevo = !prod;
  if (nuevo && !puede('productos_crear')) return exigir('productos_crear');
  const departamentos = await q('SELECT * FROM departamentos ORDER BY nombre');
  const proveedores = await q('SELECT * FROM proveedores WHERE activo = 1 ORDER BY nombre');
  const impuestos = cfg('usar_impuestos') ? await q('SELECT * FROM impuestos ORDER BY id') : [];
  const unidades = cfg('unidades') || [];
  const usarInv = cfg('usar_inventario');
  const margen = Number(cfg('margen_auto')) || 0;
  const p = prod || {
    codigo: '',
    descripcion: '',
    tipo_venta: 'U',
    unidad: unidades[0] || '',
    costo: 0,
    ganancia: margen,
    precio: 0,
    mayoreo: 0,
    departamento: '',
    proveedor_id: null,
    usa_inventario: usarInv ? 1 : 0,
    existencia: 0,
    minimo: 0,
    maximo: 0,
    tasas: impuestos.filter(i => i.auto_nuevos),
  };
  const tasasSel = new Set((p.tasas || []).map(t => t.id));
  let componentes = prod?.tipo_venta === 'K'
    ? await q(
        `SELECT k.producto_id, k.cantidad, p.codigo, p.descripcion, p.costo, p.precio
         FROM kit_componentes k JOIN productos p ON p.id = k.producto_id WHERE k.kit_id = ?`,
        [prod.id]
      )
    : [];
  const preciosConImp = cfg('usar_impuestos') && cfg('precios_con_impuestos');

  cont.innerHTML = `
    <div class="panel form-producto">
      <h3>${nuevo ? 'NUEVO PRODUCTO' : 'MODIFICAR PRODUCTO'}</h3>
      <div class="pestanas">
        <button class="pestana activo" data-pestana="producto">Producto</button>
        ${impuestos.length ? `<button class="pestana" data-pestana="impuestos">Impuestos (<span data-n-imp>${tasasSel.size}</span>)</button>` : ''}
        <button class="pestana" data-pestana="kit" ${p.tipo_venta === 'K' ? '' : 'hidden'}>Contenido del paquete</button>
      </div>
      <form data-form autocomplete="off">
        <div class="pestana-cuerpo" data-cuerpo-pestana="producto">
          <div class="form-grid">
            <label>Código de barras</label>
            <div class="fila"><input name="codigo" value="${esc(p.codigo)}" maxlength="40" class="ancho-medio"><span class="nota">F10 para buscar</span></div>
            <label>Descripción</label><input name="descripcion" value="${esc(p.descripcion)}" maxlength="60">
            <label>Se vende</label>
            <div class="fila radios">
              <label class="check"><input type="radio" name="tipo_venta" value="U" ${p.tipo_venta === 'U' ? 'checked' : ''}> Por unidad / pieza</label>
              <label class="check"><input type="radio" name="tipo_venta" value="G" ${p.tipo_venta === 'G' ? 'checked' : ''}> A granel (usa decimales)</label>
              <label class="check"><input type="radio" name="tipo_venta" value="K" ${p.tipo_venta === 'K' ? 'checked' : ''}> Como paquete (kit)</label>
            </div>
            <label data-fila-unidad>Unidad de medida</label>
            <select name="unidad" data-fila-unidad>
              <option value="">(ninguna)</option>
              ${unidades.map(u => `<option ${u === p.unidad ? 'selected' : ''}>${esc(u)}</option>`).join('')}
            </select>
            <label>Precio costo</label><input name="costo" class="num ancho-chico" value="${numInput(p.costo, 4)}">
            <label>Ganancia (%)</label><input name="ganancia" class="num ancho-chico" value="${numInput(p.ganancia, 2)}">
            <label>Precio venta</label>
            <div class="fila"><input name="precio" class="num ancho-chico" value="${numInput(p.precio, 4)}">
              ${cfg('usar_impuestos') ? `<span class="nota">${preciosConImp ? 'Con impuestos incluidos' : 'Sin impuestos (se suman al vender)'}</span>` : ''}</div>
            <label>Precio mayoreo</label>
            <div class="fila"><input name="mayoreo" class="num ancho-chico" value="${numInput(p.mayoreo, 4)}"><span class="nota">0 = sin precio de mayoreo</span></div>
            <label>Departamento</label>
            <div class="fila">
              <input name="departamento" list="lista-deptos" value="${esc(p.departamento || '')}" placeholder="- Sin departamento -">
              <datalist id="lista-deptos">${departamentos.map(d => `<option value="${esc(d.nombre)}">`).join('')}</datalist>
              <button type="button" class="btn" data-admin-deptos>Administrar departamentos</button>
            </div>
            ${proveedores.length ? `<label>Proveedor</label><select name="proveedor_id"><option value="">- Ninguno -</option>
              ${proveedores.map(x => `<option value="${x.id}" ${x.id === p.proveedor_id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>` : ''}
            ${usarInv ? `
            <label data-fila-inv-check></label>
            <label class="check" data-fila-inv-check><input type="checkbox" name="usa_inventario" ${p.usa_inventario ? 'checked' : ''}> Este producto SÍ utiliza inventario</label>
            <label data-fila-inv>Hay</label>
            <div class="fila" data-fila-inv><input name="existencia" class="num ancho-chico" value="${numInput(p.existencia, 3)}">
              ${nuevo ? '<span class="nota">Existencia inicial</span>' : '<span class="nota">Al cambiarla se registra un ajuste de inventario</span>'}</div>
            <label data-fila-inv>Mínimo</label><input name="minimo" class="num ancho-chico" value="${numInput(p.minimo, 3)}" data-fila-inv>
            <label data-fila-inv>Máximo</label><input name="maximo" class="num ancho-chico" value="${numInput(p.maximo, 3)}" data-fila-inv>` : ''}
          </div>
        </div>
        ${impuestos.length ? `
        <div class="pestana-cuerpo" data-cuerpo-pestana="impuestos" hidden>
          <p class="nota">Marca los impuestos que aplican a este producto.</p>
          ${impuestos.map(i => `<label class="check"><input type="checkbox" name="imp_${i.id}" ${tasasSel.has(i.id) ? 'checked' : ''}> ${esc(i.nombre)} (${pct(i.tasa)})</label>`).join('')}
        </div>` : ''}
        <div class="pestana-cuerpo" data-cuerpo-pestana="kit" hidden>
          <p class="nota">Agrega los productos que contiene el paquete. El costo y el precio sugeridos son la suma de sus componentes.</p>
          <div class="fila">
            <input data-kit-codigo placeholder="Código del producto (F10 para buscar)">
            <span data-kit-desc class="nota"></span>
            <label>Cantidad</label><input data-kit-cant class="num ancho-chico" value="1">
            <button type="button" class="btn" data-kit-agregar>Agregar</button>
          </div>
          <div class="tabla-scroll alto-200" style="margin-top:10px">
            <table class="tabla seleccionable"><thead><tr><th>Código</th><th>Descripción</th><th class="num">Cantidad</th><th class="num">Costo</th><th class="num">Precio</th></tr></thead>
            <tbody data-kit-lista></tbody>
            <tfoot><tr><td colspan="3">Suma de componentes</td><td class="num" data-kit-costo></td><td class="num" data-kit-precio></td></tr></tfoot></table>
          </div>
          <div class="botones">
            <button type="button" class="btn" data-kit-precio-sugerido>Usar suma como precio de venta</button>
            <button type="button" class="btn btn-peligro" data-kit-quitar>Remover seleccionado</button>
          </div>
        </div>
        <div class="botones">
          ${nuevo ? '' : '<button type="button" class="btn" data-cancelar>Cancelar</button>'}
          <button type="submit" class="btn btn-primario grande">💾 Guardar producto</button>
        </div>
      </form>
    </div>`;

  const form = cont.querySelector('[data-form]');
  const f = n => form.elements[n];

  // Pestañas
  cont.querySelectorAll('[data-pestana]').forEach(
    b =>
      (b.onclick = () => {
        cont.querySelectorAll('[data-pestana]').forEach(x => x.classList.toggle('activo', x === b));
        cont.querySelectorAll('[data-cuerpo-pestana]').forEach(x => (x.hidden = x.dataset.cuerpoPestana !== b.dataset.pestana));
      })
  );
  const tipo = () => form.querySelector('[name=tipo_venta]:checked').value;
  const actualizarVisibilidad = () => {
    const t = tipo();
    cont.querySelector('[data-pestana="kit"]').hidden = t !== 'K';
    const mostrarUnidad = unidades.length > 2 || t === 'G';
    cont.querySelectorAll('[data-fila-unidad]').forEach(x => (x.hidden = !mostrarUnidad || t === 'K'));
    cont.querySelectorAll('[data-fila-inv-check]').forEach(x => (x.hidden = t === 'K'));
    const usa = f('usa_inventario')?.checked && t !== 'K';
    cont.querySelectorAll('[data-fila-inv]').forEach(x => (x.hidden = !usa));
  };
  form.querySelectorAll('[name=tipo_venta]').forEach(r => (r.onchange = () => (actualizarVisibilidad(), pintarKit())));
  if (f('usa_inventario')) f('usa_inventario').onchange = actualizarVisibilidad;
  actualizarVisibilidad();

  // Ganancia ↔ precio
  f('costo').oninput = () => {
    const costo = num(f('costo').value);
    const g = num(f('ganancia').value);
    if (costo > 0 && (g !== 0 || margen)) f('precio').value = numInput(calcularPrecio(costo, g), 2);
  };
  f('ganancia').oninput = () => {
    const costo = num(f('costo').value);
    if (costo > 0) f('precio').value = numInput(calcularPrecio(costo, num(f('ganancia').value)), 2);
  };
  f('precio').oninput = () => {
    const costo = num(f('costo').value);
    f('ganancia').value = numInput(calcularGanancia(costo, num(f('precio').value)), 2);
  };
  form.querySelectorAll('[name^=imp_]').forEach(
    c => (c.onchange = () => (cont.querySelector('[data-n-imp]').textContent = form.querySelectorAll('[name^=imp_]:checked').length))
  );

  // Código: F10 busca y carga el producto encontrado (en modificar) o avisa si ya existe (en nuevo).
  f('codigo').addEventListener('keydown', async e => {
    if (e.key === 'F10') {
      e.preventDefault();
      e.stopPropagation();
      const x = await buscarProducto();
      if (x && !nuevo) mostrar('modificar', { codigo: x.codigo });
      else if (x) toast(`Ese producto ya existe: ${x.codigo}`, 'aviso');
    }
  });

  cont.querySelector('[data-admin-deptos]').onclick = async () => {
    const r = await formulario({ titulo: 'Nuevo departamento', campos: [{ nombre: 'nombre', etiqueta: 'Nombre', requerido: true }], aceptar: 'Guardar' });
    if (!r) return;
    await departamentoId(r.nombre);
    f('departamento').value = r.nombre;
    cont.querySelector('#lista-deptos').insertAdjacentHTML('beforeend', `<option value="${esc(r.nombre)}">`);
    toast('Departamento guardado');
  };

  // ENTER avanza entre campos
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName === 'BUTTON' || e.target.matches('[data-kit-codigo],[data-kit-cant]')) return;
    e.preventDefault();
    const campos = [...form.querySelectorAll('[data-cuerpo-pestana="producto"] input:not([type=radio]):not([type=checkbox]), [data-cuerpo-pestana="producto"] select')].filter(
      x => !x.closest('[hidden]') && !x.hidden
    );
    const i = campos.indexOf(e.target);
    if (i >= 0 && i < campos.length - 1) {
      campos[i + 1].focus();
      campos[i + 1].select?.();
    } else form.requestSubmit();
  });

  // Kit
  let kitSel = -1;
  let kitProd = null;
  const kitCodigo = cont.querySelector('[data-kit-codigo]');
  const pintarKit = () => {
    const tb = cont.querySelector('[data-kit-lista]');
    tb.innerHTML =
      componentes
        .map(
          (c, i) => `<tr data-i="${i}" class="${i === kitSel ? 'sel' : ''}"><td>${esc(c.codigo)}</td><td>${esc(c.descripcion)}</td>
          <td class="num">${cant(c.cantidad)}</td><td class="num">${dinero(c.costo * c.cantidad)}</td><td class="num">${dinero(c.precio * c.cantidad)}</td></tr>`
        )
        .join('') || '<tr><td colspan="5" class="vacio">Sin productos contenidos</td></tr>';
    const costo = componentes.reduce((a, c) => a + c.costo * c.cantidad, 0);
    const precio = componentes.reduce((a, c) => a + c.precio * c.cantidad, 0);
    cont.querySelector('[data-kit-costo]').textContent = dinero(costo);
    cont.querySelector('[data-kit-precio]').textContent = dinero(precio);
    if (tipo() === 'K') {
      f('costo').value = numInput(costo, 4);
      if (!num(f('precio').value)) f('precio').value = numInput(precio, 2);
      f('ganancia').value = numInput(calcularGanancia(costo, num(f('precio').value)), 2);
    }
  };
  const agregarComponente = () => {
    if (!kitProd) return toast('Escribe un código y presiona ENTER', 'aviso');
    if (kitProd.tipo_venta === 'K') return toast('Un kit no puede contener otro kit', 'error');
    if (prod && kitProd.id === prod.id) return toast('El kit no puede contenerse a sí mismo', 'error');
    const cantidad = num(cont.querySelector('[data-kit-cant]').value);
    if (!(cantidad > 0)) return;
    const ex = componentes.find(c => c.producto_id === kitProd.id);
    if (ex) ex.cantidad = redondear(ex.cantidad + cantidad, 3);
    else componentes.push({ producto_id: kitProd.id, codigo: kitProd.codigo, descripcion: kitProd.descripcion, costo: kitProd.costo, precio: kitProd.precio, cantidad });
    kitProd = null;
    kitCodigo.value = '';
    cont.querySelector('[data-kit-desc]').textContent = '';
    cont.querySelector('[data-kit-cant]').value = '1';
    pintarKit();
    kitCodigo.focus();
  };
  conectarCampoCodigo(kitCodigo, x => {
    kitProd = x;
    cont.querySelector('[data-kit-desc]').textContent = x.descripcion;
    cont.querySelector('[data-kit-cant]').focus();
    cont.querySelector('[data-kit-cant]').select();
  });
  cont.querySelector('[data-kit-cant]').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      agregarComponente();
    }
  });
  cont.querySelector('[data-kit-agregar]').onclick = agregarComponente;
  cont.querySelector('[data-kit-lista]').onclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (tr) {
      kitSel = Number(tr.dataset.i);
      pintarKit();
    }
  };
  cont.querySelector('[data-kit-quitar]').onclick = () => {
    if (kitSel < 0) return toast('Selecciona un producto de la lista', 'aviso');
    componentes.splice(kitSel, 1);
    kitSel = -1;
    pintarKit();
  };
  cont.querySelector('[data-kit-precio-sugerido]').onclick = () => {
    f('precio').value = numInput(componentes.reduce((a, c) => a + c.precio * c.cantidad, 0), 2);
    f('precio').oninput();
  };
  pintarKit();
  const cancelar = cont.querySelector('[data-cancelar]');
  if (cancelar) cancelar.onclick = () => mostrar('modificar');

  form.onsubmit = async e => {
    e.preventDefault();
    const datos = {
      codigo: f('codigo').value.trim(),
      descripcion: f('descripcion').value.trim(),
      tipo_venta: tipo(),
      unidad: f('unidad').value,
      costo: num(f('costo').value),
      ganancia: num(f('ganancia').value),
      precio: num(f('precio').value),
      mayoreo: num(f('mayoreo').value),
      proveedor_id: f('proveedor_id') ? Number(f('proveedor_id').value) || null : prod?.proveedor_id ?? null,
      usa_inventario: f('usa_inventario') ? (f('usa_inventario').checked ? 1 : 0) : p.usa_inventario,
      existencia: f('existencia') ? num(f('existencia').value) : p.existencia,
      minimo: f('minimo') ? num(f('minimo').value) : p.minimo,
      maximo: f('maximo') ? num(f('maximo').value) : p.maximo,
    };
    if (datos.tipo_venta === 'K') {
      datos.usa_inventario = 0;
      datos.unidad = '';
      if (!componentes.length) return alerta('Agrega al menos un producto en la pestaña <b>Contenido del paquete</b>.');
    }
    if (!datos.codigo) return marcarError(f('codigo'), 'Escribe el código del producto.');
    if (/\s/.test(datos.codigo) || datos.codigo.includes('*')) return marcarError(f('codigo'), 'El código no puede tener espacios ni asteriscos.');
    if (!datos.descripcion) return marcarError(f('descripcion'), 'Escribe la descripción del producto.');
    if (!(datos.precio > 0)) return marcarError(f('precio'), 'El precio de venta debe ser mayor que cero.');
    if (datos.costo < 0 || datos.mayoreo < 0) return alerta('Los precios no pueden ser negativos.');
    if (datos.costo > 0 && datos.precio < datos.costo && !(await confirmar('El precio de venta es menor que el costo. ¿Guardar de todas formas?')))
      return;
    const dup = await q1('SELECT id FROM productos WHERE codigo = ? COLLATE NOCASE AND id <> ?', [datos.codigo, prod?.id || 0]);
    if (dup) return marcarError(f('codigo'), 'Ya existe otro producto con ese código.');
    datos.departamento_id = await departamentoId(f('departamento').value);
    const tasas = impuestos.filter(i => form.elements['imp_' + i.id]?.checked).map(i => i.id);
    try {
      if (nuevo) await guardarNuevo(datos, tasas, componentes);
      else await guardarCambios(prod, datos, tasas, componentes);
    } catch (err) {
      console.error(err);
      return alerta('No se pudo guardar: ' + esc(err.message), 'Error');
    }
    toast(nuevo ? 'Producto guardado' : 'Cambios guardados');
    if (nuevo) mostrar('nuevo');
    else mostrar('modificar');
  };

  setTimeout(() => (nuevo ? f('codigo') : f('descripcion')).focus(), 0);
}

async function marcarError(input, mensaje) {
  input.classList.add('error');
  await alerta(mensaje);
  input.focus();
}

const CAMPOS = ['codigo', 'descripcion', 'tipo_venta', 'unidad', 'costo', 'ganancia', 'precio', 'mayoreo', 'departamento_id', 'proveedor_id', 'usa_inventario', 'minimo', 'maximo'];

function pasosImpuestosYKit(id, tasas, componentes, tipo) {
  const pasos = [{ sql: 'DELETE FROM producto_impuestos WHERE producto_id = ?', params: [id] }];
  for (const t of tasas) pasos.push({ sql: 'INSERT INTO producto_impuestos (producto_id, impuesto_id) VALUES (?, ?)', params: [id, t] });
  pasos.push({ sql: 'DELETE FROM kit_componentes WHERE kit_id = ?', params: [id] });
  if (tipo === 'K')
    for (const c of componentes)
      pasos.push({ sql: 'INSERT INTO kit_componentes (kit_id, producto_id, cantidad) VALUES (?, ?, ?)', params: [id, c.producto_id, c.cantidad] });
  return pasos;
}

async function guardarNuevo(d, tasas, componentes) {
  const { id } = await run(
    `INSERT INTO productos (${CAMPOS.join(', ')}, existencia) VALUES (${CAMPOS.map(() => '?').join(', ')}, 0)`,
    CAMPOS.map(c => d[c])
  );
  const pasos = pasosImpuestosYKit(id, tasas, componentes, d.tipo_venta);
  await tx(pasos);
  if (d.usa_inventario && d.existencia)
    await tx(await pasosInventario([{ producto_id: id, cantidad: d.existencia, costo: d.costo }], 'ENTRADA', 'Inventario inicial'));
}

async function guardarCambios(prod, d, tasas, componentes) {
  const pasos = [
    { sql: `UPDATE productos SET ${CAMPOS.map(c => c + ' = ?').join(', ')} WHERE id = ?`, params: [...CAMPOS.map(c => d[c]), prod.id] },
    ...pasosImpuestosYKit(prod.id, tasas, componentes, d.tipo_venta),
    ...pasosCambiosPrecio(prod, d),
  ];
  await tx(pasos);
  const diferencia = redondear(d.existencia - prod.existencia, 3);
  if (d.usa_inventario && diferencia)
    await tx(await pasosInventario([{ producto_id: prod.id, cantidad: diferencia, costo: d.costo }], 'AJUSTE', 'Modificación de producto'));
}

// ---------------------------------------------------------------- Departamentos
async function vistaDepartamentos(cuerpo) {
  let sel = null;
  cuerpo.innerHTML = `
    <div class="maestro-detalle">
      <div class="panel">
        <h3>Departamentos</h3>
        <div class="tabla-scroll"><table class="tabla seleccionable"><thead><tr><th>Nombre</th><th class="num">Productos</th></tr></thead><tbody data-lista></tbody></table></div>
      </div>
      <div class="panel">
        <h3 data-titulo-depto>Nuevo departamento</h3>
        <form class="form-grid" data-form>
          <label>Nombre</label><input name="nombre" maxlength="40">
        </form>
        <div class="botones">
          <button class="btn" data-nuevo>➕ Nuevo departamento</button>
          <button class="btn btn-peligro" data-eliminar disabled>🗑 Eliminar</button>
          <button class="btn btn-primario" data-guardar>💾 Guardar departamento</button>
        </div>
      </div>
    </div>`;
  const form = cuerpo.querySelector('[data-form]');
  const lista = cuerpo.querySelector('[data-lista]');
  const pintar = async () => {
    const deptos = await q(
      'SELECT d.*, (SELECT COUNT(*) FROM productos p WHERE p.departamento_id = d.id AND p.activo = 1) AS n FROM departamentos d ORDER BY d.nombre'
    );
    lista.innerHTML =
      deptos.map(d => `<tr data-id="${d.id}" class="${sel?.id === d.id ? 'sel' : ''}"><td>${esc(d.nombre)}</td><td class="num">${d.n}</td></tr>`).join('') ||
      '<tr><td colspan="2" class="vacio">No hay departamentos</td></tr>';
    lista.onclick = e => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      sel = deptos.find(d => d.id === Number(tr.dataset.id));
      form.nombre.value = sel.nombre;
      cuerpo.querySelector('[data-titulo-depto]').textContent = 'Modificar departamento';
      cuerpo.querySelector('[data-eliminar]').disabled = false;
      pintar();
    };
  };
  const limpiar = () => {
    sel = null;
    form.nombre.value = '';
    cuerpo.querySelector('[data-titulo-depto]').textContent = 'Nuevo departamento';
    cuerpo.querySelector('[data-eliminar]').disabled = true;
    form.nombre.focus();
    pintar();
  };
  const guardar = async () => {
    const nombre = form.nombre.value.trim();
    if (!nombre) return form.nombre.focus();
    const dup = await q1('SELECT id FROM departamentos WHERE nombre = ? COLLATE NOCASE AND id <> ?', [nombre, sel?.id || 0]);
    if (dup) return alerta('Ya existe un departamento con ese nombre.');
    if (sel) await run('UPDATE departamentos SET nombre = ? WHERE id = ?', [nombre, sel.id]);
    else await run('INSERT INTO departamentos (nombre) VALUES (?)', [nombre]);
    toast('Departamento guardado');
    limpiar();
  };
  form.onsubmit = e => (e.preventDefault(), guardar());
  cuerpo.querySelector('[data-guardar]').onclick = guardar;
  cuerpo.querySelector('[data-nuevo]').onclick = limpiar;
  cuerpo.querySelector('[data-eliminar]').onclick = async () => {
    if (!sel) return;
    if (!(await confirmar(`¿Eliminar el departamento <b>${esc(sel.nombre)}</b>? Sus productos quedarán sin departamento.`, { peligro: true, si: 'Eliminar' })))
      return;
    await tx([
      { sql: 'UPDATE productos SET departamento_id = NULL WHERE departamento_id = ?', params: [sel.id] },
      { sql: 'DELETE FROM departamentos WHERE id = ?', params: [sel.id] },
    ]);
    toast('Departamento eliminado');
    limpiar();
  };
  limpiar();
}

// ---------------------------------------------------------------- Ventas por período
async function vistaVentasPeriodo(cuerpo) {
  const verGanancia = puede('ver_ganancia');
  cuerpo.innerHTML = `
    <div class="panel">
      <div class="fila"><label>Mostrar ventas de:</label><span data-periodo></span>
        <label>Departamento</label><select data-depto><option value="">Todos</option></select>
        <span class="espaciador"></span>
        <button class="btn" data-exportar>📤 Exportar</button>
        <button class="btn" data-imprimir>🖨 Imprimir</button>
      </div>
    </div>
    <div class="tabla-scroll ventas-periodo-tabla">
      <table class="tabla"><thead><tr>
        <th>Código</th><th>Descripción</th><th>Departamento</th><th class="num">Cantidad</th><th class="num">Importe</th>
        ${verGanancia ? '<th class="num">Ganancia</th>' : ''}
      </tr></thead><tbody data-lista></tbody></table>
    </div>
    <div class="total-vendido">Total vendido: <b data-total></b></div>`;
  const deptos = await q('SELECT * FROM departamentos ORDER BY nombre');
  const selDepto = cuerpo.querySelector('[data-depto]');
  selDepto.innerHTML += deptos.map(d => `<option value="${d.id}">${esc(d.nombre)}</option>`).join('');
  let filas = [];
  let rango = null;
  const cargar = async () => {
    if (!rango?.desde || !rango?.hasta) return;
    const params = [rango.desde, rango.hasta];
    let cond = '';
    if (selDepto.value) {
      cond = 'AND r.departamento_id = ?';
      params.push(Number(selDepto.value));
    }
    filas = await q(
      `SELECT COALESCE(r.codigo, '') AS codigo, r.descripcion, COALESCE(d.nombre, '') AS departamento,
         SUM(r.cantidad - r.devuelto) AS cantidad,
         SUM(r.importe * (r.cantidad - r.devuelto) / r.cantidad) AS importe,
         SUM((r.precio - r.costo) * (r.cantidad - r.devuelto)) AS ganancia
       FROM venta_renglones r JOIN ventas v ON v.id = r.venta_id LEFT JOIN departamentos d ON d.id = r.departamento_id
       WHERE date(v.fecha) BETWEEN ? AND ? ${cond}
       GROUP BY COALESCE(r.producto_id, 'C:' || r.descripcion)
       HAVING SUM(r.cantidad - r.devuelto) > 0
       ORDER BY importe DESC`,
      params
    );
    cuerpo.querySelector('[data-lista]').innerHTML =
      filas
        .map(
          f => `<tr><td>${esc(f.codigo || '(común)')}</td><td>${esc(f.descripcion)}</td><td>${esc(f.departamento)}</td>
          <td class="num">${cant(f.cantidad)}</td><td class="num">${dinero(f.importe)}</td>${verGanancia ? `<td class="num">${dinero(f.ganancia)}</td>` : ''}</tr>`
        )
        .join('') || `<tr><td colspan="6" class="vacio">No hubo ventas en el período</td></tr>`;
    cuerpo.querySelector('[data-total]').textContent = dinero(filas.reduce((a, f) => a + f.importe, 0));
  };
  selectorPeriodo(cuerpo.querySelector('[data-periodo]'), r => {
    rango = r;
    cargar();
  }, 'HOY');
  selDepto.onchange = cargar;
  cuerpo.querySelector('[data-exportar]').onclick = () => {
    const cols = [
      ['codigo', 'Código'],
      ['descripcion', 'Descripción'],
      ['departamento', 'Departamento'],
      ['cantidad', 'Cantidad'],
      ['importe', 'Importe'],
    ];
    if (verGanancia) cols.push(['ganancia', 'Ganancia']);
    exportarCSV(`ventas-por-producto-${rango.desde}-a-${rango.hasta}`, cols, filas.map(f => ({ ...f, importe: redondear(f.importe, 2), ganancia: redondear(f.ganancia, 2) })));
  };
  cuerpo.querySelector('[data-imprimir]').onclick = () => {
    const l = [{ t: 'VENTAS POR PRODUCTO', c: true, b: true }, centrar(`${rango.desde} a ${rango.hasta}`), separador()];
    for (const f of filas) {
      l.push(f.descripcion);
      l.push(dos(`  ${cant(f.cantidad)}`, dinero(f.importe)));
    }
    l.push(separador(), { t: dos('TOTAL:', dinero(filas.reduce((a, f) => a + f.importe, 0))), b: true }, '', '', '');
    imprimirLineas(l);
  };
}

// ---------------------------------------------------------------- Promociones
async function vistaPromociones(cuerpo) {
  cuerpo.innerHTML = `
    <div class="dos-col promociones">
      <div class="panel">
        <h3>Promociones vigentes</h3>
        <div class="tabla-scroll alto-400"><table class="tabla seleccionable"><thead><tr>
          <th>Promoción</th><th>Producto</th><th class="num">Desde</th><th class="num">Hasta</th><th class="num">Precio</th><th></th>
        </tr></thead><tbody data-lista></tbody></table></div>
      </div>
      <div class="panel">
        <h3>NUEVA PROMOCIÓN</h3>
        <form class="form-grid" data-form autocomplete="off">
          <label>Nombre de la promoción</label><input name="nombre" placeholder="Ej. Gaseosa 3x2" maxlength="40">
          <label>Código de barras</label>
          <div class="fila"><input name="codigo" placeholder="F10 para buscar"><button type="button" class="btn" data-buscar>🔍</button></div>
          <label>Producto</label><div data-desc class="nota">—</div>
          <label>Precio normal</label><div data-normal>—</div>
          <label>Precio costo</label><div data-costo>—</div>
          <label>Cuando la cantidad vaya desde</label><input name="desde" class="num ancho-chico" value="2">
          <label>hasta</label><input name="hasta" class="num ancho-chico" value="999">
          <label>Usar precio unitario</label><input name="precio" class="num ancho-chico">
        </form>
        <div class="botones"><button class="btn btn-primario" data-guardar>💾 Guardar nueva promoción</button></div>
      </div>
    </div>`;
  const form = cuerpo.querySelector('[data-form]');
  let producto = null;
  const elegir = p => {
    producto = p;
    form.codigo.value = p.codigo;
    cuerpo.querySelector('[data-desc]').textContent = p.descripcion;
    cuerpo.querySelector('[data-normal]').textContent = dinero(p.precio);
    cuerpo.querySelector('[data-costo]').textContent = dinero(p.costo);
    form.desde.focus();
    form.desde.select();
  };
  conectarCampoCodigo(form.codigo, elegir);
  cuerpo.querySelector('[data-buscar]').onclick = async () => {
    const p = await buscarProducto();
    if (p) elegir(await productoPorCodigo(p.codigo));
  };
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.name === 'codigo') return;
    e.preventDefault();
    const orden = ['nombre', 'codigo', 'desde', 'hasta', 'precio'];
    const i = orden.indexOf(e.target.name);
    if (i < orden.length - 1) form[orden[i + 1]].focus();
    else guardar();
  });
  const pintar = async () => {
    const promos = await q(
      `SELECT pr.*, p.descripcion, p.codigo, p.precio AS normal FROM promociones pr JOIN productos p ON p.id = pr.producto_id
       WHERE p.activo = 1 ORDER BY p.descripcion, pr.desde`
    );
    const tb = cuerpo.querySelector('[data-lista]');
    tb.innerHTML =
      promos
        .map(
          x => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.descripcion)}<br><small class="nota">${esc(x.codigo)} · normal ${dinero(x.normal)}</small></td>
          <td class="num">${cant(x.desde)}</td><td class="num">${cant(x.hasta)}</td><td class="num">${dinero(x.precio)}</td>
          <td><button class="btn btn-icono" data-eliminar="${x.id}" title="Eliminar">🗑</button></td></tr>`
        )
        .join('') || '<tr><td colspan="6" class="vacio">No hay promociones</td></tr>';
    tb.querySelectorAll('[data-eliminar]').forEach(
      b =>
        (b.onclick = async () => {
          if (!(await confirmar('¿Eliminar esta promoción?', { peligro: true, si: 'Eliminar' }))) return;
          await run('DELETE FROM promociones WHERE id = ?', [Number(b.dataset.eliminar)]);
          toast('Promoción eliminada');
          pintar();
        })
    );
  };
  const guardar = async () => {
    const nombre = form.nombre.value.trim();
    const desde = num(form.desde.value);
    const hasta = num(form.hasta.value);
    const precio = num(form.precio.value);
    if (!producto) return alerta('Elige el producto de la promoción (escribe su código y presiona ENTER).');
    if (!nombre) return alerta('Escribe el nombre de la promoción.');
    if (!(desde > 0) || hasta < desde) return alerta('Revisa el rango de cantidades (desde debe ser mayor que 0 y menor o igual que hasta).');
    if (!(precio > 0)) return alerta('Escribe el precio unitario de la promoción.');
    const choque = await q1('SELECT nombre FROM promociones WHERE producto_id = ? AND NOT (hasta < ? OR desde > ?)', [producto.id, desde, hasta]);
    if (choque) return alerta(`El rango se cruza con la promoción <b>${esc(choque.nombre)}</b> del mismo producto.`);
    if (precio < producto.costo && !(await confirmar('El precio de la promoción es menor que el costo. ¿Guardar de todas formas?'))) return;
    await run('INSERT INTO promociones (nombre, producto_id, desde, hasta, precio) VALUES (?, ?, ?, ?, ?)', [nombre, producto.id, desde, hasta, precio]);
    toast('Promoción guardada');
    producto = null;
    form.reset();
    form.desde.value = '2';
    form.hasta.value = '999';
    ['[data-desc]', '[data-normal]', '[data-costo]'].forEach(s => (cuerpo.querySelector(s).textContent = '—'));
    form.nombre.focus();
    pintar();
  };
  cuerpo.querySelector('[data-guardar]').onclick = guardar;
  pintar();
  setTimeout(() => form.nombre.focus(), 0);
}

