const CACHE_NAME = 'cw-transcriber-shell-v23';
const REQUIRED_ASSETS = ['./', './index.html', './manifest.webmanifest', './cw-audio-processor.js', './icons/cw-icon-192.png', './icons/cw-icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(cacheApplicationShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('cw-transcriber-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;
  event.respondWith(event.request.mode === 'navigate' ? navigationResponse(event.request) : assetResponse(event.request));
});

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch('./index.html', { cache: 'reload' });
  if (!indexResponse.ok) throw new Error('Application shell was unavailable.');
  const markup = await indexResponse.clone().text();
  const discoveredAssets = Array.from(markup.matchAll(/(?:src|href)="([^"]+)"/g), (match) => match[1])
    .filter((path) => !path.startsWith('data:') && !path.startsWith('http'));
  const lazyChunks = [];
  const pendingScripts = [...discoveredAssets.filter((asset) => asset.endsWith('.js'))];
  const inspectedScripts = new Set();
  while (pendingScripts.length) {
    const path = pendingScripts.shift();
    if (!path || inspectedScripts.has(path)) continue;
    inspectedScripts.add(path);
    const response = await fetch(new URL(path, self.registration.scope), { cache: 'reload' });
    if (!response.ok) continue;
    const source = await response.text();
    for (const match of source.matchAll(/chunk-[A-Za-z0-9_-]+\.js/g)) {
      const chunk = `./${match[0]}`;
      if (!lazyChunks.includes(chunk)) lazyChunks.push(chunk);
      if (!inspectedScripts.has(chunk)) pendingScripts.push(chunk);
    }
  }
  await cache.put('./', indexResponse.clone());
  await cache.put('./index.html', indexResponse);
  const assetUrls = [...REQUIRED_ASSETS.slice(2), ...discoveredAssets, ...lazyChunks]
    .map((path) => new URL(path, self.registration.scope).href);
  await cache.addAll(Array.from(new Set(assetUrls)));
}

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put('./', response.clone());
      return response;
    }
    return (await cache.match('./index.html')) || (await cache.match('./')) || response;
  } catch {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function assetResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}
