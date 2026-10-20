// Diálogos reutilizables: buscador de productos (F10), selección de cliente, calculadora.
import { q, q1, run, abrirModal, esc, dinero, cant, num, numInput, puede, exigir, iniciales, colorAvatar, formulario, toast, redondear } from './core.js';
import { buscarProductos, productoPorCodigo } from './servicios.js';

// ---------------------------------------------------------------- Buscador de productos (F10)
// Devuelve el producto elegido (fila completa) o null.
export function buscarProducto({ textoInicial = '', titulo = 'Búsqueda de productos', acciones = true } = {}) {
  const m = abrirModal({
    titulo,
    ancho: 860,
    clase: 'modal-buscador',
    html: `
      <div class="fila-busqueda">
        <input type="text" data-texto placeholder="Escribe la descripción (usa % para buscar en cualquier parte)" value="${esc(textoInicial)}" autofocus>
      </div>
      <div class="tabla-scroll alto-400">
        <table class="tabla seleccionable">
          <thead><tr><th>Descripción</th><th>Código</th><th class="num">Precio venta</th><th>Departamento</th><th class="num">Inventario</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="botones">
        ${acciones ? `<button class="btn" data-fav>★ Marcar como favorito</button>` : ''}
        <span class="espaciador"></span>
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-primario" data-ok>ENTER - Aceptar</button>
      </div>`,
    onKey: (e, m) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        mover(e.key === 'ArrowDown' ? 1 : -1);
        return true;
      }
      if (e.key === 'Enter') {
        aceptar();
        return true;
      }
    },
  });
  const input = m.cuerpo.querySelector('[data-texto]');
  const tbody = m.cuerpo.querySelector('tbody');
  let filas = [];
  let sel = 0;

  const pintar = () => {
    tbody.innerHTML = filas
      .map(
        (p, i) => `<tr data-i="${i}" class="${i === sel ? 'sel' : ''} ${p.favorito ? 'favorito' : ''}">
          <td>${esc(p.descripcion)}</td><td>${esc(p.codigo)}</td><td class="num">${dinero(p.precio)}</td>
          <td>${esc(p.departamento || '- Sin departamento -')}</td>
          <td class="num">${p.usa_inventario ? cant(p.existencia) : 'Ilim'}</td></tr>`
      )
      .join('');
    if (!filas.length) tbody.innerHTML = '<tr><td colspan="5" class="vacio">Sin resultados</td></tr>';
    tbody.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const mover = d => {
    if (!filas.length) return;
    sel = Math.max(0, Math.min(filas.length - 1, sel + d));
    pintar();
  };
  const buscar = async () => {
    filas = await buscarProductos(input.value);
    sel = 0;
    pintar();
  };
  const aceptar = () => {
    if (filas[sel]) m.cerrar(filas[sel]);
  };
  let t;
  input.oninput = () => {
    clearTimeout(t);
    t = setTimeout(buscar, 150);
  };
  tbody.onclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (tr) {
      sel = Number(tr.dataset.i);
      pintar();
    }
  };
  tbody.ondblclick = e => {
    if (e.target.closest('tr[data-i]')) aceptar();
  };
  m.cuerpo.querySelector('[data-ok]').onclick = aceptar;
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  const fav = m.cuerpo.querySelector('[data-fav]');
  if (fav)
    fav.onclick = async () => {
      const p = filas[sel];
      if (!p) return;
      await run('UPDATE productos SET favorito = ? WHERE id = ?', [p.favorito ? 0 : 1, p.id]);
      toast(p.favorito ? 'Se quitó de favoritos' : 'Marcado como favorito');
      await buscar();
      input.focus();
    };
  if (!puede('venta_buscador')) {
    m.cerrar(null);
    exigir('venta_buscador');
  } else buscar();
  return m.promesa;
}

// Campo de código con F10 para buscar. Devuelve el producto cuando se presiona ENTER.
// Úsese en formularios: conectarCampoCodigo(input, async producto => {...})
export function conectarCampoCodigo(input, alElegir) {
  input.addEventListener('keydown', async e => {
    if (e.key === 'F10') {
      e.preventDefault();
      e.stopPropagation();
      const p = await buscarProducto({ textoInicial: '' });
      if (p) {
        input.value = p.codigo;
        alElegir(await productoPorCodigo(p.codigo));
      }
      input.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const codigo = input.value.trim();
      if (!codigo) return;
      const p = await productoPorCodigo(codigo);
      if (!p) {
        toast('No existe un producto con ese código', 'error');
        input.select();
        return;
      }
      alElegir(p);
    }
  });
}

// ---------------------------------------------------------------- Seleccionar cliente
// opciones.soloCredito: lista solo clientes con crédito autorizado.
export function seleccionarCliente({ titulo = 'Asignar venta a cliente', soloCredito = false } = {}) {
  const m = abrirModal({
    titulo,
    ancho: 720,
    html: `
      <div class="fila-busqueda"><input type="text" data-texto placeholder="Buscar por folio, nombre, teléfono, correo o NIT" autofocus></div>
      <div class="tabla-scroll alto-340">
        <table class="tabla seleccionable">
          <thead><tr><th></th><th>Folio</th><th>Nombre</th><th>Teléfono</th><th class="num">Saldo</th><th class="num">Límite</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="botones">
        <button class="btn" data-nuevo>F1 - Nuevo cliente</button>
        <span class="espaciador"></span>
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-primario" data-ok>ENTER - Asignar</button>
      </div>`,
    onKey: (e, m) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        sel = Math.max(0, Math.min(filas.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
        pintar();
        return true;
      }
      if (e.key === 'Enter') {
        if (filas[sel]) m.cerrar(filas[sel]);
        return true;
      }
      if (e.key === 'F1') {
        nuevo();
        return true;
      }
    },
  });
  const input = m.cuerpo.querySelector('[data-texto]');
  const tbody = m.cuerpo.querySelector('tbody');
  let filas = [];
  let sel = 0;
  const pintar = () => {
    tbody.innerHTML =
      filas
        .map(
          (c, i) => `<tr data-i="${i}" class="${i === sel ? 'sel' : ''}">
          <td><span class="avatar chico" style="background:${colorAvatar(c.nombre)}">${esc(iniciales(c.nombre))}</span></td>
          <td>${c.id}</td><td>${esc(c.nombre)}</td><td>${esc(c.telefono || '')}</td>
          <td class="num">${c.credito ? dinero(c.saldo) : ''}</td>
          <td class="num">${c.credito ? (c.limite == null ? 'Sin límite' : dinero(c.limite)) : 'Sin crédito'}</td></tr>`
        )
        .join('') || '<tr><td colspan="6" class="vacio">Sin resultados</td></tr>';
    tbody.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const buscar = async () => {
    const t = input.value.trim();
    const like = '%' + t + '%';
    filas = await q(
      `SELECT *, TRIM(nombres || ' ' || COALESCE(apellidos, '')) AS nombre FROM clientes
       WHERE activo = 1 AND es_sistema = 0 ${soloCredito ? 'AND credito = 1' : ''}
         AND (CAST(id AS TEXT) = ? OR nombres || ' ' || COALESCE(apellidos, '') LIKE ? OR telefono LIKE ? OR email LIKE ? OR nit LIKE ?)
       ORDER BY nombres LIMIT 200`,
      [t, like, like, like, like]
    );
    sel = 0;
    pintar();
  };
  const nuevo = async () => {
    if (!exigir('clientes_editar')) return;
    const r = await formulario({
      titulo: 'Nuevo cliente',
      campos: [
        { nombre: 'nombres', etiqueta: 'Nombres', requerido: true },
        { nombre: 'apellidos', etiqueta: 'Apellidos' },
        { nombre: 'telefono', etiqueta: 'Teléfono' },
        { nombre: 'domicilio1', etiqueta: 'Dirección' },
      ],
      aceptar: 'Guardar',
    });
    if (!r) return;
    const { id } = await run('INSERT INTO clientes (nombres, apellidos, telefono, domicilio1) VALUES (?, ?, ?, ?)', [
      r.nombres,
      r.apellidos,
      r.telefono,
      r.domicilio1,
    ]);
    const c = await q1(`SELECT *, TRIM(nombres || ' ' || COALESCE(apellidos, '')) AS nombre FROM clientes WHERE id = ?`, [id]);
    if (soloCredito && !c.credito) {
      toast('Cliente creado. Autoriza su crédito en el módulo Clientes.', 'aviso');
      await buscar();
      return;
    }
    m.cerrar(c);
  };
  let t;
  input.oninput = () => {
    clearTimeout(t);
    t = setTimeout(buscar, 150);
  };
  tbody.onclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (tr) {
      sel = Number(tr.dataset.i);
      pintar();
    }
  };
  tbody.ondblclick = e => {
    if (e.target.closest('tr[data-i]') && filas[sel]) m.cerrar(filas[sel]);
  };
  m.cuerpo.querySelector('[data-ok]').onclick = () => filas[sel] && m.cerrar(filas[sel]);
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  m.cuerpo.querySelector('[data-nuevo]').onclick = nuevo;
  buscar();
  return m.promesa;
}

// ---------------------------------------------------------------- Calculadora
// Suma de varias cantidades (billetes, cajas…). Devuelve el resultado o null.
export function calculadora(titulo = 'Calculadora') {
  const m = abrirModal({
    titulo,
    ancho: 360,
    html: `
      <p class="nota">Escribe cantidades y presiona ENTER para sumarlas. Usa * para multiplicar (ej. 20*5000).</p>
      <input type="text" class="num grande" data-entrada autofocus>
      <div class="calc-lista"></div>
      <div class="calc-total">Total: <b data-total>0</b></div>
      <div class="botones">
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-primario" data-ok>= Usar resultado</button>
      </div>`,
  });
  const entrada = m.cuerpo.querySelector('[data-entrada]');
  const lista = m.cuerpo.querySelector('.calc-lista');
  let total = 0;
  const valores = [];
  entrada.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const t = entrada.value.trim();
      if (!t) return m.cerrar(redondear(total, 3));
      const v = t.split('*').map(num).reduce((a, b) => a * b, 1);
      valores.push([t, v]);
      total += v;
      lista.innerHTML = valores.map(([txt, v]) => `<div>${esc(txt)} <span>${numInput(v, 3)}</span></div>`).join('');
      lista.scrollTop = lista.scrollHeight;
      m.cuerpo.querySelector('[data-total]').textContent = numInput(total, 3);
      entrada.value = '';
    } else if (e.key === '=') {
      e.preventDefault();
      m.cerrar(redondear(total, 3));
    }
  });
  m.cuerpo.querySelector('[data-ok]').onclick = () => m.cerrar(redondear(total, 3));
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  return m.promesa;
}

// Agrega un botón de calculadora a un input numérico.
export function conCalculadora(input) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-icono';
  b.title = 'Calculadora';
  b.textContent = '🖩';
  b.onclick = async () => {
    const r = await calculadora();
    if (r != null) {
      input.value = numInput(r, 3);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.focus();
  };
  input.insertAdjacentElement('afterend', b);
  return b;
}
