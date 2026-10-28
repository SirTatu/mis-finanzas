import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
function dateOnly(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null;
}
function dayDiff(iso: string, today: string) { return Math.round((Date.parse(iso+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000); }
function upcoming(doc: any, today: string) {
  const found: {name:string,date:string,kind:string}[] = [];
  const scan = (items: any[], kind: string) => {
    for (const item of (Array.isArray(items) ? items : [])) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.nombre || item.desc || item.descripcion || item.name || kind).slice(0,100);
      for (const key of Object.keys(item)) {
        if (!/(venc|vence|cierre|fecha|due)/i.test(key)) continue;
        const d = dateOnly(item[key]); if (!d) continue;
        const delta = dayDiff(d, today); if (delta >= 0 && delta <= 3) found.push({name,date:d,kind:kind});
      }
      // Gastos fijos guardan el día del mes, no una fecha completa.
      if (kind === 'gasto fijo' && Number.isInteger(Number(item.dia)) && Number(item.dia)>=1 && Number(item.dia)<=31 && item.activo!==false) {
        const [y,m] = today.split('-').map(Number); const last = new Date(Date.UTC(y,m,0)).getUTCDate(); const d = `${y}-${String(m).padStart(2,'0')}-${String(Math.min(Number(item.dia),last)).padStart(2,'0')}`; const delta=dayDiff(d,today);
        if (delta>=0 && delta<=3 && (item.ult||'')<today.slice(0,7)) found.push({name,date:d,kind});
      }
    }
  };
  scan(doc?.tarjetas,'tarjeta'); scan(doc?.vtos,'vencimiento'); scan((doc?.fijos||[]).filter((x:any)=>x.activo!==false),'gasto fijo');
  const unique = new Map(found.map(x=>[`${x.kind}|${x.name}|${x.date}`,x]));
  return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8);
}
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', {status:405});
  const cron = Deno.env.get('CRON_SECRET');
  if (!cron || req.headers.get('x-cron-secret') !== cron) return new Response('Unauthorized', {status:401});
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')!;
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
  webpush.setVapidDetails(subject, pub, priv);
  const admin = createClient(url, service, {auth:{persistSession:false}});
  const {data:docs,error:docErr} = await admin.from('datos').select('user_id,doc');
  if (docErr) return new Response(JSON.stringify({error:docErr.message}),{status:500});
  const today = new Date().toISOString().slice(0,10); let sent=0, failed=0, considered=0;
  for (const row of docs||[]) {
    const items=upcoming(row.doc,today); if(!items.length) continue;
    const {data:subs,error} = await admin.from('push_subscriptions').select('id,subscription').eq('user_id',row.user_id);
    if(error) { failed++; continue; }
    const body = items.slice(0,3).map(x=>`${x.name}: ${x.date===today?'vence hoy':`vence el ${x.date}`}`).join(' · ')+(items.length>3?` · y ${items.length-3} más`:'' );
    for(const sub of subs||[]) {
      considered++;
      try { await webpush.sendNotification(sub.subscription, JSON.stringify({title:'Mis finanzas · próximos vencimientos',body,url:'./',tag:`vencimientos-${today}`})); sent++; }
      catch(e) { failed++; const status=(e as any)?.statusCode; if(status===404||status===410) await admin.from('push_subscriptions').delete().eq('id',sub.id); }
    }
  }
  return new Response(JSON.stringify({ok:true,today,considered,sent,failed}),{headers:{'Content-Type':'application/json'}});
});
