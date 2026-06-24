const CACHE = "omrm-mvp-client-v11";
const ASSETS = [
  "./",
  "./index.html",
  "./demo-standalone.html",
  "./styles.css",
  "./app.js",
  "./src/utils/id.js",
  "./src/models/cardModel.js",
  "./src/models/rankingModel.js",
  "./src/repositories/localStore.js",
  "./src/repositories/domainRepository.js",
  "./src/repositories/configRepository.js",
  "./src/services/syncService.js",
  "./src/services/competitionTimerService.js",
  "./src/services/auditService.js",
  "./src/services/scoringService.js",
  "./src/services/rankingService.js",
  "./data/app-config.json",
  "./data/demo-data.json",
  "./data/card-template-zwirownia-2026.json",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => caches.match("./index.html")))
  );
});
