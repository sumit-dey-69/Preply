import { createHash } from "crypto";

/**
 * Hash a room password. Not designed to be cryptographically strong (this is an
 * MVP with anonymous rooms), but avoids storing the plaintext in the DB.
 */
export function hashPassword(password: string): string {
  return createHash("sha256").update(`livepdf-salt:${password}`).digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
