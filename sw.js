// Service worker: hace que la app funcione aunque haya poca cobertura.
// Sube VERSION cuando cambies los ficheros de la app (no hace falta al cambiar data.json).
const VERSION = "avzonazul-v2";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Los datos y la localización siempre se piden frescos; si no hay red, se usa la copia guardada
  if (url.pathname.endsWith("data.json")) {
    e.respondWith(
      fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  if (url.origin !== location.origin) return; // geolocalización inversa, tiendas, etc.
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
