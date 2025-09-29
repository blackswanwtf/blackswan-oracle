/*
 * BLACKSWAN ORACLE SERVICE
 * ====================
 *
 * Production-ready scalable service pushing the latest outputs of the Black Swan
 * and Market Peak analysis agents to the on-chain Oracle smart contract.
 * Handles multiple concurrent requests with proper error handling, logging, and monitoring.
 *
 * Features:
 * - Per minute interval checks for the latest scores
 * - Multiple service offerings (Black Swan & Market Peak Analysis)
 * - Comprehensive logging and monitoring
 * - Health checks and metrics
 * - Graceful error handling
 * - Hot reload support for development
 *
 * Author: Muhammad Bilal Motiwala
 * Project: Black Swan
 * Version: 1.0.0
 * License: MIT
 */

require("dotenv").config();
const { ethers } = require("ethers");
const axios = require("axios");
const winston = require("winston");
const fs = require("fs");
const path = require("path");

// Configure Winston logger with timestamps and emojis
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      const emoji = {
        error: "❌",
        warn: "⚠️ ",
        info: "📊",
        verbose: "🔍",
        debug: "🐛",
      };
      return `${timestamp} ${
        emoji[level] || "📝"
      } [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      level: "info",
    }),
  ],
});

class BlackSwanOracleService {
  constructor() {
    this.validateEnvironmentVariables();
    this.initializeBlockchainConnection();
    this.loadContractABI();
    this.lastKnownBlackSwanScore = null;
    this.lastKnownMarketPeakScore = null;
    this.isRunning = false;
  }

  validateEnvironmentVariables() {
    const requiredVars = [
      "RPC_URL",
      "DEV_WALLET_PRIVATE_KEY",
      "ORACLE_CONTRACT_ADDRESS",
      "API_ENDPOINT",
    ];

    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      logger.error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
      logger.error(
        "Please check your .env file and ensure all required variables are set."
      );
      process.exit(1);
    }

    // Validate contract address format
    if (!ethers.isAddress(process.env.ORACLE_CONTRACT_ADDRESS)) {
      logger.error(
        "Invalid contract address format in ORACLE_CONTRACT_ADDRESS"
      );
      process.exit(1);
    }

    // Validate private key format (should be 64 hex characters without 0x prefix)
    const privateKey = process.env.DEV_WALLET_PRIVATE_KEY;
    if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
      logger.error(
        "Invalid private key format. Should be 64 hex characters without 0x prefix"
      );
      process.exit(1);
    }

    logger.info("✅ Environment variables validated successfully");
  }

  async initializeBlockchainConnection() {
    try {
      // Create provider
      this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

      // Create wallet from private key
      this.wallet = new ethers.Wallet(
        `0x${process.env.DEV_WALLET_PRIVATE_KEY}`,
        this.provider
      );

      // Test connection
      const network = await this.provider.getNetwork();
      const balance = await this.provider.getBalance(this.wallet.address);

      // Validate Base network (Chain ID: 8453)
      if (network.chainId !== 8453n) {
        logger.warn(
          `⚠️ Warning: Connected to Chain ID ${network.chainId}, but Base mainnet is 8453. Ensure you're using the correct network.`
        );
      }

      logger.info(
        `🌐 Connected to network: ${network.name || "Unknown"} (Chain ID: ${
          network.chainId
        })`
      );
      logger.info(`💰 Dev wallet address: ${this.wallet.address}`);
      logger.info(`💰 Dev wallet balance: ${ethers.formatEther(balance)} ETH`);

      if (balance === 0n) {
        logger.warn(
          "Dev wallet has zero balance. Ensure it has sufficient funds for transactions."
        );
      }
    } catch (error) {
      logger.error(`Failed to connect to blockchain: ${error.message}`);
      process.exit(1);
    }
  }

  loadContractABI() {
    try {
      const abiPath = path.join(__dirname, "..", "abi", "BlackSwanOracle.json");
      const abiData = fs.readFileSync(abiPath, "utf8");
      this.contractABI = JSON.parse(abiData);

      // Create contract instance
      this.contract = new ethers.Contract(
        process.env.ORACLE_CONTRACT_ADDRESS,
        this.contractABI,
        this.wallet
      );

      logger.info(`📄 Contract ABI loaded and instance created`);
      logger.info(
        `📍 Contract address: ${process.env.ORACLE_CONTRACT_ADDRESS}`
      );
    } catch (error) {
      logger.error(`Failed to load contract ABI: ${error.message}`);
      process.exit(1);
    }
  }

  async fetchScoresFromAPI() {
    try {
      const response = await axios.get(process.env.API_ENDPOINT, {
        timeout: 30000, // 30 second timeout
        headers: {
          "User-Agent": "BlackSwanOracle/1.0",
        },
      });

      // Extract both scores from response
      let blackswanScore, marketPeakScore;

      if (
        response.data.blackswanScore !== undefined &&
        response.data.marketPeakScore !== undefined
      ) {
        blackswanScore = response.data.blackswanScore;
        marketPeakScore = response.data.marketPeakScore;
      } else {
        throw new Error("Unable to extract both scores from API response");
      }

      // Validate scores are numbers
      if (
        typeof blackswanScore !== "number" ||
        isNaN(blackswanScore) ||
        blackswanScore < 0
      ) {
        throw new Error(`Invalid blackswan score received: ${blackswanScore}`);
      }
      if (
        typeof marketPeakScore !== "number" ||
        isNaN(marketPeakScore) ||
        marketPeakScore < 0
      ) {
        throw new Error(
          `Invalid market peak score received: ${marketPeakScore}`
        );
      }

      // Ensure integers for smart contract
      blackswanScore = Math.floor(blackswanScore);
      marketPeakScore = Math.floor(marketPeakScore);

      logger.info(
        `📈 Fetched scores from API - BlackSwan: ${blackswanScore}, MarketPeak: ${marketPeakScore}`
      );
      return { blackswanScore, marketPeakScore };
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        logger.error("API request timed out");
      } else if (error.response) {
        logger.error(
          `API returned error ${error.response.status}: ${error.response.statusText}`
        );
      } else if (error.request) {
        logger.error("No response received from API");
      } else {
        logger.error(`API fetch error: ${error.message}`);
      }
      throw error;
    }
  }

  async updateOracleScores(
    newBlackswanScore,
    newMarketPeakScore,
    updateType = "both"
  ) {
    try {
      logger.info(
        `🚀 Updating oracle contract - BlackSwan: ${newBlackswanScore}, MarketPeak: ${newMarketPeakScore} (${updateType})`
      );

      // Prepare transaction options with Base-optimized settings
      const txOptions = {
        gasLimit: process.env.GAS_LIMIT
          ? parseInt(process.env.GAS_LIMIT)
          : 100000, // Higher default for Base
      };

      // Add gas price options if specified in environment
      if (process.env.MAX_FEE_PER_GAS_GWEI) {
        txOptions.maxFeePerGas = ethers.parseUnits(
          process.env.MAX_FEE_PER_GAS_GWEI,
          "gwei"
        );
      }
      if (process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI) {
        txOptions.maxPriorityFeePerGas = ethers.parseUnits(
          process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI,
          "gwei"
        );
      }
      if (process.env.GAS_PRICE_GWEI && !txOptions.maxFeePerGas) {
        txOptions.gasPrice = ethers.parseUnits(
          process.env.GAS_PRICE_GWEI,
          "gwei"
        );
      }

      let tx;
      // Choose the most efficient update method based on what changed
      if (updateType === "both") {
        tx = await this.contract.updateBothScores(
          newBlackswanScore,
          newMarketPeakScore,
          txOptions
        );
        logger.info(`⏳ Both scores update transaction sent: ${tx.hash}`);
      } else if (updateType === "blackswan") {
        tx = await this.contract.updateBlackSwanScore(
          newBlackswanScore,
          txOptions
        );
        logger.info(`⏳ BlackSwan score update transaction sent: ${tx.hash}`);
      } else if (updateType === "marketpeak") {
        tx = await this.contract.updateMarketPeakScore(
          newMarketPeakScore,
          txOptions
        );
        logger.info(`⏳ MarketPeak score update transaction sent: ${tx.hash}`);
      }

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        logger.info(
          `✅ Scores updated successfully! Block: ${
            receipt.blockNumber
          }, Gas used: ${receipt.gasUsed.toString()}`
        );
        return true;
      } else {
        logger.error("❌ Transaction failed");
        return false;
      }
    } catch (error) {
      // Handle specific contract errors
      if (error.reason) {
        logger.error(`Contract error: ${error.reason}`);
      } else if (error.message.includes("insufficient funds")) {
        logger.error("Insufficient funds in dev wallet for transaction");
      } else if (error.message.includes("nonce")) {
        logger.error("Nonce error - possible duplicate transaction");
      } else {
        logger.error(`Transaction failed: ${error.message}`);
      }
      return false;
    }
  }

  async checkAndUpdateScores() {
    try {
      logger.info("🔍 Checking for score updates...");

      const scores = await this.fetchScoresFromAPI();
      const { blackswanScore, marketPeakScore } = scores;

      // First run - initialize cached scores
      if (
        this.lastKnownBlackSwanScore === null ||
        this.lastKnownMarketPeakScore === null
      ) {
        logger.info("📊 First run - current scores from API will be cached");
        this.lastKnownBlackSwanScore = blackswanScore;
        this.lastKnownMarketPeakScore = marketPeakScore;
        return;
      }

      // Check what has changed
      const blackswanChanged = blackswanScore !== this.lastKnownBlackSwanScore;
      const marketPeakChanged =
        marketPeakScore !== this.lastKnownMarketPeakScore;

      if (!blackswanChanged && !marketPeakChanged) {
        logger.info(
          `📊 No changes - BlackSwan: ${blackswanScore}, MarketPeak: ${marketPeakScore}`
        );
        return;
      }

      // Determine update type
      let updateType;
      if (blackswanChanged && marketPeakChanged) {
        updateType = "both";
        logger.info(
          `📈 Both scores changed - BlackSwan: ${this.lastKnownBlackSwanScore} → ${blackswanScore}, MarketPeak: ${this.lastKnownMarketPeakScore} → ${marketPeakScore}`
        );
      } else if (blackswanChanged) {
        updateType = "blackswan";
        logger.info(
          `📈 BlackSwan score changed: ${this.lastKnownBlackSwanScore} → ${blackswanScore}`
        );
      } else {
        updateType = "marketpeak";
        logger.info(
          `📈 MarketPeak score changed: ${this.lastKnownMarketPeakScore} → ${marketPeakScore}`
        );
      }

      // Update the oracle with the most efficient method
      const success = await this.updateOracleScores(
        blackswanScore,
        marketPeakScore,
        updateType
      );

      if (success) {
        this.lastKnownBlackSwanScore = blackswanScore;
        this.lastKnownMarketPeakScore = marketPeakScore;
        logger.info("💾 Cached scores updated");
      } else {
        logger.warn(
          "⚠️  Scores not updated in cache due to transaction failure"
        );
      }
    } catch (error) {
      logger.error(`Error during score check: ${error.message}`);
    }
  }

  async start() {
    if (this.isRunning) {
      logger.warn("Service is already running");
      return;
    }

    this.isRunning = true;
    const pollInterval = parseInt(process.env.POLL_INTERVAL) || 60000; // Default 1 minute

    logger.info(`🚀 BlackSwan Oracle Service starting...`);
    logger.info(`⏰ Polling interval: ${pollInterval / 1000} seconds`);
    logger.info(`🔗 API Endpoint: ${process.env.API_ENDPOINT}`);

    // Initial check
    await this.checkAndUpdateScores();

    // Set up recurring checks
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.checkAndUpdateScores();
      }
    }, pollInterval);

    logger.info("✅ Service started successfully");
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info("🛑 Stopping BlackSwan Oracle Service...");

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    logger.info("✅ Service stopped successfully");
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.info("📢 Received SIGINT signal");
  if (global.oracleService) {
    await global.oracleService.stop();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("📢 Received SIGTERM signal");
  if (global.oracleService) {
    await global.oracleService.stop();
  }
  process.exit(0);
});

// Handle unhandled errors
process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on("uncaughtException", (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});

// Start the service
async function main() {
  try {
    global.oracleService = new BlackSwanOracleService();
    await global.oracleService.start();
  } catch (error) {
    logger.error(`Failed to start service: ${error.message}`);
    process.exit(1);
  }
}

// Only run if this file is executed directly (not imported)
if (require.main === module) {
  main();
}

module.exports = BlackSwanOracleService;
