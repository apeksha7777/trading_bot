/**
 * Trading Bot Application
 * Manages initialization, execution, and graceful shutdown
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import createTradeEngine from "./core/tradeEngine.js";
import { calculateTCLQuantities, getStepSizeAndMinQty } from "./utils/qtyCalculator.js";
import placeOrder from "./services/orderService.js";
import { log, error, warn } from "./utils/logger.js";
import client from "./services/binanceClient.js";
import startPriceFeed from "./services/priceFeedService.js";
import { validateInputs } from "./validators/inputValidator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "../trading-config.json");

let priceInterval = null;
let isRunning = false;

/**
 * Load trading configuration from JSON file
 */
function loadConfig() {
  try {
    const configData = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configData);
    return config;
  } catch (err) {
    error("Failed to load trading-config.json:", err.message);
    process.exit(1);
  }
}

/**
 * Main trading function
 */
async function runPositionSizing() {
  try {
    if (isRunning) {
      warn("Trading bot is already running");
      return;
    }

    isRunning = true;
    log("Trading bot starting...");

    // Load configuration from file
    const inputs = loadConfig();

    // Validate inputs
    validateInputs(inputs);
    log("Input validation passed");

    // Set leverage
    log(`Setting leverage to ${inputs.leverage}x for ${inputs.symbol}`);
    await client.futuresLeverage({
      symbol: inputs.symbol,
      leverage: inputs.leverage,
    });

    // Get symbol precision info
    const { stepSize, minQty } = await getStepSizeAndMinQty(inputs.symbol);
    log(`Symbol precision - stepSize: ${stepSize}, minQty: ${minQty}`);

    // Calculate quantities
    const results = calculateTCLQuantities(
      inputs.amount,
      inputs.entry1,
      inputs.takeProfit,
      inputs.stopLoss,
      inputs.leverage,
      inputs.entry2,
      inputs.entry3,
      stepSize,
      minQty
    );

    log("--- Trading Configuration ---");
    log(`Symbol: ${inputs.symbol}`);
    log(`Side: ${inputs.side}`);
    log(`Account Size: ${inputs.amount}`);
    log(`Entry 1: ${inputs.entry1}`);
    log(`Entry 2: ${inputs.entry2}`);
    log(`Entry 3: ${inputs.entry3}`);
    log(`Take Profit: ${inputs.takeProfit}`);
    log(`Stop Loss: ${inputs.stopLoss}`);
    log(`Leverage: ${inputs.leverage}x`);

    log("\n--- Calculated Quantities ---");
    log(`Entry 1 Qty: ${results.qty1}`);
    log(`Entry 2 Qty: ${results.qty2}`);
    log(`Entry 3 Qty: ${results.qty3}`);
    log(`Total Position Qty: ${results.qty1 + results.qty2 + results.qty3}`);

    // Create trade engine
    const engine = createTradeEngine(inputs, results);

    // Start price feed
    log("Starting price feed...");
    priceInterval = startPriceFeed(inputs.symbol, engine.onPrice);

    log("Trading bot initialized successfully");
    log("Waiting for price levels...");
  } catch (err) {
    error("Failed to initialize trading bot:", err.message);
    isRunning = false;
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
function shutdown(signal) {
  return async () => {
    log(`\nReceived ${signal}, shutting down gracefully...`);

    if (priceInterval) {
      clearInterval(priceInterval);
      log("Stopped price feed");
    }

    isRunning = false;
    log("Trading bot shut down successfully");
    process.exit(0);
  };
}

/**
 * Setup process event handlers
 */
function setupProcessHandlers() {
  // Handle signals
  process.on("SIGINT", shutdown("SIGINT"));
  process.on("SIGTERM", shutdown("SIGTERM"));

  // Handle uncaught exceptions
  process.on("uncaughtException", (err) => {
    error("Uncaught exception:", err);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    error("Unhandled rejection at:", promise, "reason:", reason);
    process.exit(1);
  });
}

/**
 * Start the application
 */
export async function start() {
  setupProcessHandlers();
  
  try {
    await runPositionSizing();
  } catch (err) {
    error("Fatal error:", err.message);
    process.exit(1);
  }
}

export default { start };
