const SW_VERSION = "1.0.5";
const CACHE_NAME = `ledger-v${SW_VERSION}`;
const STATIC_ASSETS = [
  "/",
  "/logo.svg",
  "/logo-192.png",
  "/logo-512.png",
  "/maskable-icon.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/manifest.json",
];

// Install Event — activate immediately to purge stale cache
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => console.warn("PWA: Pre-caching failed", err));
    })
  );
});

// Message listener — React app sends SKIP_WAITING when user taps "Update"
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "GET_VERSION") {
    const replyPort = event.ports?.[0];
    if (replyPort) {
      replyPort.postMessage({ type: "SW_VERSION", version: SW_VERSION });
      return;
    }

    event.source?.postMessage({ type: "SW_VERSION", version: SW_VERSION });
  }
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, API routes, and Next.js dev HMR
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api") ||
    url.pathname.includes("/_next/webpack-hmr")
  ) {
    return;
  }

  // Cache-First for static assets: fonts, images, css, js
  const isStaticAsset =
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/) ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && !url.pathname.startsWith("/_next/static/")) {
              const cacheCopy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, cacheCopy);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            return new Response("Offline resource", { status: 503, statusText: "Offline" });
          });
      })
    );
  } else {
    // Network-First for documents and navigation
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, cacheCopy);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return caches.match("/");
          });
        })
    );
  }
});
