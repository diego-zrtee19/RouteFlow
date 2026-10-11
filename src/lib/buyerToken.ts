import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * BUYER ACCESS TOKENS — the credential that makes an order non-enumerable.
 *
 * The IDOR the audit found was caused by treating the order id as a capability:
 * `POST /api/orders/[id]/confirm` only checked that the id existed, so anyone
 * who guessed or observed an id could release a buyer's funds.
 *
 * The fix gives each order an independent, high-entropy secret:
 *
 *   - 32 random bytes, base64url encoded  -> ~256 bits of entropy
 *   - stored only as a SHA-256 hash        -> a DB leak is not replayable
 *   - compared with `timingSafeEqual`      -> no timing side channel
 *   - verified alongside the order id      -> id alone is never sufficient
 *
 * This mirrors how `buyer_access_token` already worked in the V2 SQL schema, but
 * with hashing so the plaintext never touches the database.
 */

const TOKEN_BYTES = 32;

/** Generates a fresh buyer token. Returned to the buyer exactly once. */
export function generateBuyerToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Hashes a token for storage. Deterministic, so lookup can be done by hash. */
export function hashBuyerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Constant-time comparison of a presented token against a stored hash.
 *
 * Returns false for an empty token so that "no token supplied" is treated as
 * "not authorised" rather than accidentally matching an unset hash.
 */
export function verifyBuyerToken(presented: string | null | undefined, storedHash: string): boolean {
  if (!presented || !storedHash) return false;

  const presentedHash = Buffer.from(hashBuyerToken(presented), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");

  // Buffers of different lengths are never equal; bail before timingSafeEqual,
  // which throws on a length mismatch.
  if (presentedHash.length !== expectedHash.length) return false;

  return timingSafeEqual(presentedHash, expectedHash);
}

/** Opaque order number shown to humans, e.g. `RF-8F3K2Q`. */
export function generateOrderNumber(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `RF-${out}`;
}

/**
 * Generates a purchase-link public id.
 *
 * 8 characters from a 32-symbol alphabet (~40 bits). Unique-constrained in the
 * database; a collision is retried by the caller, never silently accepted.
 */
export function generatePublicId(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}