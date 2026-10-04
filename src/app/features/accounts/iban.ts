/** "XX47NEOB1000000001" -> "XX47 NEOB 1000 0000 01" (blocks of four, the standard print format). */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

/** Users paste IBANs with spaces and in any case: "xx65 neob 1000 0000 01" -> "XX65NEOB1000000001". */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

/**
 * ISO 13616 check: move the first four characters to the end; letters count as numbers (A=10 ... Z=35); the result
 * must be 1 mod 97. Catches almost every typo before we bother the server.
 */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (iban.length < 5 || !/^[A-Z0-9]+$/.test(iban)) {
    return false;
  }
  let remainder = 0;
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    const value = /\d/.test(char) ? Number(char) : char.charCodeAt(0) - 55;
    remainder = (value < 10 ? remainder * 10 + value : remainder * 100 + value) % 97;
  }
  return remainder === 1;
}
