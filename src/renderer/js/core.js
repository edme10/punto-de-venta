// Utilidades compartidas por todos los módulos: base de datos, configuración,
// sesión, permisos, formato de números/fechas y diálogos modales.

// ---------------------------------------------------------------- Base de datos
export const q = (sql, params = []) => window.api.query(sql, params);
export const q1 = async (sql, params = []) => (await q(sql, params))[0] || null;
export const run = (sql, params = []) => window.api.run(sql, params);
// pasos: [{sql, params}] — '$ref:N' en params = id insertado por el paso N.
export const tx = pasos => window.api.tx(pasos);

// ---------------------------------------------------------------- Configuración
export const CONFIG_DEFAULT = {
  configurado: false,
  negocio_nombre: 'Mi Negocio',
  negocio_giro: '',
  // Opciones habilitadas
  usar_inventario: true,
  metodo_costo: 'PROMEDIO', // PROMEDIO | ULTIMO
  ofrecer_credito: true,
  producto_comun: true,
  margen_auto: 0, // % (0 = desactivado)
  redondeo: 'NINGUNO', // NINGUNO | DECIMAS | MEDIOS | ENTEROS_100 (redondea a centena)
  alerta_texto: '',
  alerta_cada: 0,
  permitir_sin_existencia: true,
  // Moneda
  moneda_simbolo: '$',
  moneda_miles: '.',
  moneda_decimal: ',',
  moneda_decimales: 0,
  // Formas de pago
  pago_efectivo_estricto: true,
  pago_dolares: false,
  tipo_cambio: 4000,
  pago_tarjeta: true,
  comision_tarjeta: 0,
  pago_transferencia: true,
  nombre_transferencia: 'Transferencia',
  pago_cheque: false,
  pago_vales: false,
  pago_mixto: true,
  // Impuestos
  usar_impuestos: false,
  precios_con_impuestos: true,
  desglosar_impuestos: false,
  // Corte
  corte_solicitar_esperado: true,
  limite_efectivo: 0,
  limite_comportamiento: 'IGNORAR', // IGNORAR | ADVERTIR | BLOQUEAR
  limite_mensaje: 'Has superado el límite de efectivo en caja. Realiza un retiro.',
  // Folios
  folio_leyenda: 'Ticket',
  // Ticket
  ticket_lineas_arriba: 0,
  ticket_lineas_abajo: 3,
  ticket_encabezado: ['Mi Negocio', 'Dirección del negocio', 'Tel. 000 000 0000'],
  ticket_pie: ['¡Gracias por su compra!'],
  ticket_logo: '', // dataURL
  ticket_precio_unitario: true,
  ticket_descripcion_completa: false,
  ticket_datos_cliente: false,
  ticket_campos_cliente: ['nombre', 'telefono', 'domicilio1'],
  // Impresora
  impresora: '', // '' = diálogo del sistema; '-' = no usar impresora
  ticket_fuente: 'Courier New',
  ticket_tamano: 10,
  ticket_columnas: 32,
  ticket_negritas: 'TOTALES', // TOTALES | NORMAL | TODO
  // Dispositivos
  cajon_abrir: false,
  bascula_bandera: '20',
  bascula_tipo: 'PESO', // PESO | PRECIO
  // Unidades
  unidades: ['Kg', 'Gr'],
  // Respaldo
  respaldo_carpeta: '',
  respaldo_al_salir: false,
  // Logotipo del programa
  logo_programa: '',
};

let configCache = { ...CONFIG_DEFAULT };

export async function cargarConfig() {
  const filas = await q('SELECT clave, valor FROM config');
  configCache = { ...CONFIG_DEFAULT };
  for (const f of filas) {
    try {
      configCache[f.clave] = JSON.parse(f.valor);
    } catch {
      configCache[f.clave] = f.valor;
    }
  }
  return configCache;
}

export const cfg = clave => configCache[clave];

export async function setCfg(clave, valor) {
  configCache[clave] = valor;
  await run('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', [
    clave,
    JSON.stringify(valor),
  ]);
}

// ---------------------------------------------------------------- Sesión y permisos
export const sesion = {
  usuario: null, // fila de usuarios + permisos parseados (Set)
  turno: null, // fila de turnos
  caja: { id: 1, nombre: 'Caja principal' },
};

export const PERMISOS = {
  Ventas: {
    venta_comun: 'Utilizar producto común',
    venta_mayoreo: 'Aplicar mayoreo',
    venta_descuento: 'Aplicar descuento',
    venta_historial: 'Revisar el historial de ventas',
    caja_entradas: 'Registrar entradas de efectivo',
    caja_salidas: 'Registrar salidas de efectivo',
    venta_cobrar: 'Cobrar un ticket',
    venta_credito: 'Cobrar a crédito',
    venta_cancelar: 'Cancelar tickets y devolver artículos',
    venta_eliminar_art: 'Eliminar artículos de venta',
    venta_buscador: 'Usar buscador de productos',
  },
  Clientes: {
    clientes_editar: 'Crear, modificar o eliminar clientes',
    clientes_asignar: 'Asignar cliente a una venta',
    clientes_credito: 'Asignar o remover crédito a clientes',
    creditos_ver: 'Ver cuenta, recibir abonos y reportes de clientes a crédito',
  },
  Productos: {
    productos_crear: 'Crear nuevos productos',
    productos_modificar: 'Modificar productos',
    productos_eliminar: 'Eliminar productos',
    productos_reporte: 'Ver reporte de ventas por período',
    productos_promociones: 'Crear promociones',
    productos_masivo: 'Modificar varios productos a la vez',
  },
  Inventario: {
    inventario_agregar: 'Agregar mercancía',
    inventario_reportes: 'Ver reportes de existencias y mínimos',
    inventario_movimientos: 'Ver movimientos de inventario',
    inventario_ajustar: 'Ajustar el inventario',
  },
  Otros: {
    corte_turno: 'Realizar el corte de su turno y ver efectivo esperado',
    corte_todos: 'Realizar el corte de todos los turnos',
    corte_dia: 'Realizar el corte del día (todos los turnos)',
    ver_ganancia: 'Ver la ganancia del día',
    configuracion: 'Cambiar la configuración del programa',
    reportes: 'Acceder a los reportes de ventas y ganancias',
    compras_crear: 'Crear órdenes de compra',
    compras_recibir: 'Recibir órdenes de compra',
  },
};

// Permisos con los que se crea un cajero nuevo.
export const PERMISOS_CAJERO_DEFAULT = [
  'venta_cobrar',
  'venta_buscador',
  'venta_comun',
  'venta_mayoreo',
  'venta_historial',
  'caja_entradas',
  'clientes_asignar',
  'corte_turno',
];

export function puede(permiso) {
  const u = sesion.usuario;
  if (!u) return false;
  if (u.es_admin) return true;
  return u.permisosSet.has(permiso);
}

// Verifica el permiso; si falta, avisa y devuelve false.
export function exigir(permiso) {
  if (puede(permiso)) return true;
  const etiqueta = Object.values(PERMISOS).reduce((a, g) => a || g[permiso], null) || permiso;
  alerta(`No tienes permiso para: <b>${esc(etiqueta)}</b>.`, 'Acceso restringido');
  return false;
}

// ---------------------------------------------------------------- Números y moneda
export function redondear(n, dec = 2) {
  const f = 10 ** dec;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

function formatoNumero(n, decimales) {
  const miles = cfg('moneda_miles');
  const decimal = cfg('moneda_decimal');
  const neg = n < 0;
  const [ent, frac] = Math.abs(redondear(n, decimales)).toFixed(decimales).split('.');
  const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, miles);
  return (neg ? '-' : '') + entFmt + (frac ? decimal + frac : '');
}

// Formato de dinero: $1.234,50
export function dinero(n) {
  n = Number(n) || 0;
  const s = cfg('moneda_simbolo') + formatoNumero(Math.abs(n), cfg('moneda_decimales'));
  return n < 0 && redondear(n, cfg('moneda_decimales')) !== 0 ? '-' + s : s;
}

// Formato de cantidad: enteros sin decimales, granel hasta 3.
export function cant(n) {
  n = Number(n) || 0;
  if (Number.isInteger(redondear(n, 3))) return formatoNumero(n, 0);
  return formatoNumero(n, 3).replace(new RegExp('\\' + cfg('moneda_decimal') + '?0+$'), '');
}

export const pct = n => formatoNumero(Number(n) || 0, 2).replace(/[.,]00$/, '') + '%';

// Interpreta un número escrito por el usuario respetando los separadores configurados.
export function num(texto) {
  if (typeof texto === 'number') return texto;
  let s = String(texto ?? '').trim().replace(/[^\d.,\-]/g, '');
  if (!s) return 0;
  const miles = cfg('moneda_miles');
  const decimal = cfg('moneda_decimal');
  if (s.includes(decimal) && decimal !== miles) {
    s = s.split(miles).join('').replace(decimal, '.');
  } else if (miles === '.' && /^\-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.split('.').join('');
  } else {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// Valor para mostrar en un <input> editable (sin símbolo ni miles).
export function numInput(n, dec = 2) {
  n = redondear(Number(n) || 0, dec);
  return String(n).replace('.', cfg('moneda_decimal'));
}

// Redondeo de centavos configurado, aplicado al total a cobrar.
export function redondearTotal(total) {
  switch (cfg('redondeo')) {
    case 'DECIMAS':
      return Math.ceil(redondear(total * 10, 4)) / 10;
    case 'MEDIOS':
      return Math.round(total * 2) / 2;
    case 'ENTEROS_100':
      return Math.round(total / 100) * 100;
    case 'ENTEROS_50':
      return Math.round(total / 50) * 50;
    default:
      return redondear(total, Math.max(2, cfg('moneda_decimales')));
  }
}

// ---------------------------------------------------------------- Fechas
const pad = n => String(n).padStart(2, '0');
export const fechaISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ahoraISO = (d = new Date()) => `${fechaISO(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fmtFecha(iso) {
  if (!iso) return '';
  const [f] = iso.split(' ');
  const [a, m, d] = f.split('-');
  return `${d}/${MESES[Number(m) - 1]}/${a}`;
}
export const fmtHora = iso => (iso ? iso.slice(11, 16) : '');
export const fmtFechaHora = iso => (iso ? `${fmtFecha(iso)} ${fmtHora(iso)}` : '');

export function sumarDias(fechaIso, dias) {
  const [a, m, d] = fechaIso.split('-').map(Number);
  return fechaISO(new Date(a, m - 1, d + dias));
}

// Rangos predefinidos para reportes. Devuelve {desde, hasta} (fechas ISO inclusive).
export function rangoPeriodo(clave) {
  const hoy = new Date();
  const h = fechaISO(hoy);
  switch (clave) {
    case 'HOY':
      return { desde: h, hasta: h };
    case 'AYER':
      return { desde: sumarDias(h, -1), hasta: sumarDias(h, -1) };
    case 'SEMANA': {
      const dow = (hoy.getDay() + 6) % 7; // lunes = 0
      return { desde: sumarDias(h, -dow), hasta: h };
    }
    case 'MES':
      return { desde: h.slice(0, 8) + '01', hasta: h };
    case 'MES_ANTERIOR': {
      const ini = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      return { desde: fechaISO(ini), hasta: fechaISO(fin) };
    }
    case 'ANIO':
      return { desde: h.slice(0, 4) + '-01-01', hasta: h };
    default:
      return { desde: h, hasta: h };
  }
}

export const PERIODOS = [
  ['HOY', 'Hoy'],
  ['AYER', 'Ayer'],
  ['SEMANA', 'Semana actual'],
  ['MES', 'Mes actual'],
  ['MES_ANTERIOR', 'Mes anterior'],
  ['ANIO', 'Año actual'],
  ['PERIODO', 'Periodo…'],
];

// ---------------------------------------------------------------- HTML
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function iniciales(nombre) {
  return String(nombre || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');
}

export function colorAvatar(texto) {
  let hsh = 0;
  for (const c of String(texto)) hsh = (hsh * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${hsh} 55% 45%)`;
}

// ---------------------------------------------------------------- Avisos
export function toast(mensaje, tipo = 'ok') {
  const t = h(`<div class="toast toast-${tipo}">${esc(mensaje)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('visible'), 10);
  setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

// ---------------------------------------------------------------- Modales
const pilaModales = [];

export const modalAbierto = () => pilaModales[pilaModales.length - 1] || null;

// Abre un diálogo modal. opciones: {titulo, html, ancho, clase, onKey(e, m), onAbrir(m), cerrarConEsc}
// Devuelve el objeto modal: {el, cuerpo, cerrar(valor), promesa}.
export function abrirModal({ titulo = '', html = '', ancho = 520, clase = '', onKey, onAbrir, cerrarConEsc = true }) {
  const fondo = h(`
    <div class="modal-fondo">
      <div class="modal ${clase}" style="width:${typeof ancho === 'number' ? ancho + 'px' : ancho}">
        ${titulo ? `<div class="modal-titulo">${titulo}</div>` : ''}
        <div class="modal-cuerpo"></div>
      </div>
    </div>`);
  const cuerpo = fondo.querySelector('.modal-cuerpo');
  if (typeof html === 'string') cuerpo.innerHTML = html;
  else cuerpo.appendChild(html);
  document.body.appendChild(fondo);

  let resolver;
  const m = {
    el: fondo.querySelector('.modal'),
    cuerpo,
    promesa: new Promise(r => (resolver = r)),
    cerrar(valor = null) {
      const i = pilaModales.indexOf(m);
      if (i >= 0) pilaModales.splice(i, 1);
      fondo.remove();
      resolver(valor);
      document.dispatchEvent(new CustomEvent('modal-cerrado'));
    },
    onKey(e) {
      if (onKey && onKey(e, m) === true) return true;
      if (e.key === 'Escape' && cerrarConEsc) {
        m.cerrar(null);
        return true;
      }
      return false;
    },
  };
  pilaModales.push(m);
  if (onAbrir) onAbrir(m);
  const primero = cuerpo.querySelector('[autofocus]') || cuerpo.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea, button');
  if (primero) setTimeout(() => {
    primero.focus();
    if (primero.select) primero.select();
  }, 0);
  return m;
}

export function alerta(mensaje, titulo = 'Aviso') {
  const m = abrirModal({
    titulo,
    ancho: 440,
    html: `<p class="mensaje">${mensaje}</p>
      <div class="botones"><button class="btn btn-primario" data-ok autofocus>Aceptar</button></div>`,
    onKey: (e, m) => {
      if (e.key === 'Enter') {
        m.cerrar(true);
        return true;
      }
    },
  });
  m.cuerpo.querySelector('[data-ok]').onclick = () => m.cerrar(true);
  return m.promesa;
}

export function confirmar(mensaje, { titulo = 'Confirmar', si = 'Sí', no = 'No', peligro = false } = {}) {
  const m = abrirModal({
    titulo,
    ancho: 460,
    html: `<p class="mensaje">${mensaje}</p>
      <div class="botones">
        <button class="btn" data-no>${esc(no)}</button>
        <button class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" data-si autofocus>${esc(si)}</button>
      </div>`,
  });
  m.cuerpo.querySelector('[data-si]').onclick = () => m.cerrar(true);
  m.cuerpo.querySelector('[data-no]').onclick = () => m.cerrar(false);
  return m.promesa.then(v => !!v);
}

// Formulario rápido. campos: [{nombre, etiqueta, tipo: 'texto'|'numero'|'dinero'|'clave'|'select'|'area'|'check', valor, opciones: [[valor, texto]], requerido}]
// Devuelve un objeto {nombre: valor} o null si se canceló. Los números se devuelven ya interpretados.
export function formulario({ titulo, campos, aceptar = 'Aceptar', ancho = 460, nota = '', validar }) {
  const html = `
    <form class="form-rapido">
      ${nota ? `<p class="nota">${nota}</p>` : ''}
      ${campos
        .map((c, i) => {
          const id = `fr_${c.nombre}`;
          const af = i === 0 ? 'autofocus' : '';
          if (c.tipo === 'check')
            return `<label class="check"><input type="checkbox" name="${c.nombre}" ${c.valor ? 'checked' : ''}> ${esc(c.etiqueta)}</label>`;
          let input;
          if (c.tipo === 'select')
            input = `<select id="${id}" name="${c.nombre}" ${af}>${c.opciones
              .map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(c.valor) ? 'selected' : ''}>${esc(t)}</option>`)
              .join('')}</select>`;
          else if (c.tipo === 'area') input = `<textarea id="${id}" name="${c.nombre}" rows="3" ${af}>${esc(c.valor ?? '')}</textarea>`;
          else {
            const tipo = c.tipo === 'clave' ? 'password' : 'text';
            const valor = c.tipo === 'numero' || c.tipo === 'dinero' ? numInput(c.valor ?? 0, 3) : c.valor ?? '';
            const cls = c.tipo === 'numero' || c.tipo === 'dinero' ? 'num' : '';
            input = `<input id="${id}" type="${tipo}" class="${cls}" name="${c.nombre}" value="${esc(valor)}" ${af} ${c.maximo ? `maxlength="${c.maximo}"` : ''}>`;
          }
          return `<label for="${id}">${esc(c.etiqueta)}</label>${input}`;
        })
        .join('')}
      <div class="botones">
        <button type="button" class="btn" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn-primario">${esc(aceptar)}</button>
      </div>
    </form>`;
  const m = abrirModal({ titulo, html, ancho });
  const form = m.cuerpo.querySelector('form');
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  form.onsubmit = async e => {
    e.preventDefault();
    const res = {};
    for (const c of campos) {
      const el = form.elements[c.nombre];
      if (c.tipo === 'check') res[c.nombre] = el.checked;
      else if (c.tipo === 'numero' || c.tipo === 'dinero') res[c.nombre] = num(el.value);
      else res[c.nombre] = el.value.trim();
      if (c.requerido && (res[c.nombre] === '' || res[c.nombre] === 0 && c.tipo !== 'numero')) {
        el.focus();
        el.classList.add('error');
        return;
      }
    }
    if (validar) {
      const err = await validar(res);
      if (err) {
        await alerta(esc(err));
        return;
      }
    }
    m.cerrar(res);
  };
  // ENTER avanza entre campos; en el último envía.
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    const inputs = [...form.querySelectorAll('input:not([type=checkbox]), select, textarea')];
    const i = inputs.indexOf(e.target);
    if (i >= 0 && i < inputs.length - 1) {
      e.preventDefault();
      inputs[i + 1].focus();
      inputs[i + 1].select?.();
    }
  });
  return m.promesa;
}

// ---------------------------------------------------------------- Exportar
// Exporta a CSV (abre directamente en Excel). columnas: [[clave, titulo]]
export async function exportarCSV(nombre, columnas, filas) {
  const sep = cfg('moneda_decimal') === ',' ? ';' : ',';
  const celda = v => {
    if (typeof v === 'number') v = String(v).replace('.', cfg('moneda_decimal'));
    const s = String(v ?? '');
    return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [columnas.map(c => celda(c[1])).join(sep)];
  for (const f of filas) lineas.push(columnas.map(c => celda(f[c[0]])).join(sep));
  const ruta = await window.api.guardarTexto(nombre.endsWith('.csv') ? nombre : nombre + '.csv', lineas.join('\r\n'));
  if (ruta) toast('Archivo exportado');
  return ruta;
}

// Lee un CSV (separador , o ;) y devuelve una matriz de celdas.
export function parsearCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda);
      if (fila.some(x => x !== '')) filas.push(fila);
      fila = [];
      celda = '';
    } else celda += c;
  }
  fila.push(celda);
  if (fila.some(x => x !== '')) filas.push(fila);
  return filas;
}

// ---------------------------------------------------------------- Selector de periodo
// Inserta un selector de periodo (select + fechas). onCambio({desde, hasta}).
export function selectorPeriodo(contenedor, onCambio, inicial = 'HOY') {
  const el = h(`
    <div class="selector-periodo">
      <select>${PERIODOS.map(([v, t]) => `<option value="${v}" ${v === inicial ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <span class="rango"><input type="date" data-desde> a <input type="date" data-hasta></span>
    </div>`);
  contenedor.appendChild(el);
  const sel = el.querySelector('select');
  const desde = el.querySelector('[data-desde]');
  const hasta = el.querySelector('[data-hasta]');
  const aplicar = () => {
    if (sel.value !== 'PERIODO') {
      const r = rangoPeriodo(sel.value);
      desde.value = r.desde;
      hasta.value = r.hasta;
    }
    el.querySelector('.rango').classList.toggle('editable', sel.value === 'PERIODO');
    desde.disabled = hasta.disabled = sel.value !== 'PERIODO';
    onCambio({ desde: desde.value, hasta: hasta.value });
  };
  sel.onchange = aplicar;
  desde.onchange = hasta.onchange = () => onCambio({ desde: desde.value, hasta: hasta.value });
  aplicar();
  return { valor: () => ({ desde: desde.value, hasta: hasta.value }) };
}

// ---------------------------------------------------------------- Gráfica de barras (SVG)
export function graficaBarras(datos, { alto = 220, formato = dinero } = {}) {
  if (!datos.length) return '<p class="vacio">Sin datos en el periodo.</p>';
  const max = Math.max(...datos.map(d => d.valor), 1);
  const ancho = Math.max(600, datos.length * 34);
  const bw = ancho / datos.length;
  const barras = datos
    .map((d, i) => {
      const bh = (d.valor / max) * (alto - 40);
      const x = i * bw + bw * 0.15;
      const y = alto - 22 - bh;
      return `<g><title>${esc(d.etiqueta)}: ${esc(formato(d.valor))}</title>
        <rect x="${x}" y="${y}" width="${bw * 0.7}" height="${bh}" rx="3" class="barra"/>
        <text x="${x + bw * 0.35}" y="${alto - 6}" class="eje" text-anchor="middle">${esc(d.etiqueta)}</text></g>`;
    })
    .join('');
  return `<svg class="grafica" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none">${barras}</svg>`;
}
