/* 小一 PWA Service Worker — 基本離線殼層快取 */
const CACHE = "xiao-yi-v6";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./mobile/voice_studio.html",
  "./mobile/voice_studio.css",
  "./mobile/voice_studio.js",
  "./mobile/assets/home.png",
  "./desktop/voice_studio.html",
  "./desktop/voice_studio.css",
  "./desktop/voice_studio.js",
  "./desktop/assets/home.png",
  "./desktop/auth.js",
  "./desktop/auto_tag.js",
  "./desktop/wake_word.js",
  "./desktop/gemini_tagger.js",
  "./desktop/config.example.js",
  "./desktop/config.deploy.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && url.protocol.startsWith("http")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
