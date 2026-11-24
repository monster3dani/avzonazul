// Service worker: hace que la app funcione aunque haya poca cobertura y muestra los avisos.
// La versión se cambia en version.js (no aquí).
importScripts("version.js");
const VERSION = "avzonazul-" + self.AVZ_VERSION;
const SHELL = [
  "./", "index.html", "version.js", "i18n.js", "styles.css", "app.js", "config.js", "manifest.webmanifest",
  "lib/leaflet.js", "lib/leaflet.css",
  "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-800-normal.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon.png"
];
const IMG_CACHE = "avzonazul-img";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(async () => {
    // La primera vez se activa sola; las siguientes espera a que el usuario pulse «Actualizar».
    // Excepción: si viene de la versión antigua sin botón de actualizar, se activa sola.
    if (!self.registration.active || (await caches.has("avzonazul-v3")) || (await caches.has("avzonazul-v2"))) self.skipWaiting();
  }));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Datos: siempre frescos; sin red, la última copia
  if (url.pathname.endsWith("data.json") || url.pathname.endsWith("festivos.json")) {
    e.respondWith(
      fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Logos de las apps y trozos del mapa: se guardan para ir más rápido
  if (/mzstatic\.com$|duckduckgo\.com$|tile\.openstreetmap\.org$/.test(url.hostname)) {
    e.respondWith(caches.open(IMG_CACHE).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok || r.type === "opaque") c.put(e.request, r.clone());
      return r;
    }).catch(() => fetch(e.request)));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});

// Al tocar el aviso, abrir (o traer al frente) la app
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  }));
});

// La app pide activar la versión nueva
self.addEventListener("message", e => { if (e.data === "actualizar") self.skipWaiting(); });
