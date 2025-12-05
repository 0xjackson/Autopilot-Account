/**
 * Core types for the AutoYield Backend API
 */

/**
 * Risk tier for yield strategies
 * - low: Established protocols, audited, low IL risk (e.g., Aave, Compound)
 * - med: Newer protocols or moderate IL exposure
 * - high: Experimental protocols, high IL, or unaudited
 */
export type RiskTier = "low" | "med" | "high";

/**
 * Represents a yield strategy/vault that users can deposit into
 */
export type Strategy = {
  /** Unique identifier for the strategy, e.g. "aave-usdc-base" */
  id: string;

  /** Chain ID where the strategy exists (8453 for Base mainnet, 84532 for Base Sepolia) */
  chainId: number;

  /** Token symbol that can be deposited, e.g. "USDC", "WETH" */
  token: string;

  /** Contract address of the underlying token */
  tokenAddress: string;

  /** Contract address of the vault/strategy where funds are deposited */
  vaultAddress: string;

  /**
   * Contract address of the IYieldAdapter that wraps this vault
   * Used by AutoYieldModule to interact with the underlying protocol
   * NOTE: Placeholder addresses (0xAdapter...) until real adapters are deployed
   */
  adapterAddress?: string;

  /** Human-readable name of the protocol, e.g. "Aave", "Moonwell" */
  protocolName: string;

  /** Annual Percentage Yield as a decimal (e.g., 0.15 = 15% APY) */
  apy: number;

  /** Risk classification for the strategy */
  riskTier?: RiskTier;

  /** Whether the strategy is currently accepting deposits */
  isActive: boolean;
};

/**
 * Data source for strategy data
 * - "live": Fetched from real protocol APIs (Morpho, Aave, Moonwell)
 * - "mock": Static fallback data from strategies.ts
 */
export type DataSource = "live" | "mock";

/**
 * Metadata about strategy data freshness
 */
export type StrategyMetadata = {
  dataSource: DataSource;
  fetchedAt?: string;
  expiresAt?: string;
};

/**
 * Response shape for GET /strategies endpoint
 */
export type StrategiesResponse = {
  token: string;
  chainId: number;
  strategies: Strategy[];
  metadata: StrategyMetadata;
};

/**
 * Response shape for GET /recommend endpoint
 */
export type RecommendResponse = {
  token: string;
  chainId: number;
  strategy: Strategy;
  metadata: StrategyMetadata;
};

/**
 * Error response shape
 */
export type ErrorResponse = {
  error: string;
};

// ============================================================================
// B2: Strategy selector with risk scoring
// ============================================================================

/**
 * User preferences for strategy selection
 * Used to filter and rank strategies based on risk tolerance and minimum APY
 */
export type StrategyPreferences = {
  /** Maximum risk level the user is willing to accept */
  riskTolerance: RiskTier;
  /** Minimum acceptable APY as a decimal (e.g., 0.05 = 5%) */
  minApy: number;
  // TODO: Add more preference fields for future enhancements
  // preferredProtocols?: string[];
  // excludedProtocols?: string[];
  // maxAllocationPerProtocol?: number;
};

/**
 * A strategy with its computed recommendation score
 */
export type ScoredStrategy = Strategy & {
  /** Computed score based on APY and risk (higher is better) */
  score: number;
};

/**
 * Response shape for GET /recommendations endpoint
 * Returns both the best strategy and all matching strategies
 */
export type RecommendationsResponse = {
  token: string;
  chainId: number;
  preferences: StrategyPreferences;
  /** The single best strategy based on score (null if none match) */
  bestStrategy: ScoredStrategy | null;
  /** All strategies matching preferences, sorted by score descending */
  strategies: ScoredStrategy[];
  /** Total number of strategies before filtering */
  totalAvailable: number;
  /** Metadata about data source and freshness */
  metadata: StrategyMetadata;
};

// TODO: Future types for wallet-specific preferences (B2+)
// export type WalletPreferences = {
//   walletAddress: string;
//   preferences: StrategyPreferences;
//   createdAt: Date;
//   updatedAt: Date;
// };

// TODO: Future types for real APY fetching
// export type ApySource = {
//   source: "defillama" | "protocol_api" | "onchain";
//   lastUpdated: Date;
//   confidence: number;
// };

// ============================================================================
// B3: Auto-rebalance scheduler
// ============================================================================

/**
 * Status of a rebalance task
 */
export type TaskStatus = "idle" | "running" | "completed" | "error";

/**
 * Type of action the scheduler can perform
 */
export type TaskAction = "rebalance" | "flushToChecking" | "sweepDust";

/**
 * A scheduled rebalance task for a wallet
 */
export type RebalanceTask = {
  /** Unique task identifier */
  id: string;
  /** Wallet address to rebalance (0x...) */
  wallet: string;
  /** Token to manage (e.g., "USDC") */
  token: string;
  /** Chain ID (e.g., 8453 for Base) */
  chainId: number;
  /** Preferred strategy ID (optional, uses best if not set) */
  preferredStrategyId?: string;
  /** Risk tolerance for strategy selection */
  riskTolerance: RiskTier;
  /** Interval between runs in milliseconds */
  intervalMs: number;
  /** Action to perform */
  action: TaskAction;
  /** Current task status */
  status: TaskStatus;
  /** Timestamp of last execution */
  lastRunAt?: Date;
  /** Timestamp of next scheduled execution */
  nextRunAt?: Date;
  /** Last error message if status is "error" */
  lastError?: string;
  /** Number of consecutive errors */
  errorCount: number;
  /** Task creation timestamp */
  createdAt: Date;
  /** Whether the task is enabled */
  enabled: boolean;
};

/**
 * Input for creating a new rebalance task
 */
export type RebalanceTaskInput = {
  wallet: string;
  token?: string;
  chainId?: number;
  preferredStrategyId?: string;
  riskTolerance?: RiskTier;
  intervalMs?: number;
  action?: TaskAction;
};

/**
 * Response for GET /rebalance-tasks
 */
export type RebalanceTasksResponse = {
  tasks: RebalanceTask[];
  schedulerStatus: SchedulerStatus;
};

/**
 * Response for single task operations
 */
export type RebalanceTaskResponse = {
  task: RebalanceTask;
  message?: string;
};

/**
 * Scheduler status information
 */
export type SchedulerStatus = {
  isRunning: boolean;
  bundlerEnabled: boolean;
  tickIntervalMs: number;
  taskCount: number;
  lastTickAt?: Date;
  nextTickAt?: Date;
};

/**
 * Result of a task execution
 */
export type TaskExecutionResult = {
  taskId: string;
  success: boolean;
  strategyUsed?: string;
  strategyScore?: number;
  adapterUsed?: string;
  message: string;
  timestamp: Date;
  userOpHash?: string;
  txHash?: string;
};

// ============================================================================
// B4: Dust token metadata service
// ============================================================================

/**
 * Suggested action for handling a dust token
 */
export type DustAction = "swap" | "hold" | "ignore";

/**
 * Metadata for a token that may be treated as "dust"
 */
export type DustTokenMeta = {
  /** Chain ID where this token exists */
  chainId: number;
  /** Token contract address */
  tokenAddress: string;
  /** Token symbol (e.g., "DEGEN", "AERO") */
  symbol: string;
  /** Human-readable token name */
  name: string;
  /** Token decimals (usually 18, but varies) */
  decimals: number;
  /** Whether this token is treated as a dust source (small balance to sweep) */
  isDustSource: boolean;
  /** Suggested action: swap to consolidation, hold, or ignore */
  suggestedAction: DustAction;
  /** Token address to consolidate into (e.g., USDC address) */
  consolidationTarget?: string;
  /** Optional notes about the token */
  notes?: string;
  /** Whether this token can be used as a consolidation target */
  isConsolidationTarget?: boolean;
  /** Minimum balance (in token units) below which it's considered dust */
  dustThreshold?: number;
};

/**
 * Configuration for dust sweeping operations
 */
export type DustConfig = {
  /** Chain ID */
  chainId: number;
  /** Default consolidation token symbol */
  defaultConsolidationToken: string;
  /** Default consolidation token address */
  defaultConsolidationAddress: string;
  /** List of tokens being tracked as dust sources */
  trackedDustTokens: DustTokenMeta[];
  /** Available consolidation targets */
  consolidationTargets: DustTokenMeta[];
};

/**
 * Response for GET /dust/tokens endpoint
 */
export type DustTokensResponse = {
  chainId: number;
  tokens: DustTokenMeta[];
  totalCount: number;
  dustSourceCount: number;
};

/**
 * Response for GET /dust/config endpoint
 */
export type DustConfigResponse = {
  chainId: number;
  consolidationToken: DustTokenMeta;
  dustSources: DustTokenMeta[];
  totalDustSources: number;
};

/**
 * Mock balance for dust summary (future: real on-chain data)
 */
export type DustBalance = {
  token: DustTokenMeta;
  balance: string;
  balanceUsd?: number;
  isDust: boolean;
};

/**
 * Response for GET /dust/summary endpoint (stub for now)
 */
export type DustSummaryResponse = {
  wallet: string;
  chainId: number;
  consolidationToken: string;
  dustBalances: DustBalance[];
  totalDustValueUsd?: number;
  note: string;
};

// ============================================================================
// Wallet Summary (Dashboard)
// ============================================================================

/**
 * Current strategy info for a wallet
 */
export type CurrentStrategyInfo = {
  /** Strategy ID (e.g., "morpho-usdc-base") */
  id: string;
  /** Protocol name (e.g., "Morpho", "Aave") */
  protocol: string;
  /** Strategy name (e.g., "Steakhouse USDC") */
  name: string;
  /** Current APY as decimal (e.g., 0.0567 = 5.67%) */
  apy: number;
  /** Vault address */
  vaultAddress: string;
  /** Adapter address */
  adapterAddress?: string;
};

/**
 * Response for GET /wallet/:address/summary endpoint
 * Provides dashboard data for a wallet including strategy info
 */
export type WalletSummaryResponse = {
  /** Smart wallet address */
  wallet: string;
  /** Owner EOA address (if registered) */
  owner?: string;
  /** Chain ID */
  chainId: number;
  /** Whether the wallet is registered for automation */
  isRegistered: boolean;
  /** Current strategy info (if yield is active) */
  currentStrategy?: CurrentStrategyInfo;
  /** Timestamp when data was fetched */
  fetchedAt: string;
  /** Data source/freshness info */
  metadata: StrategyMetadata;
};

// ============================================================================
// Wallet Settings
// ============================================================================

/**
 * Token-specific yield configuration
 */
export type TokenYieldConfig = {
  enabled: boolean;
};

/**
 * Auto-yield token configuration for supported tokens
 */
export type AutoYieldTokens = {
  USDC: TokenYieldConfig;
  WETH: TokenYieldConfig;
};

/**
 * Allowed consolidation tokens for dust sweep
 */
export type DustConsolidationToken = "USDC" | "WETH" | "ETH";

/**
 * Allowed yield strategy identifiers
 */
export type YieldStrategyId = "aerodrome" | "beefy" | "mock" | "morpho";

/**
 * Wallet settings - user preferences for automation
 */
export type WalletSettings = {
  /** Minimum USDC to keep in checking (as string for precision) */
  checkingThreshold: string;
  /** Per-token yield enablement */
  autoYieldTokens: AutoYieldTokens;
  /** Token to consolidate dust into */
  dustConsolidationToken: DustConsolidationToken;
  /** Whether dust sweep is enabled */
  dustSweepEnabled: boolean;
  /** Minimum USD value to consider as dust (as string for precision) */
  dustThreshold: string;
  /** Risk tolerance 1-5 (1=very low, 5=very high) */
  riskTolerance: number;
  /** Selected yield strategy identifier */
  yieldStrategy: YieldStrategyId | string;
};

/**
 * Default settings for new wallets
 */
export const DEFAULT_WALLET_SETTINGS: WalletSettings = {
  checkingThreshold: "100",
  autoYieldTokens: {
    USDC: { enabled: true },
    WETH: { enabled: false },
  },
  dustConsolidationToken: "USDC",
  dustSweepEnabled: true,
  dustThreshold: "1.00",
  riskTolerance: 3,
  yieldStrategy: "morpho",
};

/**
 * Allowed values for validation
 */
export const ALLOWED_CONSOLIDATION_TOKENS: DustConsolidationToken[] = ["USDC", "WETH", "ETH"];
export const ALLOWED_YIELD_STRATEGIES: string[] = ["aerodrome", "beefy", "mock", "morpho"];

/**
 * Response for GET /wallet/:address/settings
 */
export type WalletSettingsResponse = {
  wallet: string;
  settings: WalletSettings;
  updatedAt?: string;
};

/**
 * Request body for POST /wallet/:address/settings
 */
export type WalletSettingsInput = Partial<WalletSettings>;

/**
 * Validation error detail
 */
export type ValidationError = {
  field: string;
  message: string;
};

/**
 * Response for validation errors
 */
export type ValidationErrorResponse = {
  error: string;
  validationErrors: ValidationError[];
};
