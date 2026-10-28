// Service worker: la app abre aunque no haya conexión.
// Con internet siempre baja la versión más nueva; sin internet usa la guardada.
const CACHE = 'finanzas-v5';
const ARCHIVOS = ['./', 'index.html', 'sync.js', 'config.js', 'biometric.js', 'push.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Solo archivos de la propia app; las llamadas a Supabase no se guardan.
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match('index.html')))
  );
});


// Push remoto: el servidor debe enviar payloads JSON a esta suscripción.
self.addEventListener('push', event => {
  let data = { title: 'Mis finanzas', body: 'Tenés un vencimiento próximo.', url: './' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (_) {
    try { if (event.data) data.body = event.data.text(); } catch (_) {}
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Mis finanzas', {
    body: data.body || 'Tenés un recordatorio.', icon: './icon-192.png', badge: './icon-192.png',
    data: { url: data.url || './' }, tag: data.tag || 'mis-finanzas-recordatorio', renotify: false
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    for (const c of list) if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
