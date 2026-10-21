// Módulo Configuración: opciones del programa, cajeros y permisos, ticket, pagos, impuestos,
// dispositivos y respaldos. Los cambios se guardan al momento.
import {
  q, q1, run, tx, cfg, setCfg, sesion, exigir, abrirModal, alerta, confirmar, formulario, toast,
  esc, dinero, num, numInput, ahoraISO, PERMISOS, PERMISOS_CAJERO_DEFAULT, $, $$,
} from '../core.js';
import { documentoTicket, lineasVenta, imprimirLineas, imprimirVenta, dos, centrar, separador } from '../ticket.js';
import { refrescarNavegacion, refrescarEncabezado } from '../app.js';

// ---------------------------------------------------------------- Secciones
const SECCIONES = [
  { id: 'opciones', grupo: 'General', titulo: 'Opciones habilitadas', icono: '✅', render: secOpciones },
  { id: 'cajeros', grupo: 'General', titulo: 'Cajeros', icono: '👤', render: secCajeros },
  { id: 'negocio', grupo: 'General', titulo: 'Datos del negocio y folios', icono: '🏪', render: secNegocio },
  { id: 'basedatos', grupo: 'General', titulo: 'Base de datos y respaldos', icono: '💾', render: secBaseDatos },
  { id: 'logo', grupo: 'Personalización', titulo: 'Logotipo del programa', icono: '🖼️', render: secLogo },
  { id: 'ticket', grupo: 'Personalización', titulo: 'Ticket', icono: '🧾', render: secTicket },
  { id: 'pagos', grupo: 'Personalización', titulo: 'Formas de pago', icono: '💳', render: secPagos },
  { id: 'impuestos', grupo: 'Personalización', titulo: 'Impuestos', icono: '🏛️', render: secImpuestos },
  { id: 'corte', grupo: 'Personalización', titulo: 'Corte', icono: '💰', render: secCorte },
  { id: 'moneda', grupo: 'Personalización', titulo: 'Símbolo de moneda', icono: '💲', render: secMoneda },
  { id: 'unidades', grupo: 'Personalización', titulo: 'Unidades de medida', icono: '⚖️', render: secUnidades },
  { id: 'impresora', grupo: 'Dispositivos', titulo: 'Impresora de tickets', icono: '🖨️', render: secImpresora },
  { id: 'lector', grupo: 'Dispositivos', titulo: 'Lector de códigos', icono: '📷', render: secLector },
  { id: 'cajon', grupo: 'Dispositivos', titulo: 'Cajón de dinero', icono: '🗄️', render: secCajon },
  { id: 'bascula', grupo: 'Dispositivos', titulo: 'Báscula', icono: '⚖', render: secBascula },
];

let raiz = null;

export async function montar(el, seccion = null) {
  if (!exigir('configuracion')) return {};
  raiz = el;
  el.innerHTML = `
    <div class="modulo-barra">Configuración <span class="cfg-subtitulo" data-subtitulo></span></div>
    <div class="sub-barra">
      <button class="btn" data-indice>☰ Mostrar todas las opciones</button>
    </div>
    <div class="modulo-cuerpo" data-cuerpo></div>`;
  $('[data-indice]', el).onclick = indice;
  if (seccion) abrirSeccion(seccion);
  else indice();
  return {
    onKey: () => false,
    desmontar() {
      raiz = null;
    },
  };
}

function cuerpo() {
  return $('[data-cuerpo]', raiz);
}

function indice() {
  $('[data-subtitulo]', raiz).textContent = '';
  const grupos = [...new Set(SECCIONES.map(s => s.grupo))];
  cuerpo().innerHTML = grupos
    .map(
      g => `<div class="cfg-grupo"><h3>${esc(g)}</h3><div class="cfg-tiles">
      ${SECCIONES.filter(s => s.grupo === g)
        .map(s => `<button class="cfg-tile" data-sec="${s.id}"><span class="cfg-icono">${s.icono}</span><span>${esc(s.titulo)}</span></button>`)
        .join('')}</div></div>`
    )
    .join('');
  cuerpo().onclick = e => {
    const b = e.target.closest('[data-sec]');
    if (b) abrirSeccion(b.dataset.sec);
  };
}

async function abrirSeccion(id) {
  const s = SECCIONES.find(x => x.id === id);
  if (!s) return indice();
  $('[data-subtitulo]', raiz).textContent = '› ' + s.titulo;
  const c = cuerpo();
  c.onclick = null;
  c.innerHTML = '';
  await s.render(c);
}

// ---------------------------------------------------------------- Formulario ligado a la configuración
// items: [{clave, etiqueta, tipo: 'check'|'select'|'numero'|'dinero'|'texto'|'lineas'|'titulo'|'nota', opciones, nota, alCambiar}]
function formCfg(cont, items) {
  const panel = document.createElement('div');
  panel.className = 'panel cfg-panel';
  panel.innerHTML = `<div class="form-grid">${items
    .map((it, i) => {
      if (it.tipo === 'titulo') return `<h3 class="cfg-span">${esc(it.etiqueta)}</h3>`;
      if (it.tipo === 'nota') return `<p class="nota cfg-span">${it.etiqueta}</p>`;
      const v = cfg(it.clave);
      const nota = it.nota ? `<div class="nota">${it.nota}</div>` : '';
      if (it.tipo === 'check')
        return `<span></span><div><label class="check"><input type="checkbox" data-i="${i}" ${v ? 'checked' : ''}> ${esc(it.etiqueta)}</label>${nota}</div>`;
      let input;
      if (it.tipo === 'select')
        input = `<select data-i="${i}">${it.opciones
          .map(([val, t]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`)
          .join('')}</select>`;
      else if (it.tipo === 'lineas') input = `<textarea data-i="${i}" rows="${it.filas || 4}">${esc((v || []).join('\n'))}</textarea>`;
      else if (it.tipo === 'numero' || it.tipo === 'dinero')
        input = `<input class="num corto" data-i="${i}" value="${esc(numInput(v, 4))}">`;
      else input = `<input data-i="${i}" value="${esc(v ?? '')}" ${it.maximo ? `maxlength="${it.maximo}"` : ''}>`;
      return `<label>${esc(it.etiqueta)}</label><div>${input}${nota}</div>`;
    })
    .join('')}</div>`;
  cont.appendChild(panel);
  panel.querySelectorAll('[data-i]').forEach(el => {
    const it = items[Number(el.dataset.i)];
    const evento = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'change';
    el.addEventListener(evento, async () => {
      let valor;
      if (it.tipo === 'check') valor = el.checked;
      else if (it.tipo === 'numero' || it.tipo === 'dinero') valor = num(el.value);
      else if (it.tipo === 'lineas') valor = el.value.split('\n').map(s => s.trimEnd());
      else if (it.tipo === 'select') valor = it.numerico ? Number(el.value) : el.value;
      else valor = el.value.trim();
      if (it.validar) {
        const err = it.validar(valor);
        if (err) {
          await alerta(esc(err));
          el.value = it.tipo === 'lineas' ? (cfg(it.clave) || []).join('\n') : cfg(it.clave);
          return;
        }
      }
      await setCfg(it.clave, valor);
      guardado();
      if (it.alCambiar) await it.alCambiar(valor);
    });
  });
  return panel;
}

let tGuardado;
function guardado() {
  clearTimeout(tGuardado);
  tGuardado = setTimeout(() => toast('Cambios guardados'), 150);
}

// ---------------------------------------------------------------- Opciones habilitadas
function secOpciones(c) {
  formCfg(c, [
    { tipo: 'titulo', etiqueta: 'Inventario' },
    { clave: 'usar_inventario', etiqueta: 'Utilizar inventarios para mis productos', tipo: 'check', alCambiar: refrescarNavegacion },
    {
      clave: 'metodo_costo',
      etiqueta: 'Método de costo de inventario',
      tipo: 'select',
      opciones: [
        ['PROMEDIO', 'Costo promedio ponderado'],
        ['ULTIMO', 'Último costo'],
      ],
    },
    { clave: 'permitir_sin_existencia', etiqueta: 'Permitir vender productos sin existencia suficiente (solo avisar)', tipo: 'check' },
    { tipo: 'titulo', etiqueta: 'Ventas' },
    { clave: 'ofrecer_credito', etiqueta: 'Deseo ofrecer crédito a mis clientes', tipo: 'check', alCambiar: refrescarNavegacion },
    { clave: 'producto_comun', etiqueta: 'Habilitar venta de producto común (no registrado)', tipo: 'check' },
    {
      clave: 'margen_auto',
      etiqueta: 'Margen de ganancia automático (%)',
      tipo: 'numero',
      nota: 'Calcula automáticamente el precio de venta con este margen al crear, modificar o ingresar inventario. 0 = desactivado.',
    },
    {
      clave: 'redondeo',
      etiqueta: 'Redondeo del total a cobrar',
      tipo: 'select',
      opciones: [
        ['NINGUNO', 'Sin redondeo'],
        ['DECIMAS', 'A décimas (45,52 → 45,60)'],
        ['MEDIOS', 'A mitad o entero más cercano (48,78 → 49,00)'],
        ['ENTEROS_50', 'Al múltiplo de 50 más cercano (1.270 → 1.250)'],
        ['ENTEROS_100', 'Al múltiplo de 100 más cercano (1.270 → 1.300)'],
      ],
    },
    { tipo: 'titulo', etiqueta: 'Alerta de contingencia' },
    { clave: 'alerta_texto', etiqueta: 'Mostrar aviso', tipo: 'texto', nota: 'Ejemplo: "Recuerda lavarte las manos".' },
    { clave: 'alerta_cada', etiqueta: 'Cada cuántas ventas cobradas', tipo: 'numero', nota: '0 = desactivado.' },
  ]);
}

// ---------------------------------------------------------------- Cajeros
async function secCajeros(c) {
  c.innerHTML = `
    <div class="maestro-detalle cfg-cajeros">
      <div class="panel">
        <div class="fila"><h3 style="margin:0">Cajeros</h3><span class="espaciador"></span><button class="btn btn-primario" data-nuevo>+ Nuevo cajero</button></div>
        <div class="tabla-scroll" style="margin-top:10px"><table class="tabla seleccionable"><thead><tr><th>Usuario</th><th>Nombre</th><th></th></tr></thead><tbody data-lista></tbody></table></div>
      </div>
      <div class="panel" data-detalle><p class="vacio">Selecciona un cajero o crea uno nuevo.</p></div>
    </div>`;
  let usuarios = [];
  let selId = null;

  async function cargar() {
    usuarios = await q('SELECT * FROM usuarios ORDER BY es_admin DESC, activo DESC, nombre');
    $('[data-lista]', c).innerHTML = usuarios
      .map(
        u => `<tr data-id="${u.id}" class="${u.id === selId ? 'sel' : ''} ${u.activo ? '' : 'cancelada'}">
          <td>${esc(u.usuario)}</td><td>${esc(u.nombre)}</td>
          <td>${u.es_admin ? '<span class="etiqueta azul">ADMIN</span>' : u.activo ? '' : '<span class="etiqueta">BAJA</span>'}</td></tr>`
      )
      .join('');
  }

  function detalle(u) {
    const det = $('[data-detalle]', c);
    const nuevo = !u;
    const permisos = new Set(u ? JSON.parse(u.permisos || '[]') : PERMISOS_CAJERO_DEFAULT);
    const grupos = Object.keys(PERMISOS);
    det.innerHTML = `
      <h3>${nuevo ? 'Nuevo cajero' : esc(u.nombre)}</h3>
      <form class="form-grid" data-form autocomplete="off">
        <label>Usuario</label><input name="usuario" value="${esc(u?.usuario || '')}" ${u?.es_admin ? 'disabled' : ''}>
        <label>Contraseña</label><input name="clave" type="password" placeholder="${nuevo ? '' : 'Deja vacío para conservar la actual'}">
        <label>Nombre completo</label><input name="nombre" value="${esc(u?.nombre || '')}">
      </form>
      ${
        u?.es_admin
          ? '<p class="nota">El administrador tiene todos los permisos y no puede darse de baja.</p>'
          : `<h3 style="margin-top:16px">Permisos</h3>
      <div class="cfg-pestanas">${grupos.map((g, i) => `<button class="cfg-pestana ${i === 0 ? 'activo' : ''}" data-pest="${i}">${esc(g)}</button>`).join('')}</div>
      ${grupos
        .map(
          (g, i) => `<div class="cfg-permisos" data-grupo="${i}" ${i ? 'hidden' : ''}>
          ${Object.entries(PERMISOS[g])
            .map(([k, t]) => `<label class="check"><input type="checkbox" data-permiso="${k}" ${permisos.has(k) ? 'checked' : ''}> ${esc(t)}</label>`)
            .join('')}
          <div class="fila" style="margin-top:8px"><button class="btn" data-todos="${i}">Marcar todos</button><button class="btn" data-ninguno="${i}">Ninguno</button></div>
        </div>`
        )
        .join('')}`
      }
      <div class="botones">
        ${!nuevo && !u.es_admin ? (u.activo ? '<button class="btn btn-peligro" data-baja>Dar de baja cajero</button>' : '<button class="btn" data-alta>Reactivar cajero</button>') : ''}
        <span class="espaciador"></span>
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-primario" data-guardar>Guardar cajero y permisos</button>
      </div>`;
    det.querySelectorAll('[data-pest]').forEach(
      b =>
        (b.onclick = () => {
          det.querySelectorAll('[data-pest]').forEach(x => x.classList.toggle('activo', x === b));
          det.querySelectorAll('[data-grupo]').forEach(x => (x.hidden = x.dataset.grupo !== b.dataset.pest));
        })
    );
    det.querySelectorAll('[data-todos]').forEach(
      b => (b.onclick = () => det.querySelectorAll(`[data-grupo="${b.dataset.todos}"] [data-permiso]`).forEach(x => (x.checked = true)))
    );
    det.querySelectorAll('[data-ninguno]').forEach(
      b => (b.onclick = () => det.querySelectorAll(`[data-grupo="${b.dataset.ninguno}"] [data-permiso]`).forEach(x => (x.checked = false)))
    );
    det.querySelector('[data-cancelar]').onclick = () => {
      selId = null;
      cargar();
      det.innerHTML = '<p class="vacio">Selecciona un cajero o crea uno nuevo.</p>';
    };
    const baja = det.querySelector('[data-baja]');
    if (baja)
      baja.onclick = async () => {
        if (u.id === sesion.usuario.id) return alerta('No puedes darte de baja a ti mismo.');
        if (!(await confirmar(`¿Dar de baja a <b>${esc(u.nombre)}</b>? Ya no podrá entrar al sistema.`, { peligro: true, si: 'Dar de baja' }))) return;
        await run('UPDATE usuarios SET activo = 0 WHERE id = ?', [u.id]);
        toast('Cajero dado de baja');
        await cargar();
        detalle(usuarios.find(x => x.id === u.id));
      };
    const alta = det.querySelector('[data-alta]');
    if (alta)
      alta.onclick = async () => {
        await run('UPDATE usuarios SET activo = 1 WHERE id = ?', [u.id]);
        toast('Cajero reactivado');
        await cargar();
        detalle(usuarios.find(x => x.id === u.id));
      };
    det.querySelector('[data-guardar]').onclick = async () => {
      const f = det.querySelector('[data-form]');
      const usuario = f.usuario.value.trim();
      const nombre = f.nombre.value.trim();
      const clave = f.clave.value;
      if (!usuario || !nombre) return alerta('Captura el usuario y el nombre completo.');
      if (nuevo && !clave) return alerta('Captura una contraseña para el cajero.');
      const repetido = await q1('SELECT id FROM usuarios WHERE usuario = ? COLLATE NOCASE AND id <> ?', [usuario, u?.id || 0]);
      if (repetido) return alerta('Ya existe un cajero con ese nombre de usuario.');
      const lista = u?.es_admin ? [] : $$('[data-permiso]', det).filter(x => x.checked).map(x => x.dataset.permiso);
      const hash = clave ? await window.api.hashClave(clave) : null;
      if (nuevo) {
        const r = await run('INSERT INTO usuarios (usuario, clave, nombre, permisos) VALUES (?, ?, ?, ?)', [usuario, hash, nombre, JSON.stringify(lista)]);
        selId = r.id;
      } else {
        await run('UPDATE usuarios SET usuario = ?, nombre = ?, permisos = ? WHERE id = ?', [
          u.es_admin ? u.usuario : usuario,
          nombre,
          JSON.stringify(lista),
          u.id,
        ]);
        if (hash) await run('UPDATE usuarios SET clave = ? WHERE id = ?', [hash, u.id]);
        if (u.id === sesion.usuario.id) {
          sesion.usuario.nombre = nombre;
          sesion.usuario.permisosSet = new Set(lista);
          refrescarEncabezado();
        }
      }
      toast('Cajero guardado');
      await cargar();
      detalle(usuarios.find(x => x.id === selId));
    };
    setTimeout(() => det.querySelector(u?.es_admin ? '[name=clave]' : '[name=usuario]')?.focus(), 0);
  }

  $('[data-lista]', c).onclick = e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    selId = Number(tr.dataset.id);
    cargar();
    detalle(usuarios.find(u => u.id === selId));
  };
  $('[data-nuevo]', c).onclick = () => {
    selId = null;
    cargar();
    detalle(null);
  };
  await cargar();
}

// ---------------------------------------------------------------- Negocio y folios
async function secNegocio(c) {
  formCfg(c, [
    { tipo: 'titulo', etiqueta: 'Datos del negocio' },
    {
      clave: 'negocio_nombre',
      etiqueta: 'Nombre del negocio',
      tipo: 'texto',
      validar: v => (!v ? 'El nombre no puede quedar vacío.' : null),
      alCambiar: v => {
        document.title = v + ' · Punto de Venta';
        refrescarEncabezado();
      },
    },
    { clave: 'negocio_giro', etiqueta: 'Giro', tipo: 'texto' },
    { tipo: 'nota', etiqueta: 'La dirección, teléfono y NIT que salen en el ticket se editan en <b>Ticket</b>.' },
    { tipo: 'titulo', etiqueta: 'Folios' },
    {
      clave: 'folio_leyenda',
      etiqueta: 'Nombre del folio',
      tipo: 'texto',
      nota: 'Leyenda que se imprime en el ticket junto al número (ej. "Ticket", "Nota de venta", "Remisión").',
      validar: v => (!v ? 'Captura un nombre para el folio.' : null),
    },
  ]);
  const caja = await q1('SELECT * FROM cajas WHERE id = ?', [sesion.caja.id]);
  const panel = document.createElement('div');
  panel.className = 'panel cfg-panel';
  panel.innerHTML = `<h3>Caja</h3><div class="form-grid"><label>Nombre de esta caja</label><div><input data-caja value="${esc(caja?.nombre || '')}">
    <div class="nota">Aparece en la barra de estado, cortes e historial.</div></div></div>`;
  c.appendChild(panel);
  panel.querySelector('[data-caja]').onchange = async e => {
    const v = e.target.value.trim();
    if (!v) return;
    await run('UPDATE cajas SET nombre = ? WHERE id = ?', [v, sesion.caja.id]);
    sesion.caja.nombre = v;
    refrescarEncabezado();
    guardado();
  };
}

// ---------------------------------------------------------------- Imágenes
function leerImagen(archivo, maxAncho = 600) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = reject;
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, maxAncho / img.width);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * escala);
        cv.height = Math.round(img.height * escala);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('No es una imagen válida'));
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

function selectorImagen(cont, { clave, titulo, nota, maxAncho, alCambiar }) {
  const panel = document.createElement('div');
  panel.className = 'panel cfg-panel';
  const pintar = () => {
    const v = cfg(clave);
    panel.innerHTML = `<h3>${esc(titulo)}</h3><p class="nota">${nota}</p>
      <div class="cfg-imagen">${v ? `<img src="${v}" alt="">` : '<span class="nota">Sin imagen</span>'}</div>
      <div class="fila" style="margin-top:10px">
        <label class="btn">Elegir imagen…<input type="file" accept="image/png,image/jpeg,image/bmp,image/gif" hidden data-archivo></label>
        ${v ? '<button class="btn btn-peligro" data-quitar>Quitar imagen</button>' : ''}
      </div>`;
    panel.querySelector('[data-archivo]').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        await setCfg(clave, await leerImagen(f, maxAncho));
        guardado();
        pintar();
        if (alCambiar) alCambiar();
      } catch (err) {
        alerta(esc(err.message));
      }
    };
    const quitar = panel.querySelector('[data-quitar]');
    if (quitar)
      quitar.onclick = async () => {
        await setCfg(clave, '');
        guardado();
        pintar();
        if (alCambiar) alCambiar();
      };
  };
  pintar();
  cont.appendChild(panel);
}

function secLogo(c) {
  selectorImagen(c, {
    clave: 'logo_programa',
    titulo: 'Logotipo del programa',
    nota: 'Se muestra en el encabezado de la aplicación. Tamaño recomendado: 300 × 63 px (JPG, PNG o BMP).',
    maxAncho: 600,
    alCambiar: refrescarEncabezado,
  });
}

// ---------------------------------------------------------------- Ticket
const CAMPOS_CLIENTE = {
  nombre: 'Nombre completo',
  telefono: 'Teléfono',
  domicilio1: 'Domicilio 1',
  domicilio2: 'Domicilio 2',
  colonia: 'Barrio / Colonia',
  municipio: 'Municipio',
  estado: 'Departamento / Estado',
  nit: 'NIT / Identificación',
};

async function secTicket(c) {
  c.innerHTML = `<div class="cfg-ticket"><div data-opciones></div>
    <div class="panel cfg-vista"><h3>Vista previa</h3><iframe data-vista title="Vista previa del ticket"></iframe>
      <div class="botones"><button class="btn" data-probar>🖨 Probar impresión con último ticket…</button></div></div></div>`;
  const ops = $('[data-opciones]', c);
  const ultima = await q1('SELECT id FROM ventas ORDER BY id DESC LIMIT 1');

  async function vista() {
    let lineas = ultima ? await lineasVenta(ultima.id) : null;
    if (!lineas) {
      lineas = [];
      for (let i = 0; i < Number(cfg('ticket_lineas_arriba')); i++) lineas.push('');
      if (cfg('ticket_logo')) lineas.push({ img: cfg('ticket_logo') });
      for (const e of cfg('ticket_encabezado') || []) if (e) lineas.push({ t: e, c: true });
      lineas.push('', dos(`${cfg('folio_leyenda')} 1`, '20/oct/2026 10:30'), separador());
      lineas.push(dos('2 Producto de ejemplo', dinero(5000)), dos('1 Otro producto', dinero(3200)), separador());
      lineas.push({ t: dos('TOTAL:', dinero(8200)), b: true, g: true }, dos('Efectivo:', dinero(8200)), '');
      for (const e of cfg('ticket_pie') || []) if (e) lineas.push({ t: e, c: true });
      for (let i = 0; i < Number(cfg('ticket_lineas_abajo')); i++) lineas.push('');
    }
    const fr = $('[data-vista]', c);
    if (fr) fr.srcdoc = documentoTicket(lineas);
  }

  formCfg(ops, [
    { tipo: 'titulo', etiqueta: 'Contenido' },
    { clave: 'ticket_lineas_arriba', etiqueta: 'Líneas en blanco arriba', tipo: 'numero', alCambiar: vista },
    { clave: 'ticket_encabezado', etiqueta: 'Encabezado (una línea por renglón)', tipo: 'lineas', filas: 5, alCambiar: vista },
    { clave: 'ticket_pie', etiqueta: 'Pie del ticket (una línea por renglón)', tipo: 'lineas', filas: 3, alCambiar: vista },
    { clave: 'ticket_lineas_abajo', etiqueta: 'Líneas en blanco abajo', tipo: 'numero', alCambiar: vista },
    { clave: 'ticket_precio_unitario', etiqueta: 'Incluir precio unitario', tipo: 'check', alCambiar: vista },
    { clave: 'ticket_descripcion_completa', etiqueta: 'Imprimir descripción completa (varios renglones)', tipo: 'check', alCambiar: vista },
  ]);
  selectorImagen(ops, {
    clave: 'ticket_logo',
    titulo: 'Logotipo del ticket',
    nota: 'Se imprime en blanco y negro. Tamaño ideal: 120 × 30 px.',
    maxAncho: 300,
    alCambiar: vista,
  });

  // Datos del cliente
  const panel = document.createElement('div');
  panel.className = 'panel cfg-panel';
  ops.appendChild(panel);
  const pintarCliente = () => {
    const elegidos = (cfg('ticket_campos_cliente') || []).filter(k => CAMPOS_CLIENTE[k]);
    const disponibles = Object.keys(CAMPOS_CLIENTE).filter(k => !elegidos.includes(k));
    panel.innerHTML = `<h3>Impresión de datos del cliente</h3>
      <label class="check"><input type="checkbox" data-imprimir-cliente ${cfg('ticket_datos_cliente') ? 'checked' : ''}> Imprimir en todos los tickets los datos del cliente</label>
      <div class="cfg-listas">
        <div><div class="nota">Campos disponibles</div><select size="8" data-disp>${disponibles.map(k => `<option value="${k}">${esc(CAMPOS_CLIENTE[k])}</option>`).join('')}</select></div>
        <div class="cfg-flechas">
          <button class="btn" data-agregar title="Agregar">→</button>
          <button class="btn" data-quitar title="Quitar">←</button>
          <button class="btn" data-subir title="Subir">↑</button>
          <button class="btn" data-bajar title="Bajar">↓</button>
        </div>
        <div><div class="nota">Campos a imprimir</div><select size="8" data-elegidos>${elegidos.map(k => `<option value="${k}">${esc(CAMPOS_CLIENTE[k])}</option>`).join('')}</select></div>
      </div>`;
    const guardar = async lista => {
      await setCfg('ticket_campos_cliente', lista);
      guardado();
      pintarCliente();
      vista();
    };
    panel.querySelector('[data-imprimir-cliente]').onchange = async e => {
      await setCfg('ticket_datos_cliente', e.target.checked);
      guardado();
      vista();
    };
    const disp = panel.querySelector('[data-disp]');
    const eleg = panel.querySelector('[data-elegidos]');
    panel.querySelector('[data-agregar]').onclick = () => disp.value && guardar([...elegidos, disp.value]);
    panel.querySelector('[data-quitar]').onclick = () => eleg.value && guardar(elegidos.filter(k => k !== eleg.value));
    const mover = d => {
      const i = elegidos.indexOf(eleg.value);
      const j = i + d;
      if (i < 0 || j < 0 || j >= elegidos.length) return;
      const l = [...elegidos];
      [l[i], l[j]] = [l[j], l[i]];
      guardar(l).then(() => (panel.querySelector('[data-elegidos]').value = l[j]));
    };
    panel.querySelector('[data-subir]').onclick = () => mover(-1);
    panel.querySelector('[data-bajar]').onclick = () => mover(1);
  };
  pintarCliente();

  $('[data-probar]', c).onclick = async () => {
    if (!ultima) return alerta('Aún no hay ventas registradas para imprimir.');
    await imprimirVenta(ultima.id, { copia: true });
  };
  vista();
}

// ---------------------------------------------------------------- Formas de pago
function secPagos(c) {
  formCfg(c, [
    { tipo: 'titulo', etiqueta: 'Efectivo' },
    { clave: 'pago_efectivo_estricto', etiqueta: 'No permitir cobrar si el efectivo recibido es menor que el total', tipo: 'check' },
    { tipo: 'titulo', etiqueta: 'Dólares' },
    { clave: 'pago_dolares', etiqueta: 'Aceptar pagos en dólares', tipo: 'check', nota: 'Se pedirá el tipo de cambio cada vez que inicie el programa.' },
    { clave: 'tipo_cambio', etiqueta: 'Tipo de cambio (1 US$ =)', tipo: 'dinero', validar: v => (v <= 0 ? 'El tipo de cambio debe ser mayor a 0.' : null) },
    { tipo: 'titulo', etiqueta: 'Tarjeta' },
    { clave: 'pago_tarjeta', etiqueta: 'Aceptar tarjeta de crédito / débito', tipo: 'check' },
    {
      clave: 'comision_tarjeta',
      etiqueta: 'Comisión por cobro con tarjeta (%)',
      tipo: 'numero',
      nota: 'Se suma al total cuando el cliente paga con tarjeta. Verifica que cobrar comisión esté permitido en tu país.',
      validar: v => (v < 0 || v > 30 ? 'La comisión debe estar entre 0 y 30%.' : null),
    },
    { tipo: 'titulo', etiqueta: 'Transferencia' },
    { clave: 'pago_transferencia', etiqueta: 'Aceptar transferencias', tipo: 'check' },
    { clave: 'nombre_transferencia', etiqueta: 'Nombre visible', tipo: 'texto', nota: 'Ej. "Nequi", "Daviplata", "Transferencia".' },
    { tipo: 'titulo', etiqueta: 'Otras' },
    { clave: 'pago_cheque', etiqueta: 'Aceptar cheques', tipo: 'check' },
    { clave: 'pago_vales', etiqueta: 'Aceptar vales', tipo: 'check' },
    { clave: 'pago_mixto', etiqueta: 'Permitir pagos mixtos (varias formas en una venta)', tipo: 'check' },
  ]);
}

// ---------------------------------------------------------------- Impuestos
async function secImpuestos(c) {
  formCfg(c, [
    { clave: 'usar_impuestos', etiqueta: 'Mis productos manejan impuestos', tipo: 'check' },
    {
      clave: 'precios_con_impuestos',
      etiqueta: 'Deseo ingresar mis precios de venta con impuestos incluidos',
      tipo: 'check',
      nota: 'Si está activo, el precio que capturas es el precio final y el sistema calcula la base.',
    },
    { clave: 'desglosar_impuestos', etiqueta: 'Desglosar impuestos en el ticket y en la pantalla de ventas', tipo: 'check' },
  ]);
  const panel = document.createElement('div');
  panel.className = 'panel cfg-panel';
  c.appendChild(panel);

  async function pintar() {
    const lista = await q(
      `SELECT i.*, (SELECT COUNT(*) FROM producto_impuestos pi WHERE pi.impuesto_id = i.id) AS productos FROM impuestos i ORDER BY i.id`
    );
    panel.innerHTML = `<h3>Impuestos configurados</h3>
      <div class="tabla-scroll"><table class="tabla seleccionable"><thead><tr><th>Nombre</th><th class="num">Tasa</th><th class="num">Productos</th><th>Nuevos productos</th><th></th></tr></thead>
      <tbody>${
        lista
          .map(
            i => `<tr data-id="${i.id}"><td>${esc(i.nombre)}</td><td class="num">${numInput(i.tasa, 2)}%</td><td class="num">${i.productos}</td>
          <td>${i.auto_nuevos ? 'Se aplica automáticamente' : '—'}</td>
          <td class="num"><button class="btn btn-icono" data-editar="${i.id}">✎</button><button class="btn btn-icono" data-borrar="${i.id}">✕</button></td></tr>`
          )
          .join('') || '<tr><td colspan="5" class="vacio">No hay impuestos configurados</td></tr>'
      }</tbody></table></div>
      <div class="botones" style="justify-content:flex-start">
        <button class="btn btn-primario" data-agregar>+ Agregar nuevo impuesto</button>
        <span class="nota">Sugerencias Colombia:</span>
        <button class="btn" data-sug="IVA|19">IVA 19%</button>
        <button class="btn" data-sug="IVA|5">IVA 5%</button>
        <button class="btn" data-sug="INC|8">INC 8%</button>
      </div>`;
    panel.querySelector('[data-agregar]').onclick = () => editar(null);
    panel.querySelectorAll('[data-sug]').forEach(b => {
      const [n, t] = b.dataset.sug.split('|');
      b.onclick = () => editar(null, { nombre: n, tasa: Number(t) });
    });
    panel.querySelectorAll('[data-editar]').forEach(b => (b.onclick = () => editar(lista.find(i => i.id === Number(b.dataset.editar)))));
    panel.querySelector('tbody').ondblclick = e => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) editar(lista.find(i => i.id === Number(tr.dataset.id)));
    };
    panel.querySelectorAll('[data-borrar]').forEach(
      b =>
        (b.onclick = async () => {
          const i = lista.find(x => x.id === Number(b.dataset.borrar));
          if (!(await confirmar(`¿Eliminar el impuesto <b>${esc(i.nombre)} (${numInput(i.tasa, 2)}%)</b>? Se quitará de ${i.productos} producto(s).`, { peligro: true, si: 'Eliminar' })))
            return;
          await tx([
            { sql: 'DELETE FROM producto_impuestos WHERE impuesto_id = ?', params: [i.id] },
            { sql: 'DELETE FROM impuestos WHERE id = ?', params: [i.id] },
          ]);
          toast('Impuesto eliminado');
          pintar();
        })
    );
  }

  async function editar(imp, sugerido = {}) {
    const nuevo = !imp;
    const r = await formulario({
      titulo: nuevo ? 'Agregar nuevo impuesto' : 'Modificar impuesto',
      nota: nuevo ? '' : 'Los cambios afectan a todos los productos que tienen este impuesto.',
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre del impuesto', valor: imp?.nombre ?? sugerido.nombre ?? '', requerido: true },
        { nombre: 'tasa', etiqueta: 'Porcentaje (%)', tipo: 'numero', valor: imp?.tasa ?? sugerido.tasa ?? 0 },
        ...(nuevo ? [{ nombre: 'todos', etiqueta: 'Aplicar a todos los productos existentes', tipo: 'check', valor: false }] : []),
        { nombre: 'auto', etiqueta: 'Aplicar automáticamente a productos nuevos', tipo: 'check', valor: imp ? !!imp.auto_nuevos : true },
      ],
      validar: v => (v.tasa < 0 || v.tasa > 100 ? 'El porcentaje debe estar entre 0 y 100.' : null),
      aceptar: 'Guardar',
    });
    if (!r) return;
    if (nuevo) {
      const pasos = [{ sql: 'INSERT INTO impuestos (nombre, tasa, auto_nuevos) VALUES (?, ?, ?)', params: [r.nombre, r.tasa, r.auto ? 1 : 0] }];
      if (r.todos)
        pasos.push({
          sql: "INSERT OR IGNORE INTO producto_impuestos (producto_id, impuesto_id) SELECT id, (SELECT MAX(id) FROM impuestos) FROM productos WHERE activo = 1",
          params: [],
        });
      await tx(pasos);
      if (!cfg('usar_impuestos')) {
        await setCfg('usar_impuestos', true);
        toast('Se activó el manejo de impuestos');
        return abrirSeccion('impuestos');
      }
    } else {
      await run('UPDATE impuestos SET nombre = ?, tasa = ?, auto_nuevos = ? WHERE id = ?', [r.nombre, r.tasa, r.auto ? 1 : 0, imp.id]);
    }
    toast('Impuesto guardado');
    pintar();
  }

  await pintar();
}

// ---------------------------------------------------------------- Corte
function secCorte(c) {
  formCfg(c, [
    { tipo: 'titulo', etiqueta: 'Cierre de turno' },
    {
      clave: 'corte_solicitar_esperado',
      etiqueta: 'Solicitar el dinero en caja al cerrar el turno',
      tipo: 'check',
      nota: 'Muestra el efectivo esperado y pide al cajero contar el dinero. Si se desactiva, solo se confirma el cierre y las diferencias las ve el dueño en el historial.',
    },
    { tipo: 'titulo', etiqueta: 'Límite de efectivo en caja' },
    { clave: 'limite_efectivo', etiqueta: 'Monto máximo en caja', tipo: 'dinero', nota: '0 = sin límite.' },
    {
      clave: 'limite_comportamiento',
      etiqueta: 'Al alcanzar el límite',
      tipo: 'select',
      opciones: [
        ['IGNORAR', 'Ignorar el límite'],
        ['ADVERTIR', 'Permitir vender pero mostrar advertencia'],
        ['BLOQUEAR', 'No permitir cobrar hasta registrar una salida de efectivo'],
      ],
    },
    { clave: 'limite_mensaje', etiqueta: 'Mensaje para el cajero', tipo: 'texto' },
  ]);
}

// ---------------------------------------------------------------- Moneda
function secMoneda(c) {
  const ejemplo = () => {
    const p = $('[data-ejemplo]', c);
    if (p) p.innerHTML = `Ejemplo: <b>${esc(dinero(1234567.5))}</b>`;
  };
  formCfg(c, [
    { clave: 'moneda_simbolo', etiqueta: 'Símbolo', tipo: 'texto', maximo: 4, alCambiar: ejemplo },
    {
      clave: 'moneda_miles',
      etiqueta: 'Separador de miles',
      tipo: 'select',
      opciones: [
        ['.', 'Punto (1.000)'],
        [',', 'Coma (1,000)'],
        [' ', 'Espacio (1 000)'],
        ['', 'Ninguno (1000)'],
      ],
      validar: v => (v && v === cfg('moneda_decimal') ? 'El separador de miles no puede ser igual al decimal.' : null),
      alCambiar: ejemplo,
    },
    {
      clave: 'moneda_decimal',
      etiqueta: 'Separador decimal',
      tipo: 'select',
      opciones: [
        [',', 'Coma (0,50)'],
        ['.', 'Punto (0.50)'],
      ],
      validar: v => (v === cfg('moneda_miles') ? 'El separador decimal no puede ser igual al de miles.' : null),
      alCambiar: ejemplo,
    },
    {
      clave: 'moneda_decimales',
      etiqueta: 'Centavos',
      tipo: 'select',
      numerico: true,
      opciones: [
        [0, 'Sin centavos'],
        [2, 'Con 2 decimales'],
      ],
      alCambiar: ejemplo,
    },
  ]);
  const p = document.createElement('p');
  p.className = 'panel cfg-panel';
  p.dataset.ejemplo = '';
  c.appendChild(p);
  ejemplo();
}

// ---------------------------------------------------------------- Unidades
function secUnidades(c) {
  const panel = document.createElement('div');
  panel.className = 'panel cfg-panel';
  c.appendChild(panel);
  const pintar = () => {
    const unidades = cfg('unidades') || [];
    panel.innerHTML = `<h3>Unidades de medida</h3>
      <p class="nota">Unidades disponibles para los productos a granel (Kg, Gr, Lt, Mt…). Si hay más de 2, aparece el campo "unidad" en el producto.</p>
      <div class="cfg-unidades">${unidades.map((u, i) => `<span class="cfg-chip">${esc(u)} <button class="btn btn-icono" data-quitar="${i}">✕</button></span>`).join('') || '<span class="nota">Sin unidades</span>'}</div>
      <div class="fila" style="margin-top:10px"><input data-nueva placeholder="Nueva unidad" maxlength="10"><button class="btn btn-primario" data-agregar>Agregar</button>
      <button class="btn" data-sugeridas>Agregar Kg, Gr, Lt, Ml, Mt, Cm</button></div>`;
    const guardar = async l => {
      await setCfg('unidades', l);
      guardado();
      pintar();
    };
    panel.querySelectorAll('[data-quitar]').forEach(b => (b.onclick = () => guardar(unidades.filter((_, i) => i !== Number(b.dataset.quitar)))));
    const agregar = () => {
      const v = panel.querySelector('[data-nueva]').value.trim();
      if (!v) return;
      if (unidades.some(u => u.toLowerCase() === v.toLowerCase())) return toast('Esa unidad ya existe', 'aviso');
      guardar([...unidades, v]);
    };
    panel.querySelector('[data-agregar]').onclick = agregar;
    panel.querySelector('[data-nueva]').onkeydown = e => {
      if (e.key === 'Enter') agregar();
    };
    panel.querySelector('[data-sugeridas]').onclick = () => {
      const l = [...unidades];
      for (const u of ['Kg', 'Gr', 'Lt', 'Ml', 'Mt', 'Cm']) if (!l.some(x => x.toLowerCase() === u.toLowerCase())) l.push(u);
      guardar(l);
    };
  };
  pintar();
}

// ---------------------------------------------------------------- Impresora
async function secImpresora(c) {
  let impresoras = [];
  try {
    impresoras = await window.api.listarImpresoras();
  } catch {
    impresoras = [];
  }
  const actual = cfg('impresora');
  const opciones = [
    ['-', 'No usar impresora de tickets'],
    ['', 'Preguntar cada vez (diálogo de impresión)'],
    ...impresoras.map(p => [p, p]),
  ];
  if (actual && actual !== '-' && !impresoras.includes(actual)) opciones.push([actual, actual + ' (no disponible)']);
  formCfg(c, [
    { clave: 'impresora', etiqueta: 'Impresora', tipo: 'select', opciones },
    {
      clave: 'ticket_fuente',
      etiqueta: 'Tipo de letra',
      tipo: 'select',
      opciones: [
        ['Courier New', 'Courier New (recomendada)'],
        ['Consolas', 'Consolas'],
        ['Lucida Console', 'Lucida Console'],
        ['monospace', 'Monoespaciada del sistema'],
      ],
    },
    {
      clave: 'ticket_tamano',
      etiqueta: 'Tamaño de letra',
      tipo: 'select',
      numerico: true,
      opciones: [7, 8, 9, 10, 11, 12].map(n => [n, n + (n === 10 ? ' (recomendado)' : '')]),
    },
    {
      clave: 'ticket_columnas',
      etiqueta: 'Columnas (caracteres por línea)',
      tipo: 'numero',
      nota: 'Papel de 58 mm: 30–32 · Papel de 80 mm: 42–48.',
      validar: v => (v < 20 || v > 64 ? 'Usa entre 20 y 64 columnas.' : null),
    },
    {
      clave: 'ticket_negritas',
      etiqueta: 'Apariencia',
      tipo: 'select',
      opciones: [
        ['TOTALES', 'Totales en negritas'],
        ['NORMAL', 'Usar fuente normal para los totales'],
        ['TODO', 'Imprimir todas las letras en negritas'],
      ],
    },
  ]);
  const panel = document.createElement('div');
  panel.className = 'panel cfg-panel';
  panel.innerHTML = `<button class="btn btn-primario" data-probar>🖨 Probar impresión</button>
    <p class="nota">La impresora debe estar instalada en Windows. Si tu ticket se corta o sale muy ancho, ajusta las columnas.</p>`;
  c.appendChild(panel);
  panel.querySelector('[data-probar]').onclick = () => {
    const n = Number(cfg('ticket_columnas'));
    imprimirLineas([
      { t: cfg('negocio_nombre'), c: true, b: true },
      centrar('PRUEBA DE IMPRESIÓN'),
      separador(),
      '1234567890'.repeat(Math.ceil(n / 10)).slice(0, n),
      dos('Izquierda', 'Derecha'),
      { t: dos('TOTAL:', dinero(12345)), b: true, g: true },
      separador(),
      centrar(ahoraISO()),
      '',
      '',
      '',
    ]);
  };
}

function secLector(c) {
  const p = document.createElement('div');
  p.className = 'panel cfg-panel';
  p.innerHTML = `<h3>Lector de códigos de barras</h3>
    <p>Los lectores USB funcionan como un teclado: no requieren configuración. Al escanear, el código se escribe en el campo
    <b>Código del producto</b> y el lector envía ENTER automáticamente.</p>
    <p class="nota">Si tu lector no envía ENTER al final, configúralo con el manual del fabricante (sufijo "CR" o "Enter").</p>
    <h3>Prueba</h3><input data-prueba class="grande" placeholder="Escanea un código aquí">
    <p data-resultado class="nota"></p>`;
  c.appendChild(p);
  const i = p.querySelector('[data-prueba]');
  i.onkeydown = e => {
    if (e.key === 'Enter') {
      p.querySelector('[data-resultado]').textContent = i.value ? `Leído: "${i.value}" (${i.value.length} caracteres) ✓ ENTER recibido` : '';
      i.select();
    }
  };
}

function secCajon(c) {
  formCfg(c, [
    {
      clave: 'cajon_abrir',
      etiqueta: 'Tengo un cajón de dinero conectado a la impresora de tickets',
      tipo: 'check',
      nota: 'El cajón se conecta a la impresora (cable RJ11) y se abre cuando la impresora recibe un ticket. Configura la apertura en las propiedades del controlador de la impresora en Windows (opción "Abrir cajón" / "Cash drawer": antes o después de imprimir).',
    },
  ]);
}

function secBascula(c) {
  formCfg(c, [
    { tipo: 'titulo', etiqueta: 'Báscula impresora de etiquetas' },
    {
      clave: 'bascula_bandera',
      etiqueta: 'Bandera de inicio',
      tipo: 'texto',
      maximo: 4,
      nota: 'Prefijo con el que inician las etiquetas (ej. "20" o "0200"). Si tiene menos de 4 dígitos se completa con ceros a la derecha.',
      validar: v => (v && !/^\d{1,4}$/.test(v) ? 'La bandera debe tener de 1 a 4 dígitos.' : null),
    },
    {
      clave: 'bascula_tipo',
      etiqueta: 'Mi báscula imprime etiquetas con',
      tipo: 'select',
      opciones: [
        ['PESO', 'El peso (5 dígitos, 3 decimales en kg)'],
        ['PRECIO', 'El precio (5 dígitos, 2 decimales)'],
      ],
    },
    {
      tipo: 'nota',
      etiqueta: `Formato del código de 13 dígitos: <code>[bandera 4][código del producto 3][peso o precio 5][verificador 1]</code>.<br>
        Ejemplo: <code>2000 013 01250 7</code> = producto "013", 1,250 kg. El producto debe existir con el mismo código (ej. "013").<br>
        La lectura directa del peso por cable serial no está disponible: usa etiquetas impresas por la báscula o captura la cantidad a mano.`,
    },
  ]);
}

// ---------------------------------------------------------------- Base de datos y respaldos
// Borra todo el historial de ventas y deja el programa como recién instalado (sin tocar catálogos).
async function borrarVentas(ruta) {
  if (!sesion.usuario.es_admin) return alerta('Solo el administrador puede borrar las ventas.', 'Acceso restringido');
  const r = await formulario({
    titulo: 'Borrar todas las ventas',
    nota: `Se borrarán <b>todas</b> las ventas, devoluciones, cortes, turnos, entradas y salidas de efectivo, tickets pendientes
      y los saldos de crédito. Esta acción no se puede deshacer (salvo restaurando el respaldo que se guardará antes).`,
    campos: [
      { nombre: 'kardex', etiqueta: 'Borrar también el historial de movimientos de inventario (kardex)', tipo: 'check', valor: false },
      { nombre: 'confirmacion', etiqueta: 'Escribe BORRAR para confirmar' },
      { nombre: 'clave', etiqueta: 'Contraseña del administrador', tipo: 'clave' },
    ],
    aceptar: 'Borrar ventas',
    validar: async v => {
      if (v.confirmacion.toUpperCase() !== 'BORRAR') return 'Escribe BORRAR para confirmar.';
      if (!(await window.api.verificarClave(v.clave, sesion.usuario.clave))) return 'Contraseña incorrecta.';
      return null;
    },
  });
  if (!r) return;

  const sep = ruta.includes('\\') ? '\\' : '/';
  const carpeta = cfg('respaldo_carpeta') || ruta.slice(0, ruta.lastIndexOf(sep)) + sep + 'respaldos';
  let respaldo;
  try {
    respaldo = await window.api.respaldoAutomatico(carpeta);
  } catch (e) {
    return alerta('No se pudo crear el respaldo previo, no se borró nada: ' + esc(e.message), 'Error');
  }

  const existe = async t => !!(await q1("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [t]));
  const tablas = [
    'credito_aplicaciones', 'movimientos_credito', 'devoluciones', 'venta_pagos', 'venta_renglones', 'ventas',
    'movimientos_caja', 'turnos', 'tickets_pendientes',
  ];
  if (r.kardex) tablas.push('movimientos_inventario', 'cambios_precio');
  const pasos = [];
  for (const t of tablas) if (await existe(t)) pasos.push({ sql: `DELETE FROM ${t}`, params: [] });
  pasos.push({ sql: 'UPDATE clientes SET saldo = 0', params: [] });
  await tx(pasos);

  await alerta(
    `Listo, las ventas quedaron en cero.<br><br>Respaldo previo guardado en:<br><code>${esc(respaldo)}</code><br><br>
     El programa se reiniciará para abrir un turno nuevo.`,
    'Ventas borradas'
  );
  location.reload();
}

async function secBaseDatos(c) {
  const ruta = await window.api.rutaBD();
  const panel = document.createElement('div');
  panel.className = 'panel cfg-panel';
  c.appendChild(panel);
  const pintar = () => {
    panel.innerHTML = `<h3>Base de datos</h3>
      <div class="form-grid"><label>Ubicación</label><div><code class="cfg-ruta">${esc(ruta)}</code></div></div>
      <div class="botones" style="justify-content:flex-start">
        <button class="btn btn-primario" data-respaldar>💾 Realizar respaldo en este momento…</button>
        <button class="btn btn-peligro" data-restaurar>⟲ Restaurar desde un respaldo…</button>
      </div>
      <h3 style="margin-top:18px">Respaldo automático</h3>
      <div class="form-grid">
        <label>Carpeta de respaldos</label>
        <div class="fila"><code class="cfg-ruta">${esc(cfg('respaldo_carpeta') || 'No configurada')}</code>
          <button class="btn" data-carpeta>Elegir carpeta…</button></div>
        <span></span><label class="check"><input type="checkbox" data-al-salir ${cfg('respaldo_al_salir') ? 'checked' : ''}> Realizar respaldo automático al salir del programa</label>
      </div>
      <p class="nota">Recomendación: usa una memoria USB, un disco externo o una carpeta sincronizada en la nube (OneDrive, Google Drive).</p>
      <h3 style="margin-top:18px">Borrar ventas</h3>
      <p class="nota">Deja en cero las ventas, devoluciones, cortes y turnos, entradas y salidas de efectivo, tickets pendientes
        y los saldos de crédito de los clientes. Los folios vuelven a empezar en 1. <b>No</b> se borran productos, clientes,
        proveedores, cajeros ni configuración. Antes de borrar se guarda un respaldo automático.</p>
      <div class="botones" style="justify-content:flex-start">
        <button class="btn btn-peligro" data-borrar-ventas>🗑 Borrar todas las ventas…</button>
      </div>`;
    panel.querySelector('[data-borrar-ventas]').onclick = () => borrarVentas(ruta);
    panel.querySelector('[data-respaldar]').onclick = async () => {
      const r = await window.api.crearRespaldo();
      if (r) toast('Respaldo guardado');
    };
    panel.querySelector('[data-restaurar]').onclick = async () => {
      const ok = await confirmar(
        'Restaurar un respaldo <b>reemplaza todos los datos actuales</b> (se guarda una copia de seguridad de los datos actuales junto a la base de datos). ¿Continuar?',
        { titulo: 'Restaurar respaldo', si: 'Elegir respaldo…', peligro: true }
      );
      if (!ok) return;
      if (await window.api.restaurarRespaldo()) {
        await alerta('Respaldo restaurado. El programa se reiniciará.', 'Restauración');
        location.reload();
      }
    };
    panel.querySelector('[data-carpeta]').onclick = async () => {
      const d = await window.api.elegirCarpeta();
      if (d) {
        await setCfg('respaldo_carpeta', d);
        guardado();
        pintar();
      }
    };
    panel.querySelector('[data-al-salir]').onchange = async e => {
      if (e.target.checked && !cfg('respaldo_carpeta')) {
        e.target.checked = false;
        return alerta('Primero elige la carpeta de respaldos.');
      }
      await setCfg('respaldo_al_salir', e.target.checked);
      guardado();
    };
  };
  pintar();
}
