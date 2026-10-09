/**
 * Privacy lock primitives — real platform APIs only, never a fake biometric.
 * - Code: PBKDF2-SHA256 (Web Crypto), salted, 150k iterations. Only the hash is stored.
 * - Face ID / Touch ID: WebAuthn platform authenticator with userVerification 'required'. Without a server
 *   there is no remote check, so this is a local privacy lock (keeps casual eyes out), not encryption.
 */
const enc = new TextEncoder()
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const PIN_ITERATIONS = 150_000

export async function hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITERATIONS }, key, 256)
  return { hash: b64(bits), salt: b64(salt) }
}

export async function verifyPin(pin: string, lock: { pinHash: string; pinSalt: string }): Promise<boolean> {
  const { hash } = await hashPin(pin, lock.pinSalt)
  return hash === lock.pinHash
}

export const validPin = (pin: string) => /^\d{4,8}$/.test(pin)

/** True only when this device really has Face ID / Touch ID available to the web app. */
export async function biometricAvailable(): Promise<boolean> {
  try {
    const PKC = (globalThis as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential
    if (!PKC?.isUserVerifyingPlatformAuthenticatorAvailable || !window.isSecureContext) return false
    return await PKC.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/** Creates a device-bound credential (asks for Face ID). Returns its id, or undefined if she cancels. */
export async function registerBiometric(userName: string): Promise<string | undefined> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'MARINA OS' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: userName, displayName: userName },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null
    return cred ? b64(cred.rawId) : undefined
  } catch {
    return undefined
  }
}

/** Asks for Face ID with that credential. True only when the platform verified her. */
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  try {
    const got = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    const flags = got ? new Uint8Array((got.response as AuthenticatorAssertionResponse).authenticatorData)[32] : 0
    // Bit 2 (UV) = the platform verified the user (Face ID / Touch ID / device passcode).
    return !!got && (flags & 0x04) !== 0
  } catch {
    return false
  }
}
