// Asistente de importación de productos desde CSV (Excel → "Guardar como CSV").
import { q, q1, run, tx, cfg, puede, exigir, abrirModal, alerta, confirmar, toast, esc, num, redondear, exportarCSV, parsearCSV } from '../core.js';
import { pasosInventario, calcularGanancia } from '../servicios.js';
import { COLUMNAS_PLANTILLA, departamentoId, proveedorId, pasosCambiosPrecio } from './productos-comun.js';

const SINONIMOS = {
  codigo: ['codigo', 'código', 'codigo de barras', 'código de barras', 'barcode', 'sku', 'clave'],
  descripcion: ['descripcion', 'descripción', 'nombre', 'producto', 'articulo', 'artículo'],
  tipo_venta: ['tipo de venta', 'tipo', 'se vende'],
  unidad: ['unidad', 'unidad de medida'],
  costo: ['precio costo', 'costo', 'precio de costo', 'precio compra'],
  precio: ['precio venta', 'precio', 'precio de venta', 'pvp'],
  mayoreo: ['precio mayoreo', 'mayoreo', 'precio de mayoreo', 'precio mayorista'],
  departamento: ['departamento', 'categoria', 'categoría', 'linea', 'línea'],
  proveedor: ['proveedor'],
  existencia: ['inventario', 'existencia', 'cantidad', 'stock', 'hay'],
  minimo: ['inventario minimo', 'inventario mínimo', 'minimo', 'mínimo'],
  maximo: ['inventario maximo', 'inventario máximo', 'maximo', 'máximo'],
  impuestos: ['impuestos', 'impuesto', 'iva'],
};

const normalizar = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function tipoDesdeTexto(t) {
  const s = normalizar(t);
  if (!s) return null;
  if (s.startsWith('g') || s.includes('granel')) return 'G';
  if (s.startsWith('k') || s.includes('paquete')) return 'K';
  return 'U';
}

export async function asistenteImportar() {
  if (!exigir('productos_crear')) return;
  let filas = null; // matriz sin encabezado
  let encabezados = [];
  let mapa = {};
  let opciones = { conImpuestos: false, actualizar: false, inventario: true };

  const m = abrirModal({ titulo: 'Importar productos', ancho: 860, clase: 'modal-importar' });

  const pasoArchivo = () => {
    m.cuerpo.innerHTML = `
      <div class="pasos-asistente"><span class="activo">1. Archivo</span><span>2. Relacionar columnas</span><span>3. Importar</span></div>
      <ol class="instrucciones">
        <li>Descarga la plantilla y llénala en Excel (una fila por producto). También puedes usar tu propio archivo.</li>
        <li>Guárdala como <b>CSV</b> (Archivo → Guardar como → CSV UTF-8).</li>
        <li>Selecciona el archivo. En el siguiente paso relacionarás sus columnas.</li>
      </ol>
      <p class="nota">Tipo de venta: "Unidad" o "Granel". Impuestos: nombres separados por "|" (ej. IVA 19%). Los kits no se pueden importar.</p>
      <div class="botones">
        <button class="btn" data-plantilla>📄 Descargar plantilla</button>
        <span class="espaciador"></span>
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-primario" data-archivo>📂 Seleccionar archivo…</button>
      </div>`;
    m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
    m.cuerpo.querySelector('[data-plantilla]').onclick = () =>
      exportarCSV('plantilla-productos', COLUMNAS_PLANTILLA, [
        { codigo: '7700000000017', descripcion: 'Gaseosa 400ml', tipo_venta: 'Unidad', unidad: '', costo: 1500, precio: 2500, mayoreo: 2200, departamento: 'Bebidas', proveedor: '', existencia: 24, minimo: 6, maximo: 48, impuestos: '' },
        { codigo: 'QUESO', descripcion: 'Queso campesino', tipo_venta: 'Granel', unidad: 'Kg', costo: 12000, precio: 18000, mayoreo: 0, departamento: 'Lácteos', proveedor: '', existencia: 5.5, minimo: 1, maximo: 10, impuestos: '' },
      ]);
    m.cuerpo.querySelector('[data-archivo]').onclick = async () => {
      const texto = await window.api.abrirTexto(['csv', 'txt']);
      if (texto == null) return;
      const matriz = parsearCSV(texto);
      if (matriz.length < 2) return alerta('El archivo no tiene filas de productos (la primera fila debe ser de encabezados).');
      encabezados = matriz[0].map(h => h.trim());
      filas = matriz.slice(1);
      mapa = {};
      for (const [campo] of COLUMNAS_PLANTILLA) {
        const i = encabezados.findIndex(h => (SINONIMOS[campo] || [campo]).includes(normalizar(h)));
        mapa[campo] = i;
      }
      pasoColumnas();
    };
  };

  const pasoColumnas = () => {
    const opcionesSel = i => `<option value="-1">(no importar)</option>${encabezados.map((h, j) => `<option value="${j}" ${j === i ? 'selected' : ''}>${esc(h || `Columna ${j + 1}`)}</option>`).join('')}`;
    const muestra = filas.slice(0, 4);
    m.cuerpo.innerHTML = `
      <div class="pasos-asistente"><span class="hecho">1. Archivo</span><span class="activo">2. Relacionar columnas</span><span>3. Importar</span></div>
      <p class="nota">${filas.length} fila(s) en el archivo. Indica qué columna del archivo corresponde a cada dato.</p>
      <div class="importar-columnas">
        <div class="form-grid">
          ${COLUMNAS_PLANTILLA.map(([k, t]) => `<label>${t}${k === 'codigo' || k === 'descripcion' || k === 'precio' ? ' *' : ''}</label><select data-campo="${k}">${opcionesSel(mapa[k])}</select>`).join('')}
        </div>
        <div>
          ${cfg('usar_impuestos') ? `<label class="check"><input type="checkbox" data-op="conImpuestos" ${opciones.conImpuestos ? 'checked' : ''}> Mis precios incluyen impuestos</label>` : ''}
          <label class="check"><input type="checkbox" data-op="actualizar" ${opciones.actualizar ? 'checked' : ''}> Actualizar los productos cuyo código ya exista</label>
          <label class="check"><input type="checkbox" data-op="inventario" ${opciones.inventario ? 'checked' : ''}> Actualizar el inventario del producto</label>
          <p class="nota">Si no marcas "Actualizar…", los productos que ya existen se omiten.</p>
        </div>
      </div>
      <h4>Vista previa</h4>
      <div class="tabla-scroll alto-200"><table class="tabla"><thead><tr>${encabezados.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${muestra.map(f => `<tr>${encabezados.map((_, j) => `<td>${esc(f[j] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="botones">
        <button class="btn" data-atras>‹ Atrás</button><span class="espaciador"></span>
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-primario" data-importar>📥 Importar</button>
      </div>`;
    m.cuerpo.querySelector('[data-atras]').onclick = pasoArchivo;
    m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
    m.cuerpo.querySelectorAll('[data-campo]').forEach(s => (s.onchange = () => (mapa[s.dataset.campo] = Number(s.value))));
    m.cuerpo.querySelectorAll('[data-op]').forEach(
      c =>
        (c.onchange = async () => {
          opciones[c.dataset.op] = c.checked;
          if (c.dataset.op === 'actualizar' && c.checked) {
            if (!puede('productos_modificar')) {
              c.checked = opciones.actualizar = false;
              return exigir('productos_modificar');
            }
            const ok = await confirmar('Los productos con el mismo código se sobrescribirán con los datos del archivo.', {
              si: 'Sí, continuar actualizando mis productos',
              no: 'Cancelar',
            });
            if (!ok) c.checked = opciones.actualizar = false;
          }
        })
    );
    m.cuerpo.querySelector('[data-importar]').onclick = () => {
      if (mapa.codigo < 0) return alerta('Relaciona la columna del <b>código</b>.');
      if (mapa.descripcion < 0) return alerta('Relaciona la columna de la <b>descripción</b>.');
      if (mapa.precio < 0) return alerta('Relaciona la columna del <b>precio de venta</b>.');
      pasoImportar();
    };
  };

  const pasoImportar = async () => {
    m.cuerpo.innerHTML = `
      <div class="pasos-asistente"><span class="hecho">1. Archivo</span><span class="hecho">2. Relacionar columnas</span><span class="activo">3. Importar</span></div>
      <div class="progreso"><div class="progreso-barra" data-barra></div></div>
      <p data-estado>Importando…</p>
      <div data-errores></div>
      <div class="botones"><button class="btn btn-primario" data-cerrar disabled>Finalizar</button></div>`;
    const barra = m.cuerpo.querySelector('[data-barra]');
    const estado = m.cuerpo.querySelector('[data-estado]');
    const impuestos = await q('SELECT * FROM impuestos');
    const auto = impuestos.filter(i => i.auto_nuevos).map(i => i.id);
    const res = { creados: 0, actualizados: 0, omitidos: 0, errores: [] };
    const cacheDepto = new Map();
    const cacheProv = new Map();
    const val = (f, k) => (mapa[k] >= 0 ? String(f[mapa[k]] ?? '').trim() : '');
    const hay = (f, k) => mapa[k] >= 0 && val(f, k) !== '';

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      const linea = i + 2;
      try {
        const codigo = val(f, 'codigo');
        if (!codigo) throw new Error('sin código');
        if (/\s/.test(codigo)) throw new Error('el código tiene espacios');
        const tipo = tipoDesdeTexto(val(f, 'tipo_venta'));
        if (tipo === 'K') throw new Error('los kits no se pueden importar');
        const existente = await q1('SELECT * FROM productos WHERE codigo = ? COLLATE NOCASE AND activo = 1', [codigo]);
        if (existente && !opciones.actualizar) {
          res.omitidos++;
          continue;
        }
        // Impuestos
        let tasasIds = null;
        if (hay(f, 'impuestos')) {
          tasasIds = [];
          for (const nombre of val(f, 'impuestos').split(/[|;,]/).map(s => s.trim()).filter(Boolean)) {
            const imp = impuestos.find(x => normalizar(x.nombre) === normalizar(nombre) || normalizar(`${x.nombre} ${x.tasa}%`) === normalizar(nombre));
            if (!imp) throw new Error(`impuesto desconocido "${nombre}"`);
            tasasIds.push(imp.id);
          }
        }
        const idsTasa = tasasIds ?? (existente ? null : auto);
        let factor = 1;
        if (opciones.conImpuestos && cfg('usar_impuestos') && !cfg('precios_con_impuestos')) {
          const ids = idsTasa ?? (await q('SELECT impuesto_id FROM producto_impuestos WHERE producto_id = ?', [existente.id])).map(x => x.impuesto_id);
          factor = 1 + impuestos.filter(x => ids.includes(x.id)).reduce((a, x) => a + x.tasa, 0) / 100;
        }
        const precioDe = k => redondear(num(val(f, k)) / factor, 4);

        const d = {};
        if (hay(f, 'descripcion')) d.descripcion = val(f, 'descripcion').slice(0, 60);
        if (tipo) d.tipo_venta = tipo;
        if (hay(f, 'unidad')) d.unidad = val(f, 'unidad');
        if (hay(f, 'costo')) d.costo = precioDe('costo');
        if (hay(f, 'precio')) d.precio = precioDe('precio');
        if (hay(f, 'mayoreo')) d.mayoreo = precioDe('mayoreo');
        if (hay(f, 'minimo')) d.minimo = num(val(f, 'minimo'));
        if (hay(f, 'maximo')) d.maximo = num(val(f, 'maximo'));
        if (hay(f, 'departamento')) {
          const n = val(f, 'departamento');
          if (!cacheDepto.has(n.toLowerCase())) cacheDepto.set(n.toLowerCase(), await departamentoId(n));
          d.departamento_id = cacheDepto.get(n.toLowerCase());
        }
        if (hay(f, 'proveedor')) {
          const n = val(f, 'proveedor');
          if (!cacheProv.has(n.toLowerCase())) cacheProv.set(n.toLowerCase(), await proveedorId(n));
          d.proveedor_id = cacheProv.get(n.toLowerCase());
        }
        const existencia = hay(f, 'existencia') ? num(val(f, 'existencia')) : null;
        if (d.precio != null && d.precio < 0) throw new Error('precio negativo');

        if (!existente) {
          if (!d.descripcion) throw new Error('sin descripción');
          if (!(d.precio > 0)) throw new Error('sin precio de venta');
          const costo = d.costo ?? 0;
          const usaInv = cfg('usar_inventario') && existencia != null ? 1 : 0;
          const { id } = await run(
            `INSERT INTO productos (codigo, descripcion, tipo_venta, unidad, costo, ganancia, precio, mayoreo, departamento_id, proveedor_id,
               usa_inventario, existencia, minimo, maximo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [codigo, d.descripcion, d.tipo_venta || 'U', d.unidad || '', costo, calcularGanancia(costo, d.precio), d.precio, d.mayoreo || 0,
              d.departamento_id ?? null, d.proveedor_id ?? null, usaInv, d.minimo || 0, d.maximo || 0]
          );
          const pasos = (idsTasa || []).map(t => ({ sql: 'INSERT INTO producto_impuestos (producto_id, impuesto_id) VALUES (?, ?)', params: [id, t] }));
          if (pasos.length) await tx(pasos);
          if (usaInv && existencia && opciones.inventario)
            await tx(await pasosInventario([{ producto_id: id, cantidad: existencia, costo }], 'ENTRADA', 'Importación de productos'));
          res.creados++;
        } else {
          const campos = Object.keys(d);
          const pasos = [];
          if (d.costo != null || d.precio != null) {
            d.ganancia = calcularGanancia(d.costo ?? existente.costo, d.precio ?? existente.precio);
            campos.push('ganancia');
          }
          if (existencia != null && opciones.inventario && cfg('usar_inventario') && existente.tipo_venta !== 'K' && !existente.usa_inventario) {
            d.usa_inventario = 1;
            campos.push('usa_inventario');
          }
          if (campos.length)
            pasos.push({ sql: `UPDATE productos SET ${campos.map(c => c + ' = ?').join(', ')} WHERE id = ?`, params: [...campos.map(c => d[c]), existente.id] });
          pasos.push(...pasosCambiosPrecio(existente, d));
          if (tasasIds) {
            pasos.push({ sql: 'DELETE FROM producto_impuestos WHERE producto_id = ?', params: [existente.id] });
            for (const t of tasasIds) pasos.push({ sql: 'INSERT INTO producto_impuestos (producto_id, impuesto_id) VALUES (?, ?)', params: [existente.id, t] });
          }
          if (pasos.length) await tx(pasos);
          if (existencia != null && opciones.inventario && cfg('usar_inventario') && existente.tipo_venta !== 'K') {
            const dif = redondear(existencia - existente.existencia, 3);
            if (dif) await tx(await pasosInventario([{ producto_id: existente.id, cantidad: dif }], 'AJUSTE', 'Importación de productos'));
          }
          res.actualizados++;
        }
      } catch (err) {
        res.errores.push(`Fila ${linea}: ${err.message}`);
      }
      if (i % 10 === 0 || i === filas.length - 1) {
        const p = Math.round(((i + 1) / filas.length) * 100);
        barra.style.width = p + '%';
        estado.textContent = `Importando… ${p}% (${i + 1} de ${filas.length})`;
      }
    }
    estado.innerHTML = `<b>Importación terminada.</b> Nuevos: <b>${res.creados}</b> · Actualizados: <b>${res.actualizados}</b> · Omitidos (ya existían): <b>${res.omitidos}</b> · Con error: <b>${res.errores.length}</b>`;
    if (res.errores.length)
      m.cuerpo.querySelector('[data-errores]').innerHTML = `<div class="tabla-scroll alto-200 lista-errores">${res.errores.map(e => `<div>${esc(e)}</div>`).join('')}</div>`;
    const cerrar = m.cuerpo.querySelector('[data-cerrar]');
    cerrar.disabled = false;
    cerrar.onclick = () => m.cerrar(res);
    if (res.creados || res.actualizados) toast(`${res.creados + res.actualizados} producto(s) importado(s)`);
  };

  pasoArchivo();
  return m.promesa;
}
