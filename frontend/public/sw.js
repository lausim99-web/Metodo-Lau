/* METODOLAU — minimal service worker: enables "Installa app" (PWA).
   Network-first for everything; no offline caching of private data. */
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
