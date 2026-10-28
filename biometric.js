/* Bloqueo biométrico local WebAuthn para PWA. No reemplaza el login de Supabase. */
(function(){
  'use strict';
  function b64u(bytes){return btoa(String.fromCharCode.apply(null,new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
  function unb64u(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
  function rand(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return a}
  function supported(){return !!(window.PublicKeyCredential&&navigator.credentials&&location.protocol==='https:')}
  async function configure(){
    if(!supported())throw new Error('Este navegador no admite WebAuthn en este contexto seguro. Abrí la app desde su URL HTTPS y probá con Safari actualizado.');
    if(PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable && !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) throw new Error('Este dispositivo no informa un autenticador biométrico disponible.');
    const userId=rand(16),challenge=rand(32),rpId=location.hostname;
    const cred=await navigator.credentials.create({publicKey:{challenge,rp:{name:'Mis finanzas',id:rpId},user:{id:userId,name:'usuario-finanzas',displayName:'Mis finanzas'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],timeout:60000,attestation:'none',authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'}}});
    if(!cred)throw new Error('No se completó el registro biométrico.');
    localStorage.setItem('mf_webauthn_cred',b64u(cred.rawId));localStorage.setItem('mf_webauthn_rp',rpId);
    return 'Biometría configurada. Al abrir la app, tocá “Desbloquear con Face ID / Touch ID”.';
  }
  async function verify(){
    const id=localStorage.getItem('mf_webauthn_cred');if(!id)throw new Error('No hay biometría configurada.');
    const cred=await navigator.credentials.get({publicKey:{challenge:rand(32),rpId:localStorage.getItem('mf_webauthn_rp')||location.hostname,allowCredentials:[{type:'public-key',id:unb64u(id)}],timeout:60000,userVerification:'required'}});
    if(!cred)throw new Error('No se pudo verificar la biometría.');return true;
  }
  function lockScreen(onSuccess,onPin){
    const d=document.createElement('div');d.id='mfBioLock';d.style.cssText='position:fixed;inset:0;z-index:99999;background:var(--bg,#eef1ee);color:var(--ink,#17262b);display:flex;align-items:center;justify-content:center;padding:24px;font:16px system-ui';
    d.innerHTML='<section style="max-width:360px;width:100%;text-align:center"><h1 style="margin-bottom:10px">Mis finanzas está bloqueado</h1><p style="margin-bottom:18px">Verificá tu identidad con la biometría del dispositivo.</p><button id="mfBioGo" style="padding:13px 16px;border:0;border-radius:12px;background:#0e6b66;color:white;width:100%;font:inherit">Desbloquear con Face ID / Touch ID</button><p id="mfBioErr" style="margin:12px 0;color:#a63a2e"></p><button id="mfBioPin" style="padding:10px;border:0;background:transparent;color:inherit">Usar PIN</button></section>';
    document.body.appendChild(d);
    d.querySelector('#mfBioGo').onclick=async()=>{const b=d.querySelector('#mfBioGo'),e=d.querySelector('#mfBioErr');b.disabled=true;b.textContent='Verificando…';try{await verify();d.remove();onSuccess()}catch(x){e.textContent=x.message||'No se pudo verificar.';b.disabled=false;b.textContent='Volver a intentar'}};
    d.querySelector('#mfBioPin').onclick=()=>{if(onPin)onPin();else d.querySelector('#mfBioErr').textContent='No hay PIN configurado. Contactá al administrador de esta instalación.'};
  }
  function pinFallback(hash,onSuccess){const p=prompt('Ingresá tu PIN para abrir Mis finanzas');if(p===null){document.body.innerHTML='<main><h1>Mis finanzas bloqueado</h1><p>Recargá la app e ingresá la biometría o PIN para continuar.</p></main>';return}crypto.subtle.digest('SHA-256',new TextEncoder().encode(p)).then(buf=>{const h=Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');if(h===hash){const d=document.getElementById('mfBioLock');if(d)d.remove();onSuccess()}else{alert('PIN incorrecto.');pinFallback(hash,onSuccess)}})}
  window.MFBiometric={configure,verify,lockScreen,pinFallback,supported};
})();
