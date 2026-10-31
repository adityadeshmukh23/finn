// Guards against the stale-app-shell blank page. Run after `npm run build`.
//
// FINN ships no caching service worker. dist/sw.js is only a kill switch for browsers that still have
// the old worker, and index.html must never point at a file the build didn't produce. Checks:
//   1. the build contains no workbox, precache manifest or registerSW.js, and sw.js is the kill switch
//   2. the kill switch behaves: takes over, deletes every cache, unregisters, reloads open pages, never answers a fetch
//   3. every local file index.html references exists in dist
//   4. the Vercel rewrite never answers a missing /assets/ or /demo/ file with index.html
//   5. sw.js and index.html are served no-cache
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const problems = []
const check = (ok, msg) => { if (!ok) problems.push(msg) }

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ not found: run `npm run build` first')
  process.exit(1)
}

// 1. no caching worker in the build
const files = readdirSync(dist)
check(!files.some((f) => /^workbox-/.test(f)), 'dist contains a workbox runtime')
check(!files.includes('registerSW.js'), 'dist contains registerSW.js')
check(existsSync(join(dist, 'sw.js')), 'dist/sw.js (the kill switch) is missing')
const sw = existsSync(join(dist, 'sw.js')) ? readFileSync(join(dist, 'sw.js'), 'utf8') : ''
const swCode = sw.replace(/^\s*\/\/.*$/gm, '')
check(!/precache|workbox|CacheFirst|StaleWhileRevalidate|cache\.(put|add)/.test(swCode), 'sw.js caches something')
check(sw === readFileSync(join(root, 'public', 'sw.js'), 'utf8'), 'dist/sw.js differs from public/sw.js')

// 2. run the kill switch against a fake ServiceWorkerGlobalScope
const listeners = {}
const cacheNames = ['workbox-precache-v2-http://localhost/', 'finn-demo']
const calls = { skipWaiting: 0, claim: 0, unregister: 0, deleted: [], navigated: [] }
const scope = {
  addEventListener: (type, fn) => { listeners[type] = fn },
  skipWaiting: () => { calls.skipWaiting++; return Promise.resolve() },
  registration: { unregister: () => { calls.unregister++; return Promise.resolve(true) } },
  clients: {
    claim: () => { calls.claim++; return Promise.resolve() },
    matchAll: () => Promise.resolve([{ url: 'https://finn.example/', navigate: (u) => { calls.navigated.push(u); return Promise.resolve() } }]),
  },
}
scope.self = scope
scope.caches = { keys: () => Promise.resolve([...cacheNames]), delete: (k) => { calls.deleted.push(k); return Promise.resolve(true) } }
try {
  vm.runInNewContext(sw, scope)
  check(!listeners.fetch, 'sw.js handles fetch events')
  check(typeof listeners.install === 'function' && typeof listeners.activate === 'function', 'sw.js lacks install or activate')
  listeners.install?.({})
  let pending
  listeners.activate?.({ waitUntil: (p) => { pending = p } })
  await pending
  check(calls.skipWaiting === 1, 'kill switch does not skip waiting')
  check(calls.claim === 1, 'kill switch does not claim clients')
  check(cacheNames.every((k) => calls.deleted.includes(k)), 'kill switch leaves caches behind')
  check(calls.unregister === 1, 'kill switch does not unregister itself')
  check(calls.navigated.length === 1, 'kill switch does not reload open pages')
} catch (e) {
  check(false, `kill switch threw: ${e.message}`)
}

// 3. index.html only references files the build produced
const html = readFileSync(join(dist, 'index.html'), 'utf8')
for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) {
  check(existsSync(join(dist, url)), `index.html references ${url}, which is not in dist`)
}
check(/<link rel="manifest" href="\/manifest\.webmanifest"/.test(html), 'index.html has no manifest link')
check(!/registerSW|serviceWorker\.register/.test(html), 'index.html registers a service worker')

// 4 and 5. Vercel rewrite and headers
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
const spa = new RegExp(`^${vercel.rewrites[0].source}$`)
for (const p of ['/assets/index-OLDHASH.js', '/assets/index-OLDHASH.css', '/demo/digest-2020-01-01-24.json', '/sw.js']) {
  check(!spa.test(p), `rewrite would answer ${p} with index.html`)
}
for (const p of ['/', '/research/BEL']) check(spa.test(p), `rewrite no longer covers ${p}`)
for (const path of ['/sw.js', '/index.html']) {
  const h = vercel.headers?.find((x) => x.source === path)?.headers ?? []
  check(h.some((x) => x.key === 'Cache-Control' && /no-cache/.test(x.value)), `${path} is not served no-cache`)
}

if (problems.length) {
  console.error(`stale-shell guard failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('stale-shell guard passed: no caching worker, kill switch behaves, index.html only references built files')
