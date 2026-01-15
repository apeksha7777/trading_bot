# Trading Bot

A professional-grade cryptocurrency trading bot for Binance Futures with automated position sizing and risk management.

## Features

- **Automated Position Sizing**: Three-level entry strategy (Entry 1, 2, 3)
- **Risk Management**: Stop Loss and Take Profit automation
- **Leverage Support**: Configurable leverage for futures trading
- **Real-time Price Monitoring**: Continuous price feed from Binance
- **Order Deduplication**: Prevents accidental duplicate orders
- **Comprehensive Logging**: Detailed logs for monitoring and debugging
- **Production Ready**: Proper error handling, validation, and graceful shutdown

## Project Structure

```
trading-bot/
├── bin/
│   └── app.js                 # Application entry point
├── config/
│   └── environment.js         # Environment configuration
├── src/
│   ├── core/
│   │   └── tradeEngine.js     # Trading logic and price handling
│   ├── services/
│   │   ├── binanceClient.js   # Binance API client
│   │   ├── orderService.js    # Order execution
│   │   └── priceFeedService.js # Price monitoring
│   ├── utils/
│   │   ├── logger.js          # Logging utility
│   │   └── qtyCalculator.js   # Position size calculations
│   └── validators/
│       └── inputValidator.js  # Input validation
├── logs/                      # Application logs
├── config.js                  # Legacy config (use config/environment.js)
└── package.json               # Project dependencies
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd trading-bot
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` with your Binance API credentials:
```env
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
TESTNET=true  # Use testnet for testing
NODE_ENV=production
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
NODE_ENV=production node bin/app.js
```

## Configuration

Edit trading parameters in `bin/app.js`:

```javascript
const inputs = {
  amount: 100,              // Account size in USDT
  entry1: 144.22,          // First entry price
  entry2: 143.91,          // Second entry price
  entry3: 143.64,          // Third entry price
  takeProfit: 145.07,      // Take profit level
  stopLoss: 143.35,        // Stop loss level
  leverage: 15,            // Trading leverage
  side: "LONG",            // LONG or SHORT
  symbol: "SOLUSDT",       // Trading pair
};
```

## API Dependencies

- **binance-api-node**: Binance API client
- **dotenv**: Environment variable management

## Development Dependencies

- **nodemon**: Auto-reload on file changes

## Error Handling

The bot includes comprehensive error handling:
- Configuration validation on startup
- Input parameter validation
- Order placement error handling
- Price feed error recovery with automatic shutdown after max errors
- Graceful shutdown on SIGINT/SIGTERM

## Logging

Logs are written to both console and `logs/bot.log`:
- **INFO**: General information and trading events
- **WARN**: Warnings (e.g., bot already running)
- **ERROR**: Error messages
- **DEBUG**: Detailed debug information (requires `LOG_LEVEL=debug`)

## Safety Features

- **Order Deduplication**: Prevents duplicate orders within cooldown period
- **Position Validation**: Ensures valid quantities before placing orders
- **Price Validation**: Verifies price data integrity
- **Max Error Recovery**: Stops price feed after maximum consecutive errors
- **Graceful Shutdown**: Properly closes connections on interruption

## Testing

To test on Binance Testnet:
1. Set `TESTNET=true` in `.env`
2. Create a testnet account at https://testnet.binance.vision
3. Generate API keys on testnet
4. Add credentials to `.env`

## License

ISC

## Support

For issues or questions, please create an issue in the repository.
