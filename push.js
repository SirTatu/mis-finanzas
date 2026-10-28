/* Registro de notificaciones push; requiere configurar la clave pública VAPID y desplegar Edge Functions. */
(function(){
 'use strict';
 function b64u(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
 async function activar(){
  const C=window.APP_CONFIG||{},ses=window.__sync&&window.__sync.ses&&window.__sync.ses();
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error('Este navegador no admite notificaciones push. En iPhone, agregá primero la app a la pantalla de inicio y abrila desde ese ícono.');
  if(!C.vapidPublicKey||C.vapidPublicKey.indexOf('PEGAR_')===0)throw new Error('Falta configurar vapidPublicKey en config.js. Seguí NOTIFICACIONES-Y-BIOMETRIA.md.');
  if(!C.url||!C.key||!ses||!ses.access)throw new Error('Primero iniciá sesión con Supabase.');
  const perm=await Notification.requestPermission();if(perm!=='granted')throw new Error('No concediste permiso de notificaciones. Revisá los ajustes del navegador/iPhone.');
  const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(C.vapidPublicKey)});
  const res=await fetch(C.url.replace(/\/$/,'')+'/functions/v1/register-push',{method:'POST',headers:{'Content-Type':'application/json','apikey':C.key,'Authorization':'Bearer '+ses.access},body:JSON.stringify({subscription:sub.toJSON(),userAgent:navigator.userAgent})});
  const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||body.message||('No se pudo guardar la suscripción (HTTP '+res.status+'). Desplegá la función register-push.'));
  return 'Notificaciones activadas en este dispositivo.';
 }
 async function desactivar(){const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe();return 'Se desactivaron las notificaciones push en este dispositivo. Para quitar también la suscripción del servidor, volvé a activar y luego eliminá el dispositivo desde Supabase.'}
 window.MFPush={activar,desactivar};
})();
