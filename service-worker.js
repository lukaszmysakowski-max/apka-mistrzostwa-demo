const CACHE = "omrm-mvp-client-v51";
const ASSETS = [
  "./",
  "./index.html",
  "./demo-standalone.html",
  "./styles.css?v=users-v51",
  "./app.js?v=users-v51",
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
  "./data/card-template-blair-a-2026.json",
  "./data/card-template-blair-d-2026.json",
  "./data/card-template-szybcy-a-2026.json",
  "./data/card-template-szybcy-b-2026.json",
  "./data/card-template-kill-bill-2026.json",
  "./data/card-template-trainspotting-2026.json",
  "./manifest.json",
  "./icon.svg",
  "./assets/images/logo.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => caches.match("./index.html")))
  );
});
