import { toIsbn13 } from "@/lib/pos/isbn";
import type { SheetRow } from "@/lib/actions/catalog";

export type SheetLine = SheetRow & { qty: number };
// A row whose ISBN has a missing or wrong digit; `isbn` holds what the sheet said
export type SkippedLine = SheetLine & { rowNo: number; problem: string; suggestion: string | null };
type Column = keyof SheetLine | "discount";

// Column headings used by publisher / distributor invoices and stock lists. Order matters:
// "Author name" and "Publisher name" must be claimed before the title's "name", and each
// field tries its patterns in turn (a "Title" column wins over an "Item code" column).
const COLUMNS: [Column, RegExp[], RegExp?][] = [
  ["isbn", [/\bisbn/, /\bean\b/, /bar ?code/]],
  ["author", [/author|writer/]],
  ["publisher", [/publisher|imprint/]],
  ["price", [/mrp|m\.r\.p/, /selling|retail|list|price/], /net|nett|cost|rate|purchase|disc|amount|total/],
  ["cost_price", [/net|nett|cost|rate|purchase/], /disc|amount|total|%/],
  ["discount", [/dis|disc|discount/]],
  ["qty", [/\b(qty|quantity|copies|pcs|units|nos)\b/]],
  ["name", [/title/, /book/, /description|particular/, /name/, /item|product/], /code|no\b|supplier|party|customer/],
];

// "NA" / "-" in a text column means empty
function toText(value: unknown) {
  const text = String(value ?? "").trim();
  return /^(n\/?a|-+|nil)$/i.test(text) ? "" : text;
}

// A valid ISBN, or a publisher's own product code (sets, stationery) kept as the barcode.
// A number that looks like an ISBN but fails the check has a missing or wrong digit.
export function sheetCode(raw: string) {
  const code = raw.toUpperCase().replace(/[^0-9X]/g, ""); // the database keeps digits only
  return toIsbn13(raw) ?? (/^97[89]/.test(code) || !code ? null : code);
}

// What is wrong with a bad ISBN, in words a cashier understands
function isbnProblem(raw: string) {
  const digits = raw.replace(/[^0-9Xx]/g, "").length;
  return digits === 13 ? "has a wrong digit" : `has ${digits} digits, an ISBN needs 13`;
}

// The likely correct ISBN: one digit added (or changed) so the ISBN is valid and starts like
// the publisher's other ISBNs in the same sheet
function suggestIsbn(raw: string, good: string[]) {
  const digits = raw.replace(/\D/g, "");
  const candidates = new Set<string>();
  for (let i = 0; i <= digits.length; i++) {
    for (let d = 0; d <= 9; d++) {
      if (digits.length === 12) candidates.add(digits.slice(0, i) + d + digits.slice(i));
      if (digits.length === 13 && i < 13) candidates.add(digits.slice(0, i) + d + digits.slice(i + 1));
    }
  }
  const sharedStart = (a: string, b: string) => {
    let n = 0;
    while (n < a.length && a[n] === b[n]) n++;
    return n;
  };
  let best: string | null = null;
  let bestShared = 9; // at least the publisher part of the ISBN must match
  for (const c of candidates) {
    if (toIsbn13(c) !== c) continue;
    const shared = Math.max(0, ...good.map((g) => sharedStart(c, g)));
    if (shared > bestShared) {
      best = c;
      bestShared = shared;
    } else if (shared === bestShared && best !== c) {
      best = null; // two equally likely answers: don't guess
    }
  }
  return best;
}

function toNumber(value: unknown) {
  const n = Number(String(value ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Reads the first sheet of an Excel / CSV file. The heading row can be anywhere near the top
// (invoices start with the supplier's address). Same ISBN on several rows adds up.
export async function readSupplierSheet(
  file: File
): Promise<{ error: string } | { lines: SheetLine[]; skipped: SkippedLine[]; hasTitles: boolean; hasQty: boolean }> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer());
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });

  const isIsbnHeading = (c: unknown) => COLUMNS[0][1].some((p) => p.test(String(c).toLowerCase()));
  const headerIndex = grid.slice(0, 30).findIndex((row) => row.some(isIsbnHeading));
  if (headerIndex === -1) return { error: "Couldn't find an ISBN column. The sheet needs a heading like “ISBN”." };

  const headers = grid[headerIndex].map((c) => String(c).toLowerCase().trim());
  const columnOf = new Map<Column, number>();
  for (const [key, patterns, exclude] of COLUMNS) {
    for (const pattern of patterns) {
      const index = headers.findIndex(
        (h, i) => h && pattern.test(h) && !exclude?.test(h) && ![...columnOf.values()].includes(i)
      );
      if (index !== -1) {
        columnOf.set(key, index);
        break;
      }
    }
  }
  const cell = (row: unknown[], key: Column) => {
    const index = columnOf.get(key);
    return index === undefined ? "" : row[index];
  };

  const lines = new Map<string, SheetLine>();
  const skipped: SkippedLine[] = [];
  grid.slice(headerIndex + 1).forEach((row, i) => {
    const raw = String(cell(row, "isbn")).trim();
    if (!raw) return;
    const qty = columnOf.has("qty") ? toNumber(cell(row, "qty")) : 1;
    if (!qty) return;

    // No net rate column: work it out from MRP and the trade discount
    const price = toNumber(cell(row, "price"));
    const discount = toNumber(cell(row, "discount"));
    const cost =
      toNumber(cell(row, "cost_price")) ??
      (price && discount && discount < 100 ? Math.round(price * (100 - discount)) / 100 : null);
    const line = {
      isbn: raw,
      name: toText(cell(row, "name")),
      author: toText(cell(row, "author")),
      publisher: toText(cell(row, "publisher")),
      price,
      cost_price: cost,
      qty,
    };

    const isbn = sheetCode(raw);
    if (!isbn) {
      skipped.push({ ...line, rowNo: headerIndex + i + 2, problem: isbnProblem(raw), suggestion: null }); // row as Excel shows it
      return;
    }
    const existing = lines.get(isbn);
    if (existing) existing.qty += qty;
    else lines.set(isbn, { ...line, isbn });
  });

  const good = [...lines.keys()];
  for (const row of skipped) row.suggestion = suggestIsbn(row.isbn, good);

  return { lines: [...lines.values()], skipped, hasTitles: columnOf.has("name"), hasQty: columnOf.has("qty") };
}
