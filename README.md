# Mobile Shop POS & Management System (FYP)

A comprehensive, full-stack Point of Sale (POS), Inventory, Customer Khata / Ledger, and Repair Management System tailored for retail mobile phone and electronics stores.

---

## 🌟 Key Features

- **Point of Sale (POS)**
  - Fast barcode and IMEI search.
  - Multi-payment support (Cash, Card, Bank Transfer, Split/Credit).
  - Clean thermal printing tailored for 80mm continuous receipt paper without blank pages or browser chrome.
  - Seller attribution and profit calculation per transaction.

- **Inventory & IMEI Tracking**
  - Smartphone inventory with IMEI-level tracking and PTA approval status (`Approved`, `Non-PTA`).
  - Low stock alerts and warranty duration configurations.
  - Multi-category support (Smartphones, Accessories, Tablets, etc.).

- **Customer Ledger (Khata / Udhar System)**
  - Comprehensive debit and credit transaction history per customer.
  - Printable statement slips and payment receipts.
  - Pending payment alerts and balance tracking.

- **Warranty & Claims Management**
  - Instant warranty verification by IMEI.
  - Claim history and status logging (Brand Warranty vs. Shop Warranty).

- **Mobile Repair & Issue Ticketing**
  - Service ticketing system for customer phone repairs.
  - Lifecycle statuses: `Pending`, `Under Inspection`, `Repaired`, `Delivered`, `Rejected`.

- **Expense Management & Reporting**
  - Shop expense tracking categorized by type (Rent, Utilities, Salary, Daily Expenses).
  - Real-time gross and net profit computation.

- **Role-Based Authentication**
  - Admin and Cashier accounts with role-specific access permissions.

---

## 🛠️ Tech Stack

- **Frontend:** React, Vite, Lucide Icons, Vanilla CSS Design System.
- **Backend:** Node.js, Express.js.
- **Database:** Supabase (Cloud PostgreSQL).

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Git](https://git-scm.com/)
- A [Supabase](https://supabase.com/) account & project

---

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/abdullahshah1894-cmd/FYP.git
   cd FYP
   ```

2. **Frontend Setup:**
   ```bash
   # Install dependencies
   npm install

   # Configure environment variables
   cp .env.example .env
   ```
   Edit `.env` with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   PORT=5000
   ```

3. **Backend Setup:**
   ```bash
   cd backend
   npm install

   # Configure backend environment variables
   cp .env.example .env
   ```
   Edit `backend/.env` with your PostgreSQL database URL and service keys:
   ```env
   PORT=5000
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   DATABASE_URL=postgresql://postgres:your_password@your_project_host:5432/postgres
   ```

4. **Database Migration & Initialization:**
   ```bash
   # Create database tables and initial admin user
   node scripts/setupSupabase.js
   node scripts/setupMobileIssues.js
   node apply_migration.js            # expenses table, seller columns
   node scripts/migratePersistence.js # ledger, settings, customers.updated_at
   node scripts/migrateHardening.js   # login revocation, one opening balance per day
   node scripts/migrateSales.js       # create_sale / add_stock (one transaction per sale)
   node scripts/migrateReturnsSuppliers.js # returns, bill edit / delete, suppliers
   ```
   All migrations are safe to run again. If `db.<project>.supabase.co` does not resolve on your network
   (IPv6 only), use the Session pooler connection string from Supabase → Connect as `DATABASE_URL`.

   Optional: add `JWT_SECRET=<long random string>` to `backend/.env`. Without it the login tokens are
   signed with the service role key.

5. **Running Locally:**
   - **Start the backend server:**
     ```bash
     cd backend
     npm start
     # or node server.js
     ```
   - **Start the frontend application:**
     ```bash
     # From project root
     npm run dev
     ```
   - Open your browser at `http://localhost:5173` and log in with a user from the `users` table
     (seeded: `admin` / `admin123`, `cashier` / `cashier123` — change these). Vite forwards `/api` to the
     backend on port 5000; for a backend on another machine set `VITE_API_URL` in `.env`.
   - **Production:** `npm run build`, then run the backend with `NODE_ENV=production`; it serves the app and
     the API from the same address (http://localhost:5000).
   - **Cache:** the server keeps the lists (products, sales, customers, ...) in memory and refreshes them after
     every save, so screens load in milliseconds instead of a round trip to Supabase. Set `REDIS_URL` in
     `backend/.env` to keep the cache in Redis instead (shared when several computers run the server).

---

## 💻 Running on the shop laptop (Windows)

1. First time only: clone the repo, copy `backend/.env.example` to `backend/.env` and fill in the Supabase keys
   (the **service_role** key is required).
2. **To get the newest version:** double-click `update-app.bat` (pulls `main` from GitHub, installs packages and
   builds the app).
3. **To open the app:** double-click `start-app.bat` (starts the server, which also serves the built app, then opens
   http://localhost:5000). Keep the "Al-Syed server" window open while working.

Database changes are applied once to the shared Supabase database, so every laptop sees the same data.

---

## 🔐 Security & Configuration

Sensitive keys, database credentials, and `.env` files are strictly excluded from version control via `.gitignore`. Always refer to `.env.example` to set up your local development environment.

---

## 📄 License

This project is developed for educational and commercial point-of-sale management purposes.
