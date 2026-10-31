// Kill switch. FINN no longer ships a caching service worker: an earlier build precached index.html,
// and after a redeploy that cached shell could point at hashed assets the server no longer has,
// which left the page blank until a hard reload. Browsers that still have the old worker re-fetch
// this file on their next visit, so it replaces that worker, deletes its caches, unregisters itself
// and reloads the page from the network. It has no fetch handler: nothing is ever served from here.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim()
    for (const key of await caches.keys()) await caches.delete(key)
    await self.registration.unregister()
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url)
  })())
})
