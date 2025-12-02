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
 * Response shape for GET /strategies endpoint
 */
export type StrategiesResponse = {
  token: string;
  chainId: number;
  strategies: Strategy[];
};

/**
 * Response shape for GET /recommend endpoint
 */
export type RecommendResponse = {
  token: string;
  chainId: number;
  strategy: Strategy;
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
  message: string;
  timestamp: Date;
  // TODO (B5): Add userOp hash when bundler integration is complete
  // userOpHash?: string;
};
