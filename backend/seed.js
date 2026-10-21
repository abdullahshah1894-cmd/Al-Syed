const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const mongoose = require("mongoose");
const Product = require("./models/Product");
const Sale = require("./models/Sale");

const sampleProducts = [
  {
    name: "iPhone 15 Pro Max",
    brand: "Apple",
    model: "256GB Natural Titanium",
    category: "Smartphones",
    purchasePrice: 380000,
    salePrice: 425000,
    warrantyDuration: 12,
    warrantyType: "Official Brand Warranty",
    imeis: [
      { imei: "358921098471201", status: "in_stock", ptaStatus: "Approved" },
      { imei: "358921098471202", status: "in_stock", ptaStatus: "Approved" },
    ],
  },
  {
    name: "Samsung Galaxy S24 Ultra",
    brand: "Samsung",
    model: "512GB Titanium Black",
    category: "Smartphones",
    purchasePrice: 340000,
    salePrice: 385000,
    warrantyDuration: 12,
    warrantyType: "Official Brand Warranty",
    imeis: [
      { imei: "354129087123901", status: "in_stock", ptaStatus: "Approved" },
      { imei: "354129087123902", status: "in_stock", ptaStatus: "Approved" },
    ],
  },
  {
    name: "Xiaomi 14 Ultra",
    brand: "Xiaomi",
    model: "512GB Black",
    category: "Smartphones",
    purchasePrice: 220000,
    salePrice: 255000,
    warrantyDuration: 12,
    warrantyType: "Shop Warranty",
    imeis: [
      { imei: "867123049182301", status: "in_stock", ptaStatus: "Approved" },
    ],
  },
];

const seedData = async () => {
  try {
    const connStr = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/finalyear";
    console.log("[Seeder] Connecting to MongoDB Atlas Cluster...");
    await mongoose.connect(connStr, {
      tls: true,
      tlsAllowInvalidCertificates: true,
    });
    console.log("[Seeder] Connected successfully to Atlas Database!");

    await Product.deleteMany({});
    await Sale.deleteMany({});

    await Product.insertMany(sampleProducts);
    console.log("[Seeder] Sample products successfully seeded into MongoDB Atlas.");

    process.exit(0);
  } catch (err) {
    console.error("[Seeder Error]", err.message);
    process.exit(1);
  }
};

seedData();
