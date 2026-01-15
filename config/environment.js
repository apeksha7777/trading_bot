/**
 * Configuration management
 * Ensures all required environment variables are set
 */

import dotenv from "dotenv";
dotenv.config();

const config = {
  // Environment
  env: process.env.NODE_ENV || "development",
  isDev: (process.env.NODE_ENV || "development") === "development",
  isProd: process.env.NODE_ENV === "production",

  // Binance API
  binance: {
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: process.env.TESTNET === "true" || process.env.TESTNET === "1",
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || "info",
    maxSize: process.env.LOG_MAX_SIZE || "50m",
    maxFiles: parseInt(process.env.LOG_MAX_FILES || "7"),
  },

  // Server
  port: parseInt(process.env.PORT || "3000"),
};

/**
 * Validate critical configuration on startup
 */
function validateConfig() {
  const errors = [];

  if (!config.binance.apiKey) {
    errors.push("BINANCE_API_KEY is required");
  }
  if (!config.binance.apiSecret) {
    errors.push("BINANCE_API_SECRET is required");
  }

  if (errors.length > 0) {
    console.error("❌ Configuration validation failed:");
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }
}

// Validate on import (production only)
if (config.isProd) {
  validateConfig();
}

export default config;
