// Módulo Corte: corte de turno (cajero), corte del día, historial y cierre de turno.
import {
  q, q1, run, tx, cfg, sesion, puede, exigir, abrirModal, alerta, toast,
  esc, dinero, num, numInput, redondear, fechaISO, ahoraISO, fmtFecha, fmtHora, fmtFechaHora, $,
} from '../core.js';
import { efectivoEnCaja } from '../servicios.js';
import { calculadora } from '../componentes.js';
import { imprimirLineas, dos, centrar, separador, nombreForma } from '../ticket.js';

// ---------------------------------------------------------------- Cálculo del corte
// filtro: {tipo: 'turno', turno} | {tipo: 'dia', fecha}
function condicion(filtro, alias, campoFecha = 'fecha') {
  if (filtro.tipo === 'turno') return { sql: `${alias}.turno_id = ?`, params: [filtro.turno.id] };
  return { sql: `date(${alias}.${campoFecha}) = ?`, params: [filtro.fecha] };
}

export async function calcularCorte(filtro) {
  const cv = condicion(filtro, 'v');
  const cd = condicion(filtro, 'd');
  const cm = condicion(filtro, 'm');
  const cc = condicion(filtro, 'mc');

  // Fondo de caja
  let fondo;
  if (filtro.tipo === 'turno') fondo = filtro.turno.fondo || 0;
  else fondo = (await q1('SELECT COALESCE(SUM(fondo), 0) AS f FROM turnos WHERE date(inicio) = ?', [filtro.fecha])).f;

  const ventas = await q1(
    `SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(comision), 0) AS comision FROM ventas v WHERE ${cv.sql}`,
    cv.params
  );
  const gan = await q1(
    `SELECT COALESCE(SUM((r.precio - r.costo) * r.cantidad), 0) AS g FROM venta_renglones r JOIN ventas v ON v.id = r.venta_id WHERE ${cv.sql}`,
    cv.params
  );
  const devTot = await q1(
    `SELECT COALESCE(SUM(monto), 0) AS monto, COALESCE(SUM(costo), 0) AS costo,
            COALESCE(SUM(CASE WHEN forma_reembolso = 'EFECTIVO' THEN monto ELSE 0 END), 0) AS efectivo
     FROM devoluciones d WHERE ${cd.sql}`,
    cd.params
  );
  const pagos = await q(
    `SELECT vp.forma, COALESCE(SUM(vp.monto), 0) AS monto FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
     WHERE ${cv.sql} GROUP BY vp.forma`,
    cv.params
  );
  const porForma = Object.fromEntries(pagos.map(p => [p.forma, p.monto]));

  const creditos = await q(
    `SELECT m.*, TRIM(c.nombres || ' ' || COALESCE(c.apellidos, '')) AS cliente FROM movimientos_credito m
     JOIN clientes c ON c.id = m.cliente_id
     WHERE ${cm.sql} AND m.tipo IN ('ABONO', 'LIQUIDAR', 'DEV_ABONO') ORDER BY m.id`,
    cm.params
  );
  const abonosEfectivo = creditos.filter(m => m.forma_pago === 'EFECTIVO').reduce((a, m) => a - m.monto, 0);

  const movCaja = await q(
    `SELECT mc.* FROM movimientos_caja mc WHERE ${cc.sql} AND mc.cancelado = 0 ORDER BY mc.id`,
    cc.params
  );
  const entradas = movCaja.filter(m => m.tipo === 'ENTRADA');
  const salidas = movCaja.filter(m => m.tipo === 'SALIDA');
  const suma = l => l.reduce((a, m) => a + m.monto, 0);

  const departamentos = await q(
    `SELECT COALESCE(dp.nombre, '- Sin departamento -') AS nombre, SUM(r.importe) AS ventas,
            SUM((r.precio - r.costo) * r.cantidad) AS ganancia
     FROM venta_renglones r JOIN ventas v ON v.id = r.venta_id LEFT JOIN departamentos dp ON dp.id = r.departamento_id
     WHERE ${cv.sql} GROUP BY dp.nombre ORDER BY ventas DESC`,
    cv.params
  );

  const devoluciones = await q(
    `SELECT d.*, r.descripcion FROM devoluciones d LEFT JOIN venta_renglones r ON r.id = d.renglon_id
     WHERE ${cd.sql} ORDER BY d.id`,
    cd.params
  );

  // Impuestos: base = importe - impuesto; por tasa: cobrado = base * tasa.
  const impuestos = {};
  if (cfg('usar_impuestos')) {
    const rs = await q(
      `SELECT r.importe, r.impuesto, r.tasas FROM venta_renglones r JOIN ventas v ON v.id = r.venta_id WHERE ${cv.sql} AND r.impuesto > 0`,
      cv.params
    );
    for (const r of rs) {
      let tasas = [];
      try {
        tasas = JSON.parse(r.tasas || '[]');
      } catch {
        /* sin tasas */
      }
      const base = r.importe - r.impuesto;
      for (const t of tasas) {
        const k = `${t.nombre} (${t.tasa}%)`;
        impuestos[k] = impuestos[k] || { cobrado: 0, gravado: 0 };
        impuestos[k].cobrado += (base * t.tasa) / 100;
        impuestos[k].gravado += base;
      }
    }
  }

  const clientes = await q(
    `SELECT TRIM(c.nombres || ' ' || COALESCE(c.apellidos, '')) AS nombre, SUM(v.total) AS ventas,
            SUM((SELECT COALESCE(SUM((r.precio - r.costo) * r.cantidad), 0) FROM venta_renglones r WHERE r.venta_id = v.id)) AS ganancia
     FROM ventas v JOIN clientes c ON c.id = v.cliente_id
     WHERE ${cv.sql} AND c.es_sistema = 0 GROUP BY c.id`,
    cv.params
  );

  const ventasEfectivo = (porForma.EFECTIVO || 0) + (porForma.DOLARES || 0);
  const dinero_caja = {
    fondo,
    ventas_efectivo: ventasEfectivo,
    abonos_efectivo: redondear(abonosEfectivo, 2),
    entradas: suma(entradas),
    salidas: suma(salidas),
    devoluciones_efectivo: devTot.efectivo,
  };
  dinero_caja.total = redondear(
    fondo + ventasEfectivo + dinero_caja.abonos_efectivo + dinero_caja.entradas - dinero_caja.salidas - devTot.efectivo,
    2
  );

  const ingresosContado = pagos.filter(p => p.forma !== 'CREDITO').reduce((a, p) => a + p.monto, 0);

  return {
    tipo: filtro.tipo,
    calculado: ahoraISO(),
    num_ventas: ventas.n,
    ventas_totales: redondear(ventas.total - devTot.monto, 2),
    comisiones: ventas.comision,
    ganancia: redondear(gan.g - (devTot.monto - devTot.costo), 2),
    dinero_caja,
    por_forma: porForma,
    devoluciones_total: devTot.monto,
    ingresos_contado: redondear(ingresosContado - devTot.efectivo, 2),
    entradas: entradas.map(m => ({ fecha: m.fecha, descripcion: m.descripcion, monto: m.monto })),
    salidas: salidas.map(m => ({ fecha: m.fecha, descripcion: m.descripcion, monto: m.monto })),
    departamentos,
    devoluciones: devoluciones.map(d => ({
      fecha: d.fecha,
      venta_id: d.venta_id,
      descripcion: d.tipo === 'CANCELACION' ? 'Cancelación de venta' : d.descripcion || 'Devolución',
      monto: d.monto,
      forma: d.forma_reembolso,
    })),
    impuestos,
    pagos_creditos: creditos.map(m => ({
      fecha: m.fecha,
      cliente: m.cliente,
      tipo: m.tipo,
      forma: m.forma_pago,
      monto: -m.monto,
      cancelado: m.cancelado,
    })),
    clientes_ventas: [...clientes].sort((a, b) => b.ventas - a.ventas).slice(0, 5),
    clientes_ganancia: [...clientes].sort((a, b) => b.ganancia - a.ganancia).slice(0, 5),
  };
}

// ---------------------------------------------------------------- Utilidades
function duracion(inicio, fin) {
  const a = new Date(inicio.replace(' ', 'T'));
  const b = fin ? new Date(fin.replace(' ', 'T')) : new Date();
  const min = Math.max(0, Math.round((b - a) / 60000));
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

const FORMAS_ORDEN = ['EFECTIVO', 'TARJETA', 'CREDITO', 'VALE', 'TRANSFERENCIA', 'CHEQUE', 'DOLARES'];
const ETIQUETAS_VENTA = {
  EFECTIVO: 'En efectivo',
  TARJETA: 'Con tarjeta',
  CREDITO: 'A crédito',
  VALE: 'Con vales',
  TRANSFERENCIA: () => 'Con ' + (cfg('nombre_transferencia') || 'transferencia').toLowerCase(),
  CHEQUE: 'Con cheque',
  DOLARES: 'En dólares',
};
const etiquetaForma = f => {
  const e = ETIQUETAS_VENTA[f];
  return typeof e === 'function' ? e() : e || f;
};

const NOMBRES_CREDITO = { ABONO: 'Abono', LIQUIDAR: 'Liquidación', DEV_ABONO: 'Cancelación de abono' };

async function turnosDeFecha(fecha) {
  return q(
    `SELECT t.*, u.nombre AS cajero, c.nombre AS caja FROM turnos t JOIN usuarios u ON u.id = t.usuario_id
     LEFT JOIN cajas c ON c.id = t.caja_id WHERE date(t.inicio) = ? ORDER BY t.id`,
    [fecha]
  );
}

// ---------------------------------------------------------------- Cierre de turno
export async function cerrarTurno() {
  if (!puede('corte_turno') && !puede('corte_todos')) {
    exigir('corte_turno');
    return false;
  }
  const turno = await q1('SELECT * FROM turnos WHERE id = ?', [sesion.turno.id]);
  if (!turno || turno.estado !== 'ABIERTO') {
    await alerta('El turno ya está cerrado.');
    return false;
  }
  const esperado = await efectivoEnCaja(turno.id);
  const solicitar = cfg('corte_solicitar_esperado');
  const verEsperado = solicitar && (puede('corte_turno') || puede('corte_todos'));

  const m = abrirModal({
    titulo: 'CIERRE DE TURNO',
    ancho: 500,
    html: solicitar
      ? `
      <p class="mensaje">Por favor cuenta el dinero en caja e ingrésalo para proceder con el cierre de turno.</p>
      <div class="form-grid">
        ${verEsperado ? `<label>Efectivo esperado en caja</label><div class="cierre-esperado">${dinero(esperado)}</div>` : ''}
        <label>¿Cuánto efectivo hay en caja?</label>
        <div class="fila"><input class="num grande cierre-contado" data-contado autofocus><button type="button" class="btn btn-icono" data-calc title="Calculadora">🖩</button></div>
        ${verEsperado ? `<label>Diferencia</label><div data-diferencia class="cierre-diferencia"></div>` : ''}
      </div>
      <div class="botones">
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-primario" data-cerrar>🔒 Cerrar turno</button>
      </div>`
      : `
      <p class="mensaje">¿Deseas cerrar el turno #${turno.id}? Al cerrar, la aplicación se cerrará y quedará lista para un nuevo turno.</p>
      <div class="form-grid"><label>Efectivo en caja (opcional)</label><input class="num" data-contado></div>
      <div class="botones">
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-primario" data-cerrar>🔒 Cerrar turno</button>
      </div>`,
    onKey: (e, m) => {
      if (e.key === 'Enter' && e.target.matches('[data-contado]')) {
        confirmarCierre();
        return true;
      }
    },
  });
  const input = m.cuerpo.querySelector('[data-contado]');
  const difEl = m.cuerpo.querySelector('[data-diferencia]');
  const pintarDif = () => {
    if (!difEl) return;
    if (!input.value.trim()) {
      difEl.textContent = '';
      return;
    }
    const d = redondear(num(input.value) - esperado, 2);
    difEl.className = 'cierre-diferencia ' + (Math.abs(d) < 0.01 ? 'ok' : d < 0 ? 'faltante' : 'sobrante');
    difEl.textContent =
      Math.abs(d) < 0.01 ? '¡Excelente! Todo en orden' : d < 0 ? `Faltante: ${dinero(-d)}` : `Sobrante: ${dinero(d)}`;
  };
  input.oninput = pintarDif;
  const calc = m.cuerpo.querySelector('[data-calc]');
  if (calc)
    calc.onclick = async () => {
      const r = await calculadora('Cuenta el efectivo');
      if (r != null) {
        input.value = numInput(r, 2);
        pintarDif();
      }
      input.focus();
    };

  let confirmando = false;
  async function confirmarCierre() {
    if (confirmando) return;
    if (solicitar && !input.value.trim()) {
      input.classList.add('error');
      input.focus();
      return;
    }
    confirmando = true;
    const contado = input.value.trim() ? num(input.value) : esperado;
    const diferencia = redondear(contado - esperado, 2);
    const ahora = ahoraISO();
    const pasos = [];
    if (Math.abs(diferencia) >= 0.01) {
      pasos.push({
        sql: 'INSERT INTO movimientos_caja (turno_id, tipo, monto, descripcion, usuario_id, fecha) VALUES (?, ?, ?, ?, ?, ?)',
        params: [
          turno.id,
          diferencia < 0 ? 'SALIDA' : 'ENTRADA',
          Math.abs(diferencia),
          diferencia < 0 ? 'Faltante en cierre' : 'Sobrante en cierre',
          sesion.usuario.id,
          ahora,
        ],
      });
    }
    if (pasos.length) await tx(pasos);
    const corte = await calcularCorte({ tipo: 'turno', turno });
    corte.esperado = esperado;
    corte.contado = contado;
    corte.diferencia = diferencia;
    await run(
      `UPDATE turnos SET fin = ?, esperado = ?, contado = ?, diferencia = ?, estado = 'CERRADO', corte = ? WHERE id = ?`,
      [ahora, esperado, contado, diferencia, JSON.stringify(corte), turno.id]
    );
    m.cerrar(true);
  }
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(false);
  m.cuerpo.querySelector('[data-cerrar]').onclick = confirmarCierre;
  const ok = await m.promesa;
  if (ok) {
    await alerta('El turno se cerró correctamente. La aplicación se cerrará.', 'Turno cerrado');
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- Pantalla del corte
let raiz = null;
let vista = null; // {filtro, corte, turno}

export async function montar(el) {
  raiz = el;
  vista = null;
  el.innerHTML = `
    <div class="modulo-barra">Corte</div>
    <div class="sub-barra">
      <button class="btn" data-turno>👤 Hacer corte de cajero</button>
      <button class="btn" data-dia>📅 Hacer corte del día</button>
      <span class="espaciador"></span>
      <button class="btn" data-imprimir disabled>🖨 Imprimir</button>
      <button class="btn btn-primario" data-cerrar-turno>🔒 Cerrar turno…</button>
    </div>
    <div class="modulo-cuerpo" data-cuerpo>
      <div class="corte-vacio">
        <p>Por seguridad, la información del corte se muestra solo al pulsar un botón.</p>
        <p class="nota">Elige <b>Hacer corte de cajero</b> para tu turno actual o <b>Hacer corte del día</b> para consolidar todos los turnos.</p>
      </div>
    </div>`;
  $('[data-turno]', el).onclick = () => mostrarTurno(sesion.turno.id);
  $('[data-dia]', el).onclick = () => mostrarDia(fechaISO());
  $('[data-imprimir]', el).onclick = imprimir;
  $('[data-cerrar-turno]', el).onclick = async () => {
    if (await cerrarTurno()) {
      const { terminar } = await import('../app.js');
      await terminar();
    }
  };
  return {
    onKey: () => false,
    desmontar() {
      raiz = null;
    },
  };
}

async function mostrarTurno(turnoId) {
  if (!puede('corte_turno') && !puede('corte_todos')) return exigir('corte_turno');
  const turno = await q1(
    `SELECT t.*, u.nombre AS cajero, c.nombre AS caja FROM turnos t JOIN usuarios u ON u.id = t.usuario_id
     LEFT JOIN cajas c ON c.id = t.caja_id WHERE t.id = ?`,
    [turnoId]
  );
  if (!turno) return;
  if (turno.id !== sesion.turno.id && !puede('corte_todos')) return exigir('corte_todos');
  let corte;
  if (turno.estado === 'CERRADO' && turno.corte) {
    try {
      corte = JSON.parse(turno.corte);
    } catch {
      corte = null;
    }
  }
  if (!corte) corte = await calcularCorte({ tipo: 'turno', turno });
  vista = { filtro: { tipo: 'turno', turno }, corte, turno };
  pintar();
}

async function mostrarDia(fecha) {
  if (!exigir('corte_dia')) return;
  const corte = await calcularCorte({ tipo: 'dia', fecha });
  const turnos = await turnosDeFecha(fecha);
  vista = { filtro: { tipo: 'dia', fecha }, corte, turnos };
  pintar();
}

function lista(filas, vacio = 'Sin movimientos') {
  if (!filas.length) return `<p class="vacio">${vacio}</p>`;
  return `<table class="lista-montos">${filas.map(([a, b, cls = '']) => `<tr class="${cls}"><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
}

function pintar() {
  if (!raiz || !vista) return;
  const { corte: c, filtro } = vista;
  $('[data-imprimir]', raiz).disabled = false;
  const verGanancia = puede('ver_ganancia');
  const verEsperado = puede('corte_turno') || puede('corte_todos') || puede('corte_dia');

  let encabezado;
  if (filtro.tipo === 'turno') {
    const t = vista.turno;
    encabezado = `
      <div class="corte-encabezado">
        <div class="corte-titulo">Corte de <a href="#" data-elegir-turno>${esc(t.cajero)}</a> iniciado el
          <a href="#" data-elegir-fecha>${fmtFecha(t.inicio)}</a>
          ${t.estado === 'CERRADO' ? '<span class="etiqueta">CERRADO</span>' : '<span class="etiqueta verde">TURNO ACTUAL</span>'}</div>
        <div class="nota">De ${fmtFechaHora(t.inicio)} a ${t.fin ? fmtFechaHora(t.fin) : fmtFechaHora(ahoraISO()) + ' – (Turno actual)'}
          · Duración: ${duracion(t.inicio, t.fin)} · De la caja: ${esc(t.caja || '')} · Turno #${t.id}</div>
        ${t.estado === 'CERRADO' && t.contado != null ? `<div class="nota">Esperado: <b>${dinero(t.esperado)}</b> · Contado: <b>${dinero(t.contado)}</b> · Diferencia: <b class="${t.diferencia < 0 ? 'rojo' : ''}">${dinero(t.diferencia)}</b></div>` : ''}
      </div>`;
  } else {
    encabezado = `
      <div class="corte-encabezado">
        <div class="corte-titulo">Corte del día <a href="#" data-elegir-fecha>${fmtFecha(filtro.fecha)}</a>
          <span class="etiqueta azul">TODOS LOS TURNOS</span></div>
        <div class="nota">Turnos: ${vista.turnos.map(t => `<a href="#" data-ver-turno="${t.id}">#${t.id} ${esc(t.cajero)} (${fmtHora(t.inicio)}${t.fin ? '–' + fmtHora(t.fin) : ''})</a>`).join(' · ') || 'ninguno'}</div>
      </div>`;
  }

  const dc = c.dinero_caja;
  const formas = FORMAS_ORDEN.filter(f => c.por_forma[f]);
  const impuestos = Object.entries(c.impuestos || {});

  $('[data-cuerpo]', raiz).innerHTML = `
    ${encabezado}
    <div class="kpis">
      <div class="kpi"><div class="etq">Ventas totales</div><div class="val">${dinero(c.ventas_totales)}</div><div class="nota">${c.num_ventas} ventas</div></div>
      ${verGanancia ? `<div class="kpi"><div class="etq">Ganancia</div><div class="val verde">${dinero(c.ganancia)}</div></div>` : ''}
      ${verEsperado ? `<div class="kpi"><div class="etq">Dinero en caja</div><div class="val">${dinero(dc.total)}</div></div>` : ''}
    </div>
    <div class="dos-col">
      <div>
        ${verEsperado ? `<div class="panel"><h3>Dinero en caja</h3>${lista([
          ['Fondo de caja', '+ ' + dinero(dc.fondo)],
          ['Ventas en efectivo', '+ ' + dinero(dc.ventas_efectivo)],
          ['Abonos en efectivo', '+ ' + dinero(dc.abonos_efectivo)],
          ['Entradas', '+ ' + dinero(dc.entradas)],
          ['Salidas', '− ' + dinero(dc.salidas), 'resta'],
          ['Devoluciones en efectivo', '− ' + dinero(dc.devoluciones_efectivo), 'resta'],
          ['Total', dinero(dc.total), 'total'],
        ])}</div>` : ''}
        <div class="panel"><h3>Ventas</h3>${lista([
          ...formas.map(f => [etiquetaForma(f), dinero(c.por_forma[f])]),
          ['Devoluciones de ventas', '− ' + dinero(c.devoluciones_total), 'resta'],
          ['Total', dinero(c.ventas_totales), 'total'],
        ])}${c.comisiones ? `<p class="nota">Comisiones por tarjeta cobradas: ${dinero(c.comisiones)} (no cuentan como ganancia).</p>` : ''}</div>
        <div class="panel"><h3>Ingresos de contado</h3>${lista([
          ...formas.filter(f => f !== 'CREDITO').map(f => ['Ventas ' + etiquetaForma(f).toLowerCase(), dinero(c.por_forma[f])]),
          ['Devoluciones en efectivo', '− ' + dinero(dc.devoluciones_efectivo), 'resta'],
          ['Total', dinero(c.ingresos_contado), 'total'],
        ])}</div>
        <div class="panel"><h3>Ventas por departamento</h3>${lista(
          c.departamentos.map(d => [esc(d.nombre), dinero(d.ventas) + (verGanancia ? ` <small class="nota">(gan. ${dinero(d.ganancia)})</small>` : '')]),
          'No hubo ventas'
        )}</div>
        ${impuestos.length ? `<div class="panel"><h3>Impuestos</h3>${lista(
          impuestos.flatMap(([k, v]) => [
            [esc(k) + ' – Cobrado', dinero(v.cobrado)],
            [esc(k) + ' – Ventas gravadas', dinero(v.gravado)],
          ])
        )}</div>` : ''}
      </div>
      <div>
        <div class="panel"><h3>Entradas de efectivo</h3>${lista(
          c.entradas.map(m => [`${fmtHora(m.fecha)} ${esc(m.descripcion || '')}`, dinero(m.monto)]),
          'No hubo entradas'
        )}</div>
        <div class="panel"><h3>Salidas de efectivo</h3>${lista(
          c.salidas.map(m => [`${fmtHora(m.fecha)} ${esc(m.descripcion || '')}`, dinero(m.monto)]),
          'No hubo salidas'
        )}</div>
        <div class="panel"><h3>Devoluciones</h3>${lista(
          c.devoluciones.map(d => [`${fmtHora(d.fecha)} ${esc(d.descripcion)} · ${esc(cfg('folio_leyenda'))} ${d.venta_id}${d.forma === 'CREDITO' ? ' (a crédito)' : ''}`, dinero(d.monto)]),
          'No hubo devoluciones'
        )}</div>
        <div class="panel"><h3>Pagos de créditos</h3>${lista(
          c.pagos_creditos.map(p => [
            `${fmtHora(p.fecha)} ${esc(p.cliente)} · ${NOMBRES_CREDITO[p.tipo] || p.tipo} · ${esc(nombreForma(p.forma))}`,
            dinero(p.monto),
            p.cancelado ? 'cancelado' : '',
          ]),
          'No se recibieron pagos de créditos'
        )}</div>
        <div class="panel"><h3>Clientes con más ventas</h3>${lista(
          c.clientes_ventas.map(x => [esc(x.nombre), dinero(x.ventas)]),
          'No hubo ventas'
        )}</div>
        ${verGanancia ? `<div class="panel"><h3>Clientes con más ganancia</h3>${lista(
          c.clientes_ganancia.map(x => [esc(x.nombre), dinero(x.ganancia)]),
          'No hubo ventas'
        )}</div>` : ''}
      </div>
    </div>`;

  const cuerpo = $('[data-cuerpo]', raiz);
  cuerpo.querySelector('[data-elegir-fecha]')?.addEventListener('click', e => {
    e.preventDefault();
    elegirFecha();
  });
  cuerpo.querySelector('[data-elegir-turno]')?.addEventListener('click', e => {
    e.preventDefault();
    elegirTurno(fechaDeVista());
  });
  cuerpo.querySelectorAll('[data-ver-turno]').forEach(a =>
    a.addEventListener('click', e => {
      e.preventDefault();
      mostrarTurno(Number(a.dataset.verTurno));
    })
  );
}

const fechaDeVista = () => (vista.filtro.tipo === 'dia' ? vista.filtro.fecha : vista.turno.inicio.slice(0, 10));

async function elegirFecha() {
  if (vista.filtro.tipo === 'turno' && !puede('corte_todos')) return exigir('corte_todos');
  const m = abrirModal({
    titulo: 'Consultar otra fecha',
    ancho: 360,
    html: `<div class="form-grid"><label>Fecha</label><input type="date" data-fecha value="${fechaDeVista()}" autofocus></div>
      <div class="botones"><button class="btn" data-cancelar>Cancelar</button><button class="btn btn-primario" data-ok>Aceptar</button></div>`,
    onKey: (e, m) => {
      if (e.key === 'Enter') {
        m.cerrar(m.cuerpo.querySelector('[data-fecha]').value);
        return true;
      }
    },
  });
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  m.cuerpo.querySelector('[data-ok]').onclick = () => m.cerrar(m.cuerpo.querySelector('[data-fecha]').value);
  const fecha = await m.promesa;
  if (!fecha) return;
  if (vista.filtro.tipo === 'dia') mostrarDia(fecha);
  else elegirTurno(fecha);
}

async function elegirTurno(fecha) {
  if (!puede('corte_todos')) return exigir('corte_todos');
  const turnos = await turnosDeFecha(fecha);
  if (!turnos.length) return toast(`No hay turnos el ${fmtFecha(fecha)}`, 'aviso');
  const m = abrirModal({
    titulo: `Turnos del ${fmtFecha(fecha)}`,
    ancho: 620,
    html: `<div class="tabla-scroll alto-340"><table class="tabla seleccionable"><thead><tr>
      <th>#</th><th>Cajero</th><th>Caja</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead><tbody>
      ${turnos
        .map(
          t => `<tr data-id="${t.id}"><td>${t.id}</td><td>${esc(t.cajero)}</td><td>${esc(t.caja || '')}</td>
          <td>${fmtHora(t.inicio)}</td><td>${t.fin ? fmtFechaHora(t.fin) : '—'}</td>
          <td>${t.estado === 'ABIERTO' ? '<span class="etiqueta verde">ABIERTO</span>' : '<span class="etiqueta">CERRADO</span>'}</td></tr>`
        )
        .join('')}</tbody></table></div>
      <div class="botones"><button class="btn" data-cancelar>Cancelar</button></div>`,
  });
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  m.cuerpo.querySelector('tbody').onclick = e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) m.cerrar(Number(tr.dataset.id));
  };
  const id = await m.promesa;
  if (id) mostrarTurno(id);
}

// ---------------------------------------------------------------- Impresión
async function imprimir() {
  if (!vista) return;
  const { corte: c, filtro } = vista;
  const verGanancia = puede('ver_ganancia');
  const l = [];
  for (const e of cfg('ticket_encabezado') || []) if (e) l.push({ t: e, c: true });
  l.push('');
  if (filtro.tipo === 'turno') {
    const t = vista.turno;
    l.push({ t: 'CORTE DE CAJERO', c: true, b: true });
    l.push(`Cajero: ${t.cajero}`, `Turno #${t.id} · ${t.caja || ''}`, `Inicio: ${fmtFechaHora(t.inicio)}`);
    l.push(`Fin: ${t.fin ? fmtFechaHora(t.fin) : 'Turno actual'}`);
  } else {
    l.push({ t: 'CORTE DEL DÍA', c: true, b: true }, centrar(fmtFecha(filtro.fecha)));
  }
  l.push(`Impreso: ${fmtFechaHora(ahoraISO())}`, separador());
  l.push({ t: dos('VENTAS TOTALES:', dinero(c.ventas_totales)), b: true });
  if (verGanancia) l.push(dos('Ganancia:', dinero(c.ganancia)));
  l.push(dos('Número de ventas:', String(c.num_ventas)), separador());
  l.push({ t: 'DINERO EN CAJA', b: true });
  const dc = c.dinero_caja;
  l.push(dos('Fondo de caja', '+' + dinero(dc.fondo)));
  l.push(dos('Ventas en efectivo', '+' + dinero(dc.ventas_efectivo)));
  l.push(dos('Abonos en efectivo', '+' + dinero(dc.abonos_efectivo)));
  l.push(dos('Entradas', '+' + dinero(dc.entradas)));
  l.push(dos('Salidas', '-' + dinero(dc.salidas)));
  l.push(dos('Devoluciones efectivo', '-' + dinero(dc.devoluciones_efectivo)));
  l.push({ t: dos('Total en caja:', dinero(dc.total)), b: true });
  if (filtro.tipo === 'turno' && vista.turno.contado != null) {
    l.push(dos('Contado:', dinero(vista.turno.contado)), dos('Diferencia:', dinero(vista.turno.diferencia)));
  }
  l.push(separador(), { t: 'VENTAS', b: true });
  for (const f of FORMAS_ORDEN) if (c.por_forma[f]) l.push(dos(etiquetaForma(f), dinero(c.por_forma[f])));
  l.push(dos('Devoluciones', '-' + dinero(c.devoluciones_total)));
  l.push({ t: dos('Total:', dinero(c.ventas_totales)), b: true });
  if (c.entradas.length) {
    l.push(separador(), { t: 'ENTRADAS', b: true });
    for (const m of c.entradas) l.push(dos(`${fmtHora(m.fecha)} ${m.descripcion || ''}`, dinero(m.monto)));
  }
  if (c.salidas.length) {
    l.push(separador(), { t: 'SALIDAS', b: true });
    for (const m of c.salidas) l.push(dos(`${fmtHora(m.fecha)} ${m.descripcion || ''}`, dinero(m.monto)));
  }
  if (c.departamentos.length) {
    l.push(separador(), { t: 'POR DEPARTAMENTO', b: true });
    for (const d of c.departamentos) l.push(dos(d.nombre, dinero(d.ventas)));
  }
  if (c.devoluciones.length) {
    l.push(separador(), { t: 'DEVOLUCIONES', b: true });
    for (const d of c.devoluciones) l.push(dos(`${fmtHora(d.fecha)} ${d.descripcion}`, dinero(d.monto)));
  }
  const imps = Object.entries(c.impuestos || {});
  if (imps.length) {
    l.push(separador(), { t: 'IMPUESTOS', b: true });
    for (const [k, v] of imps) l.push(dos(k + ' cobrado', dinero(v.cobrado)), dos(k + ' gravado', dinero(v.gravado)));
  }
  if (c.pagos_creditos.length) {
    l.push(separador(), { t: 'PAGOS DE CRÉDITOS', b: true });
    for (const p of c.pagos_creditos) l.push(dos(`${fmtHora(p.fecha)} ${p.cliente}`, dinero(p.monto)));
  }
  for (let i = 0; i < Number(cfg('ticket_lineas_abajo')); i++) l.push('');
  await imprimirLineas(l);
}
