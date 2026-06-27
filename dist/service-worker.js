// Sweet Sync Vault – Service Worker
// Supports Background Fetch API for downloads that survive tab minimization/hiding

const CACHE_NAME = 'ssv-cache-v3';
const BG_FETCH_CACHE = 'ssv-bgfetch-v2';

// In-memory store of {id -> {filename, resolveTs}} for active background fetches
const bgFetchMeta = new Map();

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== BG_FETCH_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Message handler (from page → SW) ────────────────────────────────────────

self.addEventListener('message', event => {
  const { type, id, filename } = event.data || {};
  if (type === 'BG_FETCH_META') {
    // Page tells SW which filename belongs to which fetch id
    bgFetchMeta.set(id, { filename });
  }
});

// ─── Background Fetch handlers ────────────────────────────────────────────────

self.addEventListener('backgroundfetchsuccess', event => {
  const bgFetch = event.registration;
  event.waitUntil((async () => {
    const meta = bgFetchMeta.get(bgFetch.id) || { filename: bgFetch.id };
    try {
      const records = await bgFetch.matchAll();
      const cache = await caches.open(BG_FETCH_CACHE);
      await Promise.all(
        records.map(async record => {
          const response = await record.responseReady;
          await cache.put(`/sw-dl/${bgFetch.id}`, response.clone());
        })
      );

      // Notify all open clients
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({
          type: 'BG_FETCH_DONE',
          id: bgFetch.id,
          filename: meta.filename,
        });
      }

      // Show notification so user knows the download is ready
      if (self.registration.showNotification) {
        await self.registration.showNotification('Download Ready ✅', {
          body: `${meta.filename} finished downloading!`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: bgFetch.id,
          renotify: true,
          data: { id: bgFetch.id, filename: meta.filename },
        });
      }
    } catch (err) {
      console.error('[SW] backgroundfetchsuccess handler error:', err);
    } finally {
      bgFetchMeta.delete(bgFetch.id);
    }
  })());
});

self.addEventListener('backgroundfetchfail', event => {
  const bgFetch = event.registration;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: 'BG_FETCH_FAIL',
        id: bgFetch.id,
        error: 'Background download failed',
      });
    }
    bgFetchMeta.delete(bgFetch.id);
  })());
});

self.addEventListener('backgroundfetchclick', event => {
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clients.length > 0) {
      clients[0].focus();
    } else {
      self.clients.openWindow('/');
    }
  })());
});

// ─── Notification click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { id, filename } = event.notification.data || {};
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = clients[0];
    if (target) {
      await target.focus();
      target.postMessage({ type: 'NOTIFICATION_CLICK_DOWNLOAD', id, filename });
    } else {
      self.clients.openWindow('/');
    }
  })());
});

// ─── Fetch handler ────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Serve cached background-fetch results
  if (url.pathname.startsWith('/sw-dl/')) {
    event.respondWith(
      caches.open(BG_FETCH_CACHE).then(cache => cache.match(event.request.url))
        .then(r => r || new Response('Not found', { status: 404 }))
    );
    return;
  }

  // Skip API and function routes – always go to network
  if (
    url.pathname.startsWith('/functions/') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
