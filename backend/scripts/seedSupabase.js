const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("Missing DATABASE_URL in environment");
  process.exit(1);
}
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function seedData() {
  console.log("[Seeder] Connecting to Supabase PostgreSQL...");
  const client = await pool.connect();
  try {
    // Clear existing
    await client.query("DELETE FROM warranties; DELETE FROM ledger_entries; DELETE FROM sales; DELETE FROM products; DELETE FROM customers;");

    // Products
    const products = [
      {
        name: "iPhone 15 Pro Max",
        brand: "Apple",
        model: "256GB Natural Titanium",
        category: "Smartphones",
        purchase_price: 380000,
        sale_price: 425000,
        quantity: 3,
        min_stock_alert: 2,
        barcode: "88846200001",
        warranty_duration: 12,
        warranty_type: "Official Brand Warranty",
        supplier_name: "Apple Direct Pakistan",
        supplier_phone: "0300-1112233",
        specs: { ram: "8GB", storage: "256GB", color: "Natural Titanium", batteryCapacity: "4422mAh", os: "iOS 17" },
        imeis: [
          { imei: "358921098471201", status: "in_stock", ptaStatus: "Approved" },
          { imei: "358921098471202", status: "in_stock", ptaStatus: "Approved" },
          { imei: "358921098471203", status: "sold", ptaStatus: "Approved" },
        ],
      },
      {
        name: "Samsung Galaxy S24 Ultra",
        brand: "Samsung",
        model: "512GB Titanium Black",
        category: "Smartphones",
        purchase_price: 340000,
        sale_price: 385000,
        quantity: 4,
        min_stock_alert: 2,
        barcode: "88846200002",
        warranty_duration: 12,
        warranty_type: "Official Brand Warranty",
        supplier_name: "Samsung Official Dealer",
        supplier_phone: "0321-4445566",
        specs: { ram: "12GB", storage: "512GB", color: "Titanium Black", batteryCapacity: "5000mAh", os: "Android 14" },
        imeis: [
          { imei: "354112091234501", status: "in_stock", ptaStatus: "Approved" },
          { imei: "354112091234502", status: "in_stock", ptaStatus: "Non-PTA" },
        ],
      },
      {
        name: "Xiaomi 14 Ultra",
        brand: "Xiaomi",
        model: "512GB Ceramic Black",
        category: "Smartphones",
        purchase_price: 220000,
        sale_price: 255000,
        quantity: 2,
        min_stock_alert: 2,
        barcode: "88846200003",
        warranty_duration: 12,
        warranty_type: "Shop Warranty",
        supplier_name: "Xiaomi Pakistan",
        supplier_phone: "0333-7778899",
        specs: { ram: "16GB", storage: "512GB", color: "Ceramic Black", batteryCapacity: "5300mAh", os: "Android 14" },
        imeis: [
          { imei: "867123049182301", status: "in_stock", ptaStatus: "Approved" },
          { imei: "867123049182302", status: "in_stock", ptaStatus: "Approved" },
        ],
      },
      {
        name: "OnePlus 12",
        brand: "OnePlus",
        model: "256GB Silky Black",
        category: "Smartphones",
        purchase_price: 160000,
        sale_price: 189999,
        quantity: 5,
        min_stock_alert: 2,
        barcode: "88846200004",
        warranty_duration: 12,
        warranty_type: "Official Brand Warranty",
        supplier_name: "OnePlus Distributor",
        supplier_phone: "0311-2223344",
        specs: { ram: "12GB", storage: "256GB", color: "Silky Black", batteryCapacity: "5400mAh", os: "Android 14" },
        imeis: [
          { imei: "351987012345601", status: "in_stock", ptaStatus: "Approved" },
        ],
      },
      {
        name: "Apple AirPods Pro 2",
        brand: "Apple",
        model: "USB-C MagSafe",
        category: "Accessories",
        purchase_price: 45000,
        sale_price: 55000,
        quantity: 10,
        min_stock_alert: 3,
        barcode: "88846200005",
        warranty_duration: 12,
        warranty_type: "Official Brand Warranty",
        specs: {},
        imeis: [],
      },
    ];

    const insertedProducts = [];
    for (const p of products) {
      const { rows } = await client.query(
        `INSERT INTO products (name, brand, model, category, purchase_price, sale_price, quantity, min_stock_alert, barcode, warranty_duration, warranty_type, supplier_name, supplier_phone, specs, imeis)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [p.name, p.brand, p.model, p.category, p.purchase_price, p.sale_price, p.quantity, p.min_stock_alert, p.barcode, p.warranty_duration, p.warranty_type, p.supplier_name || null, p.supplier_phone || null, JSON.stringify(p.specs), JSON.stringify(p.imeis)]
      );
      insertedProducts.push({ ...p, id: rows[0].id });
    }
    console.log(`[Seeder] ✅ ${insertedProducts.length} products seeded.`);

    // Customers
    const custResult = await client.query(
      `INSERT INTO customers (name, phone, address, total_purchases) VALUES
       ('Tariq Mahmood', '03001234567', 'Lahore', 425000),
       ('Muhammad Rizwan', '03219876543', 'Karachi', 385000)
       RETURNING id`
    );
    console.log(`[Seeder] ✅ Customers seeded.`);

    // Sales
    const iphone = insertedProducts.find(p => p.name === "iPhone 15 Pro Max");
    const samsung = insertedProducts.find(p => p.name === "Samsung Galaxy S24 Ultra");
    const c1 = custResult.rows[0].id;
    const c2 = custResult.rows[1].id;

    const saleItems1 = [{ productId: iphone.id, productName: "iPhone 15 Pro Max", brand: "Apple", qty: 1, imei: "358921098471203", unitPurchasePrice: 380000, unitSalePrice: 425000, subtotal: 425000 }];
    const saleItems2 = [{ productId: samsung.id, productName: "Samsung Galaxy S24 Ultra", brand: "Samsung", qty: 1, imei: "354112091234502", unitPurchasePrice: 340000, unitSalePrice: 385000, subtotal: 385000 }];

    await client.query(
      `INSERT INTO sales (bill_number, customer_id, customer_name, customer_phone, items, subtotal_amount, grand_total, paid_amount, due_amount, net_profit, payment_method, payment_status, cashier_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13), ($14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [
        "INV-20260910-001", c1, "Tariq Mahmood", "03001234567", JSON.stringify(saleItems1), 425000, 425000, 425000, 0, 45000, "Cash", "paid", "Syed Admin",
        "INV-20260911-002", c2, "Muhammad Rizwan", "03219876543", JSON.stringify(saleItems2), 385000, 385000, 385000, 0, 45000, "Card", "paid", "Syed Admin",
      ]
    );
    console.log("[Seeder] ✅ Sales seeded.");

    // Ledger opening balance
    await client.query(
      `INSERT INTO ledger_entries (type, date, description, balance) VALUES ('opening', CURRENT_DATE, 'Opening Balance', 776605)`
    );
    console.log("[Seeder] ✅ Ledger seeded.");

    console.log("[Seeder] 🎉 All data seeded into Supabase successfully!");
  } catch (err) {
    console.error("[Seeder Error]", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seedData();
