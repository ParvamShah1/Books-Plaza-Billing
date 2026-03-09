import type { InvoiceItemInput } from "./validations";

export type CalculatedItem = InvoiceItemInput & {
  amount: number;
};

export function calculateItemAmount(quantity: number, price: number, discount: number): number {
  return Math.round(quantity * price * (1 - discount / 100) * 100) / 100;
}

export function calculateItemTotals(item: InvoiceItemInput): CalculatedItem {
  const amount = calculateItemAmount(item.quantity, item.price, item.discount);
  return { ...item, amount };
}

export function calculateInvoiceTotals(items: InvoiceItemInput[]) {
  const calculatedItems = items.map(calculateItemTotals);
  const subtotal = calculatedItems.reduce((sum, item) => sum + item.amount, 0);
  const grand_total = Math.round(subtotal * 100) / 100;

  return {
    items: calculatedItems,
    subtotal: grand_total,
    grand_total,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function numberToWords(num: number): string {
  if (num === 0) return "Zero";

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convert(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  let result = convert(rupees) + " Rupees";
  if (paise > 0) {
    result += " and " + convert(paise) + " Paise";
  }
  result += " Only";

  return result;
}
