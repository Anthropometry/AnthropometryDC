/**
 * F4 receipt codes: 7 characters from the easy-to-read alphabet (no 0 O 1 I L), shown as
 * "R7K-2MPQ". Made on the phone so it works offline; the database keeps them unique.
 */
export const RECEIPT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // 31 characters
const LENGTH = 7

/** Unbiased: bytes ≥ 248 (8 × 31) are thrown away and drawn again. */
export function newReceiptCode(randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let code = ''
  while (code.length < LENGTH) {
    for (const b of randomBytes(LENGTH * 2)) {
      if (b < 248 && code.length < LENGTH) code += RECEIPT_ALPHABET[b % 31]
    }
  }
  return code
}

export function isReceiptCode(code: string): boolean {
  return /^[A-HJKMNP-Z2-9]{7}$/.test(code)
}

/** "R7K2MPQ" → "R7K-2MPQ" */
export function formatReceipt(code: string): string {
  return code.length === LENGTH ? `${code.slice(0, 3)}-${code.slice(3)}` : code
}

/** "r7k 2mpq", "R7K-2MPQ" → "R7K2MPQ" */
export function cleanReceipt(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}
