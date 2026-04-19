/**
 * Order Event Service - Listens to Binance futures websocket for order updates
 */

import client from "./binanceClient.js";
import { log, error, debug } from "../utils/logger.js";

/**
 * Start listening to Binance futures user data stream for order fills
 * @param {Function} onOrderFilled - Callback when an order fills (receives { orderId, status, ... })
 * @returns {Function} - Cleanup function to stop listening
 */
async function startOrderEventListener(onOrderFilled) {
  try {
    if (typeof onOrderFilled !== 'function') {
      throw new Error('onOrderFilled callback must be a function');
    }

    if (!client || !client.ws) {
      throw new Error('Binance client is not initialized');
    }

    log('[WS] Initializing Futures user data stream...');

    // IMPORTANT: futuresUser returns a Promise. You must await it to 
    // ensure the listenKey is fetched and the socket starts connecting.
    const cleanup = await client.ws.futuresUser((event) => {
      try {
        if (!event) return;

        // Fallback to raw field names (e, o, i, etc.) if the library hasn't mapped them
        const eventType = event.eventType || event.e;

        if (process.env.DEBUG === 'true') {
          debug(`[WS] Event received: ${eventType}`);
        }

        // Listen for ORDER_TRADE_UPDATE events
        if (eventType === 'ORDER_TRADE_UPDATE') {
          const o = event.order || event.o;
          if (!o) return;

          const orderUpdate = {
            orderId: o.orderId || o.i,
            status: o.orderStatus || o.X,
            symbol: o.symbol || o.s,
            side: o.side || o.S,
            quantity: parseFloat(o.quantity || o.q),
            executedQty: parseFloat(o.orderFilledAccumulatedQuantity || o.z || 0),
            price: parseFloat(o.price || o.p),
            eventTime: event.eventTime || event.E,
          };

          log(`[WS] Order Update: ${orderUpdate.symbol} status is ${orderUpdate.status} (Filled: ${orderUpdate.executedQty})`);
          onOrderFilled(orderUpdate);
        }
      } catch (err) {
        error('[WS] Error processing event:', err.message);
      }
    });

    log('[WS] ✅ Futures user stream connection established\n');

    // Return cleanup function
    return cleanup;
  } catch (err) {
    error('Failed to start order event listener:', err.message);
    throw err;
  }
}

export default startOrderEventListener;
