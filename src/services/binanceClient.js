import BinanceAPI from "binance-api-node";
import config from "../../config/environment.js";
import { error } from "../utils/logger.js";

const Binance = BinanceAPI.default;

let client;

try {
  client = Binance({
    apiKey: config.binance.apiKey,
    apiSecret: config.binance.apiSecret,
    testnet: config.binance.testnet,
  });
} catch (err) {
  error("Failed to initialize Binance client:", err.message);
  process.exit(1);
}


export default client;
