import jwt from 'jsonwebtoken'

export interface NakamaTokenPayload {
  /** Nakama user ID (UUID) */
  uid: string
  /** Nakama username */
  usn: string
  /** Token expiry (unix timestamp) */
  exp: number
  /** Token ID */
  tid: string
}

/**
 * Verify a Nakama JWT session token using the shared encryption key.
 * Returns the decoded payload if valid, or null if invalid/expired.
 *
 * Nakama uses HS256 (HMAC-SHA256) for JWT signing.
 * The signing key is `session.encryption_key` from Nakama config.
 */
export function verifyNakamaToken(token: string): NakamaTokenPayload | null {
  const encryptionKey = process.env.NAKAMA_ENCRYPTION_KEY
  if (!encryptionKey) {
    console.warn('[auth] NAKAMA_ENCRYPTION_KEY not set — cannot verify Nakama tokens')
    return null
  }

  try {
    const decoded = jwt.verify(token, encryptionKey, {
      algorithms: ['HS256'],
    }) as NakamaTokenPayload

    if (!decoded.uid || !decoded.usn) {
      console.warn('[auth] Nakama token missing uid or usn claim')
      return null
    }

    return decoded
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      console.log('[auth] Nakama token expired')
    } else if (err instanceof jwt.JsonWebTokenError) {
      console.warn('[auth] Invalid Nakama token:', (err as Error).message)
    }
    return null
  }
}
