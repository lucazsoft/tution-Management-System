export function normaliseAakashPhoneNumber(value: string): string {
  // Aakash API v3 requires a local 10-digit number in the `to` field.
  const digits = value.replace(/[\s()-]/g, '');
  if (/^\+977\d{10}$/.test(digits)) return digits.slice(4);
  if (/^977\d{10}$/.test(digits)) return digits.slice(3);
  if (/^\d{10}$/.test(digits)) return digits;
  return digits;
}
