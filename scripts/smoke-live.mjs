// Cheap live-mode smoke check: GET /v1/models only. No image generation.
// Loads .env.local for VITE_MODEL_API_KEY but never prints the key.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = 'https://api.meta.ai/v1'

function loadEnvFile(path) {
  const values = {}
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return values
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

function redact(message, key) {
  if (!key) return message
  return String(message).split(key).join('[redacted]')
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fileEnv = loadEnvFile(resolve(root, '.env.local'))
const apiKey = (process.env.VITE_MODEL_API_KEY ?? fileEnv.VITE_MODEL_API_KEY ?? '').trim()

if (!apiKey) {
  console.log('smoke-live: no VITE_MODEL_API_KEY in environment or .env.local; live check skipped.')
  process.exit(2)
}

let response
try {
  response = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
} catch (error) {
  console.error(`smoke-live: request failed: ${redact(error, apiKey)}`)
  process.exit(1)
}

if (!response.ok) {
  console.error(`smoke-live: GET /v1/models -> HTTP ${response.status}`)
  process.exit(1)
}

let body
try {
  body = await response.json()
} catch (error) {
  console.error(`smoke-live: invalid JSON response: ${redact(error, apiKey)}`)
  process.exit(1)
}

const ids = Array.isArray(body?.data) ? body.data.map((item) => item?.id).filter(Boolean) : []
const wanted = ids.filter((id) => /sam|muse/i.test(id))
console.log(`smoke-live: GET /v1/models OK (${ids.length} models listed).`)
for (const id of wanted) console.log(`- ${id}`)
if (wanted.length === 0) console.log('smoke-live: no sam/muse model ids visible.')
process.exit(0)
