// Entradas (F7) y salidas (F8) de efectivo del turno actual.
import { q, run, sesion, abrirModal, confirmar, toast, esc, dinero, num, fmtHora, ahoraISO } from '../core.js';

export function movimientoCaja(tipo) {
  const entrada = tipo === 'ENTRADA';
  const m = abrirModal({
    titulo: entrada ? 'Entrada de efectivo' : 'Salida de efectivo',
    ancho: 560,
    html: `
      <form class="form-grid">
        <label>Cantidad</label><input class="num grande" name="monto" autofocus>
        <label>${entrada ? 'Comentarios' : 'Razón o proveedor'}</label>
        <input name="descripcion" value="${entrada ? 'Entrada de dinero' : ''}">
      </form>
      <div class="botones">
        <button class="btn" data-pasadas>Ver ${entrada ? 'entradas' : 'salidas'} pasadas ▾</button>
        <span class="espaciador"></span>
        <button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-primario" data-guardar>Guardar</button>
      </div>
      <div data-lista hidden></div>`,
    onKey: (e, m) => {
      if (e.key === 'Enter' && e.target.name === 'monto') {
        m.cuerpo.querySelector('[name=descripcion]').focus();
        m.cuerpo.querySelector('[name=descripcion]').select();
        return true;
      }
      if (e.key === 'Enter' && e.target.name === 'descripcion') {
        guardar();
        return true;
      }
    },
  });
  const form = m.cuerpo.querySelector('form');
  const lista = m.cuerpo.querySelector('[data-lista]');

  async function pintarLista() {
    const movs = await q(
      `SELECT mc.*, u.nombre AS cajero FROM movimientos_caja mc LEFT JOIN usuarios u ON u.id = mc.usuario_id
       WHERE mc.turno_id = ? AND mc.tipo = ? ORDER BY mc.id DESC`,
      [sesion.turno.id, tipo]
    );
    lista.innerHTML = `<div class="tabla-scroll alto-200" style="margin-top:12px"><table class="tabla">
      <thead><tr><th>Hora</th><th>Descripción</th><th class="num">Monto</th><th></th></tr></thead><tbody>
      ${
        movs
          .map(
            x => `<tr class="${x.cancelado ? 'cancelada' : ''}"><td>${fmtHora(x.fecha)}</td><td>${esc(x.descripcion)}</td>
            <td class="num">${dinero(x.monto)}</td>
            <td>${x.cancelado ? '' : `<button class="btn btn-icono" data-cancelar-mov="${x.id}" title="Cancelar">✕</button>`}</td></tr>`
          )
          .join('') || '<tr><td colspan="4" class="vacio">Sin movimientos en este turno</td></tr>'
      }</tbody></table></div>`;
    lista.querySelectorAll('[data-cancelar-mov]').forEach(
      b =>
        (b.onclick = async () => {
          if (await confirmar('¿Cancelar este movimiento?', { peligro: true, si: 'Cancelar movimiento' })) {
            await run('UPDATE movimientos_caja SET cancelado = 1 WHERE id = ?', [Number(b.dataset.cancelarMov)]);
            pintarLista();
          }
        })
    );
  }

  async function guardar() {
    const monto = num(form.monto.value);
    if (!(monto > 0)) {
      form.monto.classList.add('error');
      form.monto.focus();
      return;
    }
    await run('INSERT INTO movimientos_caja (turno_id, tipo, monto, descripcion, usuario_id, fecha) VALUES (?, ?, ?, ?, ?, ?)', [
      sesion.turno.id,
      tipo,
      monto,
      form.descripcion.value.trim() || (entrada ? 'Entrada de dinero' : 'Salida de dinero'),
      sesion.usuario.id,
      ahoraISO(),
    ]);
    toast(`${entrada ? 'Entrada' : 'Salida'} de ${dinero(monto)} registrada`);
    m.cerrar(true);
  }

  m.cuerpo.querySelector('[data-pasadas]').onclick = () => {
    lista.hidden = !lista.hidden;
    if (!lista.hidden) pintarLista();
  };
  m.cuerpo.querySelector('[data-cancelar]').onclick = () => m.cerrar(null);
  m.cuerpo.querySelector('[data-guardar]').onclick = guardar;
  form.onsubmit = e => e.preventDefault();
  return m.promesa;
}
