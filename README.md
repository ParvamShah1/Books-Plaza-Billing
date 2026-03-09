# BooksPlaza - Billing System

A production-ready GST-compliant billing system for Indian bookstores built with Next.js 14+, Supabase, and TypeScript.

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **PDF**: jsPDF + jspdf-autotable
- **Excel**: xlsx (SheetJS)
- **Validation**: Zod
- **Icons**: Lucide React

## Features

- Email + Password authentication with Supabase
- Customer management (CRUD + soft delete)
- Invoice system (Tax Invoice + Delivery Challan)
- GST calculation (CGST/SGST breakup)
- Auto invoice numbering (INV-0001)
- PDF generation and print
- Excel bulk upload with preview
- Dashboard with sales stats
- Row Level Security (user isolation)
- Business profile settings

---

## Setup Instructions

### 1. Install Dependencies

```bash
cd booksplaza
npm install
```

### 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy your project URL and anon key from **Settings > API**

### 3. Configure Environment Variables

Edit `.env.local` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Run Database Schema

1. Go to Supabase Dashboard > **SQL Editor**
2. Open `supabase/schema.sql`
3. Copy the entire contents and run it in the SQL Editor

This creates:
- All tables (profiles, customers, invoices, invoice_items)
- Indexes
- RLS policies
- Auto profile creation trigger
- Invoice number generator function

### 5. Enable Email Auth

In Supabase Dashboard > **Authentication > Providers**, ensure Email provider is enabled.

For development, you may want to disable email confirmation:
- Go to **Authentication > Settings**
- Uncheck "Enable email confirmations"

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Architecture

```
src/
├── app/
│   ├── auth/
│   │   ├── login/page.tsx        # Login page
│   │   └── signup/page.tsx       # Signup page
│   ├── (dashboard)/
│   │   ├── layout.tsx            # Dashboard layout with sidebar
│   │   ├── dashboard/page.tsx    # Main dashboard
│   │   ├── customers/page.tsx    # Customer management
│   │   ├── invoices/
│   │   │   ├── page.tsx          # Invoice listing
│   │   │   ├── new/page.tsx      # Create invoice
│   │   │   └── [id]/page.tsx     # Invoice detail + PDF
│   │   ├── upload/page.tsx       # Bulk upload
│   │   └── settings/page.tsx     # Business settings
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Root redirect
├── components/
│   ├── ui/
│   │   ├── badge.tsx
│   │   ├── empty-state.tsx
│   │   ├── modal.tsx
│   │   ├── page-header.tsx
│   │   └── stat-card.tsx
│   ├── sidebar.tsx
│   ├── customer-form.tsx
│   ├── invoice-form.tsx
│   └── invoice-actions.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server Supabase client
│   │   └── middleware.ts         # Session management
│   ├── actions/
│   │   ├── auth.ts               # Auth server actions
│   │   ├── customers.ts          # Customer CRUD actions
│   │   ├── invoices.ts           # Invoice actions + dashboard
│   │   └── profile.ts            # Profile actions
│   ├── calculations.ts           # GST + invoice math
│   ├── pdf.ts                    # PDF generation
│   ├── types.ts                  # TypeScript types
│   └── validations.ts            # Zod schemas
└── middleware.ts                  # Route protection

supabase/
└── schema.sql                    # Complete SQL schema + RLS
```

## Design System

| Element | Color |
|---------|-------|
| Primary Accent | Orange (#F97316) |
| Background | White |
| Secondary BG | gray-50 |
| Text | neutral-900 |
| Sidebar | neutral-900 (black) |
| Borders | gray-200 |

## Invoice Types

- **Tax Invoice**: Full GST breakup (CGST + SGST), grand total with tax
- **Delivery Challan**: Simple total without GST display, convertible to Tax Invoice
