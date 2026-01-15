import placeBinanceOrder from "../services/orderService.js";
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
    exitAtPrice: null,
    done: false,
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

  /**
   * Main price callback - handles all trading logic
   */
  function onPrice(price) {
    try {
      if (state.done) return;

      debug(`[${symbol}] LTP: ${price}, Level: ${state.level}, Position Qty: ${state.positionQty}`);

      // ---------- STOP LOSS ----------
      if (
        (side === "LONG" && price <= stopLoss) ||
        (side === "SHORT" && price >= stopLoss)
      ) {
        if (state.positionQty > 0) {
          log(`STOP LOSS HIT at ${price}`);
          placeOrderWrapper("CLOSE", state.positionQty);
          state.done = true;
        }
        return;
      }

      // ---------- TAKE PROFIT ----------
      if (
        (side === "LONG" && price >= takeProfit) ||
        (side === "SHORT" && price <= takeProfit)
      ) {
        log(`TAKE PROFIT HIT at ${price}`);
        placeOrderWrapper("CLOSE", state.positionQty);
        state.done = true;
        return;
      }

      // ---------- EXIT ON RETRACE ----------
      if (!state.done && state.exitAtPrice !== null) {
        if (
          (side === "LONG" && price >= state.exitAtPrice) ||
          (side === "SHORT" && price <= state.exitAtPrice)
        ) {
          log(`RETRACE EXIT triggered at ${price}`);
          placeOrderWrapper("CLOSE", state.positionQty);
          state.done = true;
          return;
        }
      }

      // ---------- ENTRY 1 ----------
      if (state.level === 0) {
        if (
          (side === "LONG" && price <= entry1) ||
          (side === "SHORT" && price >= entry1)
        ) {
          log(`ENTRY 1 triggered at ${price} - Qty: ${qty1}`);
          placeOrderWrapper("OPEN", qty1);
          state.level = 1;
          state.positionQty = qty1;
          state.exitAtPrice = takeProfit;
        }
        return;
      }

      // ---------- ENTRY 2 ----------
      if (state.level === 1) {
        if (
          (side === "LONG" && price <= entry2) ||
          (side === "SHORT" && price >= entry2)
        ) {
          log(`ENTRY 2 triggered at ${price} - Qty: ${qty2}`);
          placeOrderWrapper("OPEN", qty2);
          state.level = 2;
          state.positionQty += qty2;
          state.exitAtPrice = entry1; // retrace target
        }
        return;
      }

      // ---------- ENTRY 3 ----------
      if (state.level === 2) {
        if (
          (side === "LONG" && price <= entry3) ||
          (side === "SHORT" && price >= entry3)
        ) {
          log(`ENTRY 3 triggered at ${price} - Qty: ${qty3}`);
          placeOrderWrapper("OPEN", qty3);
          state.level = 3;
          state.positionQty += qty3;
          state.exitAtPrice = entry2; // retrace target
        }
      }
    } catch (err) {
      error("Error in onPrice handler:", err.message);
    }
  }

  /**
   * Wrapper for placing orders with error handling
   */
  function placeOrderWrapper(action, qty) {
    if (qty <= 0) {
      error("Invalid quantity for order:", qty);
      return;
    }
    // Fire and forget with error handling
    placeBinanceOrder(action, qty, symbol, side).catch((err) => {
      error("Failed to place order:", err.message);
    });
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

  return { onPrice, getState };
}

export default createTradeEngine;
