// Módulo Ventas (F1): pantalla principal de venta con teclas de función.
import {
  q, q1, run, cfg, sesion, puede, exigir, abrirModal, alerta, confirmar, formulario, toast,
  esc, dinero, cant, num, numInput, redondear, ahoraISO, $, $$,
} from '../core.js';
import {
  productoPorCodigo, nuevoRenglon, renglonComun, precioRenglon, importeRenglon, totalesTicket,
  registrarVenta, efectivoEnCaja,
} from '../servicios.js';
import { buscarProducto, seleccionarCliente } from '../componentes.js';
import { imprimirVenta } from '../ticket.js';
import { dialogoCobro } from './ventas-cobro.js';
import { historialVentas } from './ventas-historial.js';
import { movimientoCaja } from './ventas-caja.js';

// ---------------------------------------------------------------- Estado (persiste al cambiar de módulo)
let tickets = null; // [{uid, nombre, cliente, renglones, sel, creado}]
let activo = 0;
let ultimaVenta = null; // {id, total, pago_con, cambio}
let ventasDesdeAlerta = 0;
let siguienteNumero = 1;
let raiz = null;

const nuevoTicket = () => ({
  uid: Date.now() + Math.random(),
  nombre: `Ticket ${siguienteNumero++}`,
  cliente: null,
  renglones: [],
  sel: -1,
  creado: ahoraISO(),
});

const ticket = () => tickets[activo];

async function cargarPendientes() {
  tickets = [];
  const filas = await q('SELECT * FROM tickets_pendientes ORDER BY id');
  for (const f of filas) {
    try {
      tickets.push({ ...JSON.parse(f.datos), creado: f.creado });
    } catch {
      /* ignora tickets corruptos */
    }
  }
  const n = tickets.map(t => Number((/^Ticket (\d+)$/.exec(t.nombre) || [])[1]) || 0);
  siguienteNumero = Math.max(0, ...n) + 1;
  if (!tickets.length) tickets.push(nuevoTicket());
  activo = 0;
}

let tGuardar;
function guardarPendientes() {
  clearTimeout(tGuardar);
  tGuardar = setTimeout(async () => {
    const pasos = [{ sql: 'DELETE FROM tickets_pendientes', params: [] }];
    for (const t of tickets) {
      if (!t.renglones.length) continue;
      pasos.push({
        sql: 'INSERT INTO tickets_pendientes (nombre, datos, usuario_id, creado) VALUES (?, ?, ?, ?)',
        params: [t.nombre, JSON.stringify(t), sesion.usuario?.id, t.creado],
      });
    }
    await window.api.tx(pasos);
  }, 400);
}

// ---------------------------------------------------------------- Montaje
export async function montar(el) {
  if (!tickets) await cargarPendientes();
  raiz = el;
  el.innerHTML = `
    <div class="modulo-barra">VENTA - <span data-titulo></span></div>
    <div class="venta-codigo">
      <label for="codigo">Código del producto:</label>
      <input id="codigo" autocomplete="off" spellcheck="false">
      <button class="btn btn-primario" data-accion="agregar"><kbd>ENTER</kbd>Agregar producto</button>
    </div>
    <div class="sub-barra venta-acciones">
      <button class="btn" data-accion="varios"><kbd>INS</kbd>Varios</button>
      ${cfg('producto_comun') ? '<button class="btn" data-accion="comun"><kbd>CTRL+P</kbd>Art. común</button>' : ''}
      <button class="btn" data-accion="buscar"><kbd>F10</kbd>Buscar</button>
      <button class="btn" data-accion="mayoreo"><kbd>F11</kbd>Mayoreo</button>
      <button class="btn" data-accion="entrada"><kbd>F7</kbd>Entradas</button>
      <button class="btn" data-accion="salida"><kbd>F8</kbd>Salidas</button>
      <button class="btn" data-accion="borrar"><kbd>DEL</kbd>Borrar art.</button>
      <button class="btn" data-accion="verificador"><kbd>F9</kbd>Verificador</button>
      <span class="espaciador"></span>
      <button class="btn" data-accion="descuento"><kbd>CTRL+D</kbd>Descuento</button>
    </div>
    <div class="tabs-tickets"></div>
    <div class="venta-grilla">
      <table class="tabla seleccionable">
        <thead><tr>
          <th style="width:160px">Código</th><th>Descripción del producto</th>
          <th class="num" style="width:130px">Precio venta</th><th class="num" style="width:90px">Cant.</th>
          <th class="num" style="width:140px">Importe</th><th class="num" style="width:100px">Existencia</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="venta-pie">
      <div class="venta-pie-izq">
        <div class="conteo" data-conteo></div>
        <div class="fila">
          <button class="btn" data-accion="cambiar"><kbd>F5</kbd>Cambiar</button>
          <button class="btn" data-accion="pendiente"><kbd>F6</kbd>Pendiente</button>
          <button class="btn" data-accion="eliminar-ticket">Eliminar</button>
          <button class="btn" data-accion="cliente" data-cliente><kbd>=</kbd>Asignar cliente</button>
        </div>
        <div class="fila">
          <button class="btn" data-accion="reimprimir">🖨 Reimprimir último ticket</button>
          <button class="btn" data-accion="historial">📄 Ventas del día y devoluciones</button>
        </div>
      </div>
      <div class="ultima-venta" data-ultima></div>
      <div class="venta-pie-der">
        <button class="btn btn-verde boton-cobrar" data-accion="cobrar"><kbd>F12</kbd>Cobrar</button>
        <div class="venta-total" data-accion="descuento-global" title="Clic para aplicar un descuento a toda la venta">
          <div class="total" data-total></div>
          <div class="subtotal" data-subtotal></div>
        </div>
      </div>
    </div>`;

  const input = $('#codigo', el);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      agregarDesdeCampo();
    }
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-accion]');
    if (b) ejecutar(b.dataset.accion);
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      activo = Number(tab.dataset.tab);
      pintar();
    }
    const tr = e.target.closest('tr[data-i]');
    if (tr) {
      ticket().sel = Number(tr.dataset.i);
      pintar();
    }
  });
  el.querySelector('tbody').addEventListener('dblclick', e => {
    if (e.target.closest('tr[data-i]')) ejecutar('descuento');
  });
  // Mantener el foco en el campo de código.
  el.addEventListener('mouseup', () => {
    if (!window.getSelection().toString()) enfocar();
  });
  document.addEventListener('modal-cerrado', enfocar);

  pintar();
  enfocar();
  return {
    onKey,
    desmontar() {
      document.removeEventListener('modal-cerrado', enfocar);
      raiz = null;
    },
  };
}

function enfocar() {
  setTimeout(() => {
    const i = raiz && $('#codigo', raiz);
    if (i && !document.querySelector('.modal-fondo')) i.focus();
  }, 0);
}

// ---------------------------------------------------------------- Teclado
function onKey(e) {
  const input = $('#codigo', raiz);
  const vacio = !input.value;
  const k = e.key;
  if (k === 'F12') return ejecutar('cobrar'), true;
  if (k === 'F10') return ejecutar('buscar'), true;
  if (k === 'F11') return ejecutar('mayoreo'), true;
  if (k === 'F9') return ejecutar('verificador'), true;
  if (k === 'F7') return ejecutar('entrada'), true;
  if (k === 'F8') return ejecutar('salida'), true;
  if (k === 'F5') return ejecutar('cambiar'), true;
  if (k === 'F6') return ejecutar('pendiente'), true;
  if (k === 'Insert') return ejecutar('varios'), true;
  if (e.ctrlKey && (k === 'p' || k === 'P')) return ejecutar('comun'), true;
  if (e.ctrlKey && (k === 'd' || k === 'D')) return ejecutar('descuento'), true;
  if (k === '=') return ejecutar('cliente'), true;
  if (k === 'Delete' && vacio) return ejecutar('borrar'), true;
  if ((k === '+' || k === '-') && vacio) {
    cambiarCantidad(k === '+' ? 1 : -1);
    return true;
  }
  if (k === 'ArrowDown' || k === 'ArrowUp') {
    const t = ticket();
    if (!t.renglones.length) return true;
    t.sel = Math.max(0, Math.min(t.renglones.length - 1, t.sel + (k === 'ArrowDown' ? 1 : -1)));
    pintar();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- Acciones
async function ejecutar(accion) {
  switch (accion) {
    case 'agregar': return agregarDesdeCampo();
    case 'varios': return varios();
    case 'comun': return articuloComun();
    case 'buscar': return buscar();
    case 'mayoreo': return mayoreo();
    case 'entrada': if (exigir('caja_entradas')) await movimientoCaja('ENTRADA'); return enfocar();
    case 'salida': if (exigir('caja_salidas')) await movimientoCaja('SALIDA'); return enfocar();
    case 'borrar': return borrarRenglon();
    case 'verificador': return verificador();
    case 'descuento': return descuentoRenglon();
    case 'descuento-global': return descuentoGlobal();
    case 'cambiar': return cambiarTicket();
    case 'pendiente': return dejarPendiente();
    case 'eliminar-ticket': return eliminarTicket();
    case 'cliente': return asignarCliente();
    case 'cobrar': return cobrar();
    case 'reimprimir':
      if (!ultimaVenta) {
        const u = await q1('SELECT id FROM ventas WHERE caja_id = ? ORDER BY id DESC LIMIT 1', [sesion.caja.id]);
        if (!u) return toast('Aún no hay ventas', 'aviso');
        await imprimirVenta(u.id, { copia: true });
      } else await imprimirVenta(ultimaVenta.id, { copia: true });
      return enfocar();
    case 'historial':
      if (exigir('venta_historial')) await historialVentas();
      return enfocar();
  }
}

// ---------------------------------------------------------------- Agregar productos
// Etiqueta de báscula: [bandera 4][código 3][peso/precio 5][verificador 1]
function decodificarEtiquetaBascula(codigo) {
  const bandera = String(cfg('bascula_bandera') || '').padEnd(4, '0');
  if (!/^\d{13}$/.test(codigo) || !bandera.trim() || !codigo.startsWith(bandera)) return null;
  const prod = codigo.slice(4, 7);
  const valor = Number(codigo.slice(7, 12));
  return cfg('bascula_tipo') === 'PRECIO'
    ? { codigo: prod, precio: valor / 100 }
    : { codigo: prod, peso: valor / 1000 };
}

async function agregarDesdeCampo() {
  const input = $('#codigo', raiz);
  let texto = input.value.trim();
  if (!texto) return;
  let cantidad = null;
  const m = /^(\d+(?:[.,]\d+)?)\*(.+)$/.exec(texto);
  if (m) {
    cantidad = num(m[1]);
    texto = m[2].trim();
  }
  let p = await productoPorCodigo(texto);
  if (!p) {
    const et = decodificarEtiquetaBascula(texto);
    if (et) {
      p = (await productoPorCodigo(et.codigo)) || (await productoPorCodigo(String(Number(et.codigo))));
      if (p) {
        const r = nuevoRenglon(p, 1);
        cantidad = et.peso ?? redondear(et.precio / precioRenglon(r), 3);
      }
    }
  }
  input.value = '';
  if (!p) {
    toast(`No existe un producto con el código "${texto}"`, 'error');
    if (puede('venta_buscador')) {
      const elegido = await buscarProducto({ textoInicial: texto });
      if (elegido) await agregarProducto(await productoPorCodigo(elegido.codigo), cantidad);
    }
    return enfocar();
  }
  await agregarProducto(p, cantidad);
  enfocar();
}

async function agregarProducto(p, cantidad = null) {
  if (!p) return;
  if (p.tipo_venta === 'G' && cantidad == null) {
    cantidad = await dialogoGranel(p);
    if (!cantidad) return;
  }
  cantidad = cantidad ?? 1;
  const t = ticket();
  let r = p.tipo_venta !== 'G' ? t.renglones.find(x => x.producto_id === p.id && x.precio_manual == null) : null;
  const nueva = (r ? r.cantidad : 0) + cantidad;
  if (cfg('usar_inventario') && p.usa_inventario && p.tipo_venta !== 'K') {
    const enOtros = t.renglones.filter(x => x !== r && x.producto_id === p.id).reduce((a, x) => a + x.cantidad, 0);
    if (nueva + enOtros > p.existencia) {
      if (!cfg('permitir_sin_existencia')) {
        await alerta(`No hay suficiente existencia de <b>${esc(p.descripcion)}</b>. Hay ${cant(p.existencia)}.`);
        return;
      }
      toast(`Atención: existencia insuficiente de ${p.descripcion} (hay ${cant(p.existencia)})`, 'aviso');
    }
  }
  if (r) {
    r.cantidad = redondear(nueva, 3);
    r.existencia = p.existencia;
  } else {
    r = nuevoRenglon(p, cantidad);
    t.renglones.push(r);
  }
  t.sel = t.renglones.indexOf(r);
  cambio();
}

function dialogoGranel(p) {
  const precio = nuevoRenglon(p).precio;
  const m = abrirModal({
    titulo: '¿Cantidad del producto?',
    ancho: 420,
    html: `
      <p class="mensaje"><b>${esc(p.descripcion)}</b><br>Precio unitario = ${dinero(precio)}${p.unidad ? ' / ' + esc(p.unidad) : ''}</p>
      <div class="form-grid">
        <label>Cantidad del producto</label><input class="num grande" data-cant value="1" autofocus>
        <label>Importe actual</label><input class="num grande" data-imp value="${numInput(precio)}">
      </div>
      <div class="botones">
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-primario" data-ok><kbd>ENTER</kbd>Aceptar</button>
      </div>`,
    onKey: (e, m) => {
      if (e.key === 'Enter') {
        aceptar();
        return true;
      }
    },
  });
  const c = m.cuerpo.querySelector('[data-cant]');
  const i = m.cuerpo.querySelector('[data-imp]');
  c.oninput = () => (i.value = numInput(num(c.value) * precio));
  i.oninput = () => (c.value = numInput(precio > 0 ? num(i.value) / precio : 0, 3));
  const aceptar = () => {
    const v = redondear(num(c.value), 3);
    if (v > 0) m.cerrar(v);
  };
  m.cuerpo.querySelector('[data-ok]').onclick = aceptar;
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  return m.promesa;
}

async function varios() {
  const r = await formulario({
    titulo: 'Agregar varios',
    campos: [
      { nombre: 'codigo', etiqueta: 'Código del producto', requerido: true },
      { nombre: 'cantidad', etiqueta: 'Cantidad', tipo: 'numero', valor: 1 },
    ],
    aceptar: 'Agregar',
  });
  if (r && r.cantidad > 0) {
    const p = await productoPorCodigo(r.codigo);
    if (!p) toast('No existe un producto con ese código', 'error');
    else await agregarProducto(p, r.cantidad);
  }
  enfocar();
}

async function articuloComun() {
  if (!cfg('producto_comun')) return toast('La venta de producto común está deshabilitada', 'aviso');
  if (!exigir('venta_comun')) return;
  const impuestos = cfg('usar_impuestos') ? await q('SELECT * FROM impuestos ORDER BY id') : [];
  const r = await formulario({
    titulo: 'Artículo común',
    nota: 'Producto no registrado. No afecta inventario.',
    campos: [
      { nombre: 'descripcion', etiqueta: 'Descripción', requerido: true, valor: 'Artículo común' },
      { nombre: 'cantidad', etiqueta: 'Cantidad', tipo: 'numero', valor: 1 },
      { nombre: 'precio', etiqueta: 'Precio unitario', tipo: 'dinero', valor: 0, requerido: true },
      ...impuestos.map(i => ({ nombre: 'imp_' + i.id, etiqueta: `${i.nombre} (${i.tasa}%)`, tipo: 'check', valor: false })),
    ],
    aceptar: 'Agregar',
  });
  if (r && r.cantidad > 0 && r.precio > 0) {
    const tasas = impuestos.filter(i => r['imp_' + i.id]).map(i => ({ id: i.id, nombre: i.nombre, tasa: i.tasa }));
    const t = ticket();
    t.renglones.push(renglonComun(r.descripcion, r.cantidad, r.precio, tasas));
    t.sel = t.renglones.length - 1;
    cambio();
  }
  enfocar();
}

async function buscar() {
  const p = await buscarProducto();
  if (p) await agregarProducto(await productoPorCodigo(p.codigo));
  enfocar();
}

function renglonSel() {
  const t = ticket();
  return t.renglones[t.sel] || null;
}

function mayoreo() {
  const r = renglonSel();
  if (!r) return;
  if (!exigir('venta_mayoreo')) return;
  if (!(r.mayoreo > 0)) return toast('Este producto no tiene precio de mayoreo', 'aviso');
  r.es_mayoreo = !r.es_mayoreo;
  cambio();
}

async function borrarRenglon() {
  const t = ticket();
  const r = renglonSel();
  if (!r) return;
  if (!exigir('venta_eliminar_art')) return;
  t.renglones.splice(t.sel, 1);
  t.sel = Math.min(t.sel, t.renglones.length - 1);
  cambio();
}

function cambiarCantidad(d) {
  const r = renglonSel();
  if (!r) return;
  const nueva = redondear(r.cantidad + d, 3);
  if (nueva <= 0) return;
  if (d < 0 && !puede('venta_eliminar_art')) return exigir('venta_eliminar_art');
  r.cantidad = nueva;
  cambio();
}

async function descuentoRenglon() {
  const r = renglonSel();
  if (!r) return;
  if (!exigir('venta_descuento')) return;
  const actual = precioRenglon(r);
  const res = await formulario({
    titulo: 'Descuento al producto',
    nota: `<b>${esc(r.descripcion)}</b><br>Precio normal: ${dinero(r.precio)} · Precio actual: ${dinero(actual)}`,
    campos: [
      {
        nombre: 'tipo',
        etiqueta: 'Tipo de descuento',
        tipo: 'select',
        valor: 'PCT',
        opciones: [
          ['PCT', 'Porcentaje (%)'],
          ['MONTO', 'Monto a descontar por unidad'],
          ['PRECIO', 'Nuevo precio unitario'],
          ['QUITAR', 'Quitar descuento (precio normal)'],
        ],
      },
      { nombre: 'valor', etiqueta: 'Valor', tipo: 'numero', valor: 0 },
    ],
    aceptar: 'Aplicar',
  });
  if (!res) return;
  if (res.tipo === 'QUITAR') r.precio_manual = null;
  else {
    let nuevo = r.precio;
    if (res.tipo === 'PCT') nuevo = r.precio * (1 - res.valor / 100);
    if (res.tipo === 'MONTO') nuevo = r.precio - res.valor;
    if (res.tipo === 'PRECIO') nuevo = res.valor;
    if (nuevo < 0) return alerta('El precio resultante no puede ser negativo.');
    r.precio_manual = redondear(nuevo, 4);
  }
  cambio();
}

async function descuentoGlobal() {
  const t = ticket();
  if (!t.renglones.length) return;
  if (!exigir('venta_descuento')) return;
  const tot = totalesTicket(t);
  const res = await formulario({
    titulo: 'Descuento a toda la venta',
    nota: `Total actual: <b>${dinero(tot.subtotal)}</b>`,
    campos: [
      {
        nombre: 'tipo',
        etiqueta: 'Tipo',
        tipo: 'select',
        valor: 'PCT',
        opciones: [
          ['PCT', 'Porcentaje de descuento (%)'],
          ['TOTAL', 'Nuevo total a cobrar'],
          ['QUITAR', 'Quitar descuentos'],
        ],
      },
      { nombre: 'valor', etiqueta: 'Valor', tipo: 'numero', valor: 0 },
    ],
    aceptar: 'Aplicar',
  });
  if (!res) return;
  if (res.tipo === 'QUITAR') t.renglones.forEach(r => (r.precio_manual = null));
  else {
    const factor = res.tipo === 'PCT' ? 1 - res.valor / 100 : tot.subtotal > 0 ? res.valor / tot.subtotal : 1;
    if (factor < 0) return alerta('El descuento no puede ser mayor al total.');
    t.renglones.forEach(r => (r.precio_manual = redondear(precioRenglon(r) * factor, 4)));
  }
  cambio();
}

// ---------------------------------------------------------------- Tickets múltiples
async function dejarPendiente() {
  const t = ticket();
  if (!t.renglones.length) return toast('El ticket está vacío', 'aviso');
  const r = await formulario({
    titulo: 'Dejar ticket pendiente',
    nota: 'Dale un nombre para identificarlo (nombre del cliente, "Mesa 5"…).',
    campos: [{ nombre: 'nombre', etiqueta: 'Nombre del ticket', valor: t.cliente?.nombre || t.nombre, requerido: true }],
    aceptar: 'Guardar como pendiente',
  });
  if (!r) return;
  t.nombre = r.nombre;
  tickets.push(nuevoTicket());
  activo = tickets.length - 1;
  cambio();
  toast('Ticket guardado como pendiente');
}

async function cambiarTicket() {
  if (tickets.length < 2) return toast('No hay otros tickets pendientes', 'aviso');
  const m = abrirModal({
    titulo: 'Tickets pendientes',
    ancho: 520,
    html: `<div class="tabla-scroll alto-340"><table class="tabla seleccionable"><thead><tr>
      <th>Nombre</th><th>Creado</th><th class="num">Artículos</th><th class="num">Total</th></tr></thead><tbody>
      ${tickets
        .map((t, i) => {
          const tot = totalesTicket(t);
          return `<tr data-i="${i}" class="${i === activo ? 'sel' : ''}"><td>${esc(t.nombre)}</td><td>${esc(t.creado.slice(5, 16))}</td>
            <td class="num">${cant(tot.articulos)}</td><td class="num">${dinero(tot.total)}</td></tr>`;
        })
        .join('')}</tbody></table></div>
      <div class="botones"><button class="btn" data-cancelar>Cancelar</button><button class="btn btn-primario" data-ok><kbd>ENTER</kbd>Abrir</button></div>`,
    onKey: (e, m) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'F5') {
        sel = (sel + (e.key === 'ArrowUp' ? -1 : 1) + tickets.length) % tickets.length;
        marcar();
        return true;
      }
      if (e.key === 'Enter') {
        m.cerrar(sel);
        return true;
      }
    },
  });
  let sel = (activo + 1) % tickets.length;
  const marcar = () => $$('tr[data-i]', m.cuerpo).forEach(tr => tr.classList.toggle('sel', Number(tr.dataset.i) === sel));
  marcar();
  m.cuerpo.onclick = e => {
    const tr = e.target.closest('tr[data-i]');
    if (tr) {
      sel = Number(tr.dataset.i);
      marcar();
    }
  };
  m.cuerpo.ondblclick = e => e.target.closest('tr[data-i]') && m.cerrar(sel);
  m.cuerpo.querySelector('[data-ok]').onclick = () => m.cerrar(sel);
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  const r = await m.promesa;
  if (r != null) {
    activo = r;
    pintar();
  }
}

async function eliminarTicket() {
  const t = ticket();
  if (t.renglones.length) {
    if (!puede('venta_eliminar_art')) return exigir('venta_eliminar_art');
    if (!(await confirmar(`¿Eliminar el ticket <b>${esc(t.nombre)}</b> con ${t.renglones.length} artículo(s)?`, { peligro: true, si: 'Eliminar' })))
      return;
  }
  cerrarTicketActual();
}

function cerrarTicketActual() {
  tickets.splice(activo, 1);
  if (!tickets.length) tickets.push(nuevoTicket());
  activo = Math.min(activo, tickets.length - 1);
  cambio();
}

async function asignarCliente() {
  const t = ticket();
  if (!exigir('clientes_asignar')) return;
  if (t.cliente) {
    const quitar = await confirmar(`La venta está asignada a <b>${esc(t.cliente.nombre)}</b>.`, {
      titulo: 'Cliente asignado',
      si: 'Des-asignar',
      no: 'Elegir otro',
    });
    if (quitar) {
      if (t.nombre === t.cliente.nombre) t.nombre = `Ticket ${siguienteNumero++}`;
      t.cliente = null;
      return cambio();
    }
  }
  const c = await seleccionarCliente();
  if (c) {
    t.cliente = { id: c.id, nombre: c.nombre, credito: c.credito, limite: c.limite, saldo: c.saldo };
    t.nombre = c.nombre;
    cambio();
  }
  enfocar();
}

// ---------------------------------------------------------------- Verificador de precios (F9)
async function verificador() {
  let producto = null;
  let verMayoreo = false;
  const m = abrirModal({
    titulo: 'Verificador de precios',
    ancho: 600,
    html: `
      <input class="grande" data-codigo placeholder="Escanea o escribe el código (F10 para buscar)" autofocus>
      <div class="verificador">
        <div class="desc" data-desc>Escanea un producto</div>
        <div class="precio" data-precio></div>
        <div class="mayoreo" data-mayoreo hidden></div>
        <div class="nota" data-nota></div>
      </div>
      <div class="botones">
        <span class="nota"><kbd>F10</kbd>Buscar · <kbd>F11</kbd>Mayoreo</span><span class="espaciador"></span>
        <button class="btn" data-cancelar><kbd>ESC</kbd>Cancelar</button>
        <button class="btn btn-primario" data-agregar><kbd>F1</kbd>Agregar a la venta</button>
      </div>`,
    onKey: (e, m) => {
      if (e.key === 'F10') {
        buscarAqui();
        return true;
      }
      if (e.key === 'F11') {
        verMayoreo = !verMayoreo;
        pintarV();
        return true;
      }
      if (e.key === 'F1') {
        if (producto) m.cerrar(producto);
        return true;
      }
    },
  });
  const input = m.cuerpo.querySelector('[data-codigo]');
  const pintarV = () => {
    if (!producto) return;
    const r = nuevoRenglon(producto);
    m.cuerpo.querySelector('[data-desc]').textContent = producto.descripcion;
    m.cuerpo.querySelector('[data-precio]').textContent = dinero(verMayoreo && r.mayoreo ? r.mayoreo : r.precio);
    const may = m.cuerpo.querySelector('[data-mayoreo]');
    may.hidden = !(r.mayoreo > 0);
    may.textContent = verMayoreo ? `Precio normal: ${dinero(r.precio)}` : `Precio de mayoreo: ${dinero(r.mayoreo)}`;
    const notas = [];
    if (cfg('usar_impuestos') && r.tasas.length) notas.push('Impuestos incluidos');
    if (r.usa_inventario) notas.push(`Existencia: ${cant(producto.existencia)}`);
    if (r.promociones.length) notas.push('Promoción: ' + r.promociones.map(p => `${cant(p.desde)}-${cant(p.hasta)} a ${dinero(p.precio)}`).join(', '));
    m.cuerpo.querySelector('[data-nota]').textContent = notas.join(' · ');
  };
  const buscarAqui = async () => {
    const p = await buscarProducto();
    if (p) {
      producto = await productoPorCodigo(p.codigo);
      pintarV();
    }
    input.focus();
  };
  input.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    e.stopPropagation();
    const p = await productoPorCodigo(input.value);
    input.select();
    if (!p) {
      producto = null;
      m.cuerpo.querySelector('[data-desc]').textContent = 'Producto no encontrado';
      m.cuerpo.querySelector('[data-precio]').textContent = '';
      m.cuerpo.querySelector('[data-mayoreo]').hidden = true;
      m.cuerpo.querySelector('[data-nota]').textContent = '';
      return;
    }
    producto = p;
    pintarV();
  });
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  m.cuerpo.querySelector('[data-agregar]').onclick = () => producto && m.cerrar(producto);
  const p = await m.promesa;
  if (p) await agregarProducto(p);
  enfocar();
}

// ---------------------------------------------------------------- Cobrar (F12)
async function cobrar() {
  const t = ticket();
  if (!t.renglones.length) return toast('No hay productos en la venta', 'aviso');
  if (!exigir('venta_cobrar')) return;
  const limite = Number(cfg('limite_efectivo'));
  if (limite > 0 && cfg('limite_comportamiento') === 'BLOQUEAR') {
    const ef = await efectivoEnCaja(sesion.turno.id);
    if (ef >= limite) {
      await alerta(esc(cfg('limite_mensaje')) + `<br><br>Efectivo en caja: <b>${dinero(ef)}</b> · Límite: <b>${dinero(limite)}</b>`, 'Límite de efectivo');
      return;
    }
  }
  const tot = totalesTicket(t);
  const cobro = await dialogoCobro({ total: tot.total, articulos: tot.articulos, cliente: t.cliente });
  if (!cobro) return enfocar();
  let folio;
  try {
    folio = await registrarVenta(t, cobro);
  } catch (err) {
    console.error(err);
    await alerta('No se pudo registrar la venta: ' + esc(err.message), 'Error');
    return;
  }
  ultimaVenta = { id: folio, total: tot.total + (cobro.comision || 0), pago_con: cobro.pago_con, cambio: cobro.cambio };
  cerrarTicketActual();
  if (cobro.imprimir) imprimirVenta(folio);
  if (cobro.cambio > 0) toast(`Su cambio: ${dinero(cobro.cambio)}`);

  // Avisos posteriores al cobro.
  if (limite > 0 && cfg('limite_comportamiento') === 'ADVERTIR') {
    const ef = await efectivoEnCaja(sesion.turno.id);
    if (ef >= limite) await alerta(esc(cfg('limite_mensaje')) + `<br><br>Efectivo en caja: <b>${dinero(ef)}</b> · Límite: <b>${dinero(limite)}</b>`, 'Límite de efectivo');
  }
  const cada = Number(cfg('alerta_cada'));
  if (cada > 0 && cfg('alerta_texto')) {
    ventasDesdeAlerta++;
    if (ventasDesdeAlerta >= cada) {
      ventasDesdeAlerta = 0;
      await alerta(esc(cfg('alerta_texto')), 'Recordatorio');
    }
  }
  enfocar();
}

// ---------------------------------------------------------------- Pintado
function cambio() {
  guardarPendientes();
  pintar();
}

function pintar() {
  if (!raiz) return;
  const t = ticket();
  $('[data-titulo]', raiz).textContent = t.nombre;
  $('.tabs-tickets', raiz).innerHTML = tickets
    .map((x, i) => `<button class="tab-ticket ${i === activo ? 'activo' : ''}" data-tab="${i}">${esc(x.nombre)}${x.renglones.length ? ` <small>(${x.renglones.length})</small>` : ''}</button>`)
    .join('');
  const tbody = $('tbody', raiz);
  tbody.innerHTML = t.renglones.length
    ? t.renglones
        .map((r, i) => {
          const precio = precioRenglon(r);
          const especial = r.es_mayoreo || r.precio_manual != null || precio !== r.precio;
          return `<tr data-i="${i}" class="${i === t.sel ? 'sel' : ''}">
            <td>${esc(r.codigo || '—')}</td>
            <td>${esc(r.descripcion)}${r.es_kit ? ' <span class="etiqueta azul">KIT</span>' : ''}${r.precio_manual != null ? ' <span class="etiqueta naranja">DESC</span>' : ''}${r.es_mayoreo && r.precio_manual == null ? ' <span class="etiqueta naranja">MAYOREO</span>' : ''}</td>
            <td class="num ${especial ? 'precio-especial' : ''}">${dinero(precio)}</td>
            <td class="num">${cant(r.cantidad)}${r.tipo_venta === 'G' && r.unidad ? ' ' + esc(r.unidad) : ''}</td>
            <td class="num importe">${dinero(importeRenglon(r))}</td>
            <td class="num">${r.usa_inventario ? cant(r.existencia) : 'Ilim'}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="6" class="vacio">Escanea o escribe el código de un producto y presiona ENTER</td></tr>';
  tbody.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });

  const tot = totalesTicket(t);
  $('[data-conteo]', raiz).textContent = `${cant(tot.articulos)} productos en la venta actual`;
  $('[data-total]', raiz).textContent = dinero(tot.total);
  const sub = [];
  if (tot.descuento > 0) sub.push(`Ahorro: ${dinero(tot.descuento)}`);
  if (cfg('desglosar_impuestos') && tot.impuestos > 0) sub.push(`Subtotal: ${dinero(tot.base)}`, `Impuestos: ${dinero(tot.impuestos)}`);
  if (tot.redondeo) sub.push(`Redondeo: ${dinero(tot.redondeo)}`);
  $('[data-subtotal]', raiz).textContent = sub.join(' · ');
  const bc = $('[data-cliente]', raiz);
  bc.innerHTML = t.cliente ? `<kbd>=</kbd>👤 ${esc(t.cliente.nombre)}` : '<kbd>=</kbd>Asignar cliente';
  bc.classList.toggle('activo', !!t.cliente);
  $('[data-ultima]', raiz).innerHTML = ultimaVenta
    ? `<div class="etq">Última venta</div>
       <div><span>Total:</span><b>${dinero(ultimaVenta.total)}</b></div>
       <div><span>Pagó con:</span><b>${dinero(ultimaVenta.pago_con)}</b></div>
       <div><span>Cambio:</span><b class="cambio">${dinero(ultimaVenta.cambio)}</b></div>`
    : '';
}
