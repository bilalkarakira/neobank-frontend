import { AbstractControl, ValidationErrors } from '@angular/forms';

export const MIN_AMOUNT = 0.01;
export const MAX_AMOUNT = 10000;

/** Mirrors the server: positive, at most 2 decimals, at most 10,000.00. The range is checked on the text only. */
export function amountValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  if (value === '') {
    return null; // "required" reports this
  }
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value)) {
    return { format: true };
  }
  const number = Number(value);
  return number < MIN_AMOUNT || number > MAX_AMOUNT ? { range: true } : null;
}

/** "50" -> "50.00", "7.5" -> "7.50": the wire format is always two decimals. */
export function normalizeAmount(text: string): string {
  const [whole, fraction = ''] = text.trim().split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
