// Módulo Clientes: administración maestro-detalle de clientes y su crédito.
import {
  q, q1, run, puede, exigir, alerta, confirmar, toast, exportarCSV,
  esc, dinero, num, numInput, iniciales, colorAvatar, fmtFecha, $,
} from '../core.js';

let raiz = null;
let clientes = [];
let actual = null; // cliente en edición (null = nuevo)

const NOMBRE = "TRIM(nombres || ' ' || COALESCE(apellidos, ''))";

export async function montar(el) {
  raiz = el;
  el.innerHTML = `
    <div class="modulo-barra">Administración de clientes</div>
    <div class="sub-barra">
      <button class="btn" data-nuevo>➕ Nuevo cliente</button>
      <button class="btn" data-exportar>📤 Exportar…</button>
    </div>
    <div class="modulo-cuerpo">
      <div class="maestro-detalle">
        <div class="panel cli-lista">
          <input data-buscar placeholder="Buscar por nombre, folio, correo, teléfono o NIT" autofocus>
          <div class="cli-items" data-items></div>
        </div>
        <div class="panel" data-form></div>
      </div>
    </div>`;
  const buscar = $('[data-buscar]', el);
  let t;
  buscar.oninput = () => {
    clearTimeout(t);
    t = setTimeout(cargar, 150);
  };
  $('[data-nuevo]', el).onclick = () => nuevo();
  $('[data-exportar]', el).onclick = exportar;
  $('[data-items]', el).onclick = e => {
    const it = e.target.closest('[data-id]');
    if (it) seleccionar(Number(it.dataset.id));
  };
  await cargar();
  if (clientes.length) await seleccionar(clientes[0].id);
  else nuevo();
  setTimeout(() => buscar.focus(), 0);
  return {
    onKey(e) {
      if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        guardar();
        return true;
      }
      return false;
    },
    desmontar() {
      raiz = null;
    },
  };
}

async function cargar() {
  const t = $('[data-buscar]', raiz).value.trim();
  const like = '%' + t + '%';
  clientes = await q(
    `SELECT *, ${NOMBRE} AS nombre FROM clientes
     WHERE activo = 1 AND es_sistema = 0
       AND (? = '' OR CAST(id AS TEXT) = ? OR ${NOMBRE} LIKE ? OR email LIKE ? OR telefono LIKE ? OR nit LIKE ?)
     ORDER BY nombres, apellidos LIMIT 500`,
    [t, t, like, like, like, like]
  );
  pintarLista();
}

function pintarLista() {
  $('[data-items]', raiz).innerHTML =
    clientes
      .map(
        c => `<div class="cli-item ${actual && actual.id === c.id ? 'sel' : ''}" data-id="${c.id}">
          <span class="avatar" style="background:${colorAvatar(c.nombre)}">${esc(iniciales(c.nombre))}</span>
          <div class="cli-texto">
            <div><b>${esc(c.nombre)}</b> <span class="nota">#${c.id}</span></div>
            <div class="nota">${esc([c.email, c.telefono].filter(Boolean).join(' – '))}</div>
          </div>
          ${c.credito ? `<span class="cli-saldo ${c.saldo > 0 ? 'rojo' : ''}">${dinero(c.saldo)}</span>` : ''}
        </div>`
      )
      .join('') || '<p class="vacio">No hay clientes</p>';
}

async function seleccionar(id) {
  actual = await q1(`SELECT *, ${NOMBRE} AS nombre FROM clientes WHERE id = ?`, [id]);
  pintarLista();
  pintarForm();
}

function nuevo() {
  if (!exigir('clientes_editar')) return;
  actual = null;
  pintarLista();
  pintarForm();
}

function campo(nombre, etiqueta, valor, extra = '') {
  return `<label>${esc(etiqueta)}</label><input name="${nombre}" value="${esc(valor ?? '')}" ${extra}>`;
}

function pintarForm() {
  const c = actual || {};
  const editable = puede('clientes_editar');
  const puedeCredito = puede('clientes_credito');
  const nombre = c.nombre || 'Nuevo cliente';
  const cont = $('[data-form]', raiz);
  cont.innerHTML = `
    <div class="cli-cabecera">
      <span class="avatar" style="background:${colorAvatar(nombre)}">${esc(iniciales(nombre))}</span>
      <div>
        <h3>${esc(nombre)}</h3>
        <div class="nota">${c.id ? `Folio ${c.id} · Alta ${fmtFecha(c.creado)}` : 'Captura los datos del cliente'}</div>
      </div>
      <span class="espaciador"></span>
      <button class="btn" data-nuevo2>Nuevo cliente</button>
      <button class="btn btn-peligro" data-eliminar ${c.id ? '' : 'disabled'}>Eliminar</button>
      <button class="btn btn-primario" data-guardar>💾 Guardar</button>
    </div>
    <form class="form-grid cli-form" autocomplete="off">
      ${campo('nombres', 'Nombres *', c.nombres)}
      ${campo('apellidos', 'Apellidos', c.apellidos)}
      ${campo('telefono', 'Teléfono', c.telefono)}
      ${campo('email', 'Correo electrónico', c.email)}
      ${campo('domicilio1', 'Domicilio', c.domicilio1)}
      ${campo('domicilio2', 'Domicilio (2)', c.domicilio2)}
      ${campo('colonia', 'Barrio / Colonia', c.colonia)}
      ${campo('municipio', 'Municipio / Ciudad', c.municipio)}
      ${campo('estado', 'Departamento / Estado', c.estado)}
      ${campo('cp', 'Código postal', c.cp)}
      <label>Notas</label><textarea name="notas" rows="2">${esc(c.notas || '')}</textarea>
      <div class="cli-seccion">Datos fiscales</div>
      ${campo('nit', 'NIT / Identificación', c.nit)}
      ${campo('razon_social', 'Razón social', c.razon_social)}
      <div class="cli-seccion">Crédito ${puedeCredito ? '' : '<span class="nota">(sin permiso para modificar)</span>'}</div>
      <label></label>
      <label class="check"><input type="checkbox" name="credito" ${c.credito ? 'checked' : ''} ${puedeCredito ? '' : 'disabled'}> Tiene crédito autorizado</label>
      <label></label>
      <div class="cli-credito">
        <label class="check"><input type="radio" name="tipo_limite" value="ILIM" ${c.limite == null ? 'checked' : ''} ${puedeCredito ? '' : 'disabled'}> Ilimitado</label>
        <label class="check"><input type="radio" name="tipo_limite" value="LIM" ${c.limite != null ? 'checked' : ''} ${puedeCredito ? '' : 'disabled'}> Con límite máximo de</label>
        <input class="num" name="limite" value="${c.limite != null ? numInput(c.limite) : ''}" ${puedeCredito ? '' : 'disabled'} style="width:140px">
      </div>
      ${c.id && c.credito ? `<label>Saldo actual</label><div><b class="${c.saldo > 0 ? 'rojo' : ''}">${dinero(c.saldo)}</b></div>` : ''}
    </form>`;
  const form = $('form', cont);
  if (!editable) form.querySelectorAll('input, textarea').forEach(i => (i.disabled = true));
  const sincronizar = () => {
    const activo = form.credito.checked && puedeCredito;
    form.querySelectorAll('[name=tipo_limite]').forEach(r => (r.disabled = !activo));
    form.limite.disabled = !activo || form.querySelector('[name=tipo_limite]:checked')?.value !== 'LIM';
  };
  form.credito.onchange = sincronizar;
  form.querySelectorAll('[name=tipo_limite]').forEach(r => (r.onchange = sincronizar));
  sincronizar();
  form.onsubmit = e => {
    e.preventDefault();
    guardar();
  };
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    const inputs = [...form.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not(:disabled), textarea')];
    const i = inputs.indexOf(e.target);
    if (i >= 0 && i < inputs.length - 1) inputs[i + 1].focus();
  });
  $('[data-guardar]', cont).onclick = guardar;
  $('[data-eliminar]', cont).onclick = eliminar;
  $('[data-nuevo2]', cont).onclick = nuevo;
  if (!actual) setTimeout(() => form.nombres.focus(), 0);
}

async function guardar() {
  if (!exigir('clientes_editar')) return;
  const form = $('[data-form] form', raiz);
  if (!form) return;
  const v = n => form[n].value.trim();
  if (!v('nombres')) {
    form.nombres.classList.add('error');
    form.nombres.focus();
    return;
  }
  const datos = [
    v('nombres'), v('apellidos'), v('telefono'), v('email'), v('domicilio1'), v('domicilio2'),
    v('colonia'), v('municipio'), v('estado'), v('cp'), form.notas.value.trim(), v('nit'), v('razon_social'),
  ];
  let credito = actual?.credito || 0;
  let limite = actual ? actual.limite : null;
  if (puede('clientes_credito')) {
    credito = form.credito.checked ? 1 : 0;
    const tipo = form.querySelector('[name=tipo_limite]:checked')?.value;
    limite = credito && tipo === 'LIM' ? num(form.limite.value) : null;
    if (credito && tipo === 'LIM' && !(limite > 0)) {
      await alerta('Indica el límite máximo de crédito.');
      form.limite.focus();
      return;
    }
  }
  const cols = 'nombres, apellidos, telefono, email, domicilio1, domicilio2, colonia, municipio, estado, cp, notas, nit, razon_social, credito, limite';
  if (actual) {
    await run(
      `UPDATE clientes SET ${cols.split(', ').map(c => c + ' = ?').join(', ')} WHERE id = ?`,
      [...datos, credito, limite, actual.id]
    );
    toast('Cliente guardado');
    await cargar();
    await seleccionar(actual.id);
  } else {
    const { id } = await run(`INSERT INTO clientes (${cols}) VALUES (${cols.split(', ').map(() => '?').join(', ')})`, [
      ...datos,
      credito,
      limite,
    ]);
    toast('Cliente creado');
    await cargar();
    await seleccionar(id);
  }
}

async function eliminar() {
  if (!actual || !exigir('clientes_editar')) return;
  if (actual.es_sistema) return alerta('Este cliente del sistema no se puede eliminar.');
  if (actual.saldo > 0.009)
    return alerta(`No se puede eliminar: <b>${esc(actual.nombre)}</b> tiene un saldo pendiente de <b>${dinero(actual.saldo)}</b>.`);
  const ok = await confirmar(`¿Borrar al cliente <b>${esc(actual.nombre)}</b>? Esta acción es permanente.`, {
    titulo: 'Borrar cliente',
    si: 'Borrar cliente',
    peligro: true,
  });
  if (!ok) return;
  await run('UPDATE clientes SET activo = 0 WHERE id = ?', [actual.id]);
  toast('Cliente eliminado exitosamente');
  actual = null;
  await cargar();
  if (clientes.length) await seleccionar(clientes[0].id);
  else nuevo();
}

async function exportar() {
  const filas = await q(
    `SELECT c.*, (SELECT MAX(fecha) FROM movimientos_credito m WHERE m.cliente_id = c.id AND m.tipo IN ('ABONO', 'LIQUIDAR') AND m.cancelado = 0) AS ultimo_abono
     FROM clientes c WHERE c.activo = 1 AND c.es_sistema = 0 ORDER BY c.nombres`
  );
  for (const f of filas) {
    f.limite_txt = !f.credito ? 'Sin crédito' : f.limite == null ? 'Sin límite' : f.limite;
    f.ultimo_abono = f.ultimo_abono ? fmtFecha(f.ultimo_abono) : '';
  }
  await exportarCSV('clientes', [
    ['id', 'Folio'],
    ['nombres', 'Nombre'],
    ['apellidos', 'Apellido'],
    ['email', 'Email'],
    ['telefono', 'Teléfono'],
    ['domicilio1', 'Domicilio'],
    ['domicilio2', 'Domicilio 2'],
    ['colonia', 'Barrio'],
    ['municipio', 'Municipio'],
    ['estado', 'Departamento'],
    ['cp', 'CP'],
    ['notas', 'Notas'],
    ['limite_txt', 'Límite de crédito'],
    ['saldo', 'Saldo actual'],
    ['ultimo_abono', 'Fecha del último abono'],
    ['nit', 'NIT'],
    ['razon_social', 'Razón social'],
  ], filas);
}
