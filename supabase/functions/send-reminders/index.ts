// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// ===================== LÓGICA PURA (se prueba por separado) =====================
// Esta función corre cada 15 minutos. En cada corrida decide, para cada usuario,
// qué avisos "tocan ahora" según sus preferencias (doc.notif) y cuáles ya se enviaron.

const DEF = {
  activo: true,
  porEvento: true,
  importes: false,
  resumenHora: '09:00',
  transfer: { on: true, antes: 60, finde: false },
  cierre: { on: true, dias: [1, 0], hora: '09:00' },
  vencTarjeta: { on: true, dias: [3, 1, 0], hora: '09:00' },
  vto: { on: true, dias: [3, 1, 0], hora: '09:00' },
  fijos: { on: true, dias: [0], hora: '09:00' },
};
const GRACIA_MIN = 180; // si el servidor se atrasa, un aviso todavía se envía hasta 3 h después

function config(doc) {
  const n = (doc && doc.notif) || {};
  const o = {};
  for (const k of Object.keys(DEF)) {
    const d = DEF[k];
    o[k] = d && typeof d === 'object' && !Array.isArray(d)
      ? Object.assign({}, d, n[k] || {})
      : (n[k] !== undefined ? n[k] : d);
  }
  return o;
}
function ahoraAR(date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const g = (t) => p.find((x) => x.type === t).value;
  const fecha = `${g('year')}-${g('month')}-${g('day')}`;
  return { fecha, min: Number(g('hour')) * 60 + Number(g('minute')), wd: new Date(fecha + 'T12:00:00Z').getUTCDay() };
}
const mins = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const solo = (v) => String(v).slice(0, 10);
const diaDiff = (iso, hoy) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(hoy + 'T12:00:00Z')) / 86400000);
const sumaDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const arr = (x) => (Array.isArray(x) ? x : []);
const objs = (x) => arr(x).filter((e) => e && typeof e === 'object');
const dinero = (n) => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const cuando = (d) => (d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`);
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function resumenTarjeta(doc, t) {
  if (!esFecha(t.anterior) || !esFecha(t.cierre)) return 0;
  const desde = sumaDias(solo(t.anterior), 1), hasta = solo(t.cierre);
  return objs(doc.movs)
    .filter((m) => m.tipo === 'Gasto' && m.pago === 'tarjeta:' + t.id && m.fecha >= desde && m.fecha <= hasta)
    .reduce((a, m) => a + Number(m.monto || 0), 0);
}

// Todos los avisos que corresponden al día de hoy (cada uno con su ventana horaria).
function eventos(doc, ahora) {
  doc = doc && typeof doc === 'object' ? doc : {};
  const cfg = config(doc), out = [], F = ahora.fecha;
  if (!cfg.activo) return { cfg, eventos: out };
  const general = (g, e) => {
    const h = mins(cfg[g].hora);
    if (h === null) return;
    out.push(Object.assign({ desde: h, hasta: h + GRACIA_MIN, resumible: true }, e));
  };
  const dias = (g) => arr(cfg[g].dias).map(Number);

  // Cierre y vencimiento de tarjetas: son avisos distintos.
  for (const t of objs(doc.tarjetas)) {
    const nombre = String(t.nombre || 'Tarjeta').slice(0, 60);
    if (cfg.cierre.on && esFecha(t.cierre)) {
      for (const d of dias('cierre')) {
        if (diaDiff(solo(t.cierre), F) !== d) continue;
        general('cierre', {
          clave: `${F}|cierre|${t.id}|${d}`, tipo: 'cierre',
          titulo: mayus(`${cuando(d)} cierra ${nombre}`),
          cuerpo: cfg.importes ? `Llevás ${dinero(resumenTarjeta(doc, t))} en este resumen.` : 'Revisá tus consumos antes del cierre.',
          linea: `Cierra ${nombre} ${cuando(d)}`,
        });
      }
    }
    if (cfg.vencTarjeta.on && esFecha(t.vencimiento)) {
      for (const d of dias('vencTarjeta')) {
        if (diaDiff(solo(t.vencimiento), F) !== d) continue;
        general('vencTarjeta', {
          clave: `${F}|vencTarjeta|${t.id}|${d}`, tipo: 'vencTarjeta',
          titulo: mayus(`${cuando(d)} vence el pago de ${nombre}`),
          cuerpo: cfg.importes ? `Resumen de ${dinero(resumenTarjeta(doc, t))}.` : 'Acordate de pagar el resumen.',
          linea: `Vence el pago de ${nombre} ${cuando(d)}`,
        });
      }
    }
  }

  // Vencimientos propios (facultad, impuestos, servicios...): se omiten los ya pagados.
  if (cfg.vto.on) {
    for (const v of objs(doc.vtos)) {
      if (v.hecho || !esFecha(v.fecha)) continue;
      const nombre = String(v.desc || 'Vencimiento').slice(0, 80);
      for (const d of dias('vto')) {
        if (diaDiff(solo(v.fecha), F) !== d) continue;
        general('vto', {
          clave: `${F}|vto|${v.id}|${d}`, tipo: 'vto',
          titulo: mayus(`${cuando(d)} vence: ${nombre}`),
          cuerpo: cfg.importes && Number(v.monto) > 0 ? `${dinero(v.monto)}. Marcalo como pagado en la app.` : 'Marcalo como pagado en la app cuando lo pagues.',
          linea: `Vence ${nombre} ${cuando(d)}`,
        });
      }
    }
  }

  // Gastos fijos: aviso hasta que se registren o se salteen en el mes.
  if (cfg.fijos.on) {
    const [y, m] = F.split('-').map(Number);
    for (const f of objs(doc.fijos)) {
      if (f.activo === false || !(Number(f.dia) >= 1 && Number(f.dia) <= 31)) continue;
      const nombre = String(f.desc || 'Gasto fijo').slice(0, 80);
      for (let off = 0; off <= 1; off++) {
        const ref = new Date(Date.UTC(y, m - 1 + off, 1));
        const ay = ref.getUTCFullYear(), am = ref.getUTCMonth() + 1;
        const ult = new Date(Date.UTC(ay, am, 0)).getUTCDate();
        const fecha = `${ay}-${String(am).padStart(2, '0')}-${String(Math.min(Number(f.dia), ult)).padStart(2, '0')}`;
        if ((f.ult || '') >= `${ay}-${String(am).padStart(2, '0')}`) continue; // ya resuelto ese mes
        for (const d of dias('fijos')) {
          if (diaDiff(fecha, F) !== d) continue;
          general('fijos', {
            clave: `${F}|fijos|${f.id}|${d}`, tipo: 'fijos',
            titulo: mayus(`${cuando(d)} toca el gasto fijo: ${nombre}`),
            cuerpo: cfg.importes && Number(f.monto) > 0 ? `${dinero(f.monto)}. Registralo desde la app.` : 'Registralo o salteálo desde la app.',
            linea: `Gasto fijo ${nombre} ${cuando(d)}`,
          });
        }
      }
    }
  }

  // Recordatorio de transferencia: unos minutos antes de la hora de corte de cada billetera.
  const R = doc.rend;
  if (cfg.transfer.on && R && Array.isArray(R.b)) {
    const finde = ahora.wd === 0 || ahora.wd === 6;
    for (const b of objs(R.b)) {
      if (!b.avisar) continue;
      const corte = mins(b.corte);
      if (corte === null) continue;
      const ov = b.ov && Object.prototype.hasOwnProperty.call(b.ov, F) ? Number(b.ov[F]) : undefined;
      if (ov === 0) continue; // ese día se indicó que no se invierte
      const tocaPorDia = b.modo !== 'nada' && Array.isArray(b.dias) && !!b.dias[ahora.wd] && (!finde || cfg.transfer.finde);
      if (!(ov > 0) && !tocaPorDia) continue;
      const antes = Math.max(0, Number(cfg.transfer.antes) || 0);
      const monto = ov > 0 ? ov : (b.modo === 'fijo' && Number(b.monto) > 0 ? Number(b.monto) : 0);
      const nombre = String(b.nombre || 'billetera').slice(0, 60);
      out.push({
        clave: `${F}|transfer|${b.id}`, tipo: 'transfer', resumible: false,
        desde: Math.max(0, corte - antes), hasta: corte,
        titulo: `Transferí a ${nombre}`,
        cuerpo: `Corta a las ${hhmm(corte)}` + (cfg.importes && monto > 0 ? ` · ${dinero(monto)}` : '') + '.',
        linea: `Transferir a ${nombre} antes de las ${hhmm(corte)}`,
      });
    }
  }
  return { cfg, eventos: out };
}

// Devuelve las notificaciones que hay que enviar ahora (sin repetir las ya enviadas).
function planificar(doc, ahora, enviados) {
  const { cfg, eventos: evs } = eventos(doc, ahora);
  const ya = enviados || new Set();
  const enVentana = (e) => ahora.min >= e.desde && ahora.min <= e.hasta && !ya.has(e.clave);
  const out = [];
  if (cfg.porEvento) {
    for (const e of evs) if (enVentana(e)) out.push({ clave: e.clave, title: e.titulo, body: e.cuerpo, tipo: e.tipo });
    return out;
  }
  // Modo resumen: los avisos de transferencia siguen siendo individuales (dependen de la hora).
  for (const e of evs) if (!e.resumible && enVentana(e)) out.push({ clave: e.clave, title: e.titulo, body: e.cuerpo, tipo: e.tipo });
  const agrupables = evs.filter((e) => e.resumible);
  const h = mins(cfg.resumenHora), claveR = `${ahora.fecha}|resumen`;
  if (agrupables.length && h !== null && ahora.min >= h && ahora.min <= h + GRACIA_MIN && !ya.has(claveR)) {
    const lineas = agrupables.map((e) => e.linea);
    out.push({
      clave: claveR, tipo: 'resumen',
      title: `Mis finanzas · ${lineas.length} ${lineas.length === 1 ? 'aviso' : 'avisos'} de hoy`,
      body: lineas.slice(0, 4).join(' · ') + (lineas.length > 4 ? ` · y ${lineas.length - 4} más` : ''),
    });
  }
  return out;
}
// ===================== FIN DE LA LÓGICA PURA =====================

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const cron = Deno.env.get('CRON_SECRET');
  if (!cron || req.headers.get('x-cron-secret') !== cron) return new Response('Unauthorized', { status: 401 });
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')!;
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
  webpush.setVapidDetails(subject, pub, priv);
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: docs, error: docErr } = await admin.from('datos').select('user_id,doc');
  if (docErr) return new Response(JSON.stringify({ error: docErr.message }), { status: 500 });

  const ahora = ahoraAR(new Date());
  let sent = 0, failed = 0, notificaciones = 0;
  for (const row of docs || []) {
    const { data: yaRows } = await admin.from('push_enviados').select('clave').eq('user_id', row.user_id).like('clave', ahora.fecha + '%');
    const ya = new Set((yaRows || []).map((r) => r.clave));
    const aEnviar = planificar(row.doc, ahora, ya);
    if (!aEnviar.length) continue;
    const { data: subs, error } = await admin.from('push_subscriptions').select('id,subscription').eq('user_id', row.user_id);
    if (error || !subs || !subs.length) continue;
    for (const n of aEnviar) {
      let ok = false;
      for (const sub of subs) {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify({ title: n.title, body: n.body, url: './', tag: n.clave }));
          ok = true; sent++;
        } catch (e) {
          failed++;
          const status = (e as any)?.statusCode;
          if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
      if (ok) {
        notificaciones++;
        await admin.from('push_enviados').upsert({ user_id: row.user_id, clave: n.clave }, { onConflict: 'user_id,clave', ignoreDuplicates: true });
      }
    }
  }
  // Limpieza: se borra el registro de avisos de más de 10 días.
  await admin.from('push_enviados').delete().lt('enviado_at', new Date(Date.now() - 10 * 86400000).toISOString());
  return new Response(JSON.stringify({ ok: true, fecha: ahora.fecha, hora: hhmm(ahora.min), notificaciones, sent, failed }), { headers: { 'Content-Type': 'application/json' } });
});
