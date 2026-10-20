// Arranque de la aplicación: asistente inicial, inicio de sesión, turnos y navegación entre módulos.
import {
  q, q1, run, cfg, setCfg, cargarConfig, sesion, puede, exigir, modalAbierto, abrirModal, alerta, confirmar, formulario,
  esc, dinero, num, numInput, fmtFechaHora, ahoraISO, toast, $,
} from './core.js';

export const VERSION = '1.0.0';

const MODULOS = [
  { id: 'ventas', titulo: 'Ventas', tecla: 'F1', icono: '🛒' },
  { id: 'creditos', titulo: 'Créditos', tecla: 'F2', icono: '💳', permiso: 'creditos_ver', requiere: 'ofrecer_credito' },
  { id: 'clientes', titulo: 'Clientes', icono: '👥' },
  { id: 'productos', titulo: 'Productos', tecla: 'F3', icono: '📦' },
  { id: 'inventario', titulo: 'Inventario', tecla: 'F4', icono: '📋', requiere: 'usar_inventario' },
  { id: 'compras', titulo: 'Compras', icono: '🚚' },
  { id: 'configuracion', titulo: 'Configuración', icono: '⚙️', permiso: 'configuracion' },
  { id: 'corte', titulo: 'Corte', icono: '💰' },
  { id: 'reportes', titulo: 'Reportes', icono: '📈', permiso: 'reportes' },
];

let moduloActual = null; // {def, instancia}

// ---------------------------------------------------------------- Navegación
function pintarNavegacion() {
  const nav = $('#navegacion');
  const visibles = MODULOS.filter(m => !m.requiere || cfg(m.requiere));
  nav.innerHTML =
    visibles
      .map(
        m => `<button class="nav-btn" data-mod="${m.id}">
          <span class="nav-icono">${m.icono}</span>
          <span>${m.tecla ? `<small>${m.tecla}</small> ` : ''}${m.titulo}</span></button>`
      )
      .join('') +
    `<span class="espaciador"></span>
     <button class="nav-btn nav-salir" data-salir><span class="nav-icono">⏻</span><span>Salir</span></button>`;
  nav.onclick = e => {
    const b = e.target.closest('[data-mod]');
    if (b) irA(b.dataset.mod);
    if (e.target.closest('[data-salir]')) salir();
  };
}

export async function irA(id, ...args) {
  const def = MODULOS.find(m => m.id === id);
  if (!def) return;
  if (def.requiere && !cfg(def.requiere)) return;
  if (def.permiso && !exigir(def.permiso)) return;
  if (moduloActual?.instancia?.desmontar) await moduloActual.instancia.desmontar();
  const contenido = $('#contenido');
  contenido.innerHTML = '';
  contenido.className = 'modulo-' + id;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('activo', b.dataset.mod === id));
  try {
    const mod = await import(`./modulos/${id}.js`);
    moduloActual = { def, instancia: null };
    moduloActual.instancia = (await mod.montar(contenido, ...args)) || {};
  } catch (err) {
    console.error(err);
    contenido.innerHTML = `<div class="error-modulo">No se pudo abrir el módulo ${esc(def.titulo)}: ${esc(err.message)}</div>`;
  }
}

export const refrescarNavegacion = pintarNavegacion;

// ---------------------------------------------------------------- Teclado global
document.addEventListener('keydown', e => {
  const m = modalAbierto();
  if (m) {
    if (m.onKey(e)) e.preventDefault();
    else if (/^F\d+$/.test(e.key)) e.preventDefault();
    return;
  }
  if (!sesion.usuario) return;
  if (moduloActual?.instancia?.onKey && moduloActual.instancia.onKey(e) === true) {
    e.preventDefault();
    return;
  }
  const destino = { F1: 'ventas', F2: 'creditos', F3: 'productos', F4: 'inventario' }[e.key];
  if (destino) {
    e.preventDefault();
    irA(destino);
  } else if (/^F\d+$/.test(e.key)) e.preventDefault();
});

// ---------------------------------------------------------------- Asistente inicial
async function asistenteBienvenida() {
  await alerta(
    'Bienvenido. Vamos a configurar tu punto de venta en unos pocos pasos. Todo se puede cambiar después en <b>Configuración</b>.',
    'Asistente de bienvenida'
  );
  const negocio = await formulario({
    titulo: 'Paso 1 de 4 · Tu negocio',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre del negocio', valor: '', requerido: true },
      { nombre: 'giro', etiqueta: 'Giro (tienda, ferretería, papelería…)', valor: '' },
      { nombre: 'direccion', etiqueta: 'Dirección', valor: '' },
      { nombre: 'telefono', etiqueta: 'Teléfono', valor: '' },
      { nombre: 'nit', etiqueta: 'NIT / Identificación fiscal', valor: '' },
      {
        nombre: 'pais',
        etiqueta: 'País (moneda)',
        tipo: 'select',
        valor: 'CO',
        opciones: [
          ['CO', 'Colombia (COP, sin centavos, 1.234)'],
          ['MX', 'México (MXN, con centavos, 1,234.50)'],
          ['OTRO', 'Otro (con centavos, 1.234,50)'],
        ],
      },
    ],
    aceptar: 'Siguiente',
  });
  if (!negocio) return false;
  const monedas = {
    CO: { moneda_miles: '.', moneda_decimal: ',', moneda_decimales: 0, tipo_cambio: 4000 },
    MX: { moneda_miles: ',', moneda_decimal: '.', moneda_decimales: 2, tipo_cambio: 18 },
    OTRO: { moneda_miles: '.', moneda_decimal: ',', moneda_decimales: 2, tipo_cambio: 1 },
  }[negocio.pais];
  for (const [k, v] of Object.entries(monedas)) await setCfg(k, v);
  await setCfg('negocio_nombre', negocio.nombre);
  await setCfg('negocio_giro', negocio.giro);
  await setCfg(
    'ticket_encabezado',
    [negocio.nombre, negocio.direccion, negocio.telefono && 'Tel. ' + negocio.telefono, negocio.nit && 'NIT ' + negocio.nit].filter(Boolean)
  );

  const funciones = await formulario({
    titulo: 'Paso 2 de 4 · Funciones',
    campos: [
      { nombre: 'usar_inventario', etiqueta: 'Utilizar inventarios para mis productos', tipo: 'check', valor: true },
      {
        nombre: 'metodo_costo',
        etiqueta: 'Método de costo de inventario',
        tipo: 'select',
        valor: 'PROMEDIO',
        opciones: [
          ['PROMEDIO', 'Costo promedio ponderado'],
          ['ULTIMO', 'Último costo'],
        ],
      },
      { nombre: 'ofrecer_credito', etiqueta: 'Deseo ofrecer crédito a mis clientes', tipo: 'check', valor: true },
      { nombre: 'producto_comun', etiqueta: 'Habilitar venta de producto común (no registrado)', tipo: 'check', valor: true },
    ],
    aceptar: 'Siguiente',
  });
  if (!funciones) return false;
  for (const [k, v] of Object.entries(funciones)) await setCfg(k, v);

  const pagos = await formulario({
    titulo: 'Paso 3 de 4 · Formas de pago',
    nota: 'El efectivo siempre está habilitado.',
    campos: [
      { nombre: 'pago_tarjeta', etiqueta: 'Tarjeta de crédito / débito', tipo: 'check', valor: true },
      { nombre: 'pago_transferencia', etiqueta: 'Transferencia (Nequi, Daviplata, etc.)', tipo: 'check', valor: true },
      { nombre: 'pago_vales', etiqueta: 'Vales', tipo: 'check', valor: false },
      { nombre: 'pago_cheque', etiqueta: 'Cheque', tipo: 'check', valor: false },
      { nombre: 'pago_dolares', etiqueta: 'Dólares', tipo: 'check', valor: false },
    ],
    aceptar: 'Siguiente',
  });
  if (!pagos) return false;
  for (const [k, v] of Object.entries(pagos)) await setCfg(k, v);

  const clave = await formulario({
    titulo: 'Paso 4 de 4 · Contraseña del administrador',
    nota: 'El usuario <b>admin</b> tiene todos los permisos. La contraseña inicial es 12345; te recomendamos cambiarla.',
    campos: [
      { nombre: 'clave', etiqueta: 'Nueva contraseña (deja vacío para conservar 12345)', tipo: 'clave' },
      { nombre: 'clave2', etiqueta: 'Repite la contraseña', tipo: 'clave' },
    ],
    validar: r => (r.clave !== r.clave2 ? 'Las contraseñas no coinciden.' : null),
    aceptar: 'Terminar',
  });
  if (!clave) return false;
  if (clave.clave) await run("UPDATE usuarios SET clave = ? WHERE usuario = 'admin'", [await window.api.hashClave(clave.clave)]);
  await setCfg('configurado', true);
  await alerta('¡Listo! Ya puedes empezar a vender. Usuario: <b>admin</b>.', 'Configuración terminada');
  return true;
}

// ---------------------------------------------------------------- Inicio de sesión
function pantallaLogin() {
  const cont = $('#contenido');
  cont.className = 'pantalla-login';
  cont.innerHTML = `
    <form class="login">
      <h1>${esc(cfg('negocio_nombre'))}</h1>
      <p class="sub">Punto de Venta</p>
      <label>Usuario<input name="usuario" value="admin" autocomplete="off"></label>
      <label>Contraseña<input name="clave" type="password" autofocus></label>
      <button class="btn btn-primario grande" type="submit">Entrar</button>
      <p class="error" hidden></p>
    </form>`;
  const form = cont.querySelector('form');
  setTimeout(() => form.clave.focus(), 0);
  return new Promise(resolve => {
    form.onsubmit = async e => {
      e.preventDefault();
      const u = await q1('SELECT * FROM usuarios WHERE usuario = ? COLLATE NOCASE AND activo = 1', [form.usuario.value.trim()]);
      if (!u || !(await window.api.verificarClave(form.clave.value, u.clave))) {
        const err = form.querySelector('.error');
        err.hidden = false;
        err.textContent = 'Usuario o contraseña incorrectos';
        form.clave.select();
        return;
      }
      u.permisosSet = new Set(JSON.parse(u.permisos || '[]'));
      resolve(u);
    };
  });
}

async function iniciarTurno() {
  const abierto = await q1(
    `SELECT t.*, u.nombre AS cajero FROM turnos t JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.caja_id = ? AND t.estado = 'ABIERTO' ORDER BY t.id DESC LIMIT 1`,
    [sesion.caja.id]
  );
  if (abierto) {
    if (abierto.usuario_id !== sesion.usuario.id) {
      const ok = await confirmar(
        `Hay un turno abierto de <b>${esc(abierto.cajero)}</b> desde ${fmtFechaHora(abierto.inicio)}.<br><br>
         ¿Deseas continuar trabajando en ese turno? (Para iniciar uno nuevo, primero ciérralo desde el módulo Corte.)`,
        { titulo: 'Turno abierto', si: 'Continuar el turno', no: 'Salir' }
      );
      if (!ok) return false;
    }
    sesion.turno = abierto;
    return true;
  }
  const r = await formulario({
    titulo: 'Inicio de turno',
    nota: 'Ingresa el efectivo con el que inicia la caja (fondo de caja).',
    campos: [{ nombre: 'fondo', etiqueta: 'Efectivo inicial en caja', tipo: 'dinero', valor: 0 }],
    aceptar: 'Iniciar turno',
  });
  if (!r) return false;
  const { id } = await run('INSERT INTO turnos (caja_id, usuario_id, inicio, fondo) VALUES (?, ?, ?, ?)', [
    sesion.caja.id,
    sesion.usuario.id,
    ahoraISO(),
    r.fondo,
  ]);
  sesion.turno = await q1('SELECT * FROM turnos WHERE id = ?', [id]);
  return true;
}

async function pedirTipoCambio() {
  if (!cfg('pago_dolares')) return;
  const r = await formulario({
    titulo: 'Tipo de cambio del día',
    campos: [{ nombre: 'tc', etiqueta: 'Valor de 1 dólar en moneda local', tipo: 'dinero', valor: cfg('tipo_cambio') }],
  });
  if (r && r.tc > 0) await setCfg('tipo_cambio', r.tc);
}

function pintarEncabezado() {
  $('#encabezado').hidden = false;
  $('#navegacion').hidden = false;
  $('#barra-estado').hidden = false;
  $('#nombre-negocio').textContent = cfg('negocio_nombre');
  const logo = $('#logo-programa');
  logo.hidden = !cfg('logo_programa');
  if (cfg('logo_programa')) logo.src = cfg('logo_programa');
  $('#nombre-cajero').textContent = sesion.usuario.nombre;
  $('#estado-caja').textContent = `v${VERSION} · ${sesion.caja.nombre}`;
  $('#estado-turno').textContent = `Turno #${sesion.turno.id} desde ${fmtFechaHora(sesion.turno.inicio)}`;
}

export function refrescarEncabezado() {
  if (sesion.usuario) pintarEncabezado();
}

setInterval(() => {
  const d = new Date();
  const el = $('#estado-reloj');
  if (el) el.textContent = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}, 1000);

// ---------------------------------------------------------------- Salir
export async function salir() {
  const m = abrirModal({
    titulo: 'Salir',
    ancho: 460,
    html: `
      <div class="opciones-salir">
        <button class="btn grande" data-cerrar>🔒 Cerrar turno…</button>
        <button class="btn grande" data-dejar>🚪 Dejar turno abierto y salir…</button>
        <button class="btn grande" data-usuario>👤 Cambiar de usuario</button>
        <button class="btn" data-cancelar>Cancelar</button>
      </div>`,
  });
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  m.cuerpo.querySelector('[data-cerrar]').onclick = () => m.cerrar('cerrar');
  m.cuerpo.querySelector('[data-dejar]').onclick = () => m.cerrar('dejar');
  m.cuerpo.querySelector('[data-usuario]').onclick = () => m.cerrar('usuario');
  const op = await m.promesa;
  if (op === 'dejar') return terminar();
  if (op === 'usuario') return reiniciarSesion();
  if (op === 'cerrar') {
    if (!puede('corte_turno') && !puede('corte_todos')) {
      await alerta('No tienes permiso para cerrar el turno. Pide a un usuario autorizado que entre y lo cierre.');
      return;
    }
    const { cerrarTurno } = await import('./modulos/corte.js');
    if (await cerrarTurno()) return terminar();
  }
}

export async function terminar() {
  if (cfg('respaldo_al_salir') && cfg('respaldo_carpeta')) {
    try {
      await window.api.respaldoAutomatico(cfg('respaldo_carpeta'));
    } catch (e) {
      console.error(e);
    }
  }
  await window.api.salir();
}

async function reiniciarSesion() {
  if (moduloActual?.instancia?.desmontar) await moduloActual.instancia.desmontar();
  moduloActual = null;
  sesion.usuario = null;
  sesion.turno = null;
  $('#encabezado').hidden = $('#navegacion').hidden = $('#barra-estado').hidden = true;
  await iniciar();
}

// ---------------------------------------------------------------- Inicio
async function iniciar() {
  await cargarConfig();
  const caja = await q1('SELECT * FROM cajas ORDER BY id LIMIT 1');
  sesion.caja = caja;
  await run('UPDATE cajas SET ultimo_uso = ? WHERE id = ?', [ahoraISO(), caja.id]);
  document.title = cfg('negocio_nombre') + ' · Punto de Venta';

  if (!cfg('configurado')) {
    $('#contenido').innerHTML = '';
    if (!(await asistenteBienvenida())) return window.api.salir();
  }

  for (;;) {
    sesion.usuario = await pantallaLogin();
    if (await iniciarTurno()) break;
    sesion.usuario = null;
  }
  // Limpia tickets pendientes con más de 4 días.
  await run("DELETE FROM tickets_pendientes WHERE creado < datetime('now', 'localtime', '-4 days')");
  await pedirTipoCambio();
  pintarEncabezado();
  pintarNavegacion();
  await irA('ventas');
}

iniciar().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre class="error-fatal">Error al iniciar: ${esc(err.stack || err.message)}</pre>`;
});
