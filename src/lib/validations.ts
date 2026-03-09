import { z } from "zod";

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const signupSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Customer schemas
export const customerSchema = z.object({
  full_name: z.string().min(1, "Customer name is required"),
  phone: z.string().optional().default(""),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional().default(""),
  gst_number: z.string().optional().default(""),
});

// Invoice item schema
export const invoiceItemSchema = z.object({
  title: z.string().min(1, "Title is required"),
  publisher: z.string().optional().default(""),
  quantity: z.coerce.number().int().positive("Quantity must be positive"),
  price: z.coerce.number().nonnegative("Price must be non-negative"),
  discount: z.coerce.number().min(0).max(100, "Discount must be 0-100"),
});

// Invoice schema
export const invoiceSchema = z.object({
  entity_id: z.string().uuid("Select a billing entity"),
  type: z.enum(["DELIVERY_CHALLAN", "TAX_INVOICE"]),
  customer_id: z.string().uuid("Select a customer"),
  freight_charges: z.coerce.number().nonnegative("Freight must be non-negative").default(0),
  show_total: z.boolean().default(true),
  notes: z.string().optional().default(""),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
});

// Payment schema
export const paymentSchema = z.object({
  customer_id: z.string().uuid("Select a customer"),
  amount: z.coerce.number().positive("Amount must be positive"),
  mode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"]),
  notes: z.string().optional().default(""),
});

// Bulk product upload schema
export const bulkProductItemSchema = z.object({
  title: z.string().min(1, "Title is required"),
  publisher: z.string().optional().default(""),
  quantity: z.coerce.number().int().positive("Quantity must be positive"),
  price: z.coerce.number().nonnegative("Price must be non-negative"),
  discount: z.coerce.number().min(0).max(100).default(0),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
export type BulkProductItemInput = z.infer<typeof bulkProductItemSchema>;
