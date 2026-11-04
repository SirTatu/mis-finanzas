// Centro de configuración de notificaciones.
// Las preferencias se guardan en los datos de la app (S.notif) y se sincronizan con la nube:
// el servidor las lee para decidir qué avisos enviarte, cuándo y con qué detalle.
(function () {
  'use strict';

  function porDefecto() {
    return {
      activo: true,
      porEvento: true,
      importes: false,
      resumenHora: '09:00',
      transfer: { on: true, antes: 60, finde: false },
      cierre: { on: true, dias: [1, 0], hora: '09:00' },
      vencTarjeta: { on: true, dias: [3, 1, 0], hora: '09:00' },
      vto: { on: true, dias: [3, 1, 0], hora: '09:00' },
      fijos: { on: true, dias: [0], hora: '09:00' }
    };
  }

  // Preferencias actuales completas (con los valores por defecto donde falte algo).
  function cfg() {
    var d = porDefecto(), n = (typeof S !== 'undefined' && S && S.notif) || {};
    Object.keys(d).forEach(function (k) {
      if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) d[k] = Object.assign(d[k], n[k] || {});
      else if (n[k] !== undefined) d[k] = n[k];
    });
    return d;
  }
  // Deja las preferencias completas dentro de S.notif y devuelve esa referencia.
  function asegurar() { S.notif = cfg(); return S.notif; }
  function leer(path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, cfg()); }
  function fijar(path, valor) {
    var c = asegurar(), p = path.split('.'), o = c;
    for (var i = 0; i < p.length - 1; i++) o = o[p[i]];
    o[p[p.length - 1]] = valor;
    save();
  }

  var OPCIONES_DIAS = [[0, 'El mismo día'], [1, '1 día antes'], [2, '2 días antes'], [3, '3 días antes'], [5, '5 días antes'], [7, '7 días antes']];

  function chip(accion, datos, texto, activo) {
    var attrs = Object.keys(datos).map(function (k) { return ' data-' + k + "='" + esc(datos[k]) + "'"; }).join('');
    return "<button class='chip tg' data-a='" + accion + "'" + attrs + (activo ? ' aria-pressed=true' : '') + '>' + texto + '</button>';
  }
  function bloque(grupo, titulo, descripcion) {
    var c = cfg(), g = c[grupo], dias = (g.dias || []).map(Number);
    var h = "<div class='nb' style='border-top:1px solid var(--line);padding:12px 0'><div class='row' style='border:0;padding:0'><span><b>" + titulo +
      "</b><br><small class='mut'>" + descripcion + '</small></span>' + chip('nToggle', { k: grupo + '.on' }, g.on ? 'Activado' : 'Apagado', g.on) + '</div>';
    if (g.on) {
      h += "<p class='mut' style='margin:10px 0 2px;font-size:13px'>Avisarme</p><div class='chips'>" +
        OPCIONES_DIAS.map(function (o) { return chip('nDia', { g: grupo, d: o[0] }, o[1], dias.indexOf(o[0]) > -1); }).join('') + '</div>' +
        "<label>A las<input type='time' data-n='" + grupo + ".hora' value='" + esc(g.hora || '09:00') + "'></label>";
    }
    return h + '</div>';
  }

  window.vNotifCentro = function () {
    var c = cfg();
    var estado = ('serviceWorker' in navigator && 'PushManager' in window)
      ? (('Notification' in window && Notification.permission === 'granted') ? 'permiso concedido en este dispositivo'
        : ('Notification' in window && Notification.permission === 'denied') ? 'permiso bloqueado en el navegador'
        : 'todavía sin permiso')
      : 'este navegador no admite push';
    var h = '<h2>Notificaciones</h2>' +
      "<p class='mut'>Avisos que llegan aunque la app esté cerrada. Estado de este dispositivo: " + estado + '. El servidor revisa cada 15 minutos, así que un aviso puede llegar hasta 15 minutos después de la hora elegida.</p>' +
      "<button class='btn sec' data-a='activarPush'>Activar en este dispositivo</button>" +
      "<button class='btn sec' data-a='desactivarPush'>Desactivar en este dispositivo</button>" +
      "<button class='btn sec' data-a='probarNotif'>Probar cómo se ve un aviso</button>" +
      "<div class='row' style='margin-top:14px'><span><b>Notificaciones de la app</b><br><small class='mut'>Interruptor general para todos los avisos</small></span>" +
      chip('nToggle', { k: 'activo' }, c.activo ? 'Activadas' : 'Apagadas', c.activo) + '</div>';
    if (!c.activo) return h;

    h += "<p style='margin:16px 0 4px'><b>Cómo avisar</b></p><div class='chips'>" +
      chip('nModo', { v: '1' }, 'Un aviso por evento', c.porEvento) +
      chip('nModo', { v: '0' }, 'Un resumen por día', !c.porEvento) +
      chip('nToggle', { k: 'importes' }, 'Mostrar importes', c.importes) + '</div>';
    if (!c.porEvento) h += "<label>Hora del resumen<input type='time' data-n='resumenHora' value='" + esc(c.resumenHora) + "'></label>";
    h += "<p class='mut' style='font-size:13px'>Los avisos pueden verse en la pantalla bloqueada: por eso los importes vienen apagados.</p>";

    h += "<p style='margin:16px 0 0'><b>Qué querés que te avise</b></p>" +
      bloque('cierre', 'Cierre de tarjeta', 'Cuándo cierra el resumen de cada tarjeta') +
      bloque('vencTarjeta', 'Vencimiento de tarjeta', 'El día de pago del resumen') +
      bloque('vto', 'Vencimientos propios', 'Facultad, impuestos, servicios (los ya pagados no avisan)') +
      bloque('fijos', 'Gastos fijos', 'Hasta que los registres o los saltees en el mes');

    var t = c.transfer;
    h += "<div class='nb' style='border-top:1px solid var(--line);padding:12px 0'><div class='row' style='border:0;padding:0'><span><b>Transferir a billeteras</b><br><small class='mut'>Antes de la hora de corte de cada billetera</small></span>" +
      chip('nToggle', { k: 'transfer.on' }, t.on ? 'Activado' : 'Apagado', t.on) + '</div>';
    if (t.on) {
      h += "<p class='mut' style='margin:10px 0 2px;font-size:13px'>Avisarme antes del corte</p><div class='chips'>" +
        [15, 30, 60, 120].map(function (m) { return chip('nAntes', { v: m }, m === 60 ? '1 hora' : m === 120 ? '2 horas' : m + ' min', Number(t.antes) === m); }).join('') + '</div>' +
        "<div class='chips'>" + chip('nToggle', { k: 'transfer.finde' }, 'También sábados y domingos', !!t.finde) + '</div>' +
        "<p class='mut' style='font-size:13px'>Se configura en cada billetera (Rend. > Editar): hora de corte y \"Avisarme para transferir\". Avisa los días marcados en la billetera y los días con importe puntual (con importe 0 no avisa).</p>";
    }
    return h + '</div>';
  };

  window.extraActs = window.extraActs || {};
  window.extraActs.nToggle = function (d) { fijar(d.k, !leer(d.k)); };
  window.extraActs.nModo = function (d) { fijar('porEvento', d.v === '1'); };
  window.extraActs.nAntes = function (d) { fijar('transfer.antes', Number(d.v)); };
  window.extraActs.nDia = function (d) {
    var dia = Number(d.d), ruta = d.g + '.dias', lista = (leer(ruta) || []).map(Number), i = lista.indexOf(dia);
    if (i > -1) lista.splice(i, 1); else lista.push(dia);
    lista.sort(function (a, b) { return b - a; });
    fijar(ruta, lista);
  };
  window.extraActs.probarNotif = function () {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) { V.toast = 'Este navegador no admite notificaciones.'; return; }
    if (Notification.permission !== 'granted') { V.toast = 'Primero tocá "Activar en este dispositivo" y aceptá el permiso.'; return; }
    navigator.serviceWorker.ready.then(function (r) {
      return r.showNotification('Hoy vence el pago de Galicia Visa', { body: 'Así se ve un aviso de ejemplo.', tag: 'prueba-' + Date.now(), data: { url: './' } });
    }).catch(function () {});
    V.toast = 'Te mandé un aviso de ejemplo.';
  };

  // Las horas se guardan al cambiar el campo.
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.dataset || !t.dataset.n) return;
    var m = /^(\d{2}):(\d{2})$/.exec(t.value);
    if (m && Number(m[1]) < 24 && Number(m[2]) < 60) fijar(t.dataset.n, t.value);
  });
})();
