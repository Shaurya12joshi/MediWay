// MediWay's service worker: makes the site installable and keeps the pages you've opened,
// above all /emergency and its saved list of emergency rooms, working without a connection.
//   Pages:  network first (fresh data when online), the saved copy when offline or very slow
//   /assets (hashed by Vite, never change): saved the first time they load
//   Fonts:  saved copy at once, refreshed in the background
// Live data (Supabase, maps, routing) is never cached here; the app keeps what it needs itself.

const VERSION = 'v1';
const PAGES = `mediway-pages-${VERSION}`;
const ASSETS = `mediway-assets-${VERSION}`;
const FONTS = `mediway-fonts-${VERSION}`;
const SLOW_NETWORK_MS = 4000;

// The app shell and the emergency page, with every script and stylesheet the shell loads
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const pages = await caches.open(PAGES);
    const assets = await caches.open(ASSETS);
    for (const url of ['/', '/emergency']) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) continue;
        const html = await res.clone().text();
        await pages.put(url, res);
        const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
        await assets.addAll([...new Set(files)]);
      } catch { /* offline while installing: the runtime caching below fills in */ }
    }
    await assets.addAll(['/manifest.webmanifest', '/icons/icon-192.png', '/favicon.png']).catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [PAGES, ASSETS, FONTS];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  const network = fetch(request).then(res => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  const slow = new Promise(resolve => setTimeout(resolve, SLOW_NETWORK_MS));
  try {
    const res = await Promise.race([network, slow]);
    if (res) return res;
  } catch { /* offline */ }
  // Offline or slow: this page as last seen, else the app shell (the router draws any page)
  const saved = await cache.match(request, { ignoreSearch: true }) ?? await cache.match('/');
  return saved ?? network;
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const saved = await cache.match(request);
  if (saved) return saved;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, name) {
  const cache = await caches.open(name);
  const saved = await cache.match(request);
  const fresh = fetch(request).then(res => {
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  }).catch(() => saved);
  return saved ?? fresh;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      // Admin and sign-in pages always come from the network
      if (/^\/(admin|auth)/.test(url.pathname)) return;
      event.respondWith(networkFirst(request));
    } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
      event.respondWith(cacheFirst(request, ASSETS));
    }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONTS));
  }
});
