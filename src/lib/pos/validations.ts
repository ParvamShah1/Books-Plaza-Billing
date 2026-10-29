import { z } from "zod";

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  kind: z.enum(["WAREHOUSE", "EXHIBITION"]),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,4}$/, "Code must be 2-4 letters, e.g. BO"),
  address: z.string().trim().default(""),
  start_date: optionalText,
  end_date: optionalText,
  is_active: z.boolean().default(true),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sell_by: z.enum(["PIECE", "KG"]),
});

export const itemSchema = z.object({
  kind: z.enum(["PUBLISHER", "LOT"]),
  name: z.string().trim().min(1, "Name is required"),
  isbn: optionalText,
  author: optionalText,
  publisher: optionalText,
  category_id: z.string().uuid("Choose a category"),
  price: z.coerce.number().nonnegative("Price must be 0 or more"),
  cost_price: z
    .union([z.coerce.number().nonnegative(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  lot_no: optionalText,
  is_active: z.boolean().default(true),
});

export const EXPENSE_CATEGORIES = [
  { value: "TEA_FOOD", label: "Tea & food" },
  { value: "TRANSPORT", label: "Transport / tempo" },
  { value: "LABOUR", label: "Labour / hamali" },
  { value: "SALARY", label: "Staff salary" },
  { value: "RENT", label: "Rent" },
  { value: "ELECTRICITY", label: "Electricity" },
  { value: "PRINTING", label: "Printing / banners" },
  { value: "STATIONERY", label: "Stationery / bags" },
  { value: "REPAIRS", label: "Repairs" },
  { value: "INFLUENCER", label: "Influencer / blogger" },
  { value: "ADS", label: "Ad spend / boosting" },
  { value: "OTHER", label: "Other" },
] as const;

export const EXPENSE_PAID_BY = ["CASH", "UPI", "CARD", "BANK"] as const;

export const expenseLabel = (category: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category;

export const expenseSchema = z
  .object({
    location_id: z.string().uuid("Choose a location"),
    spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    category: z.enum(EXPENSE_CATEGORIES.map((c) => c.value) as [string, ...string[]], { message: "Choose what it was for" }),
    amount: z.coerce.number().positive("Enter the amount"),
    paid_by: z.enum(EXPENSE_PAID_BY),
    note: z.string().trim().default(""),
  })
  .refine((e) => e.category !== "OTHER" || e.note, { message: "Write what the expense was for", path: ["note"] });

export type LocationInput = z.input<typeof locationSchema>;
export type CategoryInput = z.input<typeof categorySchema>;
export type ItemInput = z.input<typeof itemSchema>;
export type ExpenseInput = z.input<typeof expenseSchema>;
