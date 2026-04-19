import client from "../services/binanceClient.js";
import { error, debug } from "./logger.js";

/**
 * Calculate decimals from step size
 */
function getDecimals(stepSize) {
  const s = stepSize.toString();
  return s.includes(".") ? s.split(".")[1].length : 0;
}

/**
 * Round value to step size precision
 */
function roundToStep(value, stepSize) {
  if (stepSize <= 0) {
    throw new Error("Step size must be positive");
  }
  const decimals = getDecimals(stepSize);
  return Number(
    (Math.floor(value / stepSize) * stepSize).toFixed(decimals)
  );
}

/**
 * Calculates TCL (Three Level) quantities based on risk management
 *
 * @param {number} amount - Account Size
 * @param {number} entry1 - Entry Price 1
 * @param {number} takeProfit - Take Profit Price
 * @param {number} stopLoss - Stop Loss Price
 * @param {number} leverage - Leverage (informational only)
 * @param {number} entry2 - Entry Price 2
 * @param {number} entry3 - Entry Price 3
 * @param {number} stepSize - Symbol stepSize for precision
 * @param {number} minQty - Symbol minimum quantity
 * @returns {Object} { qty1, qty2, qty3 }
 */
function calculateTCLQuantities(
  amount,
  entry1,
  takeProfit,
  stopLoss,
  leverage,
  entry2,
  entry3,
  stepSize,
  minQty
) {
  // Input validation
  const errors = [];
  if (!amount || amount <= 0) errors.push("amount must be positive");
  if (!entry1 || entry1 <= 0) errors.push("entry1 must be positive");
  if (!stopLoss || stopLoss <= 0) errors.push("stopLoss must be positive");
  if (!entry2 || entry2 <= 0) errors.push("entry2 must be positive");
  if (!entry3 || entry3 <= 0) errors.push("entry3 must be positive");
  if (!stepSize || stepSize <= 0) errors.push("stepSize must be positive");
  if (!minQty || minQty <= 0) errors.push("minQty must be positive");

  if (errors.length > 0) {
    throw new Error("Calculation validation failed: " + errors.join(", "));
  }

  const RISK_PERCENTAGE = 0.1; // 10% risk per trade

  const WEIGHTS = {
    ENTRY: 1,
    LIMIT1: 3,
    LIMIT2: 5,
  };

  const totalRiskAmount = amount * RISK_PERCENTAGE;

  // Calculate risk per unit for each entry level
  const riskPerUnitEntry = Math.abs(entry1 - stopLoss);
  const riskPerUnitLimit1 = Math.abs(entry2 - stopLoss);
  const riskPerUnitLimit2 = Math.abs(entry3 - stopLoss);

  const totalWeightedRisk =
    WEIGHTS.ENTRY * riskPerUnitEntry +
    WEIGHTS.LIMIT1 * riskPerUnitLimit1 +
    WEIGHTS.LIMIT2 * riskPerUnitLimit2;

  if (totalWeightedRisk === 0) {
    return { qty1: 0, qty2: 0, qty3: 0 };
  }

  const baseQty = totalRiskAmount / totalWeightedRisk;

  // Calculate raw quantities
  let qty1 = baseQty;
  let qty2 = baseQty * WEIGHTS.LIMIT1;
  let qty3 = baseQty * WEIGHTS.LIMIT2;

  debug(`Raw quantities - Q1: ${qty1}, Q2: ${qty2}, Q3: ${qty3}`);

  // Apply Binance precision rules
  qty1 = roundToStep(qty1, stepSize);
  qty2 = roundToStep(qty2, stepSize);
  qty3 = roundToStep(qty3, stepSize);

  // Enforce minimum quantity
  qty1 = qty1 >= minQty ? qty1 : minQty;
  qty2 = qty2 >= minQty ? qty2 : minQty;
  qty3 = qty3 >= minQty ? qty3 : minQty;

  return { qty1, qty2, qty3 };
}

/**
 * Fetch symbol precision (step size and min quantity) from Binance
 */
async function getStepSizeAndMinQty(symbol) {
  if (!symbol || typeof symbol !== "string") {
    throw new Error("Symbol is required");
  }

  try {
    const info = await client.futuresExchangeInfo();
   


    const symbolInfo = info.symbols.find((s) => s.symbol === symbol);

    if (!symbolInfo) {
      throw new Error(`Symbol not found: ${symbol}`);
    }

    const lotSizeFilter = symbolInfo.filters.find(
      (f) => f.filterType === "LOT_SIZE"
    );

    if (!lotSizeFilter) {
      throw new Error(`LOT_SIZE filter not found for ${symbol}`);
    }

    return {
      stepSize: Number(lotSizeFilter.stepSize),
      minQty: Number(lotSizeFilter.minQty),
      tickSize: Number(symbolInfo.filters.find(f => f.filterType === "PRICE_FILTER").tickSize)
    };
  } catch (err) {
    error(`Failed to get symbol info for ${symbol}:`, err.message);
    throw err;
  }
}

export { calculateTCLQuantities, getStepSizeAndMinQty };
