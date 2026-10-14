const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * USER SCHEMA
 * ─────────────────────────────────────────────────────────────
 * Handles authentication for shop staff.
 * Roles:
 *   'admin'    → Full access (analytics, Zakat, settings, all pages)
 *   'cashier'  → Limited access (POS, Inventory view, Bills only)
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: [80, "Name cannot exceed 80 characters"],
    },

    email: {
      type: String,
      required: [true, "Email address is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Never returned in queries by default
    },

    role: {
      type: String,
      enum: {
        values: ["admin", "cashier"],
        message: "Role must be either 'admin' or 'cashier'",
      },
      default: "cashier",
    },

    phone: {
      type: String,
      trim: true,
      match: [/^(\+92|0)?3\d{9}$/, "Please provide a valid Pakistani phone number"],
    },

    isActive: {
      type: Boolean,
      default: true, // Admin can deactivate accounts without deleting
    },

    // Tracks the last time a JWT was issued — useful for token invalidation
    passwordChangedAt: {
      type: Date,
    },

    // Optional: profile avatar URL (uploaded to cloud storage)
    avatar: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

// ── PRE-SAVE HOOK: Hash password before storing ──────────────
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = Date.now() - 1000; // ensure token issued after this
  next();
});

// ── INSTANCE METHOD: Compare plain-text password with hashed ──
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// ── INSTANCE METHOD: Check if JWT was issued before password change ──
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false; // Password was NOT changed after token was issued
};

module.exports = mongoose.model("User", userSchema);
