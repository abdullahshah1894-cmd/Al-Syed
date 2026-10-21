const mongoose = require("mongoose");

/**
 * CUSTOMER SCHEMA
 * ─────────────────────────────────────────────────────────────
 * Stores customer profiles, purchase history totals,
 * and Udhaar (credit/pending) balances.
 */
const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },

    phone: {
      type: String,
      required: [true, "Customer phone number is required"],
      unique: true,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    cnic: {
      type: String,
      trim: true,
      match: [
        /^\d{5}-\d{7}-\d{1}$/,
        "CNIC must follow the format: XXXXX-XXXXXXX-X",
      ],
      sparse: true, // Optional but unique if provided
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
    },

    // ── Purchase Summary (auto-updated on every sale) ──────
    totalPurchases: {
      type: Number,
      default: 0, // Cumulative total of all bills (Rs.)
    },

    totalPaid: {
      type: Number,
      default: 0, // Total amount actually received
    },

    // totalPending is a virtual: totalPurchases - totalPaid
    // (Also stored for fast querying on Pending Bills page)
    totalPending: {
      type: Number,
      default: 0,
    },

    // ── Flags ──────────────────────────────────────────────
    isBlacklisted: {
      type: Boolean,
      default: false, // Admin can flag problematic customers
    },

    notes: {
      type: String,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },

    // All sales references for this customer
    sales: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Sale",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── VIRTUAL: Pending balance ───────────────────────────────────
customerSchema.virtual("pendingBalance").get(function () {
  return Math.max(0, this.totalPurchases - this.totalPaid);
});

// ── VIRTUAL: Is this customer an Udhaar (credit) customer? ────
customerSchema.virtual("isUdhaarCustomer").get(function () {
  return this.totalPending > 0;
});

// ── INDEX: Fast search by phone or name ───────────────────────
customerSchema.index({ phone: 1 });
customerSchema.index({ name: "text" }); // Text search
customerSchema.index({ totalPending: -1 });

module.exports = mongoose.model("Customer", customerSchema);
