const CACHE_NAME = 'sozha-maint-v7';
const ASSETS = [
    './',
    './index.html',
    './client.html',
    './style.css',
    './app.js',
    './logo.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting(); // Force activation
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    // DO NOT cache Google Script calls
    if (event.request.url.includes('script.google.com')) {
        return;
    }

    // "Network First, falling back to cache" strategy for core assets
    // This ensures updates from GitHub are visible immediately if online
    event.respondWith(
        fetch(event.request).then((response) => {
            // Update the cache with the new version
            if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
            }
            return response;
        }).catch(() => {
            // If network fails, serve from cache
            return caches.match(event.request);
        })
    );
});
