/**
 * Binance API Client Configuration
 * Connects to Binance Futures API (testnet or live based on env)
 */

import BinanceAPI from "binance-api-node";
import config from "../../config/environment.js";
import { error } from "../utils/logger.js";

// Handle both ESM and CommonJS default exports from the library
const Binance = typeof BinanceAPI === 'function' ? BinanceAPI : BinanceAPI.default;

let client;

try {
  if (typeof Binance !== 'function') throw new Error("Binance factory is not a function. Check your import.");
  
  client = Binance({
    apiKey: config.binance.apiKey,
    apiSecret: config.binance.apiSecret,
    testnet: config.binance.testnet,
  });
} catch (err) {
  error("Failed to initialize Binance client:", err.message);
  process.exit(1);
}

export default client;
