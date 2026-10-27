// Runtime Meta Model API key for the pages.dev deploy.
//
// The key lives in sessionStorage only: it never touches localStorage,
// the URL, or cookies, and it is never baked into the build. When
// sessionStorage is unavailable (private mode, disabled storage), an
// in-memory fallback holds the key for the life of the page.
export const SESSION_STORAGE_KEY = 'cutcopy.modelApiKey'

let memoryKey = ''

function readStored(): string {
  try {
    if (typeof sessionStorage === 'undefined') return memoryKey
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
    return stored === null ? memoryKey : stored.trim()
  } catch {
    return memoryKey
  }
}

export function getSessionKey(): string {
  return readStored()
}

export function hasSessionKey(): boolean {
  return readStored().length > 0
}

export function setSessionKey(key: string): void {
  const next = key.trim()
  memoryKey = next
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (next) sessionStorage.setItem(SESSION_STORAGE_KEY, next)
      else sessionStorage.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {
    // Storage blocked: memoryKey above is the fallback.
  }
}

export function clearSessionKey(): void {
  memoryKey = ''
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {
    // Memory already cleared above.
  }
}
