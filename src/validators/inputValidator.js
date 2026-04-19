/**
 * Input Validator - Validates trading configuration
 */

import { error, log } from "../utils/logger.js";

/**
 * Validate trading configuration before execution
 */
function validateInputs(config) {
  try {
    const required = ['symbol', 'amount', 'entry1', 'entry2', 'entry3', 'takeProfit', 'stopLoss', 'leverage', 'side'];
    
    for (const field of required) {
      if (config[field] === undefined || config[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate numbers
    if (config.amount <= 0) throw new Error('amount must be > 0');
    if (config.leverage <= 0) throw new Error('leverage must be > 0');
    
    // Validate entry prices
    if (config.entry1 <= 0 || config.entry2 <= 0 || config.entry3 <= 0) {
      throw new Error('Entry prices must be > 0');
    }

    // Validate side
    if (!['LONG', 'SHORT'].includes(config.side)) {
      throw new Error('side must be LONG or SHORT');
    }

    // For LONG: entry1 > entry2 > entry3 < takeProfit, entry1 > stopLoss
    if (config.side === 'LONG') {
      if (!(config.entry1 > config.entry2 && config.entry2 > config.entry3)) {
        throw new Error('For LONG: entry1 > entry2 > entry3');
      }
      if (!(config.takeProfit > config.entry1)) {
        throw new Error('For LONG: takeProfit > entry1');
      }
      if (!(config.entry1 > config.stopLoss)) {
        throw new Error('For LONG: entry1 > stopLoss');
      }
    } else if (config.side === 'SHORT') {
      if (!(config.entry1 < config.entry2 && config.entry2 < config.entry3)) {
        throw new Error('For SHORT: entry1 < entry2 < entry3');
      }
      if (!(config.takeProfit < config.entry1)) {
        throw new Error('For SHORT: takeProfit < entry1');
      }
      if (!(config.entry1 < config.stopLoss)) {
        throw new Error('For SHORT: entry1 < stopLoss');
      }
    }

    log('✅ Input validation passed');
    return true;
  } catch (err) {
    error('❌ Input validation failed:', err.message);
    throw err;
  }
}

export { validateInputs };
