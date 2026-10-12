// Builds public/places.tsv — the offline place-name lookup used for photo locations.
// Data: GeoNames (https://www.geonames.org, CC BY 4.0).
//
//   1. Download and unzip into a folder:
//        https://download.geonames.org/export/dump/cities5000.zip   (whole world, ≥5000 inhabitants)
//        https://download.geonames.org/export/dump/cities1000.zip   (used for the Nordics, ≥1000 inhabitants)
//   2. node scripts/build-places.mjs <folder>
//
// Output: one line per place, "name<TAB>countrycode<TAB>lat<TAB>lon", lat/lon with 3 decimals (~100 m).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) throw new Error('Usage: node scripts/build-places.mjs <folder with cities5000.txt and cities1000.txt>')

const DETAILED = new Set(['SE', 'NO', 'DK', 'FI', 'IS', 'AX'])
const seen = new Set()
const out = []

function add(file, filter) {
  for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
    const f = line.split('\t')
    if (f.length < 9 || !filter(f[8])) continue
    const [id, name, , , lat, lon, , , cc] = f
    if (seen.has(id)) continue
    seen.add(id)
    out.push(`${name}\t${cc}\t${Number(lat).toFixed(3)}\t${Number(lon).toFixed(3)}`)
  }
}

add('cities5000.txt', () => true)
add('cities1000.txt', (cc) => DETAILED.has(cc))

writeFileSync(new URL('../public/places.tsv', import.meta.url), out.join('\n') + '\n')
console.log(`${out.length} places written to public/places.tsv`)
