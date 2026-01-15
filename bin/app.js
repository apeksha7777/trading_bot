#!/usr/bin/env node

/**
 * CLI Entry Point
 * Launches the trading bot application
 */

import { start } from "../src/app.js";

start().catch((err) => {
  console.error("Failed to start application:", err);
  process.exit(1);
});
