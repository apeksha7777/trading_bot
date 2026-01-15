import client from "./binanceClient.js";
import { log, error, debug } from "../utils/logger.js";

/**
 * Start polling Binance for mark price updates
 * @param {string} symbol - Trading pair symbol
 * @param {Function} onPrice - Callback function for price updates
 * @returns {NodeJS.Timer} - Interval ID for cleanup
 */
function startPriceFeed(symbol, onPrice) {
  if (!symbol || typeof symbol !== "string") {
    throw new Error("Symbol is required and must be a string");
  }

  if (typeof onPrice !== "function") {
    throw new Error("onPrice callback must be a function");
  }

  let lastPrice = null;
  let errorCount = 0;
  const MAX_ERRORS = 5;

  const interval = setInterval(async () => {
    try {
      const data = await client.futuresMarkPrice({
        symbol: symbol.toUpperCase(),
      });

      const currentPrice = Number(data.markPrice);

      if (isNaN(currentPrice)) {
        throw new Error(`Invalid price received: ${data.markPrice}`);
      }

      // Log price every interval
      console.log(`[${new Date().toISOString()}] ${symbol} LTP: ${currentPrice}`);

      if (currentPrice !== lastPrice) {
        lastPrice = currentPrice;
        debug(`Price update: ${symbol} = ${currentPrice}`);
        onPrice(currentPrice);
      }

      // Reset error count on successful fetch
      errorCount = 0;
    } catch (err) {
      errorCount++;
      error(`[PRICE_FEED] Error fetching price for ${symbol}:`, err.message);

      if (errorCount >= MAX_ERRORS) {
        error(`[PRICE_FEED] Too many errors (${MAX_ERRORS}), stopping feed`);
        clearInterval(interval);
        process.exit(1);
      }
    }
  }, 1000); // Poll every 1 second

  log(`✅ Price feed started for ${symbol}`);
  return interval;
}

export default startPriceFeed;
