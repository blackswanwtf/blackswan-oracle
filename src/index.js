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
const express = require("express");
const cors = require("cors");
const pinataSDK = require("@pinata/sdk");
const FormData = require("form-data");

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
    this.initializePinata();
    this.lastKnownBlackSwanScore = null;
    this.lastKnownMarketPeakScore = null;
    this.lastKnownBlackSwanIPFS = null;
    this.lastKnownMarketPeakIPFS = null;
    this.isRunning = false;
    this.expressApp = null;
    this.httpServer = null;
    this.serviceStatus = {
      status: "starting",
      uptime: 0,
      startTime: new Date(),
      lastUpdate: null,
      lastSuccessfulUpdate: null,
      updateCount: 0,
      errorCount: 0,
      lastError: null,
      isHealthy: false,
    };
    this.setupExpressServer();
  }

  validateEnvironmentVariables() {
    const requiredVars = [
      "RPC_URL",
      "DEV_WALLET_PRIVATE_KEY",
      "ORACLE_CONTRACT_ADDRESS",
      "API_ENDPOINT",
      "PINATA_API_KEY",
      "PINATA_SECRET_API_KEY",
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

  setupExpressServer() {
    this.expressApp = express();

    // Middleware
    this.expressApp.use(cors());
    this.expressApp.use(express.json());

    // Health check endpoint
    this.expressApp.get("/health", (req, res) => {
      const currentTime = new Date();
      this.serviceStatus.uptime = Math.floor(
        (currentTime - this.serviceStatus.startTime) / 1000
      );

      const healthStatus = {
        status: this.serviceStatus.status,
        healthy: this.serviceStatus.isHealthy,
        uptime: this.serviceStatus.uptime,
        startTime: this.serviceStatus.startTime,
        lastUpdate: this.serviceStatus.lastUpdate,
        lastSuccessfulUpdate: this.serviceStatus.lastSuccessfulUpdate,
        updateCount: this.serviceStatus.updateCount,
        errorCount: this.serviceStatus.errorCount,
        lastError: this.serviceStatus.lastError,
        service: "BlackSwan Oracle",
        version: "1.0.0",
        timestamp: currentTime,
      };

      // Determine HTTP status based on health
      const httpStatus = this.serviceStatus.isHealthy ? 200 : 503;
      res.status(httpStatus).json(healthStatus);
    });

    // Service status endpoint with more details
    this.expressApp.get("/status", (req, res) => {
      const currentTime = new Date();
      this.serviceStatus.uptime = Math.floor(
        (currentTime - this.serviceStatus.startTime) / 1000
      );

      res.json({
        ...this.serviceStatus,
        uptime: this.serviceStatus.uptime,
        currentScores: {
          blackswanScore: this.lastKnownBlackSwanScore,
          marketPeakScore: this.lastKnownMarketPeakScore,
        },
        ipfsHashes: {
          blackswanIPFS: this.lastKnownBlackSwanIPFS,
          marketPeakIPFS: this.lastKnownMarketPeakIPFS,
          blackswanURL: this.lastKnownBlackSwanIPFS
            ? `https://gateway.pinata.cloud/ipfs/${this.lastKnownBlackSwanIPFS.replace(
                "ipfs://",
                ""
              )}`
            : null,
          marketPeakURL: this.lastKnownMarketPeakIPFS
            ? `https://gateway.pinata.cloud/ipfs/${this.lastKnownMarketPeakIPFS.replace(
                "ipfs://",
                ""
              )}`
            : null,
        },
        configuration: {
          pollInterval: parseInt(process.env.POLL_INTERVAL) || 60000,
          apiEndpoint: process.env.API_ENDPOINT,
          contractAddress: process.env.ORACLE_CONTRACT_ADDRESS,
          walletAddress: this.wallet ? this.wallet.address : "Not initialized",
        },
        service: "BlackSwan Oracle",
        version: "1.1.0",
        timestamp: currentTime,
      });
    });

    // Scores endpoint to get current cached scores and IPFS hashes
    this.expressApp.get("/scores", (req, res) => {
      res.json({
        blackswanScore: this.lastKnownBlackSwanScore,
        marketPeakScore: this.lastKnownMarketPeakScore,
        ipfsHashes: {
          blackswanIPFS: this.lastKnownBlackSwanIPFS,
          marketPeakIPFS: this.lastKnownMarketPeakIPFS,
          blackswanURL: this.lastKnownBlackSwanIPFS
            ? `https://gateway.pinata.cloud/ipfs/${this.lastKnownBlackSwanIPFS.replace(
                "ipfs://",
                ""
              )}`
            : null,
          marketPeakURL: this.lastKnownMarketPeakIPFS
            ? `https://gateway.pinata.cloud/ipfs/${this.lastKnownMarketPeakIPFS.replace(
                "ipfs://",
                ""
              )}`
            : null,
        },
        lastUpdate: this.serviceStatus.lastUpdate,
        lastSuccessfulUpdate: this.serviceStatus.lastSuccessfulUpdate,
        timestamp: new Date(),
      });
    });

    // Force update endpoint (for manual triggers)
    this.expressApp.post("/update", async (req, res) => {
      try {
        logger.info("🔄 Manual update triggered via API");
        await this.checkAndUpdateScores();
        res.json({
          success: true,
          message: "Update check completed",
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error(`Manual update failed: ${error.message}`);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date(),
        });
      }
    });

    // Root endpoint
    this.expressApp.get("/", (req, res) => {
      res.json({
        service: "BlackSwan Oracle",
        version: "1.0.0",
        status: this.serviceStatus.status,
        healthy: this.serviceStatus.isHealthy,
        endpoints: {
          health: "/health",
          status: "/status",
          scores: "/scores",
          update: "POST /update",
        },
        timestamp: new Date(),
      });
    });

    logger.info("🌐 Express server configured with health check endpoints");
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

  initializePinata() {
    try {
      this.pinata = new pinataSDK(
        process.env.PINATA_API_KEY,
        process.env.PINATA_SECRET_API_KEY
      );

      // Test Pinata connection
      this.pinata
        .testAuthentication()
        .then(() => {
          logger.info("📌 Pinata IPFS connection authenticated successfully");
        })
        .catch((error) => {
          logger.error(`Pinata authentication failed: ${error.message}`);
          logger.warn("Service will continue but IPFS uploads may fail");
        });
    } catch (error) {
      logger.error(`Failed to initialize Pinata: ${error.message}`);
      logger.warn("Service will continue but IPFS uploads may fail");
    }
  }

  async uploadJSONToIPFS(jsonData, fileName) {
    try {
      logger.info(`📤 Uploading ${fileName} to IPFS...`);

      const options = {
        pinataMetadata: {
          name: fileName,
        },
        pinataOptions: {
          cidVersion: 0,
        },
      };

      const result = await this.pinata.pinJSONToIPFS(jsonData, options);
      const ipfsHash = result.IpfsHash;
      const ipfsURI = `ipfs://${ipfsHash}`;

      logger.info(`✅ Successfully uploaded to IPFS: ${ipfsHash}`);
      logger.info(
        `🌐 Access at: https://gateway.pinata.cloud/ipfs/${ipfsHash}`
      );
      logger.info(`📎 IPFS URI: ${ipfsURI}`);

      return ipfsURI;
    } catch (error) {
      logger.error(`Failed to upload ${fileName} to IPFS: ${error.message}`);
      throw error;
    }
  }

  createAnalysisJSON(analysisData, type) {
    try {
      const timestamp = new Date().toISOString();

      if (type === "blackswan") {
        return {
          type: "BlackSwan Analysis",
          version: "1.0.0",
          generatedAt: timestamp,
          score: analysisData.score,
          confidence: analysisData.confidence,
          certainty: analysisData.certainty,
          analysis: analysisData.analysis,
          reasoning: analysisData.reasoning,
          currentMarketIndicators: analysisData.currentMarketIndicators,
          primaryRiskFactors: analysisData.primaryRiskFactors,
          timestamp: analysisData.timestamp,
          dataSource: "BlackSwan AI Analysis Engine",
        };
      } else if (type === "marketpeak") {
        return {
          type: "Market Peak Analysis",
          version: "1.0.0",
          generatedAt: timestamp,
          score: analysisData.score,
          summary: analysisData.summary,
          keyFactors: analysisData.keyFactors,
          reasoning: analysisData.reasoning,
          timestamp: analysisData.timestamp,
          dataSource: "Market Peak AI Analysis Engine",
        };
      }
    } catch (error) {
      logger.error(`Failed to create ${type} JSON: ${error.message}`);
      throw error;
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

  async fetchAnalysisFromAPI() {
    try {
      // Use the new analysis endpoint
      const analysisEndpoint =
        process.env.API_ANALYSIS_ENDPOINT ||
        process.env.API_ENDPOINT.replace("/stats", "/analysis");

      const response = await axios.get(analysisEndpoint, {
        timeout: 30000, // 30 second timeout
        headers: {
          "User-Agent": "BlackSwanOracle/1.0",
        },
      });

      if (!response.data.blackswan || !response.data.marketPeak) {
        throw new Error("Unable to extract analysis data from API response");
      }

      logger.info(
        `📊 Fetched full analysis from API - BlackSwan: ${response.data.blackswan.score}, MarketPeak: ${response.data.marketPeak.score}`
      );

      return {
        blackswan: response.data.blackswan,
        marketPeak: response.data.marketPeak,
      };
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        logger.error("Analysis API request timed out");
      } else if (error.response) {
        logger.error(
          `Analysis API returned error ${error.response.status}: ${error.response.statusText}`
        );
      } else if (error.request) {
        logger.error("No response received from Analysis API");
      } else {
        logger.error(`Analysis API fetch error: ${error.message}`);
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

  async updateOracleScoresAndAnalysis(
    newBlackswanScore,
    newMarketPeakScore,
    blackSwanIPFS,
    marketPeakIPFS
  ) {
    try {
      logger.info(`🚀 Updating oracle contract with scores and IPFS hashes`);
      logger.info(
        `   BlackSwan: ${newBlackswanScore} | IPFS: ${blackSwanIPFS}`
      );
      logger.info(
        `   MarketPeak: ${newMarketPeakScore} | IPFS: ${marketPeakIPFS}`
      );

      // Prepare transaction options with Base-optimized settings
      const txOptions = {
        gasLimit: process.env.GAS_LIMIT
          ? parseInt(process.env.GAS_LIMIT)
          : 200000, // Higher for IPFS string storage
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

      // Use the new combined update function
      const tx = await this.contract.updateScoresAndAnalysis(
        newBlackswanScore,
        newMarketPeakScore,
        blackSwanIPFS,
        marketPeakIPFS,
        txOptions
      );

      logger.info(`⏳ Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        logger.info(`✅ Scores and IPFS hashes updated successfully!`);
        logger.info(
          `   Block: ${
            receipt.blockNumber
          }, Gas used: ${receipt.gasUsed.toString()}`
        );
        // Extract hash from ipfs:// URI for gateway URL
        const blackSwanHash = blackSwanIPFS.replace("ipfs://", "");
        const marketPeakHash = marketPeakIPFS.replace("ipfs://", "");
        logger.info(
          `   🌐 BlackSwan IPFS: https://gateway.pinata.cloud/ipfs/${blackSwanHash}`
        );
        logger.info(
          `   🌐 MarketPeak IPFS: https://gateway.pinata.cloud/ipfs/${marketPeakHash}`
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
      logger.info("🔍 Checking for analysis updates...");
      this.serviceStatus.lastUpdate = new Date();

      // Fetch full analysis data including scores
      const analysisData = await this.fetchAnalysisFromAPI();
      const { blackswan, marketPeak } = analysisData;

      const blackswanScore = Math.floor(blackswan.score);
      const marketPeakScore = Math.floor(marketPeak.score);

      // First run - initialize cached data
      if (
        this.lastKnownBlackSwanScore === null ||
        this.lastKnownMarketPeakScore === null
      ) {
        logger.info("📊 First run - initializing cache and uploading to IPFS");

        // Create JSON files for both analyses
        const blackSwanJSON = this.createAnalysisJSON(blackswan, "blackswan");
        const marketPeakJSON = this.createAnalysisJSON(
          marketPeak,
          "marketpeak"
        );

        // Upload to IPFS
        const blackSwanIPFS = await this.uploadJSONToIPFS(
          blackSwanJSON,
          `blackswan-analysis-${Date.now()}.json`
        );
        const marketPeakIPFS = await this.uploadJSONToIPFS(
          marketPeakJSON,
          `marketpeak-analysis-${Date.now()}.json`
        );

        // Update oracle with initial scores and IPFS hashes
        const success = await this.updateOracleScoresAndAnalysis(
          blackswanScore,
          marketPeakScore,
          blackSwanIPFS,
          marketPeakIPFS
        );

        if (success) {
          this.lastKnownBlackSwanScore = blackswanScore;
          this.lastKnownMarketPeakScore = marketPeakScore;
          this.lastKnownBlackSwanIPFS = blackSwanIPFS;
          this.lastKnownMarketPeakIPFS = marketPeakIPFS;
          this.serviceStatus.lastSuccessfulUpdate = new Date();
          this.serviceStatus.updateCount++;
          this.serviceStatus.isHealthy = true;
        }
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

      // Scores have changed - create new JSON and upload to IPFS
      logger.info(
        `📈 Changes detected - BlackSwan: ${this.lastKnownBlackSwanScore} → ${blackswanScore}, MarketPeak: ${this.lastKnownMarketPeakScore} → ${marketPeakScore}`
      );

      // Create JSON files for both analyses (always update both for consistency)
      logger.info("📝 Creating analysis JSON files...");
      const blackSwanJSON = this.createAnalysisJSON(blackswan, "blackswan");
      const marketPeakJSON = this.createAnalysisJSON(marketPeak, "marketpeak");

      // Upload to IPFS
      logger.info("📤 Uploading analysis to IPFS...");
      const blackSwanIPFS = await this.uploadJSONToIPFS(
        blackSwanJSON,
        `blackswan-analysis-${Date.now()}.json`
      );
      const marketPeakIPFS = await this.uploadJSONToIPFS(
        marketPeakJSON,
        `marketpeak-analysis-${Date.now()}.json`
      );

      // Update the oracle with new scores and IPFS hashes
      const success = await this.updateOracleScoresAndAnalysis(
        blackswanScore,
        marketPeakScore,
        blackSwanIPFS,
        marketPeakIPFS
      );

      if (success) {
        this.lastKnownBlackSwanScore = blackswanScore;
        this.lastKnownMarketPeakScore = marketPeakScore;
        this.lastKnownBlackSwanIPFS = blackSwanIPFS;
        this.lastKnownMarketPeakIPFS = marketPeakIPFS;
        this.serviceStatus.lastSuccessfulUpdate = new Date();
        this.serviceStatus.updateCount++;
        this.serviceStatus.isHealthy = true;
        logger.info("💾 All data updated successfully");
      } else {
        this.serviceStatus.errorCount++;
        this.serviceStatus.isHealthy = false;
        logger.warn("⚠️  Data not updated in cache due to transaction failure");
      }
    } catch (error) {
      this.serviceStatus.errorCount++;
      this.serviceStatus.lastError = {
        message: error.message,
        timestamp: new Date(),
      };
      this.serviceStatus.isHealthy = false;
      logger.error(`Error during analysis check: ${error.message}`);
    }
  }

  async start() {
    if (this.isRunning) {
      logger.warn("Service is already running");
      return;
    }

    this.isRunning = true;
    const pollInterval = parseInt(process.env.POLL_INTERVAL) || 60000; // Default 1 minute
    const httpPort = parseInt(process.env.PORT) || 8080; // Default port 8080

    logger.info(`🚀 BlackSwan Oracle Service starting...`);
    logger.info(`⏰ Polling interval: ${pollInterval / 1000} seconds`);
    logger.info(`🔗 API Endpoint: ${process.env.API_ENDPOINT}`);

    // Start Express server
    this.httpServer = this.expressApp.listen(httpPort, () => {
      logger.info(`🌐 HTTP server listening on port ${httpPort}`);
      logger.info(
        `📋 Health check available at: http://localhost:${httpPort}/health`
      );
      logger.info(
        `📊 Status endpoint available at: http://localhost:${httpPort}/status`
      );
    });

    this.serviceStatus.status = "running";
    this.serviceStatus.isHealthy = true;

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
    this.serviceStatus.status = "stopping";

    // Stop polling interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Stop HTTP server
    if (this.httpServer) {
      await new Promise((resolve) => {
        this.httpServer.close(() => {
          logger.info("🌐 HTTP server stopped");
          resolve();
        });
      });
    }

    this.serviceStatus.status = "stopped";
    this.serviceStatus.isHealthy = false;
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
