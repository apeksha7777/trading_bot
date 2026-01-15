import client from "./binanceClient.js";
import { log, error, debug } from "../utils/logger.js";

// Global locks and state tracking
let orderInFlight = false;
let lastActionKey = null;
const ORDER_COOLDOWN_MS = 500;

/**
 * Place a market order on Binance Futures
 *
 * @param {string} action - "OPEN" to enter position, "CLOSE" to exit
 * @param {number} quantity - Order quantity
 * @param {string} symbol - Trading pair (e.g., "SOLUSDT")
 * @param {string} side - "LONG" or "SHORT"
 * @returns {Promise<Object>} Order response from Binance
 */
async function placeOrder(action, quantity, symbol = "BTCUSDT", side = "LONG") {
  // Input validation
  if (!["OPEN", "CLOSE"].includes(action)) {
    throw new Error("Action must be 'OPEN' or 'CLOSE'");
  }

  if (typeof quantity !== "number" || quantity <= 0) {
    throw new Error("Quantity must be a positive number");
  }

  if (!symbol || typeof symbol !== "string") {
    throw new Error("Symbol is required");
  }

  if (!["LONG", "SHORT"].includes(side)) {
    throw new Error("Side must be 'LONG' or 'SHORT'");
  }

  // Prevent duplicate orders
  if (orderInFlight) {
    log("⛔ Order blocked: order already in flight");
    return null;
  }

  // Action deduplication
  const actionKey = `${action}_${side}_${quantity}_${symbol}`;
  if (actionKey === lastActionKey) {
    log("⛔ Duplicate order blocked:", actionKey);
    return null;
  }

  orderInFlight = true;
  lastActionKey = actionKey;

  try {
    // Determine order side
    let orderSide;
    if (action === "CLOSE") {
      orderSide = side === "LONG" ? "SELL" : "BUY";
    } else {
      orderSide = side === "LONG" ? "BUY" : "SELL";
    }

    log(
      `📤 Placing order: ${action} | ${symbol} | ${orderSide} ${quantity}`
    );
    debug(`Order timestamp: ${new Date().toISOString()}`);

    // Place market order
    const order = await client.futuresOrder({
      symbol,
      side: orderSide,
      type: "MARKET",
      quantity,
      reduceOnly: action === "CLOSE",
    });

    if (!order || !order.orderId) {
      throw new Error("No order ID received from Binance");
    }

    log(
      `✅ Order ${order.orderId} executed: ${orderSide} ${quantity} ${symbol}`
    );

    return order;
  } catch (err) {
    const errorMsg = err?.response?.body?.msg || err?.message || String(err);
    error(`❌ Order failed: ${errorMsg}`);
    throw err;
  } finally {
    // Release lock after cooldown
    setTimeout(() => {
      orderInFlight = false;
    }, ORDER_COOLDOWN_MS);
  }
}

export default placeOrder;
