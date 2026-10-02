/**
 * AES-GCM encryption for refresh tokens at rest. Key: TOKEN_ENCRYPTION_KEY (base64, 32 bytes),
 * stored as a Supabase function secret — never in the database, never in the frontend.
 * Stored format: base64(iv[12] || ciphertext).
 */
import { requiredEnv } from './http.ts'

let keyPromise: Promise<CryptoKey> | null = null

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function b64encode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function key(): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey('raw', b64decode(requiredEnv('TOKEN_ENCRYPTION_KEY')), 'AES-GCM', false, ['encrypt', 'decrypt'])
  return keyPromise
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(plain)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return b64encode(out)
}

export async function decryptSecret(stored: string): Promise<string> {
  const raw = b64decode(stored)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await key(), raw.slice(12))
  return new TextDecoder().decode(plain)
}

/** Random URL-safe string (OAuth state, PKCE verifier). */
export function randomToken(bytes = 32): string {
  return b64encode(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** PKCE S256 challenge (RFC 7636). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return b64encode(digest).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
