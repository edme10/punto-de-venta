// Diálogo Cobrar (F12): formas de pago, cambio, comisión, notas.
import { cfg, puede, abrirModal, alerta, formulario, esc, dinero, cant, num, numInput, redondear } from '../core.js';
import { seleccionarCliente } from '../componentes.js';
import { nombreForma } from '../ticket.js';

export function formasHabilitadas({ permitirCredito = true } = {}) {
  const f = ['EFECTIVO'];
  if (permitirCredito && cfg('ofrecer_credito') && puede('venta_credito')) f.push('CREDITO');
  if (cfg('pago_dolares')) f.push('DOLARES');
  if (cfg('pago_vales')) f.push('VALE');
  if (cfg('pago_tarjeta')) f.push('TARJETA');
  if (cfg('pago_transferencia')) f.push('TRANSFERENCIA');
  if (cfg('pago_cheque')) f.push('CHEQUE');
  if (cfg('pago_mixto') && f.length > 1) f.push('MIXTO');
  return f;
}

const ICONOS = { EFECTIVO: '💵', CREDITO: '📒', DOLARES: '💲', VALE: '🎫', TARJETA: '💳', TRANSFERENCIA: '📲', CHEQUE: '🧾', MIXTO: '🔀' };

// Devuelve {forma, pagos, pago_con, cambio, comision, notas, referencia, cliente, imprimir} o null.
// opciones: {total, articulos, cliente, permitirCredito, titulo}
export function dialogoCobro({ total, articulos = 0, cliente = null, permitirCredito = true, titulo = 'COBRAR' }) {
  const formas = formasHabilitadas({ permitirCredito });
  let forma = 'EFECTIVO';
  let notas = '';
  let clienteCredito = cliente && cliente.credito ? cliente : null;
  const comisionPct = cfg('pago_tarjeta') ? Number(cfg('comision_tarjeta')) || 0 : 0;

  const m = abrirModal({
    titulo,
    ancho: 820,
    clase: 'modal-cobro',
    html: `
      <div class="cobro">
        <div class="cobro-izq">
          <div class="cobro-total"><span>Total a cobrar</span><b data-total>${dinero(total)}</b></div>
          <div class="cobro-formas">
            ${formas
              .map(
                (f, i) => `<button class="forma-pago" data-forma="${f}"><span class="ico">${ICONOS[f]}</span>${esc(nombreForma(f))}
                  <small>Alt+${i + 1}</small></button>`
              )
              .join('')}
          </div>
          <div class="cobro-detalle" data-detalle></div>
        </div>
        <div class="cobro-der">
          <button class="btn btn-verde grande" data-cobrar-imprimir><kbd>F1</kbd>Cobrar e imprimir</button>
          <button class="btn grande" data-cobrar><kbd>F2</kbd>Cobrar sin imprimir</button>
          <button class="btn" data-notas><kbd>F4</kbd>Ingresar notas</button>
          <button class="btn" data-cancelar><kbd>ESC</kbd>Cancelar</button>
          <div class="nota" data-notas-texto></div>
          <div class="nota">Total de artículos: <b>${cant(articulos)}</b></div>
        </div>
      </div>`,
    onKey: (e, m) => {
      if (e.key === 'F1') return finalizar(true), true;
      if (e.key === 'F2') return finalizar(false), true;
      if (e.key === 'F4') return pedirNotas(), true;
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const f = formas[Number(e.key) - 1];
        if (f) elegir(f);
        return true;
      }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        // ENTER en el último campo = cobrar e imprimir
        const inputs = [...m.cuerpo.querySelectorAll('[data-detalle] input')];
        const i = inputs.indexOf(e.target);
        if (i >= 0 && i < inputs.length - 1) inputs[i + 1].focus();
        else finalizar(true);
        return true;
      }
    },
  });

  const detalle = m.cuerpo.querySelector('[data-detalle]');
  const totalConComision = () => redondear(total * (1 + comisionPct / 100), 2);

  function pintarDetalle() {
    m.cuerpo.querySelectorAll('[data-forma]').forEach(b => b.classList.toggle('activo', b.dataset.forma === forma));
    m.cuerpo.querySelector('[data-total]').textContent = dinero(forma === 'TARJETA' && comisionPct ? totalConComision() : total);
    let html = '';
    switch (forma) {
      case 'EFECTIVO':
        html = `<div class="form-grid">
          <label>Pagó con</label><input class="num grande" data-recibido placeholder="${esc(numInput(total))}">
          <label>Su cambio</label><div class="cambio-grande" data-cambio>${dinero(0)}</div></div>`;
        break;
      case 'DOLARES':
        html = `<div class="form-grid">
          <label>Tipo de cambio</label><div>${dinero(cfg('tipo_cambio'))}</div>
          <label>Total en dólares</label><div>US$ ${numInput(total / cfg('tipo_cambio'), 2)}</div>
          <label>Dólares recibidos</label><input class="num grande" data-usd>
          <label>Su cambio (moneda local)</label><div class="cambio-grande" data-cambio>${dinero(0)}</div></div>`;
        break;
      case 'CREDITO':
        html = `<div class="form-grid">
          <label>Cliente</label><div><b data-cli>${clienteCredito ? esc(clienteCredito.nombre) : 'Ninguno'}</b>
            <button class="btn" data-elegir-cliente>Elegir cliente…</button></div>
          <label>Saldo actual</label><div data-saldo>${clienteCredito ? dinero(clienteCredito.saldo) : '-'}</div>
          <label>Límite</label><div>${clienteCredito ? (clienteCredito.limite == null ? 'Sin límite' : dinero(clienteCredito.limite)) : '-'}</div>
          <label>Saldo después de la venta</label><div>${clienteCredito ? dinero(clienteCredito.saldo + total) : '-'}</div></div>`;
        break;
      case 'TARJETA':
        html = `<div class="form-grid">
          ${comisionPct ? `<label>Comisión (${comisionPct}%)</label><div>${dinero(totalConComision() - total)}</div>` : ''}
          <label>Referencia / autorización</label><input data-ref></div>
          <p class="nota">Realiza el cargo en la terminal bancaria y luego confirma el cobro.</p>`;
        break;
      case 'TRANSFERENCIA':
        html = `<div class="form-grid"><label>Referencia</label><input data-ref placeholder="Teléfono, número de operación…"></div>
          <p class="nota">La referencia se imprime al pie del ticket.</p>`;
        break;
      case 'VALE':
      case 'CHEQUE':
        html = `<div class="form-grid"><label>${forma === 'VALE' ? 'Folio del vale' : 'Número de cheque'}</label><input data-ref></div>`;
        break;
      case 'MIXTO':
        html = `<div class="form-grid mixto">
          ${formas
            .filter(f => f !== 'MIXTO')
            .map(
              f => `<label>${esc(nombreForma(f))}${f === 'DOLARES' ? ' (US$)' : ''}</label>
              <div class="fila"><input class="num" data-mixto="${f}">${
                f === 'CREDITO'
                  ? `<button class="btn" data-elegir-cliente>${clienteCredito ? esc(clienteCredito.nombre) : 'Elegir cliente…'}</button>`
                  : ''
              }</div>`
            )
            .join('')}
          <label>Restante</label><div data-restante class="cambio-grande">${dinero(total)}</div>
          <label>Cambio</label><div data-cambio>${dinero(0)}</div></div>
          ${comisionPct ? `<p class="nota">La parte con tarjeta incluye ${comisionPct}% de comisión.</p>` : ''}`;
        break;
    }
    detalle.innerHTML = html;
    detalle.querySelectorAll('input').forEach(i => (i.oninput = recalcular));
    detalle.querySelectorAll('[data-elegir-cliente]').forEach(
      b =>
        (b.onclick = async () => {
          const c = await seleccionarCliente({ titulo: 'Cliente con crédito', soloCredito: true });
          if (c) clienteCredito = c;
          const valores = [...detalle.querySelectorAll('[data-mixto]')].map(i => [i.dataset.mixto, i.value]);
          pintarDetalle();
          valores.forEach(([f, v]) => {
            const i = detalle.querySelector(`[data-mixto="${f}"]`);
            if (i) i.value = v;
          });
          recalcular();
        })
    );
    const primero = detalle.querySelector('input');
    if (primero) setTimeout(() => primero.focus(), 0);
    recalcular();
  }

  // Calcula el desglose actual. Devuelve {pagos, pago_con, cambio, comision, falta}
  function calcular() {
    const v = sel => detalle.querySelector(sel)?.value ?? '';
    switch (forma) {
      case 'EFECTIVO': {
        const txt = v('[data-recibido]');
        const recibido = txt.trim() ? num(txt) : total;
        return { pagos: [{ forma, monto: total }], pago_con: recibido, cambio: redondear(recibido - total, 2), comision: 0, falta: redondear(total - recibido, 2) };
      }
      case 'DOLARES': {
        const usd = num(v('[data-usd]'));
        const local = redondear(usd * cfg('tipo_cambio'), 2);
        return {
          pagos: [{ forma, monto: total, monto_extranjero: usd, tipo_cambio: cfg('tipo_cambio') }],
          pago_con: local,
          cambio: redondear(local - total, 2),
          comision: 0,
          falta: redondear(total - local, 2),
        };
      }
      case 'TARJETA': {
        const conCom = comisionPct ? totalConComision() : total;
        return { pagos: [{ forma, monto: total, referencia: v('[data-ref]') }], pago_con: 0, cambio: 0, comision: redondear(conCom - total, 2), falta: 0 };
      }
      case 'MIXTO': {
        const pagos = [];
        let noEfectivo = 0;
        let comision = 0;
        for (const i of detalle.querySelectorAll('[data-mixto]')) {
          const f = i.dataset.mixto;
          let monto = num(i.value);
          if (!monto) continue;
          if (f === 'EFECTIVO') continue;
          const p = { forma: f, monto };
          if (f === 'DOLARES') {
            p.monto_extranjero = monto;
            p.tipo_cambio = cfg('tipo_cambio');
            p.monto = redondear(monto * cfg('tipo_cambio'), 2);
          }
          if (f === 'TARJETA' && comisionPct) {
            const base = redondear(monto / (1 + comisionPct / 100), 2);
            comision += monto - base;
            p.monto = base;
          }
          noEfectivo += p.monto;
          pagos.push(p);
        }
        const efectivo = num(detalle.querySelector('[data-mixto="EFECTIVO"]')?.value);
        const restanteEf = redondear(total - noEfectivo, 2);
        const efectivoNeto = Math.max(0, Math.min(efectivo, restanteEf));
        if (efectivoNeto > 0) pagos.unshift({ forma: 'EFECTIVO', monto: efectivoNeto });
        return {
          pagos,
          pago_con: efectivo,
          cambio: redondear(Math.max(0, efectivo - Math.max(0, restanteEf)), 2),
          comision: redondear(comision, 2),
          falta: redondear(total - noEfectivo - efectivo, 2),
          excedeNoEfectivo: noEfectivo - total > 0.009,
        };
      }
      default:
        return { pagos: [{ forma, monto: total, referencia: v('[data-ref]') }], pago_con: 0, cambio: 0, comision: 0, falta: 0 };
    }
  }

  function recalcular() {
    const c = calcular();
    const cam = detalle.querySelector('[data-cambio]');
    if (cam) {
      cam.textContent = dinero(Math.max(0, c.cambio));
      cam.classList.toggle('falta', c.falta > 0.009);
    }
    const rest = detalle.querySelector('[data-restante]');
    if (rest) rest.textContent = c.falta > 0 ? dinero(c.falta) : dinero(0);
  }

  function elegir(f) {
    forma = f;
    pintarDetalle();
  }

  async function pedirNotas() {
    const r = await formulario({
      titulo: 'Notas de la venta',
      campos: [{ nombre: 'notas', etiqueta: 'Notas (se imprimen en el ticket)', tipo: 'area', valor: notas }],
    });
    if (r) {
      notas = r.notas;
      m.cuerpo.querySelector('[data-notas-texto]').textContent = notas ? 'Notas: ' + notas : '';
    }
  }

  async function finalizar(imprimir) {
    const c = calcular();
    const credito = c.pagos.filter(p => p.forma === 'CREDITO').reduce((a, p) => a + p.monto, 0);
    if (forma === 'EFECTIVO' && c.falta > 0.009 && cfg('pago_efectivo_estricto'))
      return alerta(`Efectivo insuficiente. Faltan <b>${dinero(c.falta)}</b>.`);
    if (forma === 'DOLARES' && c.falta > 0.009) return alerta(`Dólares insuficientes. Faltan <b>${dinero(c.falta)}</b>.`);
    if (forma === 'MIXTO') {
      if (c.excedeNoEfectivo) return alerta('Los pagos distintos de efectivo no pueden superar el total.');
      if (c.falta > 0.009) return alerta(`El pago no cubre el total. Faltan <b>${dinero(c.falta)}</b>.`);
    }
    if (forma === 'CREDITO') c.pagos[0].monto = total;
    if (credito > 0 || forma === 'CREDITO') {
      const montoCredito = forma === 'CREDITO' ? total : credito;
      if (!clienteCredito) return alerta('Elige un cliente con crédito autorizado.');
      if (!clienteCredito.credito) return alerta('El cliente no tiene crédito autorizado.');
      if (clienteCredito.limite != null && clienteCredito.saldo + montoCredito > clienteCredito.limite + 0.009)
        return alerta(
          `La venta excede el límite de crédito de <b>${esc(clienteCredito.nombre)}</b>.<br>
           Saldo: ${dinero(clienteCredito.saldo)} · Límite: ${dinero(clienteCredito.limite)} · Disponible: ${dinero(Math.max(0, clienteCredito.limite - clienteCredito.saldo))}`
        );
    }
    const referencia = detalle.querySelector('[data-ref]')?.value.trim() || null;
    m.cerrar({
      forma,
      pagos: c.pagos,
      pago_con: forma === 'EFECTIVO' || forma === 'DOLARES' || forma === 'MIXTO' ? c.pago_con : 0,
      cambio: Math.max(0, c.cambio),
      comision: c.comision,
      notas,
      referencia,
      cliente: credito > 0 || forma === 'CREDITO' ? clienteCredito : cliente,
      imprimir,
    });
  }

  m.cuerpo.querySelectorAll('[data-forma]').forEach(b => (b.onclick = () => elegir(b.dataset.forma)));
  m.cuerpo.querySelector('[data-cobrar-imprimir]').onclick = () => finalizar(true);
  m.cuerpo.querySelector('[data-cobrar]').onclick = () => finalizar(false);
  m.cuerpo.querySelector('[data-notas]').onclick = pedirNotas;
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  pintarDetalle();
  return m.promesa;
}
