const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const connStr = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/finalyear";
    console.log(`[MongoDB] Connecting to MongoDB Atlas...`);
    const conn = await mongoose.connect(connStr, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB] Connected successfully to Atlas Database: ${conn.connection.name}`);
  } catch (error) {
    if (error.message.includes("SSL alert") || error.message.includes("tlsv1")) {
      console.warn(`[MongoDB Atlas Warning] TLS Alert: IP Access List whitelist check required.`);
      console.warn(`[MongoDB Atlas Instruction] Go to MongoDB Atlas -> Network Access -> Add IP Address -> Allow Access from Anywhere (0.0.0.0/0).`);
    } else {
      console.warn(`[MongoDB Warning]: ${error.message}`);
    }
    console.warn("[MongoDB Info] Server operating in fallback mode until Atlas IP is whitelisted.");
  }
};

module.exports = connectDB;
