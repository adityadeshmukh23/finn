// Bundle-size ceiling. Run after `npm run build`. The app ships no chart, animation or UI library;
// this keeps it that way. The ceiling is the gzipped total of the JS and CSS in dist/assets.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const CEILING_KB = 130
const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets')
let total = 0
for (const f of readdirSync(assets)) {
  if (!/\.(js|css)$/.test(f)) continue
  const kb = gzipSync(readFileSync(join(assets, f))).length / 1024
  total += kb
  console.log(`${f.padEnd(32)} ${kb.toFixed(1)} KB gzip`)
}
console.log(`total ${total.toFixed(1)} KB gzip, ceiling ${CEILING_KB} KB`)
if (total > CEILING_KB) {
  console.error(`Over the ${CEILING_KB} KB ceiling`)
  process.exit(1)
}
