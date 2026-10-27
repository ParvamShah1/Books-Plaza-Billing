export type Role = "ADMIN" | "STAFF" | "PENDING";

export type LocationKind = "WAREHOUSE" | "EXHIBITION";

export type Location = {
  id: string;
  name: string;
  kind: LocationKind;
  code: string;
  address: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
};

export type SellBy = "PIECE" | "KG";

export type Category = {
  id: string;
  name: string;
  sell_by: SellBy;
  created_at: string;
};

export type CategoryDiscount = {
  location_id: string;
  category_id: string;
  discount: number;
};

export type ItemKind = "PUBLISHER" | "LOT";

export type Item = {
  id: string;
  kind: ItemKind;
  code: string;
  name: string;
  isbn: string | null;
  author: string | null;
  publisher: string | null;
  category_id: string | null;
  price: number;
  cost_price: number | null;
  lot_no: string | null;
  is_active: boolean;
  created_at: string;
  category?: Pick<Category, "id" | "name" | "sell_by"> | null;
};

// Row returned by the lookup_code / pos_items functions
export type PosItem = {
  item_id: string;
  kind: ItemKind;
  code: string;
  isbn: string | null;
  name: string;
  publisher: string | null;
  price: number;
  sell_by: SellBy;
  category_id: string | null;
  category_name: string | null;
  discount: number;
  stock: number;
};

export type SaleStatus = "HELD" | "PAID" | "CANCELLED";
export type PaymentMode = "CASH" | "UPI" | "CARD";

export type Sale = {
  id: string;
  invoice_no: string | null;
  public_token: string;
  location_id: string;
  customer_id: string | null;
  phone: string | null;
  status: SaleStatus;
  payment_mode: PaymentMode | null;
  hold_ref: string | null;
  total_qty: number;
  total_mrp: number;
  total_discount: number;
  total_amount: number;
  payable: number;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  location?: Pick<Location, "id" | "name" | "code" | "address"> | null;
  items?: SaleItem[];
};

export type SaleItem = {
  id: string;
  sale_id: string;
  item_id: string;
  name: string;
  qty: number;
  price: number;
  discount: number;
  discount_amt: number;
  amount: number;
  sort_order: number;
};

export type StaffMember = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  location_id: string | null;
  created_at: string;
};

export type CurrentStaff = {
  id: string;
  full_name: string;
  role: Role;
  location_id: string | null;
};

export type StockRow = {
  item_id: string;
  location_id: string;
  qty: number;
  item: Pick<Item, "id" | "kind" | "code" | "name" | "isbn" | "publisher" | "price"> & {
    category: Pick<Category, "id" | "name" | "sell_by"> | null;
  };
};
