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
   ```

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
   - Open your browser at `http://localhost:5173`.

---

## 🔐 Security & Configuration

Sensitive keys, database credentials, and `.env` files are strictly excluded from version control via `.gitignore`. Always refer to `.env.example` to set up your local development environment.

---

## 📄 License

This project is developed for educational and commercial point-of-sale management purposes.
