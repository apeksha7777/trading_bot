import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(__dirname, '../../logs');
const logFile = path.join(logDir, 'bot.log');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Create a write stream with the 'w' flag. 
 * This ensures the log file is refreshed (cleared) on every program start.
 */
const logStream = fs.createWriteStream(logFile, { flags: 'w' });

/**
 * Internal helper to format arguments and write them to the log file.
 */
const writeToFile = (level, args) => {
  const timestamp = new Date().toISOString();
  const message = util.format(...args);
  logStream.write(`[${timestamp}] [${level}] ${message}\n`);
};

// Store references to original console methods
const originalLog = console.log;
const originalError = console.error;
const originalDebug = console.debug;

/**
 * Override global console methods.
 * This ensures that even raw console.log() calls from anywhere in the app 
 * are captured in the bot.log file.
 */
console.log = (...args) => {
  originalLog(...args);
  writeToFile('INFO', args);
};

console.error = (...args) => {
  originalError(...args);
  writeToFile('ERROR', args);
};

console.debug = (...args) => {
  // Show in console only if DEBUG env is enabled, but always record to the log file.
  if (process.env.DEBUG === 'true') {
    originalDebug(...args);
  }
  writeToFile('DEBUG', args);
};

/**
 * Export the methods as required by the application's named imports.
 * These methods now effectively pipe data to both the console and the log file.
 */
export const log = console.log;
export const error = console.error;
export const debug = console.debug;