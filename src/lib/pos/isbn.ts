// ISBN helpers for supplier sheets. Books are stored with the 13-digit ISBN printed in the barcode.

function isbn13CheckDigit(first12: string) {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

// A valid ISBN-13 (ISBN-10 converted), or null when a digit is missing or wrong
export function toIsbn13(raw: unknown): string | null {
  const clean = String(raw ?? "").toUpperCase().replace(/[^0-9X]/g, "");

  if (/^97[89]\d{10}$/.test(clean)) {
    return isbn13CheckDigit(clean.slice(0, 12)) === clean[12] ? clean : null;
  }
  if (/^\d{9}[\dX]$/.test(clean)) {
    const sum = [...clean].reduce((s, c, i) => s + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
    if (sum % 11 !== 0) return null;
    const first12 = "978" + clean.slice(0, 9);
    return first12 + isbn13CheckDigit(first12);
  }
  return null;
}
