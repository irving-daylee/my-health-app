/**
 * Slot op de app. Dit is een deur, geen kluis: de data in IndexedDB is niet
 * versleuteld met de PIN. Het houdt iemand die je ontgrendelde telefoon oppakt
 * buiten; het houdt iemand met technische toegang tot het toestel niet tegen.
 */

const SALT = 'gezondheid-pin-v1'

export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(SALT + pin)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const verifyPin = async (pin: string, hash: string) => (await hashPin(pin)) === hash

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromB64url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export const biometricsAvailable = () =>
  typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials

/** Registreert Face ID / Touch ID als ontgrendeling. Geeft het credential-id terug. */
export async function registerBiometrics(): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userId = crypto.getRandomValues(new Uint8Array(16))
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Gezondheid' },
      user: { id: userId, name: 'lokaal', displayName: 'Lokale gebruiker' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Registratie afgebroken')
  return b64url(cred.rawId)
}

export async function unlockWithBiometrics(credentialId: string): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: fromB64url(credentialId) }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })
  return assertion != null
}
