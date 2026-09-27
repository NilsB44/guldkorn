// One-time setup of the push server on Cloudflare (free plan, no domain needed).
// Safe to re-run: steps that are already done are skipped.
//
//   1. log in to Cloudflare (opens the browser)
//   2. create the KV storage namespace
//   3. generate VAPID keys (public → wrangler.toml, private → Cloudflare secret, never saved on disk)
//   4. deploy the Worker and print its URL
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'

const TOML = new URL('../wrangler.toml', import.meta.url)
const wrangler = (args, opts = {}) => spawnSync(`npx wrangler ${args.join(' ')}`, { shell: true, encoding: 'utf8', ...opts })
const step = (s) => console.log(`\n▸ ${s}`)

let toml = readFileSync(TOML, 'utf8')

step('Checking Cloudflare login')
if (!/You are logged in/i.test(wrangler(['whoami']).stdout ?? '')) {
  wrangler(['login'], { stdio: 'inherit' })
}

step('KV namespace for subscriptions')
if (!/\[\[kv_namespaces\]\]/.test(toml)) {
  const out = wrangler(['kv', 'namespace', 'create', 'SUBS'])
  const id = /([0-9a-f]{32})/.exec((out.stdout ?? '') + (out.stderr ?? ''))?.[1]
  if (!id) {
    console.error(out.stdout, out.stderr)
    throw new Error('Could not create the KV namespace (see output above).')
  }
  toml = toml.trimEnd() + `\n\n[[kv_namespaces]]\nbinding = "SUBS"\nid = "${id}"\n`
  writeFileSync(TOML, toml)
  console.log(`  created (${id})`)
} else console.log('  already set')

let privateKey
step('VAPID keys')
if (/^VAPID_PUBLIC_KEY = ""/m.test(toml)) {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
  privateKey = (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d
  toml = toml.replace(/^VAPID_PUBLIC_KEY = ""/m, `VAPID_PUBLIC_KEY = "${pub}"`)
  writeFileSync(TOML, toml)
  console.log('  generated')
} else console.log('  already set')

step('Deploying the Worker')
const deploy = wrangler(['deploy'], { stdio: ['inherit', 'pipe', 'inherit'] })
process.stdout.write(deploy.stdout ?? '')
if (deploy.status !== 0) throw new Error('Deploy failed (see output above).')
const url = /(https:\/\/[\w.-]+\.workers\.dev)/.exec(deploy.stdout ?? '')?.[1]

if (privateKey) {
  step('Storing the private key as a Cloudflare secret')
  const put = wrangler(['secret', 'put', 'VAPID_PRIVATE_KEY'], { input: privateKey, stdio: ['pipe', 'inherit', 'inherit'] })
  if (put.status !== 0) throw new Error('Could not store the secret. Delete VAPID_PUBLIC_KEY in wrangler.toml (set it to "") and run setup again.')
}

console.log(`\n✓ Done. Push server: ${url ?? '(see the URL in the deploy output above)'}`)
console.log('  Put this URL in src/config.ts → pushServerUrl, then commit and push.')
