-- ============================================
-- BooksPlaza POS + Inventory - Database Schema
-- Run after schema.sql. Only adds new tables/functions;
-- the existing invoice tables are not touched.
-- ============================================

create extension if not exists pg_trgm with schema extensions;

-- ============================================
-- 1) STAFF ROLES (on existing profiles table)
-- ============================================
-- PENDING = signed up but not approved; STAFF = billing at one location; ADMIN = everything
alter table public.profiles
  add column if not exists role text not null default 'PENDING'
    check (role in ('ADMIN', 'STAFF', 'PENDING')),
  add column if not exists location_id uuid;

-- ============================================
-- 2) LOCATIONS (warehouses + exhibitions)
-- ============================================
create table public.locations (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  kind text not null check (kind in ('WAREHOUSE', 'EXHIBITION')),
  code text not null check (code ~ '^[A-Z]{2,4}$'), -- invoice prefix, e.g. BO -> BO102627-0001
  address text not null default '',
  start_date date,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index idx_locations_code on public.locations (code);

alter table public.profiles
  add constraint profiles_location_id_fkey
  foreign key (location_id) references public.locations on delete set null;

-- ============================================
-- 3) CATEGORIES + PER-LOCATION DISCOUNTS
-- ============================================
create table public.categories (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  sell_by text not null default 'PIECE' check (sell_by in ('PIECE', 'KG')),
  created_at timestamptz not null default now()
);

create unique index idx_categories_name on public.categories (lower(name));

create table public.category_discounts (
  location_id uuid not null references public.locations on delete cascade,
  category_id uuid not null references public.categories on delete cascade,
  discount numeric(5,2) not null default 0 check (discount >= 0 and discount <= 100),
  primary key (location_id, category_id)
);

-- ============================================
-- 4) ITEMS + BARCODES
-- ============================================
-- PUBLISHER = one title (ISBN); LOT = fixed-price lot, many ISBNs map to it via barcodes
create sequence public.item_code_seq start 100001;

create table public.items (
  id uuid not null default gen_random_uuid() primary key,
  kind text not null check (kind in ('PUBLISHER', 'LOT')),
  code text not null default ('BP' || nextval('public.item_code_seq')), -- sticker code
  name text not null,
  isbn text,
  author text,
  publisher text,
  category_id uuid references public.categories on delete restrict,
  price numeric(10,2) not null default 0 check (price >= 0),
  cost_price numeric(10,2) check (cost_price >= 0),
  lot_no text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index idx_items_code on public.items (code);
create index idx_items_isbn on public.items (isbn);
create index idx_items_category_id on public.items (category_id);
create index idx_items_name_trgm on public.items using gin (name extensions.gin_trgm_ops);

-- Extra barcodes, mainly ISBNs of books received into a lot
create table public.barcodes (
  code text not null,
  item_id uuid not null references public.items on delete cascade,
  created_at timestamptz not null default now(),
  primary key (code, item_id)
);

create index idx_barcodes_item_id on public.barcodes (item_id);

create or replace function public.normalize_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.isbn := nullif(upper(regexp_replace(coalesce(new.isbn, ''), '[^0-9Xx]', '', 'g')), '');
  new.code := upper(trim(new.code));
  new.name := trim(new.name);
  return new;
end;
$$;

create trigger items_normalize
  before insert or update on public.items
  for each row execute procedure public.normalize_item();

-- ============================================
-- 5) STOCK (ledger + current balance)
-- ============================================
create table public.stock (
  location_id uuid not null references public.locations on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  qty numeric(12,3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (location_id, item_id)
);

create index idx_stock_item_id on public.stock (item_id);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  location_id uuid not null references public.locations on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  qty numeric(12,3) not null,
  reason text not null check (reason in ('RECEIPT', 'SALE', 'SALE_CANCEL', 'SALE_EDIT', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT')),
  ref_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index idx_stock_movements_item on public.stock_movements (item_id, location_id);
create index idx_stock_movements_ref on public.stock_movements (ref_id);

create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.stock (location_id, item_id, qty, updated_at)
  values (new.location_id, new.item_id, new.qty, now())
  on conflict (location_id, item_id)
  do update set qty = public.stock.qty + excluded.qty, updated_at = now();
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute procedure public.apply_stock_movement();

-- Stock in (purchase / receiving)
create sequence public.stock_receipt_seq start 1;

create table public.stock_receipts (
  id uuid not null default gen_random_uuid() primary key,
  receipt_no text not null default ('GRN-' || lpad(nextval('public.stock_receipt_seq')::text, 5, '0')),
  location_id uuid not null references public.locations on delete restrict,
  supplier text,
  notes text,
  total_qty numeric(12,3) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index idx_stock_receipts_no on public.stock_receipts (receipt_no);
create index idx_stock_receipts_created_at on public.stock_receipts (created_at);

create table public.stock_receipt_items (
  id uuid not null default gen_random_uuid() primary key,
  receipt_id uuid not null references public.stock_receipts on delete cascade,
  item_id uuid not null references public.items on delete restrict,
  qty numeric(12,3) not null check (qty > 0),
  cost_price numeric(10,2)
);

create index idx_stock_receipt_items_receipt on public.stock_receipt_items (receipt_id);

-- ============================================
-- 6) RETAIL CUSTOMERS + SALES
-- ============================================
create table public.pos_customers (
  id uuid not null default gen_random_uuid() primary key,
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  name text,
  created_at timestamptz not null default now()
);

create unique index idx_pos_customers_phone on public.pos_customers (phone);

create table public.sales (
  id uuid not null default gen_random_uuid() primary key,
  invoice_no text,
  public_token uuid not null default gen_random_uuid(),
  location_id uuid not null references public.locations on delete restrict,
  customer_id uuid references public.pos_customers on delete set null,
  phone text,
  status text not null check (status in ('HELD', 'PAID', 'CANCELLED')),
  payment_mode text check (payment_mode in ('CASH', 'UPI', 'CARD')),
  hold_ref text,
  total_qty numeric(12,3) not null default 0,
  total_mrp numeric(12,2) not null default 0,
  total_discount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  payable numeric(12,2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  coupon_code text, -- coupon redeemed on this bill
  coupon_discount numeric(12,2) not null default 0,
  edited_at timestamptz, -- last change by an admin after payment
  edited_by uuid
);

create unique index idx_sales_invoice_no on public.sales (invoice_no);
create unique index idx_sales_public_token on public.sales (public_token);
create index idx_sales_location_paid on public.sales (location_id, paid_at);
create index idx_sales_status on public.sales (status);
create index idx_sales_customer_id on public.sales (customer_id);

create table public.sale_items (
  id uuid not null default gen_random_uuid() primary key,
  sale_id uuid not null references public.sales on delete cascade,
  item_id uuid not null references public.items on delete restrict,
  name text not null,
  qty numeric(12,3) not null check (qty > 0),
  price numeric(10,2) not null check (price >= 0),
  discount numeric(5,2) not null default 0,
  discount_amt numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  sort_order integer not null default 0
);

create index idx_sale_items_sale_id on public.sale_items (sale_id);
create index idx_sale_items_item_id on public.sale_items (item_id);

-- One-time discount codes handed out with each paid bill
create table public.coupons (
  id uuid not null default gen_random_uuid() primary key,
  code text not null,
  discount_pct numeric(5,2) not null default 5 check (discount_pct > 0 and discount_pct <= 100),
  phone text,
  issued_sale_id uuid references public.sales on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REDEEMED', 'VOID')),
  redeemed_sale_id uuid references public.sales on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index idx_coupons_code on public.coupons (code);
create unique index idx_coupons_issued_sale on public.coupons (issued_sale_id);
create index idx_coupons_redeemed_sale on public.coupons (redeemed_sale_id);

-- Per location, per month invoice counter (same format as the old software)
create table public.invoice_counters (
  location_id uuid not null references public.locations on delete cascade,
  period text not null,
  last_no integer not null,
  primary key (location_id, period)
);

-- ============================================
-- 7) PERMISSION HELPERS
-- ============================================
create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select coalesce((select role = 'ADMIN' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_staff()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select coalesce((select role in ('ADMIN', 'STAFF') from public.profiles where id = auth.uid()), false);
$$;

-- Admins can use every location; staff only their assigned one
create or replace function public.can_use_location(p_location uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select coalesce((
    select role = 'ADMIN' or (role = 'STAFF' and location_id = p_location)
    from public.profiles where id = auth.uid()
  ), false);
$$;

-- Stop users from promoting themselves through the "update own profile" policy
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.location_id is distinct from old.location_id) then
    raise exception 'Only an admin can change roles or locations';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();

-- ============================================
-- 8) POS FUNCTIONS
-- ============================================

-- Find sellable items for a scanned code (sticker code, ISBN or extra barcode)
create or replace function public.lookup_code(p_code text, p_location uuid)
returns table (
  item_id uuid, kind text, code text, isbn text, name text, publisher text,
  price numeric, sell_by text, category_id uuid, category_name text,
  discount numeric, stock numeric
)
language sql stable
set search_path = ''
as $$
  with input as (
    select upper(trim(p_code)) as raw,
           nullif(upper(regexp_replace(p_code, '[^0-9Xx]', '', 'g')), '') as digits
  ),
  matches as (
    select i.id from public.items i, input
    where i.code = input.raw or i.isbn = input.digits
    union
    select b.item_id from public.barcodes b, input
    where b.code = input.raw or b.code = input.digits
  )
  select i.id, i.kind, i.code, i.isbn, i.name, i.publisher,
         i.price, coalesce(c.sell_by, 'PIECE'), i.category_id, c.name,
         coalesce(cd.discount, 0), coalesce(s.qty, 0)
  from matches m
  join public.items i on i.id = m.id and i.is_active
  left join public.categories c on c.id = i.category_id
  left join public.category_discounts cd on cd.category_id = i.category_id and cd.location_id = p_location
  left join public.stock s on s.item_id = i.id and s.location_id = p_location
  order by i.kind desc, i.name;
$$;

-- Item tiles / name search on the billing screen
-- Billing screen boxes (p_kind = 'LOT': bookmarks, books by kg...) and name search
create or replace function public.pos_items(
  p_location uuid,
  p_query text default null,
  p_category uuid default null,
  p_limit integer default 60,
  p_kind text default null
)
returns table (
  item_id uuid, kind text, code text, isbn text, name text, publisher text,
  price numeric, sell_by text, category_id uuid, category_name text,
  discount numeric, stock numeric
)
language sql stable
set search_path = ''
as $$
  select i.id, i.kind, i.code, i.isbn, i.name, i.publisher,
         i.price, coalesce(c.sell_by, 'PIECE'), i.category_id, c.name,
         coalesce(cd.discount, 0), coalesce(s.qty, 0)
  from public.items i
  left join public.categories c on c.id = i.category_id
  left join public.category_discounts cd on cd.category_id = i.category_id and cd.location_id = p_location
  left join public.stock s on s.item_id = i.id and s.location_id = p_location
  where i.is_active
    and (p_category is null or i.category_id = p_category)
    and (p_kind is null or i.kind = p_kind)
    and (coalesce(trim(p_query), '') = '' or i.name ilike '%' || trim(p_query) || '%' or i.code = upper(trim(p_query)))
  order by (coalesce(s.qty, 0) > 0) desc, i.kind desc, i.name
  limit least(greatest(p_limit, 1), 200);
$$;

-- Totals for the stock page
create or replace function public.stock_summary(p_location uuid)
returns table (total_qty numeric, item_count bigint)
language sql stable
set search_path = ''
as $$
  select coalesce(sum(qty), 0), count(*) filter (where qty <> 0)
  from public.stock where location_id = p_location;
$$;

-- Today's totals for the sales page
create or replace function public.sales_summary(p_from timestamptz, p_to timestamptz, p_location uuid default null)
returns table (bills bigint, total numeric, cash numeric, upi numeric, card numeric, qty numeric)
language sql stable
set search_path = ''
as $$
  select count(*), coalesce(sum(payable), 0),
         coalesce(sum(payable) filter (where payment_mode = 'CASH'), 0),
         coalesce(sum(payable) filter (where payment_mode = 'UPI'), 0),
         coalesce(sum(payable) filter (where payment_mode = 'CARD'), 0),
         coalesce(sum(total_qty), 0)
  from public.sales
  where status = 'PAID' and paid_at >= p_from and paid_at < p_to
    and (p_location is null or location_id = p_location);
$$;

-- Paid sales per category. A bill's coupon and round-off are shared across its lines by
-- amount, so the categories add up to the bills' total.
create or replace function public.category_sales(p_from timestamptz, p_to timestamptz, p_location uuid default null)
returns table (category text, bills bigint, qty numeric, mrp numeric, discount numeric, amount numeric)
language sql stable
set search_path = ''
as $$
  select category, bills, qty, mrp, mrp - amount, amount
  from (
    select coalesce(c.name, 'No category') as category,
           count(distinct s.id) as bills,
           sum(si.qty) as qty,
           round(sum(si.qty * si.price), 2) as mrp,
           round(sum(si.amount * case when s.total_amount > 0 then s.payable / s.total_amount else 0 end), 2) as amount
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    join public.items i on i.id = si.item_id
    left join public.categories c on c.id = i.category_id
    where s.status = 'PAID' and s.paid_at >= p_from and s.paid_at < p_to
      and (p_location is null or s.location_id = p_location)
    group by c.name
  ) t
  order by amount desc;
$$;

-- Create a held bill, update a held bill, or complete a bill (PAID)
-- "BP" + 6 characters without look-alikes (no 0/O/1/I), from random uuid bytes
create or replace function public.new_coupon_code()
returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := 'BP';
    for i in 0..5 loop
      v_code := v_code || substr(v_chars, 1 + get_byte(v_bytes, i) % 32, 1);
    end loop;
    exit when not exists (select 1 from public.coupons where code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Same clean-up the billing screen does: upper case, letters and digits only
create or replace function public.clean_coupon_code(p_code text)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- Billing screen check before payment. A coupon only works for the mobile it was sent to.
create or replace function public.check_coupon(p_code text, p_phone text)
returns jsonb
language plpgsql stable
security definer set search_path = ''
as $$
declare
  v_coupon public.coupons%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Not allowed';
  end if;
  select * into v_coupon from public.coupons where code = public.clean_coupon_code(p_code);
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Coupon not found');
  end if;
  if v_coupon.status = 'REDEEMED' then
    return jsonb_build_object('ok', false, 'message', 'This coupon was already used');
  end if;
  if v_coupon.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'message', 'This coupon is no longer valid');
  end if;
  if v_coupon.phone is not null and nullif(trim(p_phone), '') is null then
    return jsonb_build_object('ok', false, 'message', 'Enter the customer mobile number first');
  end if;
  if v_coupon.phone is distinct from trim(p_phone) and v_coupon.phone is not null then
    return jsonb_build_object('ok', false, 'message', 'This coupon belongs to another mobile number');
  end if;
  return jsonb_build_object('ok', true, 'code', v_coupon.code, 'discount_pct', v_coupon.discount_pct);
end;
$$;

create or replace function public.save_sale(p jsonb)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_location uuid := (p->>'location_id')::uuid;
  v_sale_id uuid := nullif(p->>'sale_id', '')::uuid;
  v_status text := p->>'status';
  v_mode text := nullif(p->>'payment_mode', '');
  v_phone text := nullif(trim(p->>'phone'), '');
  v_customer uuid;
  v_loc public.locations%rowtype;
  v_line jsonb;
  v_item record;
  v_qty numeric;
  v_price numeric;
  v_gross numeric;
  v_disc_amt numeric;
  v_total_qty numeric := 0;
  v_total_mrp numeric := 0;
  v_total_disc numeric := 0;
  v_sort integer := 0;
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_fy integer;
  v_period text;
  v_next integer;
  v_invoice text;
  v_token uuid;
  v_coupon_code text := public.clean_coupon_code(p->>'coupon_code');
  v_coupon public.coupons%rowtype;
  v_coupon_disc numeric := 0;
  v_amount numeric;
  v_payable numeric;
  v_new_coupon text;
begin
  if not public.can_use_location(v_location) then
    raise exception 'You cannot bill for this location';
  end if;
  if v_status is null or v_status not in ('HELD', 'PAID') then
    raise exception 'Invalid bill status';
  end if;
  if v_status = 'PAID' and (v_mode is null or v_mode not in ('CASH', 'UPI', 'CARD')) then
    raise exception 'Choose a payment mode';
  end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'Add at least one book';
  end if;
  -- Every paid bill needs a mobile; 0000000000 when the customer won't give one
  if v_status = 'PAID' and v_phone is null then
    raise exception 'Enter the customer mobile number (0000000000 if they won''t give one)';
  end if;

  select * into v_loc from public.locations where id = v_location and is_active;
  if not found then
    raise exception 'Location not found or closed';
  end if;

  if v_phone is not null and v_phone <> '0000000000' then
    if v_phone !~ '^[6-9][0-9]{9}$' then
      raise exception 'Invalid mobile number';
    end if;
    insert into public.pos_customers (phone) values (v_phone)
    on conflict (phone) do update set phone = excluded.phone
    returning id into v_customer;
  end if;

  if v_sale_id is not null then
    perform 1 from public.sales
    where id = v_sale_id and status = 'HELD' and location_id = v_location
    for update;
    if not found then
      raise exception 'Held bill not found';
    end if;
    delete from public.sale_items where sale_id = v_sale_id;
  else
    insert into public.sales (location_id, status) values (v_location, 'HELD')
    returning id into v_sale_id;
  end if;

  for v_line in select * from jsonb_array_elements(p->'items') loop
    v_qty := (v_line->>'qty')::numeric;
    v_price := (v_line->>'price')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be more than 0';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'Invalid price';
    end if;

    select i.id, i.name, coalesce(c.sell_by, 'PIECE') as sell_by, coalesce(cd.discount, 0) as discount
    into v_item
    from public.items i
    left join public.categories c on c.id = i.category_id
    left join public.category_discounts cd on cd.category_id = i.category_id and cd.location_id = v_location
    where i.id = (v_line->>'item_id')::uuid;
    if not found then
      raise exception 'Book not found';
    end if;
    if v_item.sell_by = 'PIECE' and v_qty <> trunc(v_qty) then
      raise exception '% is sold per piece', v_item.name;
    end if;

    v_gross := round(v_qty * v_price, 2);
    v_disc_amt := round(v_gross * v_item.discount / 100, 2);

    insert into public.sale_items (sale_id, item_id, name, qty, price, discount, discount_amt, amount, sort_order)
    values (v_sale_id, v_item.id, v_item.name, v_qty, v_price, v_item.discount, v_disc_amt, v_gross - v_disc_amt, v_sort);

    v_sort := v_sort + 1;
    v_total_qty := v_total_qty + v_qty;
    v_total_mrp := v_total_mrp + v_gross;
    v_total_disc := v_total_disc + v_disc_amt;
  end loop;

  v_amount := v_total_mrp - v_total_disc;

  -- Coupon discount on the bill after category discounts. Row lock keeps each code single use.
  if v_coupon_code is not null then
    select * into v_coupon from public.coupons where code = v_coupon_code for update;
    if not found or v_coupon.status <> 'ACTIVE' then
      raise exception 'Coupon % is not valid or already used', v_coupon_code;
    end if;
    if v_coupon.phone is not null and v_coupon.phone is distinct from v_phone then
      raise exception 'Coupon % belongs to another mobile number', v_coupon_code;
    end if;
    v_coupon_disc := round(v_amount * v_coupon.discount_pct / 100, 2);
  end if;
  v_payable := round(v_amount - v_coupon_disc);

  if v_status = 'PAID' then
    -- Financial year Apr-Mar, e.g. Oct 2026 -> period "102627"
    v_fy := extract(year from v_now)::integer - case when extract(month from v_now) < 4 then 1 else 0 end;
    v_period := to_char(v_now, 'MM') || lpad((v_fy % 100)::text, 2, '0') || lpad(((v_fy + 1) % 100)::text, 2, '0');

    insert into public.invoice_counters (location_id, period, last_no)
    values (v_location, v_period, 1)
    on conflict (location_id, period) do update set last_no = public.invoice_counters.last_no + 1
    returning last_no into v_next;

    v_invoice := v_loc.code || v_period || '-' || lpad(v_next::text, 4, '0');

    insert into public.stock_movements (location_id, item_id, qty, reason, ref_id)
    select v_location, item_id, -qty, 'SALE', v_sale_id
    from public.sale_items where sale_id = v_sale_id;

    if v_coupon_code is not null then
      update public.coupons
      set status = 'REDEEMED', redeemed_sale_id = v_sale_id, redeemed_at = now()
      where id = v_coupon.id;
    end if;

    -- Coupon for the next order, sent on WhatsApp with the bill (real numbers only)
    if v_customer is not null then
      insert into public.coupons (code, phone, issued_sale_id)
      values (public.new_coupon_code(), v_phone, v_sale_id)
      returning code into v_new_coupon;
    end if;
  end if;

  update public.sales set
    customer_id = v_customer,
    phone = v_phone,
    status = v_status,
    payment_mode = case when v_status = 'PAID' then v_mode end,
    hold_ref = nullif(trim(p->>'hold_ref'), ''),
    total_qty = v_total_qty,
    total_mrp = v_total_mrp,
    total_discount = v_total_disc,
    total_amount = v_amount - v_coupon_disc,
    payable = v_payable,
    coupon_code = v_coupon_code,
    coupon_discount = v_coupon_disc,
    invoice_no = v_invoice,
    paid_at = case when v_status = 'PAID' then now() end,
    created_by = auth.uid()
  where id = v_sale_id
  returning public_token into v_token;

  return jsonb_build_object(
    'id', v_sale_id,
    'invoice_no', v_invoice,
    'payable', v_payable,
    'token', v_token,
    'coupon', v_new_coupon
  );
end;
$$;

-- Cancel a paid bill and put the books back in stock (admin only)
-- Admin fixes a paid bill: books, qty, price, mobile, payment mode. Same bill number and time.
-- Stock goes back for the old lines and out again for the new ones. Books already on the bill keep
-- the discount they were sold at; a redeemed coupon stays and is worked out again on the new amount.
create or replace function public.edit_sale(p jsonb)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_sale_id uuid := (p->>'sale_id')::uuid;
  v_mode text := nullif(p->>'payment_mode', '');
  v_phone text := nullif(trim(p->>'phone'), '');
  v_customer uuid;
  v_line jsonb;
  v_item record;
  v_qty numeric;
  v_price numeric;
  v_gross numeric;
  v_disc_amt numeric;
  v_total_qty numeric := 0;
  v_total_mrp numeric := 0;
  v_total_disc numeric := 0;
  v_sort integer := 0;
  v_coupon_pct numeric := 0;
  v_coupon_disc numeric := 0;
  v_amount numeric;
  v_payable numeric;
  v_old_discounts jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can edit bills';
  end if;
  select * into v_sale from public.sales where id = v_sale_id and status = 'PAID' for update;
  if not found then
    raise exception 'Bill not found or not paid';
  end if;
  if v_mode is null or v_mode not in ('CASH', 'UPI', 'CARD') then
    raise exception 'Choose a payment mode';
  end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'A bill needs at least one book. Cancel the bill instead';
  end if;
  if v_phone is null then
    raise exception 'Enter the customer mobile number (0000000000 if they won''t give one)';
  end if;
  if v_phone <> '0000000000' then
    if v_phone !~ '^[6-9][0-9]{9}$' then
      raise exception 'Invalid mobile number';
    end if;
    insert into public.pos_customers (phone) values (v_phone)
    on conflict (phone) do update set phone = excluded.phone
    returning id into v_customer;
  end if;

  -- Put the old lines back in stock
  select coalesce(jsonb_object_agg(item_id, discount), '{}'::jsonb) into v_old_discounts
  from public.sale_items where sale_id = v_sale_id;
  insert into public.stock_movements (location_id, item_id, qty, reason, ref_id)
  select v_sale.location_id, item_id, qty, 'SALE_EDIT', v_sale_id
  from public.sale_items where sale_id = v_sale_id;
  delete from public.sale_items where sale_id = v_sale_id;

  for v_line in select * from jsonb_array_elements(p->'items') loop
    v_qty := (v_line->>'qty')::numeric;
    v_price := (v_line->>'price')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be more than 0';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'Invalid price';
    end if;

    select i.id, i.name, coalesce(c.sell_by, 'PIECE') as sell_by,
           coalesce((v_old_discounts->>i.id::text)::numeric, cd.discount, 0) as discount
    into v_item
    from public.items i
    left join public.categories c on c.id = i.category_id
    left join public.category_discounts cd on cd.category_id = i.category_id and cd.location_id = v_sale.location_id
    where i.id = (v_line->>'item_id')::uuid;
    if not found then
      raise exception 'Book not found';
    end if;
    if v_item.sell_by = 'PIECE' and v_qty <> trunc(v_qty) then
      raise exception '% is sold per piece', v_item.name;
    end if;

    v_gross := round(v_qty * v_price, 2);
    v_disc_amt := round(v_gross * v_item.discount / 100, 2);

    insert into public.sale_items (sale_id, item_id, name, qty, price, discount, discount_amt, amount, sort_order)
    values (v_sale_id, v_item.id, v_item.name, v_qty, v_price, v_item.discount, v_disc_amt, v_gross - v_disc_amt, v_sort);

    v_sort := v_sort + 1;
    v_total_qty := v_total_qty + v_qty;
    v_total_mrp := v_total_mrp + v_gross;
    v_total_disc := v_total_disc + v_disc_amt;
  end loop;

  -- Take the new lines out of stock
  insert into public.stock_movements (location_id, item_id, qty, reason, ref_id)
  select v_sale.location_id, item_id, -qty, 'SALE_EDIT', v_sale_id
  from public.sale_items where sale_id = v_sale_id;

  v_amount := v_total_mrp - v_total_disc;
  if v_sale.coupon_code is not null then
    select discount_pct into v_coupon_pct from public.coupons where code = v_sale.coupon_code;
    v_coupon_disc := round(v_amount * coalesce(v_coupon_pct, 0) / 100, 2);
  end if;
  v_payable := round(v_amount - v_coupon_disc);

  update public.sales set
    customer_id = v_customer,
    phone = v_phone,
    payment_mode = v_mode,
    total_qty = v_total_qty,
    total_mrp = v_total_mrp,
    total_discount = v_total_disc,
    total_amount = v_amount - v_coupon_disc,
    payable = v_payable,
    coupon_discount = v_coupon_disc,
    edited_at = now(),
    edited_by = auth.uid()
  where id = v_sale_id;

  return jsonb_build_object('id', v_sale_id, 'invoice_no', v_sale.invoice_no, 'payable', v_payable);
end;
$$;

create or replace function public.cancel_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can cancel bills';
  end if;

  update public.sales
  set status = 'CANCELLED', cancelled_at = now(), cancel_reason = nullif(trim(p_reason), '')
  where id = p_sale_id and status = 'PAID';
  if not found then
    raise exception 'Bill not found or already cancelled';
  end if;

  insert into public.stock_movements (location_id, item_id, qty, reason, ref_id)
  select s.location_id, si.item_id, si.qty, 'SALE_CANCEL', s.id
  from public.sales s join public.sale_items si on si.sale_id = s.id
  where s.id = p_sale_id;

  -- Give back the coupon this bill used, and void the one it handed out
  update public.coupons set status = 'ACTIVE', redeemed_sale_id = null, redeemed_at = null
  where redeemed_sale_id = p_sale_id and status = 'REDEEMED';
  update public.coupons set status = 'VOID'
  where issued_sale_id = p_sale_id and status = 'ACTIVE';
end;
$$;

-- Receive stock by scanning. p = { location_id, supplier, notes, items: [{ item_id, qty, cost_price, codes: [] }] }
-- "codes" are scanned ISBNs that should point to this item from now on (lot books)
create or replace function public.create_stock_receipt(p jsonb)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_location uuid := (p->>'location_id')::uuid;
  v_receipt public.stock_receipts%rowtype;
  v_line jsonb;
  v_qty numeric;
  v_total numeric := 0;
begin
  if not public.can_use_location(v_location) then
    raise exception 'You cannot add stock to this location';
  end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'Scan at least one book';
  end if;

  insert into public.stock_receipts (location_id, supplier, notes)
  values (v_location, nullif(trim(p->>'supplier'), ''), nullif(trim(p->>'notes'), ''))
  returning * into v_receipt;

  for v_line in select * from jsonb_array_elements(p->'items') loop
    v_qty := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be more than 0';
    end if;

    insert into public.stock_receipt_items (receipt_id, item_id, qty, cost_price)
    values (v_receipt.id, (v_line->>'item_id')::uuid, v_qty, nullif(v_line->>'cost_price', '')::numeric);

    insert into public.stock_movements (location_id, item_id, qty, reason, ref_id)
    values (v_location, (v_line->>'item_id')::uuid, v_qty, 'RECEIPT', v_receipt.id);

    insert into public.barcodes (code, item_id)
    select distinct upper(trim(c)), (v_line->>'item_id')::uuid
    from jsonb_array_elements_text(coalesce(v_line->'codes', '[]'::jsonb)) as c
    where trim(c) <> ''
    on conflict do nothing;

    v_total := v_total + v_qty;
  end loop;

  update public.stock_receipts set total_qty = v_total where id = v_receipt.id;

  return jsonb_build_object('id', v_receipt.id, 'receipt_no', v_receipt.receipt_no, 'total_qty', v_total);
end;
$$;

-- Bill page opened from the SMS link (no login)
create or replace function public.get_public_bill(p_token uuid)
returns jsonb
language sql stable
security definer set search_path = ''
as $$
  select jsonb_build_object(
    'invoice_no', s.invoice_no,
    'paid_at', s.paid_at,
    'payment_mode', s.payment_mode,
    'total_qty', s.total_qty,
    'total_mrp', s.total_mrp,
    'total_discount', s.total_discount,
    'payable', s.payable,
    'coupon_code', s.coupon_code,
    'coupon_discount', s.coupon_discount,
    'next_coupon', (
      select jsonb_build_object('code', c.code, 'discount_pct', c.discount_pct)
      from public.coupons c where c.issued_sale_id = s.id and c.status = 'ACTIVE'
    ),
    'location_name', l.name,
    'location_address', l.address,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', si.name, 'qty', si.qty, 'price', si.price,
        'discount_amt', si.discount_amt, 'amount', si.amount
      ) order by si.sort_order)
      from public.sale_items si where si.sale_id = s.id
    ), '[]'::jsonb)
  )
  from public.sales s
  join public.locations l on l.id = s.location_id
  where s.public_token = p_token and s.status = 'PAID';
$$;

-- Staff management (admin only)
create or replace function public.list_staff()
returns table (id uuid, email text, full_name text, role text, location_id uuid, created_at timestamptz)
language sql stable
security definer set search_path = ''
as $$
  select p.id, u.email::text, p.full_name, p.role, p.location_id, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at;
$$;

create or replace function public.set_staff(p_user uuid, p_role text, p_location uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change staff';
  end if;
  if p_user = auth.uid() and p_role <> 'ADMIN' then
    raise exception 'You cannot remove your own admin access';
  end if;
  if p_role = 'STAFF' and p_location is null then
    raise exception 'Choose a location for staff';
  end if;
  update public.profiles
  set role = p_role, location_id = case when p_role = 'STAFF' then p_location end
  where id = p_user;
end;
$$;

revoke execute on function public.save_sale(jsonb) from public, anon;
revoke execute on function public.cancel_sale(uuid, text) from public, anon;
revoke execute on function public.edit_sale(jsonb) from public, anon;
revoke execute on function public.create_stock_receipt(jsonb) from public, anon;
revoke execute on function public.list_staff() from public, anon;
revoke execute on function public.set_staff(uuid, text, uuid) from public, anon;
grant execute on function public.save_sale(jsonb) to authenticated;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
grant execute on function public.edit_sale(jsonb) to authenticated;
grant execute on function public.create_stock_receipt(jsonb) to authenticated;
grant execute on function public.list_staff() to authenticated;
grant execute on function public.set_staff(uuid, text, uuid) to authenticated;
grant execute on function public.get_public_bill(uuid) to anon, authenticated;
revoke execute on function public.check_coupon(text, text) from public, anon;
grant execute on function public.check_coupon(text, text) to authenticated;
revoke execute on function public.new_coupon_code() from public, anon, authenticated;

-- ============================================
-- 9) ROW LEVEL SECURITY
-- ============================================
alter table public.locations enable row level security;
alter table public.categories enable row level security;
alter table public.category_discounts enable row level security;
alter table public.items enable row level security;
alter table public.barcodes enable row level security;
alter table public.stock enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_items enable row level security;
alter table public.pos_customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.coupons enable row level security;
alter table public.invoice_counters enable row level security;

-- Masters: staff read, admin write
create policy "Staff can view locations" on public.locations for select using (public.is_staff());
create policy "Admins manage locations" on public.locations for all using (public.is_admin()) with check (public.is_admin());

create policy "Staff can view categories" on public.categories for select using (public.is_staff());
create policy "Admins manage categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());

create policy "Staff can view discounts" on public.category_discounts for select using (public.is_staff());
create policy "Admins manage discounts" on public.category_discounts for all using (public.is_admin()) with check (public.is_admin());

-- Items: staff can add new books while receiving; only admins edit/delete
create policy "Staff can view items" on public.items for select using (public.is_staff());
create policy "Staff can add items" on public.items for insert with check (public.is_staff());
create policy "Admins update items" on public.items for update using (public.is_admin());
-- Staff may fix a publisher book for a day after it is added (title / price from fast receiving)
create policy "Staff fix new books" on public.items for update
  using (public.is_staff() and kind = 'PUBLISHER' and created_at > now() - interval '1 day')
  with check (public.is_staff() and kind = 'PUBLISHER');
create policy "Admins delete items" on public.items for delete using (public.is_admin());

create policy "Staff can view barcodes" on public.barcodes for select using (public.is_staff());
create policy "Admins manage barcodes" on public.barcodes for all using (public.is_admin()) with check (public.is_admin());

-- Stock is written only through the functions above
create policy "Staff can view stock" on public.stock for select using (public.is_staff());
create policy "Staff can view stock movements" on public.stock_movements for select using (public.is_staff());
create policy "Staff can view receipts" on public.stock_receipts for select using (public.is_staff());
create policy "Staff can view receipt items" on public.stock_receipt_items for select using (public.is_staff());

create policy "Staff can view customers" on public.pos_customers for select using (public.is_staff());

create policy "Staff view own location sales" on public.sales for select
  using (public.can_use_location(location_id));
create policy "Staff delete held bills" on public.sales for delete
  using (status = 'HELD' and public.can_use_location(location_id));

create policy "Staff can view coupons" on public.coupons for select using (public.is_staff());
create policy "Staff view own location sale items" on public.sale_items for select
  using (exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id and public.can_use_location(s.location_id)
  ));

-- invoice_counters: no policies (only used inside save_sale)

-- ============================================
-- 10) EXPENSES (daily spending at each location)
-- ============================================
create table public.expenses (
  id uuid not null default gen_random_uuid() primary key,
  location_id uuid not null references public.locations on delete restrict,
  spent_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  category text not null check (category in (
    'TEA_FOOD', 'TRANSPORT', 'LABOUR', 'SALARY', 'RENT', 'ELECTRICITY',
    'PRINTING', 'STATIONERY', 'REPAIRS', 'INFLUENCER', 'ADS', 'OTHER'
  )),
  amount numeric(10,2) not null check (amount > 0),
  paid_by text not null default 'CASH' check (paid_by in ('CASH', 'UPI', 'CARD', 'BANK')),
  note text not null default '',
  created_by uuid references public.profiles on delete set null,
  added_by text not null default '', -- name at the time, staff can't read other profiles
  created_at timestamptz not null default now()
);

create index idx_expenses_location_day on public.expenses (location_id, spent_on);

-- Who added it comes from the login, not from the form
create or replace function public.stamp_expense()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.added_by := coalesce((select full_name from public.profiles where id = auth.uid()), '');
  new.created_at := now();
  return new;
end;
$$;

create trigger expenses_stamp
  before insert on public.expenses
  for each row execute function public.stamp_expense();

alter table public.expenses enable row level security;

create policy "Staff view own location expenses" on public.expenses for select
  using (public.can_use_location(location_id));
-- Staff enter today's or yesterday's spending; admins any past day
create policy "Staff add expenses" on public.expenses for insert
  with check (
    public.can_use_location(location_id)
    and spent_on <= (now() at time zone 'Asia/Kolkata')::date
    and (public.is_admin() or spent_on >= (now() at time zone 'Asia/Kolkata')::date - 1)
  );
-- Staff can remove their own entry for a day after adding it (to fix a mistake)
create policy "Remove expenses" on public.expenses for delete
  using (
    public.is_admin()
    or (created_by = auth.uid() and created_at > now() - interval '1 day' and public.can_use_location(location_id))
  );

-- ============================================
-- 11) MAKE YOURSELF ADMIN (edit the email, then run)
-- ============================================
-- update public.profiles set role = 'ADMIN'
-- where id = (select id from auth.users where email = 'you@example.com');
-- Owner's overview for the phone app: sales and expenses per exhibition, the previous period of the
-- same length for comparison, and sales by day and by hour. Books by the piece and by the kg are
-- counted apart, since adding them up makes no sense. Runs as the caller, so RLS applies.
create or replace function public.owner_overview(p_from date, p_to date, p_location uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with b as (
    select (p_from::timestamp at time zone 'Asia/Kolkata') as s,
           ((p_to + 1)::timestamp at time zone 'Asia/Kolkata') as e,
           ((p_from - (p_to - p_from + 1))::timestamp at time zone 'Asia/Kolkata') as ps
  ),
  paid as (
    select x.id, x.location_id, x.payable, x.payment_mode, x.total_qty, x.paid_at, x.paid_at >= b.s as cur
    from public.sales x cross join b
    where x.status = 'PAID' and x.paid_at >= b.ps and x.paid_at < b.e
      and (p_location is null or x.location_id = p_location)
  ),
  s as (
    select location_id, count(*) as bills, sum(payable) as total,
           coalesce(sum(payable) filter (where payment_mode = 'CASH'), 0) as cash,
           coalesce(sum(payable) filter (where payment_mode = 'UPI'), 0) as upi,
           coalesce(sum(payable) filter (where payment_mode = 'CARD'), 0) as card,
           coalesce(sum(total_qty), 0) as qty
    from paid where cur group by location_id
  ),
  units as (
    select p.location_id,
           coalesce(sum(si.qty) filter (where c.sell_by is distinct from 'KG'), 0) as pieces,
           coalesce(sum(si.qty) filter (where c.sell_by = 'KG'), 0) as kg
    from paid p
    join public.sale_items si on si.sale_id = p.id
    left join public.items i on i.id = si.item_id
    left join public.categories c on c.id = i.category_id
    where p.cur
    group by p.location_id
  ),
  ex as (
    select location_id, sum(amount) as expenses,
           coalesce(sum(amount) filter (where paid_by = 'CASH'), 0) as cash_expenses
    from public.expenses
    where spent_on between p_from and p_to and (p_location is null or location_id = p_location)
    group by location_id
  )
  select jsonb_build_object(
    'prev_total', (select coalesce(sum(payable), 0) from paid where not cur),
    'prev_bills', (select count(*) from paid where not cur),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'name', l.name, 'code', l.code,
               'bills', coalesce(s.bills, 0), 'total', coalesce(s.total, 0),
               'cash', coalesce(s.cash, 0), 'upi', coalesce(s.upi, 0), 'card', coalesce(s.card, 0),
               'qty', coalesce(s.qty, 0), 'pieces', coalesce(units.pieces, 0), 'kg', coalesce(units.kg, 0),
               'expenses', coalesce(ex.expenses, 0), 'cash_expenses', coalesce(ex.cash_expenses, 0))
             order by coalesce(s.total, 0) desc, l.name)
      from public.locations l
      left join s on s.location_id = l.id
      left join units on units.location_id = l.id
      left join ex on ex.location_id = l.id
      where s.location_id is not null or ex.location_id is not null
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'total', t, 'bills', n) order by d)
      from (select (paid_at at time zone 'Asia/Kolkata')::date as d, sum(payable) as t, count(*) as n
            from paid where cur group by 1) q
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'total', t, 'bills', n) order by h)
      from (select extract(hour from paid_at at time zone 'Asia/Kolkata')::int as h, sum(payable) as t, count(*) as n
            from paid where cur group by 1) q
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.owner_overview(date, date, uuid) from public, anon;
grant execute on function public.owner_overview(date, date, uuid) to authenticated;
