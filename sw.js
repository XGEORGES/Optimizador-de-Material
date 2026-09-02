/**
 * Service Worker PWA para Optimizador 2D CAD (Módulo 5).
 * Estrategia Cache-First para funcionamiento 100% desconectado de internet (Offline).
 */

const CACHE_NAME = 'nesting-cad-pwa-v8';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './src/ui/styles.css',
  './src/app.js',
  './src/geometry/math.js',
  './src/geometry/topology.js',
  './src/geometry/dxfExtractor.js',
  './src/geometry/polygonOffset.js',
  './src/state/nestingStore.js',
  './src/nesting/nestingEngine.js',
  './src/nesting/nesting.worker.js',
  './src/ui/canvasViewer.js',
  './src/ui/inventoryView.js',
  './src/ui/nestingRenderer.js',
  './src/ui/thumbnailRenderer.js',
  './src/ui/hologramViewer.js',
  './src/export/dxfExporter.js',
  'https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Intentar cachear todos los archivos locales de forma resiliente
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`No se pudo cachear ${asset}:`, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cachear dinámicamente recursos GET válidos
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Si no hay red y se solicita la página principal, devolver index.html del cache
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
