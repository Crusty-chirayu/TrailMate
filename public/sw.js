/*
 * TrailMate application service worker.
 *
 * Kept intentionally conservative:
 *  - Only same-origin GET requests are handled.
 *  - Cross-origin requests (Supabase, OpenStreetMap tiles) are left to the
 *    network/browser and are never cached.
 *  - Navigations are network-first and fall back to a small offline page, so
 *    auth/data pages are never replayed from a stale or cookie-bearing cache.
 *  - Hashed build assets under /_next/static/ and PWA assets are cache-first.
 */
const CACHE_NAME = 'trailmate-shell-v1';
const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isCachableAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/offline.html' ||
    pathname.startsWith('/icons/')
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached.clone();
  }

  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await caches.match('/offline.html');
    if (cached) {
      return cached.clone();
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCachableAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
});
