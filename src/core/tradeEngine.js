/**
 * Trade Engine - Manages order placement and cascade logic
 */

import client from "../services/binanceClient.js";
import startOrderEventListener from "../services/orderEventService.js";
import { log, error, debug } from "../utils/logger.js";

/**
 * Creates a trade engine that places and manages orders
 */
function createTradeEngine(config, quantities, stepSize, minQty, tickSize, onEntry1Filled, onEntry2Filled, onEntry3Filled, onTradeCompleted) {
  const { symbol, side, entry1, entry2, entry3, takeProfit, stopLoss } = config;
  let { qty1, qty2, qty3 } = quantities;

  console.log(tickSize,stepSize,'tick and step');
  // Calculate decimal precision from tickSize (e.g., 0.01 -> 2)
  const qtyPrecision = Math.max(0, Math.round(-Math.log10(stepSize)));
  const pricePrecision = Math.max(0, Math.round(-Math.log10(tickSize)));

  // Apply precision to quantities
  qty1 = applyPrecision(qty1, stepSize, minQty);
  qty2 = applyPrecision(qty2, stepSize, minQty);
  qty3 = applyPrecision(qty3, stepSize, minQty);

  log(`\n--- Applying Precision ---`);
  log(`Step Size: ${stepSize}`);
  log(`Min Qty: ${minQty}`);
  log(`Entry 1 (after precision): ${qty1}`);
  log(`Entry 2 (after precision): ${qty2}`);
  log(`Entry 3 (after precision): ${qty3}\n`);

  /**
   * Apply step size precision - round down to nearest step size
   */
  function applyPrecision(quantity, step, minimum) {
    const precision = Math.max(0, Math.round(-Math.log10(step)));
    // Add a tiny epsilon to handle floating point precision errors during division
    let rounded = Math.floor((quantity + 0.0000000001) / step) * step;
    if (rounded < minimum) {
      rounded = minimum;
    }
    return parseFloat(rounded.toFixed(precision));
  }

  /**
   * Format price to appropriate decimal places
   */
  function formatPrice(price) {
    return price.toFixed(pricePrecision);
  }

  let state = {
    entry1OrderId: null,
    entry1Filled: false,
    entry2Filled: false, // New state variable to track Entry 2 fill status
    entry3Filled: false,
    entry2OrderId: null,
    entry3OrderId: null,
    takeProfitOrderId: null,
    stopLossOrderId: null,
    stopLossIsAlgo: false,
  };

  let eventListenerCleanup = null;
  let pollingTimer = null;

  /**
   * Cancel all known active orders and stop the bot
   */
  async function cleanupAndExit() {
    log('\n🧹 Cleaning up: Cancelling all pending orders...');
    const ordersToCancel = [
      { id: state.entry1OrderId, tag: 'Entry 1', isAlgo: false },
      { id: state.entry2OrderId, tag: 'Entry 2', isAlgo: false },
      { id: state.entry3OrderId, tag: 'Entry 3', isAlgo: false },
      { id: state.takeProfitOrderId, tag: 'Take Profit', isAlgo: false },
      { id: state.stopLossOrderId, tag: 'Stop Loss', isAlgo: state.stopLossIsAlgo }
    ];

    for (const order of ordersToCancel) {
      if (order.id) {
        try {
          await cancelOrder(order.id, order.tag, order.isAlgo);
        } catch (err) {
          // Silence errors if order is already filled/cancelled
          debug(`Cleanup: Could not cancel ${order.tag}: ${err.message}`);
        }
      }
    }
    
    try {
    // Check for open positions on the symbol
    const positions = await client.futuresPositionRisk({ symbol: config.symbol });
    const position = positions.find(p => p.symbol === config.symbol);

    if (position && Math.abs(parseFloat(position.positionAmt)) > 0) {
      log(`📊 Open position found: ${position.positionAmt} ${config.symbol}. Closing...`);

      // Determine close side (opposite of position)
      const closeSide = parseFloat(position.positionAmt) > 0 ? 'SELL' : 'BUY';
      const closeQty = Math.abs(parseFloat(position.positionAmt));

      // Place market order to close position
      await client.futuresOrder({
        symbol: config.symbol,
        side: closeSide,
        type: 'MARKET',
        quantity: closeQty.toString(),
        reduceOnly: true, // Ensures only closes existing position
      });

      log(`✅ Position closed: ${closeSide} ${closeQty} ${config.symbol}`);
    } else {
      log('✅ No open positions found.');
    }
  } catch (err) {
    error('Failed to check/close positions:', err.message);
  }
    if (typeof onTradeCompleted === 'function') {
      onTradeCompleted();
    }
  }

  /**
   * Handle order fill events from websocket
   */
  function handleOrderUpdate(orderUpdate) {
    const { orderId, status, symbol: orderSymbol, executedQty, quantity } = orderUpdate;

    // Check if this is Entry 1 order
    // Use string coercion for ID comparison as types can vary between REST and WS
    if (String(orderId) === String(state.entry1OrderId)) {
      debug(`[Engine] Match found for Entry 1. Status: ${status}`);

      // Check if Entry 1 is fully filled
      if (status === 'FILLED') {
        state.entry1Filled = true;
        log(`\n🎯 ENTRY 1 FULLY FILLED! (${executedQty} units)\n`);

        // Call the callback to notify app that Entry 1 is filled
        if (typeof onEntry1Filled === 'function') {
          onEntry1Filled(orderUpdate);
        }
      }
    }
    // Check if this is Entry 2 order
    else if (String(orderId) === String(state.entry2OrderId)) {
      debug(`[Engine] Match found for Entry 2. Status: ${status}`);

      // Check if Entry 2 is fully filled
      if (status === 'FILLED') {
        state.entry2Filled = true;
        log(`\n🎯 ENTRY 2 FULLY FILLED! (${executedQty} units)\n`);

        // Call the callback to notify app that Entry 2 is filled
        if (typeof onEntry2Filled === 'function') {
          onEntry2Filled(orderUpdate);
        }
      }
    }
    // Check if this is Entry 3 order
    else if (String(orderId) === String(state.entry3OrderId)) {
      debug(`[Engine] Match found for Entry 3. Status: ${status}`);

      if (status === 'FILLED') {
        state.entry3Filled = true;
        log(`\n🎯 ENTRY 3 FULLY FILLED! (${executedQty} units)\n`);

        if (typeof onEntry3Filled === 'function') {
          onEntry3Filled(orderUpdate);
        }
      }
    }
    // Check for Take Profit
    else if (String(orderId) === String(state.takeProfitOrderId)) {
      if (status === 'FILLED') {
        log('💰 TAKE PROFIT FILLED - Trade successful!');
        cleanupAndExit();
      }
    }
    // Check for Stop Loss
    else if (String(orderId) === String(state.stopLossOrderId)) {
      if (status === 'FILLED') {
        log('📉 STOP LOSS FILLED - Risk managed.');
        cleanupAndExit();
      }
    }
  }

  /**
   * Polling fallback - manually check order status if WS fails
   */
  async function startPolling() {
    if (pollingTimer) return;

    log('[Engine] Starting polling safety net...');
    pollingTimer = setInterval(async () => {
      // Identify all entry orders that are active but not yet filled
      const monitoredOrders = [
        { id: state.entry1OrderId, filled: state.entry1Filled, tag: 'Entry 1', isAlgo: false },
        { id: state.entry2OrderId, filled: state.entry2Filled, tag: 'Entry 2', isAlgo: false },
        { id: state.entry3OrderId, filled: state.entry3Filled, tag: 'Entry 3', isAlgo: false },
        { id: state.takeProfitOrderId, tag: 'Take Profit', isAlgo: false },
        { id: state.stopLossOrderId, tag: 'Stop Loss', isAlgo: state.stopLossIsAlgo }
      ].filter(order => order.id && !order.filled);

      if (monitoredOrders.length === 0) return;

      for (const target of monitoredOrders) {
        try {
          if (target.isAlgo) {
            // For simplicity, skip polling algo orders to avoid 'Order does not exist' API errors
            // as futuresGetOrder doesn't support them and futuresGetOpenAlgoOrders handles it differently.
            continue;
          }

          const order = await client.futuresGetOrder({
            symbol,
            orderId: target.id
          });

          if (order.status === 'FILLED') {
            debug(`[Polling] ${target.tag} fill detected via REST API`);
            handleOrderUpdate({
              orderId: order.orderId,
              status: order.status,
              symbol: order.symbol,
              executedQty: parseFloat(order.executedQty),
              price: parseFloat(order.avgPrice || order.price),
              quantity: parseFloat(order.origQty),
              eventTime: order.updateTime
            });
          }
        } catch (err) {
          error(`[Polling] Error fetching ${target.tag} status:`, err.message);
        }
      }
    }, 5000); // Check every 5 seconds
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
      debug('[Engine] Polling stopped');
      }
  }

  /**
   * Place a limit order on Binance Futures
   */
  async function placeLimitOrder(quantity, price, tag) {
    try {
     
      const formattedQty = quantity.toFixed(qtyPrecision);
      
      const formattedPrice = formatPrice(price);
       console.log(quantity, price,formattedPrice,'placeeee');
      
      log(`📤 Placing ${tag} order: ${side} ${formattedQty} ${symbol} @ ${formattedPrice}`);

      const order = await client.futuresOrder({
        symbol,
        side: side === 'LONG' ? 'BUY' : 'SELL',
        type: 'LIMIT',
        quantity: formattedQty,
        price: formattedPrice,
        timeInForce: 'GTC', // Good Till Cancelled
      });

      log(`✅ ${tag} order placed - ID: ${order.orderId}`);
      return order;
    } catch (err) {
      error(`Failed to place ${tag} order:`, err.message);
      throw err;
    }
  }

  /**
   * Place Entry 1 limit order at entry1 price
   */
  async function placeEntry1() {
    try {
      log('\n--- Placing Entry 1 Order ---');
      const order = await placeLimitOrder(qty1, entry1, 'Entry1');
      state.entry1OrderId = order.orderId;
      
      // Start polling as a safety net
      startPolling();
      
      log(`Entry 1 order active. Order ID: ${state.entry1OrderId}\n`);
      return order;
    } catch (err) {
      error('Failed to place Entry 1:', err.message);
      throw err;
    }
  }

  /**
   * Place Entry 2 limit order
   */
  async function placeEntry2() {
    try {
      const order = await placeLimitOrder(qty2, entry2, 'Entry2');
      state.entry2OrderId = order.orderId;
      startPolling(); // Ensure polling monitors Entry 2
      return order;
    } catch (err) {
      error('Failed to place Entry 2:', err.message);
      throw err;
    }
  }

  /**
   * Place Entry 3 limit order
   */
  async function placeEntry3() {
    try {
      const order = await placeLimitOrder(qty3, entry3, 'Entry3');
      state.entry3OrderId = order.orderId;
      startPolling(); // Ensure polling monitors Entry 3
      return order;
    } catch (err) {
      error('Failed to place Entry 3:', err.message);
      throw err;
    }
  }

  /**
   * Cancel an active order
   */
  async function cancelOrder(orderId, tag = 'Order', isAlgo = false) {
    try {
      log(`🚫 Cancelling ${tag} (ID: ${orderId})...`);
      if (isAlgo) {
        await client.futuresCancelAlgoOrder({ symbol, algoId: orderId });
      } else {
        await client.futuresCancelOrder({ symbol, orderId });
      }
      log(`✅ ${tag} cancelled.`);
    } catch (err) {
      // Don't throw if order already filled or cancelled
      debug(`Cancel ${tag} failed (might be already filled): ${err.message}`);
    }
  }

  /**
   * Place a Take Profit limit order for the current position
   * @param {number} quantity - The quantity to close
   * @param {number} price - Optional price, defaults to config takeProfit
   */
  async function placeTakeProfit(quantity, price) {
    try {
      const tpSide = side === 'LONG' ? 'SELL' : 'BUY';
      const formattedQty = quantity.toFixed(qtyPrecision);
      const targetPrice = price || takeProfit;
      const formattedPrice = formatPrice(targetPrice);

      log(`📤 Placing Take Profit order: ${tpSide} ${formattedQty} ${symbol} @ ${formattedPrice}`);

      const order = await client.futuresOrder({
        symbol,
        side: tpSide,
        type: 'LIMIT',
        quantity: formattedQty,
        price: formattedPrice,
        timeInForce: 'GTC',
        reduceOnly: true, // Ensures this only closes existing position
      });

      log(`✅ Take Profit order placed - ID: ${order.orderId}`);
      state.takeProfitOrderId = order.orderId;
      return order;
    } catch (err) {
      error('Failed to place Take Profit order:', err.message);
      throw err;
    }
  }

  /**
   * Place a Stop Loss market order for the current position
   * @param {number} quantity - The quantity to close
   */
  async function placeStopLoss(quantity) {
    try {
      const slSide = side === 'LONG' ? 'SELL' : 'BUY';
      const formattedQty = quantity.toFixed(qtyPrecision);
      const formattedPrice = formatPrice(stopLoss);

      log(`📤 Placing Stop Loss order: ${slSide} ${formattedQty} ${symbol} @ ${formattedPrice}`);

      const order = await client.futuresOrder({
        symbol,
        side: slSide,
        type: 'STOP_MARKET',
        stopPrice: formattedPrice,
        quantity: formattedQty,
        reduceOnly: true,
      });

      const id = order.orderId || order.algoId;
      log(`✅ Stop Loss order placed - ID: ${id}`);
      state.stopLossOrderId = id;
      state.stopLossIsAlgo = !!order.algoId;
      return order;
    } catch (err) {
      error('Failed to place Stop Loss order:', err.message);
      throw err;
    }
  }

  /**
   * Initialize trade engine - start listener and place first order
   */
  async function initialize() {
    try {
      log('\n═══════════════════════════════════════');
      log('    Initializing Trade Engine');
      log('═══════════════════════════════════════\n');

      // Check connectivity and API keys
      log('Verifying Binance connectivity...');
      const serverTime = await client.time();
      log(`✅ Connected to Binance (Server Time: ${new Date(serverTime).toLocaleTimeString()})`);

      // Set leverage
      await client.futuresLeverage({
        symbol,
        leverage: config.leverage,
      });
      log(`✅ Leverage set to ${config.leverage}x\n`);

      // Start order event listener BEFORE placing orders
      log('Starting order event listener...');
      eventListenerCleanup = await startOrderEventListener(handleOrderUpdate);

      // Place Entry 1 order
      await placeEntry1();

      log('═══════════════════════════════════════');
      log('✅ Trade Engine Ready - Waiting for Entry 1 fill');
      log('═══════════════════════════════════════\n');

    } catch (err) {
      error('Trade engine initialization failed:', err.message);
      throw err;
    }
  }

  /**
   * Cleanup - stop listening to events
   */
  function stop() {
    if (eventListenerCleanup) {
      eventListenerCleanup();
      log('\n[WS] Order event listener stopped');
    }
    stopPolling();
  }

  /**
   * Get current state
   */
  function getState() {
    return { ...state };
  }

  return {
    initialize,
    stop,
    getState,
    placeEntry2,
    placeEntry3,
    placeTakeProfit,
    placeStopLoss,
    cancelOrder,
    state,
    qty1,
    qty2,
    qty3,
  };
}


export default createTradeEngine;
