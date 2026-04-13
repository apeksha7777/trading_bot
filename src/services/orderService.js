import client from "./binanceClient.js";
import { log, error, debug } from "../utils/logger.js";

// Global locks and state tracking
let orderInFlight = false;
let lastActionKey = null;

/**
 * Place an order on Binance Futures using LIMIT when a price is provided.
 *
 * @param {string} action - "OPEN" to enter position, "CLOSE" to exit
 * @param {number} quantity - Order quantity
 * @param {string} symbol - Trading pair (e.g., "SOLUSDT")
 * @param {string} side - "LONG" or "SHORT"
 * @param {?number} price - Optional limit price; if provided, a LIMIT order is placed
 * @returns {Promise<Object>} Order response from Binance
 */
async function placeOrder(action, quantity, symbol = "BTCUSDT", side = "LONG", price = null) {
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

  if (price !== null && (typeof price !== "number" || price <= 0)) {
    throw new Error("Price must be a positive number for limit orders");
  }

  // Prevent duplicate orders
  if (orderInFlight) {
    log("⛔ Order blocked: order already in flight");
    return null;
  }

  // Action deduplication
  const actionKey = `${action}_${side}_${quantity}_${symbol}_${price}`;
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

    const orderType = price !== null ? "LIMIT" : "MARKET";
    const orderParams = {
      symbol,
      side: orderSide,
      type: orderType,
      quantity,
      reduceOnly: action === "CLOSE",
    };

    if (price !== null) {
      orderParams.price = price.toString();
      orderParams.timeInForce = "GTC";
    }

    log(
      `📤 Placing order: ${action} | ${symbol} | ${orderSide} ${quantity} | ${orderType}${price !== null ? ` @ ${price}` : ""}`
    );
    debug(`Order timestamp: ${new Date().toISOString()}`);

    const order = await client.futuresOrder(orderParams);

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
    orderInFlight = false;
  }
}

/**
 * Cancel an existing Binance Futures order by orderId.
 *
 * @param {string} symbol - Trading pair (e.g., "BTCUSDT")
 * @param {number|string} orderId - Binance order ID
 * @returns {Promise<Object>} Cancel response from Binance
 */
async function cancelOrder(symbol, orderId) {
  if (!symbol || typeof symbol !== "string") {
    throw new Error("Symbol is required");
  }

  if (!orderId) {
    throw new Error("Order ID is required to cancel an order");
  }

  try {
    log(`🗑️ Cancelling order ${orderId} for ${symbol}`);
    const result = await client.futuresCancelOrder({ symbol, orderId });
    log(`✅ Cancelled order ${orderId} for ${symbol}`);
    return result;
  } catch (err) {
    const errorMsg = err?.response?.body?.msg || err?.message || String(err);
    error(`❌ Cancel failed: ${errorMsg}`);
    throw err;
  }
}

export { cancelOrder };
export default placeOrder;
