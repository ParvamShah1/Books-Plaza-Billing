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

export type LocationInput = z.input<typeof locationSchema>;
export type CategoryInput = z.input<typeof categorySchema>;
export type ItemInput = z.input<typeof itemSchema>;
