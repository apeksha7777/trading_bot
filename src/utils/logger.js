import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, "../../logs");
const logFile = path.join(logsDir, "bot.log");

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Clear log on every app start
try {
  fs.writeFileSync(logFile, "");
} catch (err) {
  console.warn("Could not clear log file:", err.message);
}

/**
 * Format log messages with timestamp and level
 */
function format(args, level = "INFO") {
  const timestamp = new Date().toISOString();
  const message = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
    .join(" ");
  return `[${timestamp}] [${level}] ${message}`;
}

/**
 * Write to log file and console
 */
function writeLog(message) {
  try {
    fs.appendFileSync(logFile, message + "\n");
  } catch (err) {
    console.error("Failed to write to log file:", err.message);
  }
  console.log(message);
}

function log(...args) {
  const message = format(args, "INFO");
  writeLog(message);
}

function error(...args) {
  const message = format(args, "ERROR");
  writeLog(message);
}

function warn(...args) {
  const message = format(args, "WARN");
  writeLog(message);
}

function debug(...args) {
  if ((process.env.LOG_LEVEL || "info") === "debug") {
    const message = format(args, "DEBUG");
    writeLog(message);
  }
}

export { log, error, warn, debug };
