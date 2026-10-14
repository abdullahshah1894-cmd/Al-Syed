const mongoose = require("mongoose");

/**
 * SALE / BILL SCHEMA
 * ─────────────────────────────────────────────────────────────
 * Logs all transactions completed via POS checkout.
 * Tracks sold items, IMEIs, pricing, payment methods,
 * discount, tax, Udhaar (pending credit), and profit.
 */
const saleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
    },
    model: {
      type: String,
    },
    category: {
      type: String,
    },
    imei: {
      type: String,
      trim: true,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      default: 1,
    },
    unitPurchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    unitSalePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true }
);

const saleSchema = new mongoose.Schema(
  {
    // Auto-generated invoice number e.g. "INV-20260911-0001"
    billNumber: {
      type: String,
      required: true,
      unique: true,
    },

    // ── Customer Details ───────────────────────────────────
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null, // Null for walk-in cash customers with no profile
    },
    customerName: {
      type: String,
      default: "Walk-in Customer",
    },
    customerPhone: {
      type: String,
      default: "",
    },

    // ── Purchased Items Array ──────────────────────────────
    items: [saleItemSchema],

    // ── Financial Breakdown ────────────────────────────────
    subtotalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxPercent: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    paidAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    dueAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Payment Info ───────────────────────────────────────
    paymentMethod: {
      type: String,
      required: [true, "Payment method is required"],
      enum: [
        "Cash",
        "Card",
        "Bank Transfer",
        "Credit (Udhaar)",
        "Easypaisa",
        "JazzCash",
        "Split Payment",
      ],
      default: "Cash",
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "partial", "unpaid"],
      default: "paid",
    },
    dueDate: {
      type: Date,
      default: null, // For Udhaar / pending bills
    },

    // ── Staff Reference ────────────────────────────────────
    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cashierName: {
      type: String,
      required: true,
    },

    // ── Cancellation & Refund ─────────────────────────────
    isCancelled: {
      type: Boolean,
      default: false,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── VIRTUAL: Total Purchase Cost of all sold items ────────────
saleSchema.virtual("totalCost").get(function () {
  if (!this.items || this.items.length === 0) return 0;
  return this.items.reduce(
    (sum, item) => sum + item.unitPurchasePrice * item.quantity,
    0
  );
});

// ── VIRTUAL: Net Profit on this bill ──────────────────────────
saleSchema.virtual("netProfit").get(function () {
  return this.grandTotal - this.totalCost;
});

// ── INDEXES: Fast reporting & search ──────────────────────────
saleSchema.index({ billNumber: 1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ paymentStatus: 1 });
saleSchema.index({ customer: 1 });
saleSchema.index({ "items.imei": 1 });

module.exports = mongoose.model("Sale", saleSchema);
