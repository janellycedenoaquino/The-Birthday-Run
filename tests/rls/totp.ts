import { createHmac } from "node:crypto";

// RFC 6238 TOTP (SHA-1, 30 s, 6 digits): the codes an authenticator app shows. Used to verify
// MFA enrollment in tests (BUILD F-1 "Tests"). Checked against the RFC's vectors in tests/unit.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("totp: invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function hotp(key: Buffer, counter: number, digits = 6): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", key).update(message).digest();
  const offset = hash[hash.length - 1]! & 0x0f;
  const code = (hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, "0");
}

/** The current code for a base32 secret (as returned by Supabase's mfa.enroll). */
export function totp(
  secret: string,
  now = Date.now(),
  step = 30,
  digits = 6,
): string {
  return hotp(base32Decode(secret), Math.floor(now / 1000 / step), digits);
}
