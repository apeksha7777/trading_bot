/**
 * Main Trading Bot Entry Point
 * Loads config, validates, calculates quantities, logs them
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, error, debug } from './utils/logger.js';
import { calculateTCLQuantities, getStepSizeAndMinQty } from './utils/qtyCalculator.js';
import { validateInputs } from './validators/inputValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../trading-config.json');
const isCheckMode = process.argv.includes('--check');

let engine = null;
let config = null;

/**
 * Load and parse trading configuration from JSON file
 */
function loadConfig() {
  try {
    log('Loading trading configuration...');
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);
    log(`✅ Config loaded from ${configPath}`);
    return config;
  } catch (err) {
    error('Failed to load trading-config.json:', err.message);
    process.exit(1);
  }
}

/**
 * Callback when Entry 1 order is fully filled
 */
async function onEntry1Filled(orderUpdate) {
  log('\n╔═══════════════════════════════════════╗');
  log('║  🎉 ENTRY 1 FILLED - READY TO SCALE   ║');
  log('╚═══════════════════════════════════════╝\n');
  log(`Entry Price: ${orderUpdate.price}`);
  log(`Filled Quantity: ${orderUpdate.executedQty}`);
  log(`Time: ${new Date(orderUpdate.eventTime).toISOString()}\n`);

  try {
    // 1. Place Entry 2 limit order
    await engine.placeEntry2();

    // 2. Place Take Profit for the quantity filled in Entry 1
    await engine.placeTakeProfit(orderUpdate.executedQty);
  } catch (err) {
    error('Failed to execute follow-up strategy:', err.message);
  }
}

/**
 * Callback when Entry 2 order is fully filled
 */
async function onEntry2Filled(orderUpdate) {
  log('\n╔═══════════════════════════════════════╗');
  log('║  🚀 ENTRY 2 FILLED - SCALING UP       ║');
  log('╚═══════════════════════════════════════╝\n');
  log(`Fill Price: ${orderUpdate.price}`);
  log(`Filled Quantity: ${orderUpdate.executedQty}`);

  try {
    // 1. Place Entry 3 limit order
    await engine.placeEntry3();

    // 2. Update Take Profit: Cancel old TP and place new one for total qty
    const state = engine.getState();
    if (state.takeProfitOrderId) {
      await engine.cancelOrder(state.takeProfitOrderId, 'Old TP');
    }
    
    // Change take profit to entry 1 with qty as position qty
    const totalQty = engine.qty1 + engine.qty2;
    await engine.placeTakeProfit(totalQty, config.entry1);
  } catch (err) {
    error('Failed to execute Entry 2 follow-up:', err.message);
  }
}

/**
 * Callback when Entry 3 order is fully filled
 */
async function onEntry3Filled(orderUpdate) {
  log('\n╔═══════════════════════════════════════╗');
  log('║  🔥 ENTRY 3 FILLED - MAX POSITION     ║');
  log('╚═══════════════════════════════════════╝\n');
  log(`Fill Price: ${orderUpdate.price}`);
  log(`Filled Quantity: ${orderUpdate.executedQty}`);

  try {
    // 1. Update Take Profit: Cancel old TP and place new one at Entry 2 for total qty
    const state = engine.getState();
    if (state.takeProfitOrderId) {
      await engine.cancelOrder(state.takeProfitOrderId, 'Old TP');
    }
    
    const totalQty = engine.qty1 + engine.qty2 + engine.qty3;
    await engine.placeTakeProfit(totalQty, config.entry2);

    // 2. Place stop loss at stop loss price for pos qty
    await engine.placeStopLoss(totalQty);
  } catch (err) {
    error('Failed to execute Entry 3 follow-up:', err.message);
  }
}

/**
 * Callback when trade is finished (TP or SL filled)
 */
async function onTradeCompleted() {
  log('\n🏁 Trade cycle completed. Checking for open positions...');
  log('Shutting down bot...');
  if (engine) engine.stop();
  process.exit(0);
}

/**
 * Main execution
 */
async function main() {
  try {
    log('═════════════════════════════════════════');
    log('    Trading Bot - Configuration Setup');
    log('═════════════════════════════════════════');

    // Load configuration
    config = loadConfig();

    // Validate inputs
    validateInputs(config);

    // Display configuration
    log('\n--- Configuration Loaded ---');
    log(`Symbol: ${config.symbol}`);
    log(`Side: ${config.side}`);
    log(`Amount: ${config.amount} USDT`);
    log(`Leverage: ${config.leverage}x`);
    log(`Entry 1: ${config.entry1}`);
    log(`Entry 2: ${config.entry2}`);
    log(`Entry 3: ${config.entry3}`);
    log(`Take Profit: ${config.takeProfit}`);
    log(`Stop Loss: ${config.stopLoss}`);

    // Get symbol precision from Binance
    log('\nFetching symbol precision from Binance...');
    const { stepSize, minQty, tickSize } = await getStepSizeAndMinQty(config.symbol);
    console.log(stepSize, minQty, tickSize,'step min and tick');


   

    // Calculate quantities
    log('\nCalculating order quantities...');
    const quantities = calculateTCLQuantities(
      config.amount,
      config.entry1,
      config.takeProfit,
      config.stopLoss,
      config.leverage,
      config.entry2,
      config.entry3,
      stepSize,
      minQty
    );

    // Display results
    log('\n───────────────────────────────────────');
    log('✅ CALCULATED QUANTITIES');
    log('───────────────────────────────────────');
    log(`Entry 1 Quantity: ${quantities.qty1}`);
    log(`Entry 2 Quantity: ${quantities.qty2}`);
    log(`Entry 3 Quantity: ${quantities.qty3}`);
    log(`Total Position: ${quantities.qty1 + quantities.qty2 + quantities.qty3}`);
    log('───────────────────────────────────────\n');

    const qtyUsed = (config.entry1 * quantities.qty1 + config.entry2 * quantities.qty2 + config.entry3 * quantities.qty3)/config.leverage;
    log(`Total Margin Used: ${qtyUsed.toFixed(2)} USDT`);
    const loss =Math.abs(config.entry1 * quantities.qty1 + config.entry2 * quantities.qty2 + config.entry3 * quantities.qty3) - (config.stopLoss * (quantities.qty1 + quantities.qty2 + quantities.qty3));
    log(`Max Loss if Stop Loss Hit: ${loss.toFixed(2)} USDT`);
    const profit1 = Math.abs(config.entry1 * quantities.qty1 - config.takeProfit * quantities.qty1);
    log(`Profit from Entry 1 if TP Hit: ${profit1.toFixed(2)} USDT`);
    const profit2 = Math.abs((config.entry2 * quantities.qty2 + config.entry1 * quantities.qty1) - config.entry1 *( quantities.qty2 + quantities.qty1));
    log(`Profit from Entry 2 if TP Hit: ${profit2.toFixed(2)} USDT`);
    const profit3 = Math.abs((config.entry3 * quantities.qty3 + config.entry2 * quantities.qty2 + config.entry1 * quantities.qty1) - config.entry2 *( quantities.qty3 + quantities.qty2 + quantities.qty1));
    log(`Profit from Entry 3 if TP Hit: ${profit3.toFixed(2)} USDT`);
     

    if (isCheckMode) {
      log('✅ Check mode active. Exiting after quantity calculation.');
      process.exit(0);
    }

    // Create and initialize trade engine with callback
    const tradeModule = await import('./core/tradeEngine.js');
    const createTradeEngine = tradeModule.default;

    engine = createTradeEngine(
      config, 
      quantities, 
      stepSize, 
      minQty, 
      tickSize, 
      onEntry1Filled, 
      onEntry2Filled, 
      onEntry3Filled,
      onTradeCompleted
    );
    await engine.initialize();

    // Keep the process alive to listen for websocket events
    log('🔌 Listening for order fills... (Press Ctrl+C to exit)\n');
    await new Promise(() => {}); // Never resolves - keeps process alive

  } catch (err) {
    error('Fatal error:', err.message);
    if (engine) engine.stop();
    process.exit(1);
  }
}

main();

/**
 * Graceful shutdown
 */
process.on('SIGINT', () => {
  log('\n\nShutting down gracefully...');
  if (engine) {
    engine.stop();
  }
  process.exit(0);
});
