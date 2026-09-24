const CACHE_NAME = "couples-hear-v2";
const AUDIO_CACHE = "couples-hear-audio-v2";

// Dynamically determine the base path (supports both root '/' and GitHub Pages '/repo-name/')
const basePath = self.location.pathname.substring(0, self.location.pathname.lastIndexOf("/") + 1);

const APP_SHELL = [
  basePath,
  basePath + "index.html",
  basePath + "manifest.json",
  basePath + "icon.svg",
  basePath + "apple-touch-icon.png",
  basePath + "pwa-192x192.png",
  basePath + "pwa-512x512.png",
  basePath + "favicon-64x64.png"
];

// Install: Cache app shell safely without failing on missing optional files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          fetch(url).then((response) => {
            if (response.ok) {
              return cache.put(url, response);
            }
          }).catch((err) => {
            console.warn("[SW] Cache item skipped:", url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== AUDIO_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy routing
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Bypass real-time room streaming and write API requests
  if (
    url.pathname.includes("/events") ||
    event.request.method !== "GET" ||
    url.pathname.includes("/api/rooms/") ||
    url.pathname.includes("/api/upload")
  ) {
    return; // Pass through directly to network
  }

  // 2. Audio files: Cache First with Network Fallback
  if (url.pathname.includes("/audio/") && !url.pathname.includes("range")) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return cachedResponse || Response.error();
        }
      })
    );
    return;
  }

  // 3. Navigation requests (App Shell)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedShell = (await cache.match(basePath + "index.html")) || (await cache.match(basePath));
        return cachedShell || Response.error();
      })
    );
    return;
  }

  // 4. Stale-While-Revalidate for App Assets, Styles, Scripts, Fonts
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            event.request.url.startsWith(self.location.origin)
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
