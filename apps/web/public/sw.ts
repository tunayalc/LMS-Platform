/// <reference lib="webworker" />

// Declare service worker specific types
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'lms-cache-v1';
const RUNTIME_CACHE = 'lms-runtime-v1';

// Resources to cache immediately on install
const PRECACHE_URLS = [
    '/',
    '/dashboard/student',
    '/offline.html',
    '/manifest.json',
    '/favicon.ico'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Precaching app shell');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
                    .map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip API calls (let them go to network)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // For navigation requests, use network first with offline fallback
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .catch(() => caches.match('/offline.html') as Promise<Response>)
        );
        return;
    }

    // For static assets, use cache first
    if (
        url.pathname.startsWith('/_next/static/') ||
        url.pathname.startsWith('/icons/') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.svg')
    ) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Default: network first with cache fallback
    event.respondWith(networkFirst(request));
});

// Cache first strategy
async function cacheFirst(request: Request): Promise<Response> {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch {
        return new Response('Offline', { status: 503 });
    }
}

// Network first strategy
async function networkFirst(request: Request): Promise<Response> {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        return new Response('Offline', { status: 503 });
    }
}

// Handle push notifications
self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? { title: 'LMS Bildirimi', body: 'Yeni bir bildiriminiz var' };

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            data: data.url ? { url: data.url } : undefined
        } as NotificationOptions)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'open' && event.notification.data?.url) {
        event.waitUntil(
            self.clients.openWindow(event.notification.data.url)
        );
    }
});

// Background sync for offline actions
self.addEventListener('message', (event) => {
    if (event.data === 'sync-offline-data') {
        syncOfflineData();
    }
});

async function syncOfflineData() {
    // Get pending actions from IndexedDB and sync
    console.log('[SW] Syncing offline data...');
    // Implementation would get queued requests from IndexedDB and replay them
}

export { };
