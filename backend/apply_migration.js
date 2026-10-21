require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function migrateDatabase() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");

    const sql = `
      ALTER TABLE "public"."sales" ADD COLUMN IF NOT EXISTS "seller_name" text;
      
      ALTER TABLE "public"."customers" ADD COLUMN IF NOT EXISTS "seller_name" text;
      
      CREATE TABLE IF NOT EXISTS "public"."expenses" (
          "id" uuid DEFAULT gen_random_uuid() NOT NULL,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL,
          "title" text NOT NULL,
          "amount" numeric NOT NULL,
          "category" text DEFAULT 'Other'::text,
          "description" text,
          "seller_name" text,
          "payment_method" text DEFAULT 'Cash'::text,
          "expense_date" date DEFAULT CURRENT_DATE,
          CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
      );
      
      ALTER TABLE "public"."expenses" DISABLE ROW LEVEL SECURITY;
    `;

    console.log("Applying schema migration...");
    await client.query(sql);
    console.log("Migration successful!");

  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
    console.log("Disconnected.");
  }
}

migrateDatabase();
