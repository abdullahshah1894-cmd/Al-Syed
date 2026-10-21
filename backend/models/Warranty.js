const mongoose = require("mongoose");

/**
 * WARRANTY MANAGEMENT SCHEMA
 * ─────────────────────────────────────────────────────────────
 * Tracks mobile/electronics warranties tied to specific IMEIs.
 * Statuses: Active, Expiring Soon, Expired, Pending Claims.
 */
const warrantyClaimSchema = new mongoose.Schema(
  {
    claimDate: {
      type: Date,
      default: Date.now,
    },
    issueDescription: {
      type: String,
      required: [true, "Issue description is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["Received", "In Repair", "Sent to Brand", "Replaced", "Resolved", "Rejected"],
      default: "Received",
    },
    repairCost: {
      type: Number,
      default: 0,
    },
    resolvedDate: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { _id: true }
);

const warrantySchema = new mongoose.Schema(
  {
    // ── Primary Identifiers ────────────────────────────────
    imei: {
      type: String,
      required: [true, "15-digit IMEI number is required"],
      trim: true,
      index: true,
    },

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
      required: true,
    },
    model: {
      type: String,
    },

    // ── Related Transaction & Customer ─────────────────────
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      default: null,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    customerName: {
      type: String,
      required: true,
    },
    customerPhone: {
      type: String,
      required: true,
    },

    // ── Warranty Timeline ──────────────────────────────────
    purchaseDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    warrantyDuration: {
      type: Number,
      required: true,
      default: 12, // in months
    },
    warrantyStartDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    warrantyExpiryDate: {
      type: Date,
      required: true,
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

    // ── Status ─────────────────────────────────────────────
    status: {
      type: String,
      enum: ["Active", "Expiring Soon", "Expired", "Pending Claims", "Claimed", "Void"],
      default: "Active",
    },

    // ── History of Claims ──────────────────────────────────
    claims: [warrantyClaimSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── PRE-SAVE: Auto-calculate expiry date and dynamic status ───
warrantySchema.pre("save", function (next) {
  if (!this.warrantyExpiryDate && this.warrantyStartDate && this.warrantyDuration) {
    const expiry = new Date(this.warrantyStartDate);
    expiry.setMonth(expiry.getMonth() + this.warrantyDuration);
    this.warrantyExpiryDate = expiry;
  }

  // Update dynamic status based on current date
  if (this.status !== "Void" && this.status !== "Pending Claims") {
    const now = new Date();
    const expiry = new Date(this.warrantyExpiryDate);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      this.status = "Expired";
    } else if (diffDays <= 30) {
      this.status = "Expiring Soon";
    } else {
      this.status = "Active";
    }
  }

  next();
});

// ── VIRTUAL: Days remaining until expiration ──────────────────
warrantySchema.virtual("daysRemaining").get(function () {
  if (!this.warrantyExpiryDate) return 0;
  const now = new Date();
  const expiry = new Date(this.warrantyExpiryDate);
  const diffTime = expiry - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// ── INDEXES ───────────────────────────────────────────────────
warrantySchema.index({ imei: 1 });
warrantySchema.index({ status: 1 });
warrantySchema.index({ customerPhone: 1 });
warrantySchema.index({ warrantyExpiryDate: 1 });

module.exports = mongoose.model("Warranty", warrantySchema);
