import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import {
  getStrategiesForToken,
  getBestStrategy,
  getAvailableTokens,
  getSupportedChainIds,
  getRecommendedStrategies,
  isValidRiskTier,
  DEFAULTS,
} from "./strategyService";
import {
  StrategiesResponse,
  RecommendResponse,
  RecommendationsResponse,
  RebalanceTasksResponse,
  RebalanceTaskResponse,
  DustTokensResponse,
  DustConfigResponse,
  DustSummaryResponse,
  ErrorResponse,
  RiskTier,
  RebalanceTaskInput,
  WalletSummaryResponse,
  CurrentStrategyInfo,
  WalletSettings,
  WalletSettingsResponse,
  WalletSettingsInput,
  ValidationError,
  ValidationErrorResponse,
  DEFAULT_WALLET_SETTINGS,
  ALLOWED_CONSOLIDATION_TOKENS,
  ALLOWED_YIELD_STRATEGIES,
  DustConsolidationToken,
} from "./types";
import {
  getDustTokens,
  getDustSources,
  getDustConfig,
  getDustConfigByAddress,
  getDustSummary,
  getTokenBySymbol,
  getTokenByAddress,
  isValidConsolidationSymbol,
  DEFAULT_DUST_CHAIN_ID,
} from "./dustService";
import {
  refreshLiveStrategies,
  getCacheStatus,
} from "./liveStrategyStore";
import { isValidWalletAddress as isValidWallet } from "./scheduler";
import {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  addTask,
  removeTask,
  getTask,
  listTasks,
  runTaskNow,
  setTaskEnabled,
  isValidWalletAddress,
  isValidTaskAction,
} from "./scheduler";
import { prepareUserSendOp, submitSignedUserOp } from "./bundler/submit";
import { CONTRACTS } from "./bundler/constants";
import type { Address } from "viem";

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================================================
// Wallet Registry (in-memory storage)
// ============================================================================

interface RegisteredWallet {
  wallet: string;
  owner: string;
  createdAt: Date;
}

const walletRegistry = new Map<string, RegisteredWallet>();

/**
 * Get all registered wallet addresses
 * Used by scheduler to check wallets for rebalancing
 */
export function getRegisteredWallets(): string[] {
  return Array.from(walletRegistry.keys());
}

/**
 * Get count of registered wallets
 */
export function getRegisteredWalletCount(): number {
  return walletRegistry.size;
}

// ============================================================================
// Wallet Settings Storage (in-memory)
// TODO: Replace with database (PostgreSQL) for persistence
// ============================================================================

interface StoredSettings {
  settings: WalletSettings;
  updatedAt: Date;
}

const settingsStore = new Map<string, StoredSettings>();

/**
 * Get settings for a wallet (returns defaults if not set)
 */
export function getWalletSettings(wallet: string): StoredSettings {
  const stored = settingsStore.get(wallet.toLowerCase());
  if (stored) {
    return stored;
  }
  // Return defaults for wallets without stored settings
  return {
    settings: { ...DEFAULT_WALLET_SETTINGS },
    updatedAt: new Date(),
  };
}

/**
 * Save settings for a wallet
 */
export function saveWalletSettings(wallet: string, settings: WalletSettings): StoredSettings {
  const stored: StoredSettings = {
    settings,
    updatedAt: new Date(),
  };
  settingsStore.set(wallet.toLowerCase(), stored);
  return stored;
}

/**
 * Validate settings input and return validation errors
 */
function validateSettingsInput(input: WalletSettingsInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate checkingThreshold
  if (input.checkingThreshold !== undefined) {
    const threshold = parseFloat(input.checkingThreshold);
    if (isNaN(threshold) || threshold < 0) {
      errors.push({
        field: "checkingThreshold",
        message: "Checking threshold must be a non-negative number",
      });
    }
  }

  // Validate dustThreshold
  if (input.dustThreshold !== undefined) {
    const threshold = parseFloat(input.dustThreshold);
    if (isNaN(threshold) || threshold < 0) {
      errors.push({
        field: "dustThreshold",
        message: "Dust threshold must be a non-negative number",
      });
    }
  }

  // Validate riskTolerance
  if (input.riskTolerance !== undefined) {
    if (!Number.isInteger(input.riskTolerance) || input.riskTolerance < 1 || input.riskTolerance > 5) {
      errors.push({
        field: "riskTolerance",
        message: "Risk tolerance must be an integer between 1 and 5",
      });
    }
  }

  // Validate dustConsolidationToken
  if (input.dustConsolidationToken !== undefined) {
    if (!ALLOWED_CONSOLIDATION_TOKENS.includes(input.dustConsolidationToken as DustConsolidationToken)) {
      errors.push({
        field: "dustConsolidationToken",
        message: `Dust consolidation token must be one of: ${ALLOWED_CONSOLIDATION_TOKENS.join(", ")}`,
      });
    }
  }

  // Validate yieldStrategy
  if (input.yieldStrategy !== undefined) {
    if (!ALLOWED_YIELD_STRATEGIES.includes(input.yieldStrategy)) {
      errors.push({
        field: "yieldStrategy",
        message: `Yield strategy must be one of: ${ALLOWED_YIELD_STRATEGIES.join(", ")}`,
      });
    }
  }

  // Validate autoYieldTokens structure
  if (input.autoYieldTokens !== undefined) {
    if (typeof input.autoYieldTokens !== "object") {
      errors.push({
        field: "autoYieldTokens",
        message: "Auto yield tokens must be an object",
      });
    } else {
      if (input.autoYieldTokens.USDC !== undefined && typeof input.autoYieldTokens.USDC.enabled !== "boolean") {
        errors.push({
          field: "autoYieldTokens.USDC.enabled",
          message: "USDC enabled must be a boolean",
        });
      }
      if (input.autoYieldTokens.WETH !== undefined && typeof input.autoYieldTokens.WETH.enabled !== "boolean") {
        errors.push({
          field: "autoYieldTokens.WETH.enabled",
          message: "WETH enabled must be a boolean",
        });
      }
    }
  }

  // Validate dustSweepEnabled
  if (input.dustSweepEnabled !== undefined && typeof input.dustSweepEnabled !== "boolean") {
    errors.push({
      field: "dustSweepEnabled",
      message: "Dust sweep enabled must be a boolean",
    });
  }

  return errors;
}

// Middleware
app.use(cors()); // Enable CORS for all origins
app.use(express.json());

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Parse and validate chainId from query parameter
 */
function parseChainId(chainIdParam: unknown): number | null {
  if (chainIdParam === undefined || chainIdParam === null) {
    return DEFAULTS.CHAIN_ID;
  }

  const parsed = parseInt(String(chainIdParam), 10);
  if (isNaN(parsed) || parsed <= 0) {
    return null; // Invalid
  }
  return parsed;
}

/**
 * Parse token from query parameter with default
 */
function parseToken(tokenParam: unknown): string {
  if (typeof tokenParam === "string" && tokenParam.trim().length > 0) {
    return tokenParam.trim().toUpperCase();
  }
  return DEFAULTS.TOKEN;
}

/**
 * Parse and validate riskTolerance from query parameter
 * Returns the risk tier or null if invalid
 */
function parseRiskTolerance(riskParam: unknown): RiskTier | null {
  if (riskParam === undefined || riskParam === null) {
    return DEFAULTS.RISK_TOLERANCE;
  }

  const riskStr = String(riskParam).toLowerCase().trim();
  if (isValidRiskTier(riskStr)) {
    return riskStr;
  }
  return null; // Invalid
}

/**
 * Parse minApy from query parameter
 * Accepts both decimal (0.05) and percentage (5) formats
 * - Values >= 1 are treated as percentages and converted to decimal
 * - Values < 1 are treated as already decimal
 * Returns the APY as a decimal, or null if invalid
 */
function parseMinApy(apyParam: unknown): number | null {
  if (apyParam === undefined || apyParam === null) {
    return DEFAULTS.MIN_APY;
  }

  const parsed = parseFloat(String(apyParam));
  if (isNaN(parsed) || parsed < 0) {
    return null; // Invalid
  }

  // If value >= 1, treat as percentage (e.g., 5 -> 0.05)
  // If value < 1, treat as decimal (e.g., 0.05 stays 0.05)
  // Edge case: 1 could be 1% or 100%, we treat it as 1% (0.01)
  if (parsed >= 1) {
    return parsed / 100;
  }
  return parsed;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /
 * Friendly landing route to show available endpoints
 */
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "AutoYield Backend is running",
    endpoints: [
      "/health",
      "/register",
      "/wallets",
      "/wallet/:address",
      "/wallet/:address/summary",
      "/wallet/:address/settings",
      "/strategies",
      "/recommend",
      "/recommendations",
      "/tokens",
      "/chains",
      "/rebalance-tasks",
      "/dust/tokens",
      "/dust/config",
      "/dust/summary",
      "/admin/refresh-strategies",
      "/admin/cache-status",
    ],
    scheduler: getSchedulerStatus(),
    registeredWallets: walletRegistry.size,
  });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// ============================================================================
// Wallet Registry Endpoints
// ============================================================================

/**
 * POST /register
 * Register a new wallet after on-chain creation
 *
 * Body:
 *   - wallet: string (required, smart wallet address)
 *   - owner: string (required, EOA owner address)
 */
app.post("/register", (req: Request, res: Response) => {
  const { wallet, owner } = req.body;

  // Validate required fields
  if (!wallet || !owner) {
    const errorResponse: ErrorResponse = {
      error: "Missing required fields: wallet and owner",
    };
    return res.status(400).json(errorResponse);
  }

  // Validate wallet address format
  if (!isValidWalletAddress(wallet)) {
    const errorResponse: ErrorResponse = {
      error: "Invalid wallet address format. Must be 0x followed by 40 hex characters.",
    };
    return res.status(400).json(errorResponse);
  }

  // Validate owner address format
  if (!isValidWalletAddress(owner)) {
    const errorResponse: ErrorResponse = {
      error: "Invalid owner address format. Must be 0x followed by 40 hex characters.",
    };
    return res.status(400).json(errorResponse);
  }

  const walletLower = wallet.toLowerCase();
  const ownerLower = owner.toLowerCase();

  // Idempotent: update if exists, create if not
  walletRegistry.set(walletLower, {
    wallet: walletLower,
    owner: ownerLower,
    createdAt: walletRegistry.get(walletLower)?.createdAt || new Date(),
  });

  console.log(`[registry] Wallet registered: ${walletLower} (owner: ${ownerLower})`);

  return res.json({ ok: true, wallet: walletLower });
});

/**
 * GET /wallets
 * List all registered wallet addresses
 * Used by scheduler to know which wallets to automate
 */
app.get("/wallets", (_req: Request, res: Response) => {
  const wallets = Array.from(walletRegistry.keys());
  return res.json(wallets);
});

/**
 * GET /wallet/:address
 * Get details for a specific registered wallet
 */
app.get("/wallet/:address", (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();

  const wallet = walletRegistry.get(address);

  if (!wallet) {
    const errorResponse: ErrorResponse = {
      error: `Wallet not found: ${address}`,
    };
    return res.status(404).json(errorResponse);
  }

  return res.json(wallet);
});

/**
 * GET /wallet/:address/summary
 * Get dashboard summary for a wallet including strategy info
 *
 * Query params:
 *   - token: string (optional, default "USDC")
 *   - chainId: number (optional, default 8453)
 *
 * Returns:
 *   - wallet: string (smart wallet address)
 *   - owner: string (if registered)
 *   - isRegistered: boolean
 *   - currentStrategy: strategy info with APY, protocol name
 *   - metadata: data source info
 */
app.get("/wallet/:address/summary", async (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const token = parseToken(req.query.token);
  const chainId = parseChainId(req.query.chainId);

  // Validate chainId
  if (chainId === null) {
    const errorResponse: ErrorResponse = {
      error: "Invalid chainId parameter. Must be a positive integer.",
    };
    return res.status(400).json(errorResponse);
  }

  // Validate address format
  if (!isValidWalletAddress(address)) {
    const errorResponse: ErrorResponse = {
      error: "Invalid wallet address format. Must be 0x followed by 40 hex characters.",
    };
    return res.status(400).json(errorResponse);
  }

  try {
    // Check if wallet is registered
    const registeredWallet = walletRegistry.get(address);
    const isRegistered = !!registeredWallet;

    // Get best strategy for this token/chain
    const strategyResult = await getBestStrategy(token, chainId);

    let currentStrategy: CurrentStrategyInfo | undefined;
    if (strategyResult.strategy) {
      const s = strategyResult.strategy;
      currentStrategy = {
        id: s.id,
        protocol: s.protocolName,
        name: s.id.includes("-") ? s.id.split("-").slice(0, -1).join(" ") : s.protocolName,
        apy: s.apy,
        vaultAddress: s.vaultAddress,
        adapterAddress: s.adapterAddress,
      };
    }

    const response: WalletSummaryResponse = {
      wallet: address,
      owner: registeredWallet?.owner,
      chainId,
      isRegistered,
      currentStrategy,
      fetchedAt: new Date().toISOString(),
      metadata: strategyResult.metadata,
    };

    return res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[/wallet/:address/summary] Error:`, message);
    const errorResponse: ErrorResponse = {
      error: `Failed to fetch wallet summary: ${message}`,
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /wallet/:address/settings
 * Get wallet settings (preferences for automation)
 *
 * Returns stored settings or defaults if none set
 */
app.get("/wallet/:address/settings", (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();

  // Validate address format
  if (!isValidWalletAddress(address)) {
    const errorResponse: ErrorResponse = {
      error: "Invalid wallet address format. Must be 0x followed by 40 hex characters.",
    };
    return res.status(400).json(errorResponse);
  }

  const stored = getWalletSettings(address);

  const response: WalletSettingsResponse = {
    wallet: address,
    settings: stored.settings,
    updatedAt: stored.updatedAt.toISOString(),
  };

  console.log(`[settings] GET ${address}: returning settings`);
  return res.json(response);
});

/**
 * POST /wallet/:address/settings
 * Update wallet settings
 *
 * Body: Partial<WalletSettings> - only include fields to update
 *
 * Returns:
 *   - 200: Updated settings
 *   - 400: Validation errors
 */
app.post("/wallet/:address/settings", (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const input = req.body as WalletSettingsInput;

  // Validate address format
  if (!isValidWalletAddress(address)) {
    const errorResponse: ErrorResponse = {
      error: "Invalid wallet address format. Must be 0x followed by 40 hex characters.",
    };
    return res.status(400).json(errorResponse);
  }

  // Validate input
  const validationErrors = validateSettingsInput(input);
  if (validationErrors.length > 0) {
    const errorResponse: ValidationErrorResponse = {
      error: "Validation failed",
      validationErrors,
    };
    return res.status(400).json(errorResponse);
  }

  // Get current settings (or defaults)
  const current = getWalletSettings(address);

  // Merge input with current settings
  const updatedSettings: WalletSettings = {
    ...current.settings,
    ...input,
    // Deep merge autoYieldTokens if provided
    autoYieldTokens: input.autoYieldTokens
      ? {
          USDC: input.autoYieldTokens.USDC ?? current.settings.autoYieldTokens.USDC,
          WETH: input.autoYieldTokens.WETH ?? current.settings.autoYieldTokens.WETH,
        }
      : current.settings.autoYieldTokens,
  };

  // Save updated settings
  const stored = saveWalletSettings(address, updatedSettings);

  const response: WalletSettingsResponse = {
    wallet: address,
    settings: stored.settings,
    updatedAt: stored.updatedAt.toISOString(),
  };

  console.log(`[settings] POST ${address}: settings updated`);
  return res.json(response);
});

/**
 * GET /strategies
 * Returns all active strategies for a given token and chain, sorted by APY descending
 *
 * Query params:
 *   - token: string (optional, default "USDC")
 *   - chainId: number (optional, default 8453)
 */
app.get("/strategies", async (req: Request, res: Response) => {
  const token = parseToken(req.query.token);
  const chainId = parseChainId(req.query.chainId);

  // Validate chainId
  if (chainId === null) {
    const errorResponse: ErrorResponse = {
      error: "Invalid chainId parameter. Must be a positive integer.",
    };
    return res.status(400).json(errorResponse);
  }

  try {
    const result = await getStrategiesForToken(token, chainId);

    const response: StrategiesResponse = {
      token,
      chainId,
      strategies: result.strategies,
      metadata: result.metadata,
    };

    return res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[/strategies] Error:`, message);
    const errorResponse: ErrorResponse = {
      error: `Failed to fetch strategies: ${message}`,
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /recommend
 * Returns the single highest-APY strategy for a given token and chain
 *
 * Query params:
 *   - token: string (optional, default "USDC")
 *   - chainId: number (optional, default 8453)
 */
app.get("/recommend", async (req: Request, res: Response) => {
  const token = parseToken(req.query.token);
  const chainId = parseChainId(req.query.chainId);

  // Validate chainId
  if (chainId === null) {
    const errorResponse: ErrorResponse = {
      error: "Invalid chainId parameter. Must be a positive integer.",
    };
    return res.status(400).json(errorResponse);
  }

  try {
    const result = await getBestStrategy(token, chainId);

    if (!result.strategy) {
      const errorResponse: ErrorResponse = {
        error: "No strategies found",
      };
      return res.status(404).json(errorResponse);
    }

    const response: RecommendResponse = {
      token,
      chainId,
      strategy: result.strategy,
      metadata: result.metadata,
    };

    return res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[/recommend] Error:`, message);
    const errorResponse: ErrorResponse = {
      error: `Failed to fetch recommendation: ${message}`,
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /recommendations
 * Returns strategies filtered and scored by user preferences
 *
 * Query params:
 *   - token: string (optional, default "USDC")
 *   - chainId: number (optional, default 8453)
 *   - riskTolerance: "low" | "med" | "high" (optional, default "med")
 *   - minApy: number (optional, default 0)
 *       - Values >= 1 are treated as percentages (e.g., 5 = 5%)
 *       - Values < 1 are treated as decimals (e.g., 0.05 = 5%)
 *   - wallet: string (optional, for future wallet-specific preferences)
 *
 * Response includes:
 *   - bestStrategy: The highest-scored strategy matching preferences
 *   - strategies: All matching strategies sorted by score
 *   - preferences: The preferences used for filtering
 *   - totalAvailable: Total strategies before filtering
 *   - metadata: Data source and freshness info
 */
app.get("/recommendations", async (req: Request, res: Response) => {
  const token = parseToken(req.query.token);
  const chainId = parseChainId(req.query.chainId);
  const riskTolerance = parseRiskTolerance(req.query.riskTolerance);
  const minApy = parseMinApy(req.query.minApy);

  // Validate chainId
  if (chainId === null) {
    const errorResponse: ErrorResponse = {
      error: "Invalid chainId parameter. Must be a positive integer.",
    };
    return res.status(400).json(errorResponse);
  }

  // Validate riskTolerance
  if (riskTolerance === null) {
    const errorResponse: ErrorResponse = {
      error:
        'Invalid riskTolerance parameter. Must be one of: "low", "med", "high".',
    };
    return res.status(400).json(errorResponse);
  }

  // Validate minApy
  if (minApy === null) {
    const errorResponse: ErrorResponse = {
      error:
        "Invalid minApy parameter. Must be a non-negative number (e.g., 5 for 5% or 0.05).",
    };
    return res.status(400).json(errorResponse);
  }

  try {
    const result = await getRecommendedStrategies(token, chainId, riskTolerance, minApy);

    // Return 404 if no strategies match preferences
    if (result.strategies.length === 0) {
      const errorResponse: ErrorResponse = {
        error: "No strategies match preferences",
      };
      return res.status(404).json(errorResponse);
    }

    const response: RecommendationsResponse = {
      token,
      chainId,
      preferences: {
        riskTolerance,
        minApy,
      },
      bestStrategy: result.bestStrategy,
      strategies: result.strategies,
      totalAvailable: result.totalAvailable,
      metadata: result.metadata,
    };

    return res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[/recommendations] Error:`, message);
    const errorResponse: ErrorResponse = {
      error: `Failed to fetch recommendations: ${message}`,
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /tokens
 * Returns available tokens for a given chain (utility endpoint)
 *
 * Query params:
 *   - chainId: number (optional, default 8453)
 */
app.get("/tokens", (req: Request, res: Response) => {
  const chainId = parseChainId(req.query.chainId);

  if (chainId === null) {
    const errorResponse: ErrorResponse = {
      error: "Invalid chainId parameter. Must be a positive integer.",
    };
    return res.status(400).json(errorResponse);
  }

  const tokens = getAvailableTokens(chainId);
  return res.json({ chainId, tokens });
});

/**
 * GET /chains
 * Returns supported chain IDs (utility endpoint)
 */
app.get("/chains", (_req: Request, res: Response) => {
  const chainIds = getSupportedChainIds();
  return res.json({ chainIds });
});

// ============================================================================
// B3: Rebalance Task Endpoints
// ============================================================================

/**
 * GET /rebalance-tasks
 * List all rebalance tasks and scheduler status
 */
app.get("/rebalance-tasks", (_req: Request, res: Response) => {
  const response: RebalanceTasksResponse = {
    tasks: listTasks(),
    schedulerStatus: getSchedulerStatus(),
  };
  return res.json(response);
});

/**
 * POST /rebalance-tasks
 * Create a new rebalance task
 *
 * Body:
 *   - wallet: string (required, 0x address)
 *   - token: string (optional, default "USDC")
 *   - chainId: number (optional, default 8453)
 *   - preferredStrategyId: string (optional)
 *   - riskTolerance: "low" | "med" | "high" (optional, default "med")
 *   - intervalMs: number (optional, default 5 minutes)
 *   - action: "rebalance" | "flushToChecking" | "sweepDust" (optional, default "rebalance")
 */
app.post("/rebalance-tasks", (req: Request, res: Response) => {
  const input = req.body as RebalanceTaskInput;

  // Validate required fields
  if (!input.wallet) {
    const errorResponse: ErrorResponse = {
      error: "Missing required field: wallet",
    };
    return res.status(400).json(errorResponse);
  }

  // Validate wallet address format
  if (!isValidWalletAddress(input.wallet)) {
    const errorResponse: ErrorResponse = {
      error: "Invalid wallet address format. Must be 0x followed by 40 hex characters.",
    };
    return res.status(400).json(errorResponse);
  }

  // Validate chainId if provided
  if (input.chainId !== undefined) {
    const chainId = parseChainId(input.chainId);
    if (chainId === null) {
      const errorResponse: ErrorResponse = {
        error: "Invalid chainId. Must be a positive integer.",
      };
      return res.status(400).json(errorResponse);
    }
    input.chainId = chainId;
  }

  // Validate riskTolerance if provided
  if (input.riskTolerance !== undefined) {
    if (!isValidRiskTier(input.riskTolerance)) {
      const errorResponse: ErrorResponse = {
        error: 'Invalid riskTolerance. Must be one of: "low", "med", "high".',
      };
      return res.status(400).json(errorResponse);
    }
  }

  // Validate action if provided
  if (input.action !== undefined) {
    if (!isValidTaskAction(input.action)) {
      const errorResponse: ErrorResponse = {
        error: 'Invalid action. Must be one of: "rebalance", "flushToChecking", "sweepDust".',
      };
      return res.status(400).json(errorResponse);
    }
  }

  // Validate intervalMs if provided
  if (input.intervalMs !== undefined) {
    if (typeof input.intervalMs !== "number" || input.intervalMs < 1000) {
      const errorResponse: ErrorResponse = {
        error: "Invalid intervalMs. Must be a number >= 1000 (1 second).",
      };
      return res.status(400).json(errorResponse);
    }
  }

  try {
    const task = addTask(input);
    const response: RebalanceTaskResponse = {
      task,
      message: "Task created successfully",
    };
    return res.status(201).json(response);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      error: error instanceof Error ? error.message : "Failed to create task",
    };
    return res.status(400).json(errorResponse);
  }
});

/**
 * GET /rebalance-tasks/:id
 * Get a specific task by ID
 */
app.get("/rebalance-tasks/:id", (req: Request, res: Response) => {
  const task = getTask(req.params.id);

  if (!task) {
    const errorResponse: ErrorResponse = {
      error: `Task not found: ${req.params.id}`,
    };
    return res.status(404).json(errorResponse);
  }

  const response: RebalanceTaskResponse = { task };
  return res.json(response);
});

/**
 * POST /rebalance-tasks/:id/run
 * Manually trigger a task to run immediately
 */
app.post("/rebalance-tasks/:id/run", async (req: Request, res: Response) => {
  const task = getTask(req.params.id);

  if (!task) {
    const errorResponse: ErrorResponse = {
      error: `Task not found: ${req.params.id}`,
    };
    return res.status(404).json(errorResponse);
  }

  const result = await runTaskNow(req.params.id);

  if (!result.success) {
    return res.status(500).json({
      task: getTask(req.params.id),
      result,
      message: "Task execution failed",
    });
  }

  return res.json({
    task: getTask(req.params.id),
    result,
    message: "Task executed successfully",
  });
});

/**
 * PATCH /rebalance-tasks/:id/enable
 * Enable a task
 */
app.patch("/rebalance-tasks/:id/enable", (req: Request, res: Response) => {
  const task = setTaskEnabled(req.params.id, true);

  if (!task) {
    const errorResponse: ErrorResponse = {
      error: `Task not found: ${req.params.id}`,
    };
    return res.status(404).json(errorResponse);
  }

  const response: RebalanceTaskResponse = {
    task,
    message: "Task enabled",
  };
  return res.json(response);
});

/**
 * PATCH /rebalance-tasks/:id/disable
 * Disable a task
 */
app.patch("/rebalance-tasks/:id/disable", (req: Request, res: Response) => {
  const task = setTaskEnabled(req.params.id, false);

  if (!task) {
    const errorResponse: ErrorResponse = {
      error: `Task not found: ${req.params.id}`,
    };
    return res.status(404).json(errorResponse);
  }

  const response: RebalanceTaskResponse = {
    task,
    message: "Task disabled",
  };
  return res.json(response);
});

/**
 * DELETE /rebalance-tasks/:id
 * Remove a task
 */
app.delete("/rebalance-tasks/:id", (req: Request, res: Response) => {
  const success = removeTask(req.params.id);

  if (!success) {
    const errorResponse: ErrorResponse = {
      error: `Task not found: ${req.params.id}`,
    };
    return res.status(404).json(errorResponse);
  }

  return res.json({ message: `Task ${req.params.id} deleted` });
});

/**
 * GET /scheduler/status
 * Get scheduler status
 */
app.get("/scheduler/status", (_req: Request, res: Response) => {
  return res.json(getSchedulerStatus());
});

// ============================================================================
// B4: Dust Token Endpoints
// ============================================================================

/**
 * GET /dust/tokens
 * Returns all dust token metadata for a chain
 *
 * Query params:
 *   - chainId: number (optional, default 8453)
 */
app.get("/dust/tokens", (req: Request, res: Response) => {
  const chainId = parseChainId(req.query.chainId);

  if (chainId === null) {
    const errorResponse: ErrorResponse = {
      error: "Invalid chainId parameter. Must be a positive integer.",
    };
    return res.status(400).json(errorResponse);
  }

  const tokens = getDustTokens(chainId);
  const dustSources = getDustSources(chainId);

  const response: DustTokensResponse = {
    chainId,
    tokens,
    totalCount: tokens.length,
    dustSourceCount: dustSources.length,
  };

  return res.json(response);
});

/**
 * GET /dust/config
 * Returns dust sweep configuration for a chain
 *
 * Query params:
 *   - chainId: number (optional, default 8453)
 *   - consolidation: string (optional, token symbol or address, default "USDC")
 */
app.get("/dust/config", (req: Request, res: Response) => {
  const chainId = parseChainId(req.query.chainId);

  if (chainId === null) {
    const errorResponse: ErrorResponse = {
      error: "Invalid chainId parameter. Must be a positive integer.",
    };
    return res.status(400).json(errorResponse);
  }

  // Parse consolidation parameter (can be symbol or address)
  let consolidationSymbol: string | undefined;
  const consolidationParam = req.query.consolidation as string | undefined;

  if (consolidationParam) {
    // Check if it's an address (starts with 0x)
    if (consolidationParam.startsWith("0x")) {
      const token = getTokenByAddress(chainId, consolidationParam);
      if (!token) {
        const errorResponse: ErrorResponse = {
          error: `Unknown token address: ${consolidationParam}`,
        };
        return res.status(404).json(errorResponse);
      }
      if (!token.isConsolidationTarget) {
        const errorResponse: ErrorResponse = {
          error: `Token ${token.symbol} is not a valid consolidation target`,
        };
        return res.status(400).json(errorResponse);
      }
      consolidationSymbol = token.symbol;
    } else {
      // Treat as symbol
      consolidationSymbol = consolidationParam.toUpperCase();
      if (!isValidConsolidationSymbol(chainId, consolidationSymbol)) {
        const errorResponse: ErrorResponse = {
          error: `Invalid consolidation token: ${consolidationSymbol}. Must be a valid consolidation target (e.g., USDC, WETH).`,
        };
        return res.status(400).json(errorResponse);
      }
    }
  }

  const config = getDustConfig(chainId, consolidationSymbol);

  if (!config) {
    const errorResponse: ErrorResponse = {
      error: `No dust configuration available for chain ${chainId}`,
    };
    return res.status(404).json(errorResponse);
  }

  const consolidationToken = getTokenBySymbol(chainId, config.defaultConsolidationToken);

  if (!consolidationToken) {
    const errorResponse: ErrorResponse = {
      error: "Consolidation token not found",
    };
    return res.status(500).json(errorResponse);
  }

  const response: DustConfigResponse = {
    chainId,
    consolidationToken,
    dustSources: config.trackedDustTokens,
    totalDustSources: config.trackedDustTokens.length,
  };

  return res.json(response);
});

/**
 * GET /dust/summary
 * Returns dust summary for a wallet (STUB - returns mock data)
 *
 * Query params:
 *   - wallet: string (required, 0x address)
 *   - chainId: number (optional, default 8453)
 *   - consolidation: string (optional, token symbol, default "USDC")
 *
 * TODO: Implement real on-chain balance reading in B5+
 */
app.get("/dust/summary", (req: Request, res: Response) => {
  const wallet = req.query.wallet as string | undefined;
  const chainId = parseChainId(req.query.chainId);
  const consolidation = req.query.consolidation as string | undefined;

  // Validate wallet
  if (!wallet) {
    const errorResponse: ErrorResponse = {
      error: "Missing required parameter: wallet",
    };
    return res.status(400).json(errorResponse);
  }

  if (!isValidWallet(wallet)) {
    const errorResponse: ErrorResponse = {
      error: "Invalid wallet address format. Must be 0x followed by 40 hex characters.",
    };
    return res.status(400).json(errorResponse);
  }

  if (chainId === null) {
    const errorResponse: ErrorResponse = {
      error: "Invalid chainId parameter. Must be a positive integer.",
    };
    return res.status(400).json(errorResponse);
  }

  // Validate consolidation token if provided
  if (consolidation && !isValidConsolidationSymbol(chainId, consolidation.toUpperCase())) {
    const errorResponse: ErrorResponse = {
      error: `Invalid consolidation token: ${consolidation}`,
    };
    return res.status(400).json(errorResponse);
  }

  const summary = getDustSummary(wallet, chainId, consolidation?.toUpperCase());

  return res.json(summary);
});

// ============================================================================
// Admin: Live Strategy Cache
// ============================================================================

/**
 * POST /admin/refresh-strategies
 * Force refresh the live strategy cache for a chain
 *
 * Body (optional):
 *   - chainId: number (default 8453)
 *
 * Returns:
 *   - chainId: number
 *   - fetchedAt: ISO date string
 *   - expiresAt: ISO date string
 *   - count: number of strategies cached
 */
app.post("/admin/refresh-strategies", async (req: Request, res: Response) => {
  const chainIdParam = req.body?.chainId;
  const chainId = chainIdParam !== undefined ? parseChainId(chainIdParam) : DEFAULTS.CHAIN_ID;

  if (chainId === null) {
    const errorResponse: ErrorResponse = {
      error: "Invalid chainId. Must be a positive integer.",
    };
    return res.status(400).json(errorResponse);
  }

  try {
    const result = await refreshLiveStrategies(chainId);

    return res.json({
      chainId,
      fetchedAt: result.metadata.fetchedAt.toISOString(),
      expiresAt: result.metadata.expiresAt.toISOString(),
      count: result.strategies.length,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[admin/refresh-strategies] Error:`, message);

    const errorResponse: ErrorResponse = {
      error: `Failed to refresh strategies: ${message}`,
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /admin/cache-status
 * Get the current cache status for a chain
 *
 * Query params:
 *   - chainId: number (optional, default 8453)
 */
app.get("/admin/cache-status", (req: Request, res: Response) => {
  const chainId = parseChainId(req.query.chainId);

  if (chainId === null) {
    const errorResponse: ErrorResponse = {
      error: "Invalid chainId parameter. Must be a positive integer.",
    };
    return res.status(400).json(errorResponse);
  }

  const status = getCacheStatus(chainId);

  if (!status) {
    return res.json({
      chainId,
      cached: false,
      message: "No cache entry exists for this chain",
    });
  }

  return res.json({
    chainId,
    cached: true,
    isFresh: status.isFresh,
    expiresAt: status.expiresAt.toISOString(),
    strategyCount: status.strategyCount,
  });
});

// ============================================================================
// User Send Operations
// ============================================================================

/**
 * POST /ops/prepare-send
 * Prepare a send UserOp (returns unsigned UserOp + hash to sign)
 *
 * Body:
 *   - walletAddress: string (required, smart wallet address)
 *   - recipient: string (required, recipient address)
 *   - amount: string (required, amount in smallest unit)
 *   - token: string (optional, defaults to USDC)
 */
app.post("/ops/prepare-send", async (req: Request, res: Response) => {
  try {
    const { walletAddress, recipient, amount, token } = req.body;

    if (!walletAddress || !recipient || !amount) {
      const errorResponse: ErrorResponse = {
        error: "Missing required fields: walletAddress, recipient, amount",
      };
      return res.status(400).json(errorResponse);
    }

    const result = await prepareUserSendOp(
      walletAddress as Address,
      recipient as Address,
      BigInt(amount),
      (token as Address) || CONTRACTS.USDC
    );

    return res.json(result);
  } catch (error: unknown) {
    console.error("[/ops/prepare-send] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const errorResponse: ErrorResponse = { error: message };
    return res.status(500).json(errorResponse);
  }
});

/**
 * POST /ops/submit-signed
 * Submit a signed UserOp
 *
 * Body:
 *   - userOp: object (required, the UserOp from prepare-send)
 *   - signature: string (required, the user's signature)
 */
app.post("/ops/submit-signed", async (req: Request, res: Response) => {
  try {
    const { userOp, signature } = req.body;

    if (!userOp || !signature) {
      const errorResponse: ErrorResponse = {
        error: "Missing required fields: userOp, signature",
      };
      return res.status(400).json(errorResponse);
    }

    // Attach signature to UserOp
    userOp.signature = signature;

    const result = await submitSignedUserOp(userOp);
    return res.json(result);
  } catch (error: unknown) {
    console.error("[/ops/submit-signed] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const errorResponse: ErrorResponse = { error: message };
    return res.status(500).json(errorResponse);
  }
});

// ============================================================================
// Error handling
// ============================================================================

// 404 handler
app.use((_req: Request, res: Response) => {
  const errorResponse: ErrorResponse = {
    error: "Endpoint not found",
  };
  res.status(404).json(errorResponse);
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  const errorResponse: ErrorResponse = {
    error: "Internal server error",
  };
  res.status(500).json(errorResponse);
});

// ============================================================================
// Server startup
// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           AutoYield Backend API                           ║
║           Yield Strategy Aggregator                       ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                 ║
╠═══════════════════════════════════════════════════════════╣
║  Endpoints:                                               ║
║    GET  /health              - Health check               ║
║    GET  /strategies          - List strategies by token   ║
║    GET  /recommend           - Best strategy (highest APY)║
║    GET  /recommendations     - Strategies by prefs (B2)   ║
║    GET  /tokens              - Available tokens on chain  ║
║    GET  /chains              - Supported chain IDs        ║
║  Wallet Registry:                                         ║
║    POST /register            - Register a new wallet      ║
║    GET  /wallets             - List registered wallets    ║
║    GET  /wallet/:address     - Get wallet details         ║
║    GET  /wallet/:address/summary - Dashboard summary      ║
║    GET  /wallet/:address/settings - Get wallet settings   ║
║    POST /wallet/:address/settings - Update settings       ║
║  Scheduler (B3):                                          ║
║    GET  /rebalance-tasks     - List all tasks             ║
║    POST /rebalance-tasks     - Create a task              ║
║    POST /rebalance-tasks/:id/run - Trigger task manually  ║
║    DELETE /rebalance-tasks/:id   - Remove a task          ║
║  Dust Service (B4):                                       ║
║    GET  /dust/tokens         - List dust tokens           ║
║    GET  /dust/config         - Get dust sweep config      ║
║    GET  /dust/summary        - Wallet dust summary (stub) ║
║  Admin:                                                   ║
║    POST /admin/refresh-strategies - Refresh strategy cache║
║    GET  /admin/cache-status  - Check cache status         ║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Start the scheduler
  const rpcUrl = process.env.BASE_RPC_URL;
  startScheduler({
    tickIntervalMs: 30 * 1000,           // Task-based scheduling: 30 seconds
    registryCheckIntervalMs: 10 * 1000,  // Registry wallet checks: 10 seconds
    rpcUrl,                               // For on-chain reads (optional)
  });

  if (!rpcUrl) {
    console.log("⚠️  BASE_RPC_URL not set - registry wallet checks disabled");
    console.log("   Set BASE_RPC_URL to enable automatic rebalance detection");
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, stopping scheduler...");
  stopScheduler();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, stopping scheduler...");
  stopScheduler();
  process.exit(0);
});

export default app;
