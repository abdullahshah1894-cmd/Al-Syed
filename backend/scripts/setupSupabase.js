const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { createClient } = require("@supabase/supabase-js");
const { Pool } = require("pg");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error("Missing DATABASE_URL in environment");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = `
-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'cashier' CHECK (role IN ('admin','cashier')),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products / Inventory
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT,
  category TEXT NOT NULL DEFAULT 'Smartphones',
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  min_stock_alert INTEGER DEFAULT 2,
  barcode TEXT UNIQUE,
  warranty_duration INTEGER DEFAULT 12,
  warranty_type TEXT DEFAULT 'Official Brand Warranty',
  supplier_name TEXT,
  supplier_phone TEXT,
  specs JSONB DEFAULT '{}',
  imeis JSONB DEFAULT '[]',
  is_deleted BOOLEAN DEFAULT FALSE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  cnic TEXT,
  notes TEXT,
  total_purchases NUMERIC(14,2) DEFAULT 0,
  outstanding_balance NUMERIC(14,2) DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  items JSONB DEFAULT '[]',
  subtotal_amount NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  tax_percent NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  grand_total NUMERIC(12,2) DEFAULT 0,
  paid_amount NUMERIC(12,2) DEFAULT 0,
  due_amount NUMERIC(12,2) DEFAULT 0,
  net_profit NUMERIC(12,2) DEFAULT 0,
  payment_method TEXT DEFAULT 'Cash',
  payment_status TEXT DEFAULT 'paid',
  cashier_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ledger Entries
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'item' CHECK (type IN ('opening','invoice','item','payment')),
  date DATE DEFAULT CURRENT_DATE,
  description TEXT,
  qty NUMERIC(10,2) DEFAULT 0,
  rate NUMERIC(12,2) DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  amount NUMERIC(12,2) DEFAULT 0,
  debit NUMERIC(12,2) DEFAULT 0,
  credit NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(12,2) DEFAULT 0,
  parent_invoice_id UUID,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Warranties
CREATE TABLE IF NOT EXISTS warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imei TEXT NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  brand TEXT,
  model TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  purchase_date DATE,
  warranty_duration INTEGER DEFAULT 12,
  warranty_start_date DATE,
  warranty_expiry_date DATE,
  warranty_type TEXT DEFAULT 'Official Brand Warranty',
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active','Expired','Expiring Soon','Void')),
  claims JSONB DEFAULT '[]',
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function setupSchema() {
  console.log("[Setup] Connecting to Supabase PostgreSQL...");
  const client = await pool.connect();
  try {
    console.log("[Setup] Running schema migrations...");
    await client.query(SQL);
    console.log("[Setup] ✅ All 6 tables created successfully!");

    // Insert default admin user if not exists
    await client.query(`
      INSERT INTO users (name, username, password, role)
      VALUES ('Syed Admin (Owner)', 'admin', 'admin123', 'admin'),
             ('Cashier User', 'cashier', 'cashier123', 'cashier')
      ON CONFLICT (username) DO NOTHING;
    `);
    console.log("[Setup] ✅ Default users seeded.");
  } catch (err) {
    console.error("[Setup Error]", err.message);
  } finally {
    client.release();
    await pool.end();
    console.log("[Setup] Done. Database ready.");
  }
}

setupSchema();
