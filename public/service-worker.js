'use strict';

// Rodando UTP — Service Worker v5.2
// Cambia este valor cuando publiques una versión nueva de tus archivos.
const CACHE_VERSION = 'v5.2.0-cache-api';
const CACHE_PREFIX = 'rodando-utp-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${CACHE_VERSION}`;

// Rutas originales del proyecto, conservadas para que la PWA pueda instalarse y abrirse offline.
// IMPORTANTE: todas deben existir para que cache.addAll() complete la instalación.
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/styles.css?v=5.1.0',
  '/js/app.js?v=5.1.0',
  '/manifest.webmanifest',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/img/hero-carpool.svg',
  '/img/utp-route.svg',
  '/img/innovation-network.svg',
  '/img/student-community.svg',
  '/img/video-poster.svg'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Borra exclusivamente cachés de Rodando UTP, incluyendo la versión antigua v5.1.
    await Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

const isCacheableResponse = response => response && response.ok && response.type === 'basic';

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Evitar guardar API, datos de usuario, sesiones, reservaciones y panel administrativo.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  // Documentos HTML: Network First. Si falla la red, mostrar el HTML precargado.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (isCacheableResponse(response) && url.pathname === '/') {
          const copy = response.clone();
          event.waitUntil(caches.open(RUNTIME_CACHE).then(cache => cache.put('/index.html', copy)));
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request) || await caches.match('/index.html');
        return cached || new Response('Sin conexión. Vuelve a intentarlo cuando tengas internet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Recursos estáticos: Stale While Revalidate.
  // Se sirve inmediatamente la versión guardada y se actualiza desde la red en segundo plano.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const networkPromise = fetch(request).then(async response => {
      if (isCacheableResponse(response)) {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    });

    if (cached) {
      event.waitUntil(networkPromise.catch(() => undefined));
      return cached;
    }

    try {
      return await networkPromise;
    } catch (error) {
      return new Response('Recurso no disponible sin conexión.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

// Desde la página puedes enviar mensajes al SW para consultar o limpiar sus cachés.
// Ejemplo: navigator.serviceWorker.controller.postMessage({ type: 'RODANDO_CACHE_INFO' });
self.addEventListener('message', event => {
  const type = event.data && event.data.type;
  if (type === 'RODANDO_CACHE_INFO') {
    event.waitUntil((async () => {
      const info = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith(CACHE_PREFIX)) continue;
        const cache = await caches.open(name);
        info.push({ name, entries: (await cache.keys()).length });
      }
      if (event.source && typeof event.source.postMessage === 'function') {
        event.source.postMessage({ type: 'RODANDO_CACHE_INFO_RESULT', caches: info });
      }
    })());
  }

  if (type === 'RODANDO_CLEAR_APP_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(name => name.startsWith(CACHE_PREFIX)).map(name => caches.delete(name)));
      if (event.source && typeof event.source.postMessage === 'function') {
        event.source.postMessage({ type: 'RODANDO_CLEAR_APP_CACHE_RESULT', success: true });
      }
    })());
  }
});
