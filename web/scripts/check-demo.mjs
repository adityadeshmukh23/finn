// Run after `npm run build`. A research file named in the manifest but missing from dist would only show up as an error on a phone.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const demo = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'demo')
const problems = []
const read = (f) => {
  const p = join(demo, f)
  if (!existsSync(p)) { problems.push(`${f} is missing`); return null }
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { problems.push(`${f} isn't JSON`); return null }
}

const manifest = read('manifest.json')
const index = read('research/index.json')
const walks = read('walks.json')
for (const f of ['market.json', 'timeline.json']) read(f)
if (manifest) {
  if (!manifest.research?.length) problems.push('the manifest names no research')
  for (const s of manifest.research ?? []) {
    const r = read(`research/${s}.json`)
    if (r && r.symbol !== s) problems.push(`research/${s}.json holds ${r.symbol}`)
  }
  for (const c of index?.companies ?? []) if (!manifest.research.includes(c.symbol)) problems.push(`the index names ${c.symbol}, the manifest doesn't`)
  for (const w of walks ?? []) if (!manifest.research.includes(w.symbol)) problems.push(`a walk names ${w.symbol}, which has no research`)
  for (const d of manifest.days) for (const h of manifest.windows) read(`digest-${d}-${h}.json`)
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`demo data complete: ${manifest.research.length} research files, ${manifest.days.length * manifest.windows.length} briefings`)
