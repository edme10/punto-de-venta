// Catálogo de productos y actualizador masivo ("Actualizar varios").
import {
  q, tx, cfg, exigir, abrirModal, alerta, confirmar, toast,
  esc, dinero, cant, pct, num, redondear, exportarCSV,
} from '../core.js';
import { pasosInventario, calcularGanancia } from '../servicios.js';
import { TIPOS_VENTA, COLUMNAS_PLANTILLA, filasExportacion, pasosCambiosPrecio, pasoEliminar, quitarDeKitsYPromos } from './productos-comun.js';

const COLUMNAS = [
  ['codigo', 'Código', 'texto'],
  ['descripcion', 'Descripción', 'texto'],
  ['tipo_venta', 'Tipo', 'texto'],
  ['costo', 'Costo', 'num'],
  ['precio', 'Precio venta', 'num'],
  ['mayoreo', 'Mayoreo', 'num'],
  ['ganancia_calc', 'Ganancia', 'num'],
  ['departamento', 'Departamento', 'texto'],
  ['existencia', 'Existencia', 'num'],
];

const FILTROS = [
  ['', 'Todos los productos'],
  ['INV', 'Con inventario'],
  ['SININV', 'Sin inventario'],
  ['BAJO', 'Bajos en inventario'],
  ['U', 'Por unidad'],
  ['G', 'A granel'],
  ['K', 'Kits'],
  ['FAV', 'Favoritos'],
];

export async function vistaCatalogo(cuerpo, { modificar }) {
  const deptos = await q('SELECT * FROM departamentos ORDER BY nombre');
  cuerpo.innerHTML = `
    <div class="catalogo">
      <div class="fila catalogo-filtros">
        <input data-texto placeholder="🔍 Buscar por descripción o código">
        <label>Departamento</label>
        <select data-depto><option value="">Todos</option><option value="0">- Sin departamento -</option>
          ${deptos.map(d => `<option value="${d.id}">${esc(d.nombre)}</option>`).join('')}</select>
        <select data-filtro>${FILTROS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
        <span class="espaciador"></span>
        <span class="nota" data-conteo></span>
      </div>
      <div class="tabla-scroll catalogo-tabla">
        <table class="tabla seleccionable">
          <thead><tr>
            <th style="width:30px"><input type="checkbox" data-todos title="Seleccionar todos"></th>
            ${COLUMNAS.map(([k, t, tipo]) => `<th data-orden="${k}" class="${tipo === 'num' ? 'num' : ''}">${t} <span class="flecha"></span></th>`).join('')}
          </tr></thead>
          <tbody data-lista></tbody>
        </table>
      </div>
      <div class="botones">
        <span class="nota" data-seleccion></span>
        <span class="espaciador"></span>
        <button class="btn" data-exportar>📤 Exportar</button>
        <button class="btn" data-modificar>✏️ Modificar</button>
        <button class="btn btn-primario" data-masivo>⚙️ Actualizar varios</button>
      </div>
    </div>`;

  const $c = s => cuerpo.querySelector(s);
  let productos = [];
  let filtrados = [];
  const seleccion = new Set();
  let orden = { campo: 'descripcion', asc: true };
  let actual = null;

  const cargar = async () => {
    productos = await q(
      `SELECT p.*, d.nombre AS departamento FROM productos p LEFT JOIN departamentos d ON d.id = p.departamento_id
       WHERE p.activo = 1`
    );
    for (const p of productos) p.ganancia_calc = calcularGanancia(p.costo, p.precio);
    for (const id of [...seleccion]) if (!productos.some(p => p.id === id)) seleccion.delete(id);
    filtrar();
  };

  const filtrar = () => {
    const t = $c('[data-texto]').value.trim().toLowerCase();
    const d = $c('[data-depto]').value;
    const f = $c('[data-filtro]').value;
    filtrados = productos.filter(p => {
      if (t && !p.descripcion.toLowerCase().includes(t) && !p.codigo.toLowerCase().includes(t)) return false;
      if (d === '0' && p.departamento_id) return false;
      if (d && d !== '0' && p.departamento_id !== Number(d)) return false;
      switch (f) {
        case 'INV': return p.usa_inventario;
        case 'SININV': return !p.usa_inventario;
        case 'BAJO': return p.usa_inventario && p.existencia <= p.minimo;
        case 'U': case 'G': case 'K': return p.tipo_venta === f;
        case 'FAV': return p.favorito;
      }
      return true;
    });
    const { campo, asc } = orden;
    const tipo = COLUMNAS.find(c => c[0] === campo)?.[2];
    filtrados.sort((a, b) => {
      let x = a[campo];
      let y = b[campo];
      if (campo === 'existencia') {
        x = a.usa_inventario ? x : Infinity;
        y = b.usa_inventario ? y : Infinity;
      }
      const r = tipo === 'num' ? (x ?? 0) - (y ?? 0) : String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true });
      return asc ? r : -r;
    });
    pintar();
  };

  const LIMITE = 1500;
  const pintar = () => {
    const filas = filtrados.slice(0, LIMITE);
    $c('[data-lista]').innerHTML =
      filas
        .map(
          p => `<tr data-id="${p.id}" class="${seleccion.has(p.id) ? 'marcado' : ''} ${actual === p.id ? 'sel' : ''} ${p.favorito ? 'favorito' : ''}">
          <td><input type="checkbox" data-check ${seleccion.has(p.id) ? 'checked' : ''}></td>
          <td>${esc(p.codigo)}</td><td>${esc(p.descripcion)}</td><td>${TIPOS_VENTA[p.tipo_venta]}</td>
          <td class="num">${dinero(p.costo)}</td><td class="num">${dinero(p.precio)}</td><td class="num">${p.mayoreo ? dinero(p.mayoreo) : ''}</td>
          <td class="num ${p.ganancia_calc < 0 ? 'rojo' : ''}">${p.costo ? pct(p.ganancia_calc) : ''}</td>
          <td>${esc(p.departamento || '')}</td>
          <td class="num ${p.usa_inventario && p.existencia <= p.minimo ? 'rojo' : ''}">${p.usa_inventario ? cant(p.existencia) : 'Ilim'}</td></tr>`
        )
        .join('') || '<tr><td colspan="10" class="vacio">No hay productos</td></tr>';
    $c('[data-conteo]').textContent =
      `${filtrados.length} producto(s)` + (filtrados.length > LIMITE ? ` · mostrando los primeros ${LIMITE}` : '');
    $c('[data-seleccion]').textContent = seleccion.size ? `${seleccion.size} seleccionado(s)` : '';
    $c('[data-todos]').checked = filtrados.length > 0 && filtrados.every(p => seleccion.has(p.id));
    cuerpo.querySelectorAll('th[data-orden]').forEach(th => {
      th.querySelector('.flecha').textContent = th.dataset.orden === orden.campo ? (orden.asc ? '▲' : '▼') : '';
    });
  };

  let tt;
  $c('[data-texto]').oninput = () => {
    clearTimeout(tt);
    tt = setTimeout(filtrar, 150);
  };
  $c('[data-depto]').onchange = $c('[data-filtro]').onchange = filtrar;
  cuerpo.querySelector('thead').onclick = e => {
    const th = e.target.closest('th[data-orden]');
    if (!th) return;
    orden = { campo: th.dataset.orden, asc: orden.campo === th.dataset.orden ? !orden.asc : true };
    filtrar();
  };
  $c('[data-todos]').onchange = e => {
    for (const p of filtrados) e.target.checked ? seleccion.add(p.id) : seleccion.delete(p.id);
    pintar();
  };
  $c('[data-lista]').onclick = e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = Number(tr.dataset.id);
    if (e.target.matches('[data-check]')) {
      e.target.checked ? seleccion.add(id) : seleccion.delete(id);
    } else actual = id;
    pintar();
  };
  $c('[data-lista]').ondblclick = e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.matches('[data-check]')) abrirModificar(Number(tr.dataset.id));
  };
  const abrirModificar = id => {
    if (!exigir('productos_modificar')) return;
    const p = productos.find(x => x.id === id);
    if (p) modificar(p.codigo);
  };
  $c('[data-modificar]').onclick = () => {
    const id = actual ?? (seleccion.size === 1 ? [...seleccion][0] : null);
    if (!id) return toast('Selecciona un producto (clic en el renglón)', 'aviso');
    abrirModificar(id);
  };
  $c('[data-exportar]').onclick = async () => {
    const ids = seleccion.size ? [...seleccion] : filtrados.map(p => p.id);
    const filas = await filasExportacion(ids.length === productos.length ? null : ids);
    exportarCSV('catalogo-productos', COLUMNAS_PLANTILLA, filas);
  };
  $c('[data-masivo]').onclick = async () => {
    if (!exigir('productos_masivo')) return;
    let ids = [...seleccion];
    if (!ids.length) {
      if (!filtrados.length) return toast('No hay productos', 'aviso');
      if (!(await confirmar(`No seleccionaste productos. ¿Aplicar la actualización a los <b>${filtrados.length}</b> productos filtrados?`, { si: 'Sí, continuar' })))
        return;
      ids = filtrados.map(p => p.id);
    }
    const cambio = await actualizadorMasivo(productos.filter(p => ids.includes(p.id)));
    if (cambio) {
      seleccion.clear();
      await cargar();
    }
  };

  await cargar();
  setTimeout(() => $c('[data-texto]').focus(), 0);
}

// ---------------------------------------------------------------- Actualizador masivo
const ACCIONES = [
  ['precios', 'Aumentar o disminuir precios'],
  ['ganancia', 'Actualizar ganancia / utilidad'],
  ['impuestos', 'Actualizar impuestos'],
  ['tipo', 'Cambiar tipo de venta (unidad / granel)'],
  ['departamento', 'Cambiar departamento'],
  ['usar_inventario', 'Comenzar a usar inventario'],
  ['inventario', 'Aumentar o disminuir inventario'],
  ['proveedor', 'Cambiar proveedor'],
  ['eliminar', 'Eliminar productos'],
];

async function actualizadorMasivo(productos) {
  const impuestos = await q('SELECT * FROM impuestos ORDER BY id');
  const deptos = await q('SELECT * FROM departamentos ORDER BY nombre');
  const proveedores = await q('SELECT * FROM proveedores WHERE activo = 1 ORDER BY nombre');
  let paso = 1;
  let accion = 'precios';
  let params = {};
  let cambios = [];

  const m = abrirModal({ titulo: 'Actualizar varios productos', ancho: 820, clase: 'modal-masivo' });

  const pintar = () => {
    const nombre = ACCIONES.find(a => a[0] === accion)[1];
    let html = `<div class="pasos-asistente">${['Acción', 'Parámetros', 'Resumen']
      .map((t, i) => `<span class="${paso === i + 1 ? 'activo' : paso > i + 1 ? 'hecho' : ''}">${i + 1}. ${t}</span>`)
      .join('')}</div>
      <p class="nota">${productos.length} producto(s) seleccionado(s).</p>`;
    if (paso === 1) {
      html += `<div class="lista-acciones">${ACCIONES.map(
        ([k, t]) => `<label class="check opcion-accion"><input type="radio" name="accion" value="${k}" ${k === accion ? 'checked' : ''}> ${t}</label>`
      ).join('')}</div>
      <div class="botones"><button class="btn" data-cancelar>Cancelar</button><button class="btn btn-primario" data-siguiente>Siguiente ›</button></div>`;
    } else if (paso === 2) {
      html += `<h3>${nombre}</h3><form class="form-grid" data-params>${formParametros()}</form>
      <div class="botones"><button class="btn" data-atras>‹ Atrás</button><button class="btn" data-cancelar>Cancelar</button>
      <button class="btn btn-primario" data-siguiente>Siguiente ›</button></div>`;
    } else {
      const afectados = cambios.filter(c => !c.omitido);
      html += `<h3>Resumen: ${nombre}</h3>
      <p>Se modificarán <b>${afectados.length}</b> producto(s)${cambios.length - afectados.length ? `; se omitirán <b>${cambios.length - afectados.length}</b>` : ''}.
      <b class="rojo">Esta operación no se puede deshacer.</b></p>
      <div class="tabla-scroll alto-340"><table class="tabla"><thead><tr><th>Código</th><th>Descripción</th><th>Antes</th><th>Después</th></tr></thead><tbody>
      ${cambios
        .map(
          c => `<tr class="${c.omitido ? 'omitido' : ''}"><td>${esc(c.p.codigo)}</td><td>${esc(c.p.descripcion)}</td>
          <td>${esc(c.antes)}</td><td>${c.omitido ? `<i>Omitido: ${esc(c.omitido)}</i>` : esc(c.despues)}</td></tr>`
        )
        .join('')}</tbody></table></div>
      <div class="botones"><button class="btn" data-atras>‹ Atrás</button><button class="btn" data-cancelar>Cancelar</button>
      <button class="btn btn-primario" data-comenzar ${afectados.length ? '' : 'disabled'}>▶ Comenzar</button></div>`;
    }
    m.cuerpo.innerHTML = html;
    const b = s => m.cuerpo.querySelector(s);
    b('[data-cancelar]').onclick = () => m.cerrar(false);
    if (b('[data-atras]')) b('[data-atras]').onclick = () => ((paso -= 1), pintar());
    if (b('[data-siguiente]'))
      b('[data-siguiente]').onclick = async () => {
        if (paso === 1) {
          accion = m.cuerpo.querySelector('[name=accion]:checked').value;
          params = {};
          paso = 2;
        } else {
          const err = leerParametros();
          if (err) return alerta(err);
          cambios = calcularCambios();
          paso = 3;
        }
        pintar();
      };
    if (b('[data-comenzar]')) b('[data-comenzar]').onclick = aplicar;
    const primero = m.cuerpo.querySelector('[data-params] input, [data-params] select');
    if (primero) primero.focus();
  };

  const formParametros = () => {
    switch (accion) {
      case 'precios':
        return `<label>Tipo de cambio</label><select name="modo">
            <option value="PCT">Por porcentaje (%)</option><option value="MONTO">Por monto fijo (+/-)</option><option value="FIJO">Precio fijo</option></select>
          <label>Valor</label><input name="valor" class="num ancho-chico" value="0">
          <label></label><label class="check"><input type="checkbox" name="mayoreo"> Aplicar también al precio de mayoreo</label>
          <label></label><span class="nota">Usa valores negativos para disminuir. Los kits no se modifican.</span>`;
      case 'ganancia':
        return `<label>Ganancia (%)</label><input name="valor" class="num ancho-chico" value="${cfg('margen_auto') || 30}">
          <label></label><span class="nota">El precio de venta se recalcula a partir del costo. Se omiten productos sin costo, con pérdida y kits.</span>`;
      case 'impuestos':
        return impuestos.length
          ? impuestos
              .map(
                i => `<label>${esc(i.nombre)} (${pct(i.tasa)})</label><select name="imp_${i.id}">
                <option value="">Sin cambio</option><option value="AGREGAR">Agregar</option><option value="QUITAR">Quitar</option></select>`
              )
              .join('')
          : '<p class="nota">No hay impuestos configurados. Agrégalos en Configuración → Impuestos.</p>';
      case 'tipo':
        return `<label>Se venden</label><select name="tipo"><option value="U">Por unidad / pieza</option><option value="G">A granel</option></select>
          <label></label><span class="nota">Los kits no se modifican.</span>`;
      case 'departamento':
        return `<label>Nuevo departamento</label><select name="depto"><option value="">- Sin departamento -</option>
          ${deptos.map(d => `<option value="${d.id}">${esc(d.nombre)}</option>`).join('')}</select>`;
      case 'usar_inventario':
        return `<p class="nota">Los productos seleccionados empezarán a controlar existencias (con existencia actual ${cant(0)} si no tenían). Los kits se omiten.</p>`;
      case 'inventario':
        return `<label>Cantidad (+/-)</label><input name="valor" class="num ancho-chico" value="0">
          <label>Motivo</label><input name="motivo" value="Actualización masiva">
          <label></label><span class="nota">Solo afecta productos que usan inventario. Se registra como ajuste.</span>`;
      case 'proveedor':
        return `<label>Nuevo proveedor</label><select name="prov"><option value="">- Ninguno -</option>
          ${proveedores.map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('')}</select>`;
      case 'eliminar':
        return `<p class="mensaje rojo">Los productos seleccionados se eliminarán y ya no podrán venderse.</p>`;
    }
    return '';
  };

  const leerParametros = () => {
    const f = m.cuerpo.querySelector('[data-params]');
    const el = n => f.elements[n];
    switch (accion) {
      case 'precios':
        params = { modo: el('modo').value, valor: num(el('valor').value), mayoreo: el('mayoreo').checked };
        if (params.modo === 'FIJO' && !(params.valor > 0)) return 'El precio fijo debe ser mayor que cero.';
        if (params.modo !== 'FIJO' && !params.valor) return 'Escribe un valor distinto de cero.';
        break;
      case 'ganancia':
        params = { valor: num(el('valor').value) };
        break;
      case 'impuestos':
        params = Object.fromEntries(impuestos.map(i => [i.id, el('imp_' + i.id).value]));
        if (!Object.values(params).some(Boolean)) return 'Elige al menos un impuesto para agregar o quitar.';
        break;
      case 'tipo':
        params = { tipo: el('tipo').value };
        break;
      case 'departamento':
        params = { depto: Number(el('depto').value) || null };
        break;
      case 'inventario':
        params = { valor: num(el('valor').value), motivo: el('motivo').value.trim() || 'Actualización masiva' };
        if (!params.valor) return 'Escribe una cantidad distinta de cero.';
        break;
      case 'proveedor':
        params = { prov: Number(el('prov').value) || null };
        break;
    }
    return null;
  };

  const nuevoPrecio = v => {
    if (params.modo === 'PCT') return redondear(v * (1 + params.valor / 100), 2);
    if (params.modo === 'MONTO') return redondear(v + params.valor, 2);
    return params.valor;
  };

  const calcularCambios = () =>
    productos.map(p => {
      const c = { p, antes: '', despues: '' };
      switch (accion) {
        case 'precios': {
          if (p.tipo_venta === 'K') return { ...c, omitido: 'es un kit' };
          const precio = nuevoPrecio(p.precio);
          if (precio < 0) return { ...c, omitido: 'el precio quedaría negativo' };
          c.nuevo = { precio, ganancia: calcularGanancia(p.costo, precio) };
          if (params.mayoreo && p.mayoreo > 0) c.nuevo.mayoreo = Math.max(0, nuevoPrecio(p.mayoreo));
          c.antes = dinero(p.precio) + (c.nuevo.mayoreo != null ? ` / may. ${dinero(p.mayoreo)}` : '');
          c.despues = dinero(precio) + (c.nuevo.mayoreo != null ? ` / may. ${dinero(c.nuevo.mayoreo)}` : '');
          return c;
        }
        case 'ganancia': {
          if (p.tipo_venta === 'K') return { ...c, omitido: 'es un kit' };
          if (!(p.costo > 0)) return { ...c, omitido: 'no tiene costo' };
          if (p.precio < p.costo) return { ...c, omitido: 'ya tiene pérdida' };
          const precio = redondear(p.costo * (1 + params.valor / 100), 2);
          c.nuevo = { precio, ganancia: params.valor };
          c.antes = `${dinero(p.precio)} (${pct(calcularGanancia(p.costo, p.precio))})`;
          c.despues = `${dinero(precio)} (${pct(params.valor)})`;
          return c;
        }
        case 'impuestos':
          c.antes = '—';
          c.despues = impuestos
            .filter(i => params[i.id])
            .map(i => `${params[i.id] === 'AGREGAR' ? '+' : '−'} ${i.nombre}`)
            .join(', ');
          return c;
        case 'tipo':
          if (p.tipo_venta === 'K') return { ...c, omitido: 'es un kit' };
          if (p.tipo_venta === params.tipo) return { ...c, omitido: 'ya tiene ese tipo' };
          return { ...c, antes: TIPOS_VENTA[p.tipo_venta], despues: TIPOS_VENTA[params.tipo] };
        case 'departamento':
          return { ...c, antes: p.departamento || '(ninguno)', despues: deptos.find(d => d.id === params.depto)?.nombre || '(ninguno)' };
        case 'usar_inventario':
          if (p.tipo_venta === 'K') return { ...c, omitido: 'es un kit' };
          if (p.usa_inventario) return { ...c, omitido: 'ya usa inventario' };
          return { ...c, antes: 'Ilimitado', despues: `Usa inventario (hay ${cant(p.existencia)})` };
        case 'inventario':
          if (!p.usa_inventario || p.tipo_venta === 'K') return { ...c, omitido: 'no usa inventario' };
          return { ...c, antes: cant(p.existencia), despues: cant(redondear(p.existencia + params.valor, 3)) };
        case 'proveedor':
          return { ...c, antes: '', despues: proveedores.find(x => x.id === params.prov)?.nombre || '(ninguno)' };
        case 'eliminar':
          return { ...c, antes: 'Activo', despues: 'Eliminado' };
      }
      return c;
    });

  const aplicar = async () => {
    const afectados = cambios.filter(c => !c.omitido);
    if (!(await confirmar(`¿Seguro que deseas modificar <b>${afectados.length}</b> producto(s)? No se puede deshacer.`, { si: 'Sí', peligro: accion === 'eliminar' })))
      return;
    const pasos = [];
    for (const c of afectados) {
      const p = c.p;
      switch (accion) {
        case 'precios':
        case 'ganancia': {
          const n = c.nuevo;
          pasos.push({
            sql: 'UPDATE productos SET precio = ?, ganancia = ?, mayoreo = ? WHERE id = ?',
            params: [n.precio, n.ganancia, n.mayoreo ?? p.mayoreo, p.id],
          });
          pasos.push(...pasosCambiosPrecio(p, { precio: n.precio, mayoreo: n.mayoreo ?? p.mayoreo }));
          break;
        }
        case 'impuestos':
          for (const i of impuestos) {
            if (params[i.id] === 'AGREGAR')
              pasos.push({ sql: 'INSERT OR IGNORE INTO producto_impuestos (producto_id, impuesto_id) VALUES (?, ?)', params: [p.id, i.id] });
            if (params[i.id] === 'QUITAR')
              pasos.push({ sql: 'DELETE FROM producto_impuestos WHERE producto_id = ? AND impuesto_id = ?', params: [p.id, i.id] });
          }
          break;
        case 'tipo':
          pasos.push({ sql: 'UPDATE productos SET tipo_venta = ? WHERE id = ?', params: [params.tipo, p.id] });
          break;
        case 'departamento':
          pasos.push({ sql: 'UPDATE productos SET departamento_id = ? WHERE id = ?', params: [params.depto, p.id] });
          break;
        case 'usar_inventario':
          pasos.push({ sql: 'UPDATE productos SET usa_inventario = 1 WHERE id = ?', params: [p.id] });
          break;
        case 'inventario':
          break;
        case 'proveedor':
          pasos.push({ sql: 'UPDATE productos SET proveedor_id = ? WHERE id = ?', params: [params.prov, p.id] });
          break;
        case 'eliminar':
          pasos.push(pasoEliminar(p), ...(await quitarDeKitsYPromos(p.id)));
          break;
      }
    }
    if (accion === 'inventario')
      pasos.push(...(await pasosInventario(afectados.map(c => ({ producto_id: c.p.id, cantidad: params.valor })), 'AJUSTE', params.motivo)));
    try {
      if (pasos.length) await tx(pasos);
    } catch (err) {
      console.error(err);
      return alerta('No se pudo aplicar la actualización: ' + esc(err.message), 'Error');
    }
    await alerta(`Se modificaron <b>${afectados.length}</b> producto(s).`, 'Actualización terminada');
    m.cerrar(true);
  };

  pintar();
  return m.promesa;
}

