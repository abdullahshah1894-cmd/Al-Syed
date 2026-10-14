const mongoose = require("mongoose");

/**
 * PRODUCT SCHEMA
 * ─────────────────────────────────────────────────────────────
 * Central inventory record for every item in the shop.
 * Covers: Smartphones, Accessories, Tablets, Spare Parts.
 *
 * Each phone unit with a unique IMEI is stored as ONE Product
 * document. For accessories sold in bulk (no IMEI), the
 * `quantity` field tracks stock count.
 */
const productSchema = new mongoose.Schema(
  {
    // ── Basic Info ─────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },

    brand: {
      type: String,
      required: [true, "Brand is required"],
      trim: true,
    },

    model: {
      type: String,
      trim: true,
    },

    category: {
      type: String,
      required: [true, "Category is required"],
      enum: [
        "Smartphones",
        "Tablets & iPads",
        "Accessories",
        "Spare Parts",
        "Wearables",
        "Other",
      ],
    },

    // ── IMEI / Serial Numbers ──────────────────────────────
    // For smartphones: array of IMEI objects (one per unit)
    // For accessories: empty array or serial numbers
    imeis: [
      {
        imei: {
          type: String,
          trim: true,
          match: [/^\d{15}$/, "IMEI must be exactly 15 digits"],
        },
        status: {
          type: String,
          enum: ["in_stock", "sold", "returned", "damaged"],
          default: "in_stock",
        },
        ptaStatus: {
          type: String,
          enum: ["Approved", "Non-PTA", "CPID", "Unknown"],
          default: "Unknown",
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        soldAt: {
          type: Date,
          default: null,
        },
        // Reference to the sale document when this unit was sold
        soldInSale: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Sale",
          default: null,
        },
      },
    ],

    // ── Specifications (for IMEI Checker display) ──────────
    specs: {
      ram: { type: String, trim: true },           // e.g. "8GB", "12GB"
      storage: { type: String, trim: true },        // e.g. "256GB", "512GB"
      color: { type: String, trim: true },          // e.g. "Midnight Black"
      displaySize: { type: String, trim: true },    // e.g. "6.7 inch"
      processor: { type: String, trim: true },      // e.g. "Snapdragon 8 Gen 3"
      batteryCapacity: { type: String, trim: true }, // e.g. "5000mAh"
      os: { type: String, trim: true },             // e.g. "Android 14", "iOS 17"
    },

    // ── Pricing ────────────────────────────────────────────
    purchasePrice: {
      type: Number,
      required: [true, "Purchase (cost) price is required"],
      min: [0, "Purchase price cannot be negative"],
    },

    salePrice: {
      type: Number,
      required: [true, "Sale price is required"],
      min: [0, "Sale price cannot be negative"],
    },

    // ── Stock Management ───────────────────────────────────
    // For non-IMEI items (accessories/parts); for IMEI items,
    // quantity is auto-derived from imeis array filtered by status
    quantity: {
      type: Number,
      default: 0,
      min: [0, "Quantity cannot be negative"],
    },

    minStockAlert: {
      type: Number,
      default: 2, // Alert when stock falls at or below this number
      min: 0,
    },

    // ── Supplier / Purchasing Info ─────────────────────────
    supplier: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      company: { type: String, trim: true },
    },

    purchaseDate: {
      type: Date,
      default: Date.now,
    },

    // ── Warranty ───────────────────────────────────────────
    warrantyDuration: {
      type: Number,
      default: 12, // In months
      min: 0,
    },

    warrantyType: {
      type: String,
      enum: [
        "Official Brand Warranty",
        "Shop Warranty",
        "Checking Warranty",
        "No Warranty",
      ],
      default: "Official Brand Warranty",
    },

    // ── Barcode / QR ───────────────────────────────────────
    // Auto-generated barcode string for POS scanning
    barcode: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values (unique only when set)
    },

    // ── Soft Delete ────────────────────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
    },

    // Who added this product
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    // Virtual fields are included when converting to JSON/object
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── VIRTUAL: In-Stock IMEI count (for IMEI-based phones) ──────
productSchema.virtual("stockCount").get(function () {
  if (this.imeis && this.imeis.length > 0) {
    return this.imeis.filter((i) => i.status === "in_stock").length;
  }
  return this.quantity; // fallback for accessories
});

// ── VIRTUAL: Gross Profit per unit ────────────────────────────
productSchema.virtual("profitMargin").get(function () {
  return this.salePrice - this.purchasePrice;
});

// ── VIRTUAL: Profit margin % ──────────────────────────────────
productSchema.virtual("profitPercent").get(function () {
  if (this.purchasePrice === 0) return 0;
  return (((this.salePrice - this.purchasePrice) / this.purchasePrice) * 100).toFixed(2);
});

// ── INDEX: Fast search by IMEI, brand, category ───────────────
productSchema.index({ "imeis.imei": 1 });
productSchema.index({ brand: 1, category: 1 });
productSchema.index({ barcode: 1 });
productSchema.index({ isDeleted: 1 });

module.exports = mongoose.model("Product", productSchema);
