/**
 * Logger utility for consistent output formatting
 */

function log(message) {
  console.log(`[${new Date().toISOString()}] [INFO] ${message}`);
}

function error(message, details = '') {
  console.error(`[${new Date().toISOString()}] [ERROR] ${message}`, details);
}

function debug(message) {
  if (process.env.DEBUG === 'true') {
    console.log(`[${new Date().toISOString()}] [DEBUG] ${message}`);
  }
}

function warn(message) {
  console.warn(`[${new Date().toISOString()}] [WARN] ${message}`);
}

export { log, error, debug, warn };
