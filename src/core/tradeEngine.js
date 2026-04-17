import placeBinanceOrder, { cancelOrder, isOrderFilled } from "../services/orderService.js";
import { log, error, debug } from "../utils/logger.js";

/**
 * Creates a trading engine that manages position sizing and order execution
 * based on price levels (Entry 1, Entry 2, Entry 3, TP, SL)
 */
function createTradeEngine(inputs, quantities) {
  const {
    entry1,
    entry2,
    entry3,
    takeProfit,
    stopLoss,
    side,
    symbol,
  } = inputs;

  const { qty1, qty2, qty3 } = quantities;

  let state = {
    level: 0, // 0 = none, 1 = E1, 2 = E2, 3 = E3
    positionQty: 0,
    done: false,
    activeOrders: {
      entry1: null,
      entry2: null,
      entry3: null,
      takeProfit: null,
      stopLoss: null,
    },
    pendingFills: {
      entry1: false,
      entry2: false,
      entry3: false,
    },
    triggered: {
      entry1: false,
      entry2: false,
      entry3: false,
    },
    orderPlacementAttempted: {
      entry2: false,
      entry3: false,
      stopLoss: false,
      takeProfit: false,
    },
  };

  /**
   * Validates inputs before processing
   */
  function validateInputs() {
    if (!symbol) throw new Error("Symbol is required");
    if (!["LONG", "SHORT"].includes(side))
      throw new Error("Side must be LONG or SHORT");
    if (qty1 <= 0 || qty2 <= 0 || qty3 <= 0)
      throw new Error("Quantities must be positive");
  }

  async function placeOrderWrapper(action, qty, price = null, tag = null) {
    if (qty <= 0) {
      error("Invalid quantity for order:", qty);
      return null;
    }

    try {
      const order = await placeBinanceOrder(action, qty, symbol, side, price);
      if (tag && order?.orderId) {
        state.activeOrders[tag] = { orderId: order.orderId, price: price };
      }
      return order;
    } catch (err) {
      error("Failed to place order:", err.message);
      return null;
    }
  }

  async function cancelOrderByTag(tag) {
    const orderInfo = state.activeOrders[tag];
    if (!orderInfo || !orderInfo.orderId) return null;

    try {
      return await cancelOrder(symbol, orderInfo.orderId);
    } catch (err) {
      error(`Failed to cancel ${tag} order:`, err.message);
      return null;
    } finally {
      state.activeOrders[tag] = null;
    }
  }

  async function cancelOrders(tags) {
    await Promise.all(tags.map((tag) => cancelOrderByTag(tag)));
  }

  async function cancelEntryOrders() {
    await cancelOrders(["entry1", "entry2", "entry3"]);
  }

  async function cancelProtectiveOrders(excludeTag = null) {
    const tags = ["takeProfit", "stopLoss"].filter((tag) => tag !== excludeTag);
    await cancelOrders(tags);
  }

  async function checkPendingFills() {
    try {
      // Determine order side (BUY for LONG, SELL for SHORT)
      const orderSide = side === "LONG" ? "BUY" : "SELL";

      // Check Entry 1 fill
      if (state.pendingFills.entry1 && state.activeOrders.entry1) {
        const orderInfo = state.activeOrders.entry1;
        if (await isOrderFilled(symbol, orderInfo.orderId, orderSide, qty1, orderInfo.price)) {
          log(`Entry 1 order filled - Qty: ${qty1}`);
          state.level = 1;
          state.positionQty = qty1;
          state.activeOrders.entry1 = null;
          state.pendingFills.entry1 = false;

          // Now place Entry 2, SL, and TP (only if not already attempted)
          if (!state.orderPlacementAttempted.entry2) {
            state.orderPlacementAttempted.entry2 = true;
            await placeOrderWrapper("OPEN", qty2, entry2, "entry2");
          }
          if (!state.orderPlacementAttempted.stopLoss) {
            state.orderPlacementAttempted.stopLoss = true;
            await placeOrderWrapper("CLOSE", state.positionQty, stopLoss, "stopLoss");
          }
          if (!state.orderPlacementAttempted.takeProfit) {
            state.orderPlacementAttempted.takeProfit = true;
            await placeOrderWrapper("CLOSE", state.positionQty, takeProfit, "takeProfit");
          }
        }
      }

      // Check Entry 2 fill
      if (state.pendingFills.entry2 && state.activeOrders.entry2) {
        const orderInfo = state.activeOrders.entry2;
        if (await isOrderFilled(symbol, orderInfo.orderId, orderSide, qty2, orderInfo.price)) {
          log(`Entry 2 order filled - Qty: ${qty2}`);
          state.level = 2;
          state.positionQty += qty2;
          state.activeOrders.entry2 = null;
          state.pendingFills.entry2 = false;

          // Now place Entry 3, and update SL/TP (only if not already attempted)
          if (!state.orderPlacementAttempted.entry3) {
            state.orderPlacementAttempted.entry3 = true;
            await placeOrderWrapper("OPEN", qty3, entry3, "entry3");
          }
          // Reset SL/TP attempted flags for new orders
          state.orderPlacementAttempted.stopLoss = false;
          state.orderPlacementAttempted.takeProfit = false;
          await cancelProtectiveOrders();
          if (!state.orderPlacementAttempted.stopLoss) {
            state.orderPlacementAttempted.stopLoss = true;
            await placeOrderWrapper("CLOSE", state.positionQty, stopLoss, "stopLoss");
          }
          if (!state.orderPlacementAttempted.takeProfit) {
            state.orderPlacementAttempted.takeProfit = true;
            await placeOrderWrapper("CLOSE", state.positionQty, entry1, "takeProfit");
          }
        }
      }

      // Check Entry 3 fill
      if (state.pendingFills.entry3 && state.activeOrders.entry3) {
        const orderInfo = state.activeOrders.entry3;
        if (await isOrderFilled(symbol, orderInfo.orderId, orderSide, qty3, orderInfo.price)) {
          log(`Entry 3 order filled - Qty: ${qty3}`);
          state.level = 3;
          state.positionQty += qty3;
          state.activeOrders.entry3 = null;
          state.pendingFills.entry3 = false;

          // Update SL/TP (only if not already attempted)
          // Reset SL/TP attempted flags for final orders
          state.orderPlacementAttempted.stopLoss = false;
          state.orderPlacementAttempted.takeProfit = false;
          await cancelProtectiveOrders();
          if (!state.orderPlacementAttempted.stopLoss) {
            state.orderPlacementAttempted.stopLoss = true;
            await placeOrderWrapper("CLOSE", state.positionQty, stopLoss, "stopLoss");
          }
          if (!state.orderPlacementAttempted.takeProfit) {
            state.orderPlacementAttempted.takeProfit = true;
            await placeOrderWrapper("CLOSE", state.positionQty, entry2, "takeProfit");
          }
        }
      }
    } catch (err) {
      error("Error checking pending fills:", err.message);
    }
  }

  async function initializeOrders() {
    log(`Initializing limit orders for ${symbol}`);

    await placeOrderWrapper("OPEN", qty1, entry1, "entry1");
    // Protective orders will be placed after entry1 is triggered
  }

  async function onPrice(price) {
    try {
      if (state.done) return;

      debug(
        `[${symbol}] LTP: ${price}, Level: ${state.level}, Position Qty: ${state.positionQty}`
      );

      // Check for pending order fills and place subsequent orders
      await checkPendingFills();

      // ---------- STOP LOSS ----------
      if (
        (side === "LONG" && price <= stopLoss) ||
        (side === "SHORT" && price >= stopLoss)
      ) {
        log(`STOP LOSS HIT at ${price}`);
        state.done = true;
        await cancelEntryOrders();
        await cancelProtectiveOrders("stopLoss");
        return;
      }

      // ---------- TAKE PROFIT ----------
      if (
        (side === "LONG" && price >= takeProfit) ||
        (side === "SHORT" && price <= takeProfit)
      ) {
        log(`TAKE PROFIT HIT at ${price}`);
        state.done = true;
        await cancelEntryOrders();
        await cancelProtectiveOrders("takeProfit");
        return;
      }

      // ---------- ENTRY 1 ----------
      if (state.level === 0) {
        if (
          (side === "LONG" && price <= entry1) ||
          (side === "SHORT" && price >= entry1)
        ) {
          if (!state.triggered.entry1) {
            log(`ENTRY 1 triggered at ${price} - Qty: ${qty1}`);
            state.triggered.entry1 = true;
            // The order was already placed in initializeOrders, now mark as pending fill
            state.pendingFills.entry1 = true;
          }
        }
        return;
      }

      // ---------- ENTRY 2 ----------
      if (state.level === 1) {
        if (
          (side === "LONG" && price <= entry2) ||
          (side === "SHORT" && price >= entry2)
        ) {
          if (!state.triggered.entry2) {
            log(`ENTRY 2 triggered at ${price} - Qty: ${qty2}`);
            state.triggered.entry2 = true;
            // The order was already placed when entry1 filled, now mark as pending fill
            state.pendingFills.entry2 = true;
          }
        }
        return;
      }

      // ---------- ENTRY 3 ----------
      if (state.level === 2) {
        if (
          (side === "LONG" && price <= entry3) ||
          (side === "SHORT" && price >= entry3)
        ) {
          if (!state.triggered.entry3) {
            log(`ENTRY 3 triggered at ${price} - Qty: ${qty3}`);
            state.triggered.entry3 = true;
            // The order was already placed when entry2 filled, now mark as pending fill
            state.pendingFills.entry3 = true;
          }
        }
      }
    } catch (err) {
      error("Error in onPrice handler:", err.message);
    }
  }

  /**
   * Get current trading state (useful for monitoring)
   */
  function getState() {
    return { ...state };
  }

  // Validate on creation
  try {
    validateInputs();
  } catch (err) {
    error("Trade engine initialization failed:", err.message);
    throw err;
  }

  return { onPrice, getState, initializeOrders };
}

export default createTradeEngine;
