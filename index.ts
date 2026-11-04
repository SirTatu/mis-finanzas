import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'Method not allowed'}), {status:405,headers:{...cors,'Content-Type':'application/json'}});
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth = req.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Iniciá sesión para activar notificaciones.');
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession:false } });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({error:'Sesión inválida. Volvé a iniciar sesión.'}), {status:401,headers:{...cors,'Content-Type':'application/json'}});
    const body = await req.json();
    const sub = body.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('Suscripción push incompleta.');
    const admin = createClient(url, service, {auth:{persistSession:false}});
    const {error} = await admin.from('push_subscriptions').upsert({ user_id:user.id, endpoint:sub.endpoint, subscription:sub, user_agent:String(body.userAgent||'').slice(0,500), updated_at:new Date().toISOString() }, {onConflict:'endpoint'});
    if (error) throw error;
    return new Response(JSON.stringify({ok:true}), {headers:{...cors,'Content-Type':'application/json'}});
  } catch (e) {
    return new Response(JSON.stringify({error:e?.message||'Error interno'}), {status:400,headers:{...cors,'Content-Type':'application/json'}});
  }
});
