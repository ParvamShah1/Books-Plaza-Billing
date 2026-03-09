-- ============================================
-- BooksPlaza Billing System - Database Schema
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- 1) PROFILES TABLE
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- 2) ENTITIES TABLE (Business entities that issue invoices)
-- ============================================
create table public.entities (
  id uuid not null default uuid_generate_v4() primary key,
  name text not null,
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  gstin text not null default '',
  account_number text not null default '',
  branch_ifsc text not null default '',
  branch_name text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================
-- 3) CUSTOMERS TABLE
-- ============================================
create table public.customers (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users on delete cascade,
  full_name text not null,
  phone text,
  email text,
  address text,
  gst_number text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_customers_user_id on public.customers (user_id);
create index idx_customers_deleted_at on public.customers (deleted_at);

-- ============================================
-- 4) INVOICES TABLE
-- ============================================
create table public.invoices (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users on delete cascade,
  entity_id uuid not null references public.entities on delete restrict,
  invoice_number text not null,
  type text not null check (type in ('DELIVERY_CHALLAN', 'TAX_INVOICE')),
  customer_id uuid not null references public.customers on delete restrict,
  subtotal numeric(12,2) not null default 0,
  freight_charges numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  show_total boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create unique index idx_invoices_number on public.invoices (user_id, invoice_number);
create index idx_invoices_user_id on public.invoices (user_id);
create index idx_invoices_entity_id on public.invoices (entity_id);
create index idx_invoices_customer_id on public.invoices (customer_id);
create index idx_invoices_created_at on public.invoices (created_at);

-- ============================================
-- 5) INVOICE ITEMS TABLE
-- ============================================
create table public.invoice_items (
  id uuid not null default uuid_generate_v4() primary key,
  invoice_id uuid not null references public.invoices on delete cascade,
  title text not null,
  publisher text,
  quantity integer not null default 1 check (quantity > 0),
  price numeric(10,2) not null default 0 check (price >= 0),
  discount numeric(5,2) not null default 0 check (discount >= 0 and discount <= 100),
  amount numeric(12,2) not null default 0
);

create index idx_invoice_items_invoice_id on public.invoice_items (invoice_id);

-- ============================================
-- 6) PAYMENTS TABLE (per-customer payment tracking)
-- ============================================
create table public.payments (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users on delete cascade,
  customer_id uuid not null references public.customers on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  mode text not null default 'CASH' check (mode in ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_payments_user_id on public.payments (user_id);
create index idx_payments_customer_id on public.payments (customer_id);
create index idx_payments_created_at on public.payments (created_at);

-- ============================================
-- AUTO-INCREMENT INVOICE NUMBER
-- ============================================
create or replace function public.generate_invoice_number(p_user_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  next_num integer;
begin
  select coalesce(
    max(
      cast(
        regexp_replace(invoice_number, '^(INV|DC)-', '')
        as integer
      )
    ), 0
  ) + 1
  into next_num
  from public.invoices
  where user_id = p_user_id;

  return 'INV-' || lpad(next_num::text, 4, '0');
end;
$$;

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.entities enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

-- PROFILES policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ENTITIES policies (shared across all users)
create policy "Authenticated users can view entities"
  on public.entities for select
  using (auth.uid() is not null);

-- CUSTOMERS policies
create policy "Users can view own customers"
  on public.customers for select
  using (auth.uid() = user_id);

create policy "Users can create own customers"
  on public.customers for insert
  with check (auth.uid() = user_id);

create policy "Users can update own customers"
  on public.customers for update
  using (auth.uid() = user_id);

create policy "Users can delete own customers"
  on public.customers for delete
  using (auth.uid() = user_id);

-- INVOICES policies
create policy "Users can view own invoices"
  on public.invoices for select
  using (auth.uid() = user_id);

create policy "Users can create own invoices"
  on public.invoices for insert
  with check (auth.uid() = user_id);

create policy "Users can update own invoices"
  on public.invoices for update
  using (auth.uid() = user_id);

create policy "Users can delete own invoices"
  on public.invoices for delete
  using (auth.uid() = user_id);

-- INVOICE ITEMS policies
create policy "Users can view own invoice items"
  on public.invoice_items for select
  using (
    exists (
      select 1 from public.invoices
      where invoices.id = invoice_items.invoice_id
      and invoices.user_id = auth.uid()
    )
  );

create policy "Users can create own invoice items"
  on public.invoice_items for insert
  with check (
    exists (
      select 1 from public.invoices
      where invoices.id = invoice_items.invoice_id
      and invoices.user_id = auth.uid()
    )
  );

create policy "Users can update own invoice items"
  on public.invoice_items for update
  using (
    exists (
      select 1 from public.invoices
      where invoices.id = invoice_items.invoice_id
      and invoices.user_id = auth.uid()
    )
  );

create policy "Users can delete own invoice items"
  on public.invoice_items for delete
  using (
    exists (
      select 1 from public.invoices
      where invoices.id = invoice_items.invoice_id
      and invoices.user_id = auth.uid()
    )
  );

-- PAYMENTS policies
create policy "Users can view own payments"
  on public.payments for select
  using (auth.uid() = user_id);

create policy "Users can create own payments"
  on public.payments for insert
  with check (auth.uid() = user_id);

create policy "Users can update own payments"
  on public.payments for update
  using (auth.uid() = user_id);

create policy "Users can delete own payments"
  on public.payments for delete
  using (auth.uid() = user_id);
