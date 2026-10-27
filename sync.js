// Login y sincronización con Supabase, sin librerías externas.
// Los datos viven primero en el teléfono (funciona sin conexión) y se
// sincronizan con la nube cuando hay internet.
(function () {
  'use strict';
  var C = window.APP_CONFIG || {};
  var conf = !!(C.url && C.key) && !/TU-PROYECTO|TU_CLAVE/.test(C.url + C.key);
  var KM = 'finanzas_sync', KA = 'finanzas_auth', KD = 'finanzas_v1';

  function leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function escribir(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var meta = leer(KM) || { version: 0, dirty: false, last: null };
  var ses = leer(KA);
  var busy = false, otra = false, reint = 0, timer = null;
  var estado = conf ? 'Todavía sin sincronizar' : 'Sincronización sin configurar';

  function ahora() { return new Date().toISOString(); }
  function hora() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function escribiendo() { return /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || ''); }
  function refrescar() { if (!V.sheet && !escribiendo()) render(); }

  // ---------- Llamadas a Supabase ----------
  function pedir(ruta, opt) {
    return fetch(C.url + ruta, opt).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) {
          var err = new Error((j && (j.msg || j.message || j.error_description || j.error)) || ('HTTP ' + r.status));
          err.status = r.status;
          throw err;
        }
        return j;
      });
    });
  }
  function cabAuth() { return { apikey: C.key, 'Content-Type': 'application/json' }; }
  function cab(extra) {
    var h = { apikey: C.key, Authorization: 'Bearer ' + ses.access, 'Content-Type': 'application/json' };
    for (var k in extra) h[k] = extra[k];
    return h;
  }

  function guardarSes(j) {
    ses = {
      access: j.access_token,
      refresh: j.refresh_token,
      exp: Date.now() + (j.expires_in || 3600) * 1000,
      uid: (j.user && j.user.id) || (ses && ses.uid)
    };
    escribir(KA, ses);
  }
  function entrar(email, clave) {
    return pedir('/auth/v1/token?grant_type=password', {
      method: 'POST', headers: cabAuth(), body: JSON.stringify({ email: email, password: clave })
    }).then(guardarSes);
  }
  function renovar() {
    return pedir('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: cabAuth(), body: JSON.stringify({ refresh_token: ses.refresh })
    }).then(guardarSes);
  }
  function token() {
    if (!ses) return Promise.reject(new Error('Sin sesión'));
    if (ses.exp - Date.now() > 60000) return Promise.resolve();
    return renovar().catch(function (e) {
      if (e.status === 400 || e.status === 401 || e.status === 403) salir(true);
      throw e;
    });
  }
  function salir(mostrar) {
    ses = null;
    try { localStorage.removeItem(KA); } catch (e) {}
    estado = 'Sesión cerrada';
    if (mostrar) mostrarLogin();
  }

  function traer() { return pedir('/rest/v1/datos?select=doc,version&user_id=eq.' + ses.uid, { headers: cab() }); }
  function crear(doc) {
    return pedir('/rest/v1/datos', {
      method: 'POST', headers: cab({ Prefer: 'return=representation' }),
      body: JSON.stringify({ user_id: ses.uid, doc: doc, version: 1 })
    });
  }
  function subir(doc, v) {
    return pedir('/rest/v1/datos?user_id=eq.' + ses.uid + '&version=eq.' + v, {
      method: 'PATCH', headers: cab({ Prefer: 'return=representation' }),
      body: JSON.stringify({ doc: doc, version: v + 1 })
    });
  }

  // ---------- Combinar dos copias ----------
  // Los movimientos, tarjetas, gastos fijos y vencimientos se unen por su
  // identificador y se respetan los borrados. El resto (configuración,
  // rendimientos) queda como está en este dispositivo.
  function fusion(a, b) {
    var bor = Array.from(new Set((a.bor || []).concat(b.bor || [])));
    var out = Object.assign({}, b, a);
    Object.keys(b).forEach(function (k) { if (out[k] == null) out[k] = b[k]; });
    ['movs', 'tarjetas', 'fijos', 'vtos'].forEach(function (k) {
      var m = {};
      (b[k] || []).forEach(function (x) { m[x.id] = x; });
      (a[k] || []).forEach(function (x) { m[x.id] = x; });
      out[k] = Object.keys(m).filter(function (id) { return bor.indexOf(id) < 0; }).map(function (id) { return m[id]; });
    });
    out.bor = bor;
    return out;
  }
  function vacio() { return !S.movs.length && !S.tarjetas.length && !S.fijos.length && !S.vtos.length && !S.rend; }
  function aplicar(doc) { escribir(KD, doc); load(); }
  function fijarMeta(v, sucio) { meta = { version: v, dirty: !!sucio, last: ahora() }; escribir(KM, meta); }

  function subirYa(rv) {
    return subir(S, rv).then(function (r) {
      if (r && r.length) { fijarMeta(r[0].version, false); reint = 0; }
      else if (reint++ < 3) { otra = true; }
      else { throw new Error('No pude resolver un conflicto de sincronización'); }
    });
  }

  function sincronizar() {
    if (!conf || !ses) return Promise.resolve();
    if (busy) { otra = true; return Promise.resolve(); }
    busy = true;
    estado = 'Sincronizando…';
    return token().then(traer).then(function (r) {
      if (!r.length) {
        return crear(S).then(function () { fijarMeta(1, false); });
      }
      var rv = r[0].version, rd = r[0].doc;
      if (meta.version === rv) {
        if (!meta.dirty) return null;
        return subirYa(rv);
      }
      if ((!meta.dirty && meta.version > 0) || vacio()) {
        aplicar(rd);
        fijarMeta(rv, false);
        return null;
      }
      aplicar(fusion(S, rd));
      meta.dirty = true;
      return subirYa(rv);
    }).then(function () {
      if (!otra) estado = 'Sincronizado a las ' + hora();
    }).catch(function (e) {
      estado = (typeof navigator !== 'undefined' && navigator.onLine === false) || e.message === 'Failed to fetch'
        ? 'Sin conexión: se sincroniza al volver' : 'Error: ' + e.message;
    }).then(function () {
      busy = false;
      refrescar();
      if (otra) { otra = false; return sincronizar(); }
    });
  }

  window.marcarSucio = function () {
    meta.dirty = true;
    escribir(KM, meta);
    clearTimeout(timer);
    timer = setTimeout(sincronizar, 2000);
  };

  // ---------- Pantalla de ingreso ----------
  function mostrarLogin(msg) {
    var d = document.getElementById('login');
    if (!d) {
      d = document.createElement('div');
      d.id = 'login';
      d.style.cssText = 'position:fixed;inset:0;z-index:50;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px';
      document.body.appendChild(d);
    }
    d.innerHTML = '<div style="width:100%;max-width:360px"><h1 style="text-transform:none;margin-bottom:6px">Mis finanzas</h1>' +
      '<p class="mut">Ingresá con tu usuario para sincronizar tus datos.</p>' +
      '<label>Email<input id="lgE" type="email" autocomplete="username" inputmode="email"></label>' +
      '<label>Contraseña<input id="lgP" type="password" autocomplete="current-password"></label>' +
      '<p id="lgM" class="warn" style="margin-top:10px">' + (msg || '') + '</p>' +
      '<button class="btn" id="lgB">Entrar</button></div>';
    d.style.display = 'flex';
    document.getElementById('lgB').onclick = hacerLogin;
    document.getElementById('lgP').onkeydown = function (e) { if (e.key === 'Enter') hacerLogin(); };
  }
  function ocultarLogin() {
    var d = document.getElementById('login');
    if (d) d.style.display = 'none';
  }
  function hacerLogin() {
    var e = document.getElementById('lgE').value.trim(), p = document.getElementById('lgP').value;
    if (!e || !p) { document.getElementById('lgM').textContent = 'Completá el email y la contraseña.'; return Promise.resolve(); }
    document.getElementById('lgM').textContent = 'Entrando…';
    return entrar(e, p).then(function () {
      ocultarLogin();
      return sincronizar();
    }).catch(function (x) {
      mostrarLogin(x.status === 400 ? 'Email o contraseña incorrectos.' : 'No pude conectarme: ' + x.message);
    });
  }

  // ---------- Sección "Cuenta" en Ajustes ----------
  window.vCuenta = function () {
    if (!conf) return "<h2>Cuenta y sincronización</h2><p class='mut'>Sin configurar: completá config.js con la URL y la clave de Supabase.</p>";
    return "<h2>Cuenta y sincronización</h2><p class='mut'>" + esc(estado) + (meta.dirty ? ' · cambios pendientes' : '') +
      "</p><button class='btn' data-a='syncAhora'>Sincronizar ahora</button><button class='btn sec' data-a='logout'>Cerrar sesión</button>";
  };
  window.extraActs = {
    syncAhora: function () { sincronizar(); },
    logout: function () { salir(true); }
  };

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') sincronizar();
  });
  window.addEventListener('online', sincronizar);

  // Para pruebas
  window.__sync = { sincronizar: sincronizar, entrar: entrar, hacerLogin: hacerLogin, meta: function () { return meta; }, ses: function () { return ses; }, estado: function () { return estado; }, fusion: fusion };

  if (conf) {
    if (ses) sincronizar(); else mostrarLogin();
  }
})();
