export type Profile = {
  id: string;
  full_name: string;
  created_at: string;
};

export type Entity = {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  account_number: string;
  branch_ifsc: string;
  branch_name: string;
  created_at: string;
};

export type Customer = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type InvoiceType = "DELIVERY_CHALLAN" | "TAX_INVOICE";

export type Invoice = {
  id: string;
  user_id: string;
  entity_id: string;
  invoice_number: string;
  type: InvoiceType;
  customer_id: string;
  subtotal: number;
  freight_charges: number;
  grand_total: number;
  show_total: boolean;
  notes: string | null;
  created_at: string;
  entity?: Entity;
  customer?: Customer;
  items?: InvoiceItem[];
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  title: string;
  publisher: string | null;
  quantity: number;
  price: number;
  discount: number;
  amount: number;
};

export type Payment = {
  id: string;
  user_id: string;
  customer_id: string;
  amount: number;
  mode: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE" | "OTHER";
  notes: string | null;
  created_at: string;
};

export type CustomerWithBalance = Customer & {
  total_invoiced: number;
  total_paid: number;
  pending_amount: number;
};
