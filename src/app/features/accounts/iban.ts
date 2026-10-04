/** "XX47NEOB1000000001" -> "XX47 NEOB 1000 0000 01" (blocks of four, the standard print format). */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}
