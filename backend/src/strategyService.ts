import { Strategy, RiskTier, ScoredStrategy, StrategyPreferences, DataSource, StrategyMetadata } from "./types";
import { strategies as mockStrategies, CHAIN_IDS } from "./strategies";
import { getCachedStrategies, getExecutableStrategies, LiveStrategyResult } from "./liveStrategyStore";
import { Vault } from "./yieldAggregator";
import { getAdapterAddress, ProtocolSource } from "./config/adapterAddresses";

/**
 * Default values for API parameters
 */
export const DEFAULTS = {
  TOKEN: "USDC",
  CHAIN_ID: CHAIN_IDS.BASE_MAINNET,
  RISK_TOLERANCE: "med" as RiskTier,
  MIN_APY: 0,
} as const;

/**
 * Convert a Vault from yieldAggregator to a Strategy
 */
function vaultToStrategy(vault: Vault): Strategy {
  // Determine risk tier based on source
  let riskTier: RiskTier = "med";
  if (vault.source === "aave" || vault.source === "moonwell") {
    riskTier = "low";
  } else if (vault.source === "morpho") {
    // Morpho vaults can vary - use TVL as a heuristic
    riskTier = vault.tvlUsd > 1_000_000 ? "low" : "med";
  }

  // Get the adapter address for this protocol/asset combination
  const adapterAddress = getAdapterAddress(
    vault.chainId,
    vault.source as ProtocolSource,
    vault.underlyingAsset
  );

  return {
    id: `${vault.source}-${vault.symbol}-${vault.chainId}`.toLowerCase(),
    chainId: vault.chainId,
    token: vault.underlyingAsset,
    tokenAddress: vault.underlyingAssetAddress,
    vaultAddress: vault.address,
    adapterAddress,
    protocolName: vault.source.charAt(0).toUpperCase() + vault.source.slice(1),
    apy: vault.apy,
    riskTier,
    isActive: true,
  };
}

/**
 * Risk tier ordering for comparison
 * Lower number = lower risk
 */
export const RISK_ORDER: Record<RiskTier, number> = {
  low: 1,
  med: 2,
  high: 3,
};

/**
 * Risk penalty applied per risk level when scoring strategies
 * Higher risk strategies get penalized more in the score calculation
 */
const RISK_PENALTY_PER_LEVEL = 2;

/**
 * Result type for strategy fetch operations
 */
export interface StrategyFetchResult {
  strategies: Strategy[];
  metadata: StrategyMetadata;
}

/**
 * Get mock strategies as fallback
 */
function getMockStrategiesForToken(token: string, chainId: number): Strategy[] {
  const normalizedToken = token.toUpperCase();
  return mockStrategies
    .filter(
      (s) =>
        s.token.toUpperCase() === normalizedToken &&
        s.chainId === chainId &&
        s.isActive
    )
    .sort((a, b) => b.apy - a.apy);
}

/**
 * Get all active strategies for a given token and chain, sorted by APY descending
 *
 * Fetches live data from protocol APIs with fallback to mock data if unavailable.
 *
 * @param token - Token symbol (case-insensitive), e.g. "USDC"
 * @param chainId - Chain ID, e.g. 8453 for Base mainnet
 * @returns Object with strategies array and metadata about data source
 */
export async function getStrategiesForToken(
  token: string,
  chainId: number
): Promise<StrategyFetchResult> {
  const normalizedToken = token.toUpperCase();

  try {
    // Try to get live data
    const liveResult = await getCachedStrategies(chainId);

    // Convert vaults to strategies and filter by token
    const liveStrategies = liveResult.strategies
      .filter((v) => v.underlyingAsset.toUpperCase() === normalizedToken)
      .map(vaultToStrategy)
      .sort((a, b) => b.apy - a.apy);

    // If we got live data, return it
    if (liveStrategies.length > 0) {
      console.log(
        `[strategyService] Using live data: ${liveStrategies.length} strategies for ${token} on chain ${chainId}`
      );
      return {
        strategies: liveStrategies,
        metadata: {
          dataSource: "live",
          fetchedAt: liveResult.metadata.fetchedAt.toISOString(),
          expiresAt: liveResult.metadata.expiresAt.toISOString(),
        },
      };
    }

    // Live returned empty - fall back to mock
    console.warn(
      `[strategyService] Live data empty for ${token} on chain ${chainId}, falling back to mock`
    );
  } catch (error) {
    // Live fetch failed - fall back to mock
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[strategyService] Live fetch failed for chain ${chainId}: ${message}, falling back to mock`
    );
  }

  // Return mock data as fallback
  const mockData = getMockStrategiesForToken(normalizedToken, chainId);
  console.log(
    `[strategyService] Using mock data: ${mockData.length} strategies for ${token} on chain ${chainId}`
  );

  return {
    strategies: mockData,
    metadata: {
      dataSource: "mock",
    },
  };
}

/**
 * Result type for best strategy fetch
 */
export interface BestStrategyResult {
  strategy: Strategy | undefined;
  metadata: StrategyMetadata;
}

/**
 * Get the single best (highest APY) strategy for a given token and chain
 *
 * Fetches live data from protocol APIs with fallback to mock data if unavailable.
 *
 * @param token - Token symbol (case-insensitive), e.g. "USDC"
 * @param chainId - Chain ID, e.g. 8453 for Base mainnet
 * @returns Object with best strategy and metadata about data source
 */
export async function getBestStrategy(
  token: string,
  chainId: number
): Promise<BestStrategyResult> {
  const result = await getStrategiesForToken(token, chainId);
  return {
    strategy: result.strategies.length > 0 ? result.strategies[0] : undefined,
    metadata: result.metadata,
  };
}

/**
 * Get all unique tokens that have active strategies on a given chain
 * Uses mock data as the authoritative list of supported tokens
 *
 * @param chainId - Chain ID to filter by
 * @returns Array of unique token symbols
 */
export function getAvailableTokens(chainId: number): string[] {
  const tokens = new Set<string>();
  mockStrategies
    .filter((s) => s.chainId === chainId && s.isActive)
    .forEach((s) => tokens.add(s.token));
  return Array.from(tokens);
}

/**
 * Get all supported chain IDs that have active strategies
 * Uses mock data as the authoritative list of supported chains
 *
 * @returns Array of unique chain IDs
 */
export function getSupportedChainIds(): number[] {
  const chainIds = new Set<number>();
  mockStrategies.filter((s) => s.isActive).forEach((s) => chainIds.add(s.chainId));
  return Array.from(chainIds);
}

// ============================================================================
// B2: Strategy selector with risk scoring
// ============================================================================

/**
 * Calculate a score for a strategy based on APY and risk
 * Score formula: APY (as percentage) - (risk_level * penalty)
 *
 * Examples:
 * - 15% APY, high risk (3): 15 - (3 * 2) = 9
 * - 7.8% APY, low risk (1): 7.8 - (1 * 2) = 5.8
 * - 5.2% APY, low risk (1): 5.2 - (1 * 2) = 3.2
 *
 * This means a high-risk 15% APY strategy scores similar to a low-risk ~9% strategy
 *
 * @param strategy - The strategy to score
 * @returns Numeric score (higher is better)
 */
export function calculateStrategyScore(strategy: Strategy): number {
  const riskLevel = RISK_ORDER[strategy.riskTier || "high"];
  const apyPercentage = strategy.apy * 100; // Convert 0.15 to 15
  return apyPercentage - riskLevel * RISK_PENALTY_PER_LEVEL;
}

/**
 * Check if a strategy's risk tier is within the user's tolerance
 *
 * @param strategyRisk - The strategy's risk tier
 * @param tolerance - User's maximum acceptable risk
 * @returns true if strategy risk <= tolerance
 */
export function isWithinRiskTolerance(
  strategyRisk: RiskTier | undefined,
  tolerance: RiskTier
): boolean {
  const strategyRiskLevel = RISK_ORDER[strategyRisk || "high"];
  const toleranceLevel = RISK_ORDER[tolerance];
  return strategyRiskLevel <= toleranceLevel;
}

/**
 * Result type for recommended strategies fetch
 */
export interface RecommendedStrategiesResult {
  strategies: ScoredStrategy[];
  bestStrategy: ScoredStrategy | null;
  totalAvailable: number;
  metadata: StrategyMetadata;
}

/**
 * Get recommended strategies filtered by user preferences and scored
 *
 * Fetches live data from protocol APIs with fallback to mock data if unavailable.
 *
 * @param token - Token symbol (case-insensitive), e.g. "USDC"
 * @param chainId - Chain ID, e.g. 8453 for Base mainnet
 * @param riskTolerance - Maximum risk level user will accept
 * @param minApy - Minimum acceptable APY as decimal (e.g., 0.05 for 5%)
 * @returns Object with scored strategies sorted by score, best strategy, and metadata
 */
export async function getRecommendedStrategies(
  token: string,
  chainId: number,
  riskTolerance: RiskTier = DEFAULTS.RISK_TOLERANCE,
  minApy: number = DEFAULTS.MIN_APY
): Promise<RecommendedStrategiesResult> {
  // Get all active strategies for this token/chain
  const fetchResult = await getStrategiesForToken(token, chainId);
  const allStrategies = fetchResult.strategies;
  const totalAvailable = allStrategies.length;

  // Filter by risk tolerance and minimum APY
  const filtered = allStrategies.filter(
    (s) => isWithinRiskTolerance(s.riskTier, riskTolerance) && s.apy >= minApy
  );

  // Score and sort strategies
  const scored: ScoredStrategy[] = filtered
    .map((s) => ({
      ...s,
      score: calculateStrategyScore(s),
    }))
    .sort((a, b) => b.score - a.score); // Sort by score descending

  return {
    strategies: scored,
    bestStrategy: scored.length > 0 ? scored[0] : null,
    totalAvailable,
    metadata: fetchResult.metadata,
  };
}

/**
 * Validate that a string is a valid RiskTier
 */
export function isValidRiskTier(value: string): value is RiskTier {
  return value === "low" || value === "med" || value === "high";
}

// =============================================================================
// Executable Strategies (Morpho-only for scheduler)
// =============================================================================

/**
 * Get recommended strategies limited to protocols with deployed adapters.
 * Currently only Morpho has adapters, so this filters to Morpho-only strategies.
 * Used by the scheduler for actual execution; UI endpoints use getRecommendedStrategies.
 *
 * @param token - Token symbol (case-insensitive), e.g. "USDC"
 * @param chainId - Chain ID, e.g. 8453 for Base mainnet
 * @param riskTolerance - Maximum risk level user will accept
 * @param minApy - Minimum acceptable APY as decimal (e.g., 0.05 for 5%)
 * @returns Object with scored Morpho-only strategies
 */
export async function getExecutableRecommendedStrategies(
  token: string,
  chainId: number,
  riskTolerance: RiskTier = DEFAULTS.RISK_TOLERANCE,
  minApy: number = DEFAULTS.MIN_APY
): Promise<RecommendedStrategiesResult> {
  const normalizedToken = token.toUpperCase();

  try {
    // Get executable strategies only (Morpho for now)
    const liveResult = await getExecutableStrategies(chainId);

    // Convert vaults to strategies and filter by token
    const liveStrategies = liveResult.strategies
      .filter((v) => v.underlyingAsset.toUpperCase() === normalizedToken)
      .map(vaultToStrategy);

    const totalAvailable = liveStrategies.length;

    // Filter by risk tolerance and minimum APY
    const filtered = liveStrategies.filter(
      (s) => isWithinRiskTolerance(s.riskTier, riskTolerance) && s.apy >= minApy
    );

    // Score and sort strategies
    const scored: ScoredStrategy[] = filtered
      .map((s) => ({
        ...s,
        score: calculateStrategyScore(s),
      }))
      .sort((a, b) => b.score - a.score);

    console.log(
      `[strategyService] Executable strategies (Morpho-only): ${scored.length} for ${token} on chain ${chainId}`
    );

    return {
      strategies: scored,
      bestStrategy: scored.length > 0 ? scored[0] : null,
      totalAvailable,
      metadata: {
        dataSource: "live",
        fetchedAt: liveResult.metadata.fetchedAt.toISOString(),
        expiresAt: liveResult.metadata.expiresAt.toISOString(),
      },
    };
  } catch (error) {
    // Fallback to mock Morpho-only strategies
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[strategyService] Executable strategies fetch failed: ${message}, falling back to mock`
    );

    // Filter mock strategies to Morpho-like protocols only
    const mockExecutable = mockStrategies.filter(
      (s) =>
        s.token.toUpperCase() === normalizedToken &&
        s.chainId === chainId &&
        s.isActive &&
        s.protocolName.toLowerCase().includes("morpho")
    );

    const filtered = mockExecutable.filter(
      (s) => isWithinRiskTolerance(s.riskTier, riskTolerance) && s.apy >= minApy
    );

    const scored: ScoredStrategy[] = filtered
      .map((s) => ({
        ...s,
        score: calculateStrategyScore(s),
      }))
      .sort((a, b) => b.score - a.score);

    return {
      strategies: scored,
      bestStrategy: scored.length > 0 ? scored[0] : null,
      totalAvailable: mockExecutable.length,
      metadata: { dataSource: "mock" },
    };
  }
}

// TODO: Future implementation for wallet-specific preferences
// export async function getWalletPreferences(
//   walletAddress: string
// ): Promise<StrategyPreferences | null> {
//   // Fetch user preference profile from DB using wallet address
//   // For now, return null to use defaults
//   console.log(`getWalletPreferences called for ${walletAddress} - not yet implemented`);
//   return null;
// }

// TODO: Future implementation for saving wallet preferences
// export async function saveWalletPreferences(
//   walletAddress: string,
//   preferences: StrategyPreferences
// ): Promise<void> {
//   // Save user preferences to DB
//   console.log(`saveWalletPreferences called for ${walletAddress} - not yet implemented`);
// }

// ============================================================================
// TODO: Future implementations for real APY fetching
// ============================================================================

/**
 * TODO: Fetch real APY data from external sources and update strategy records
 *
 * This function would be called periodically (e.g., via cron/scheduler in B3)
 * to keep APY values fresh.
 *
 * Sources to integrate:
 * - DeFiLlama API: https://yields.llama.fi/pools
 * - Protocol-specific APIs (Aave, Moonwell, Compound)
 * - On-chain rate calculations
 */
// export async function refreshApyForAllStrategies(): Promise<void> {
//   // Example DeFiLlama integration:
//   // const response = await fetch("https://yields.llama.fi/pools");
//   // const pools = await response.json();
//   //
//   // for (const strategy of strategies) {
//   //   const match = pools.data.find(
//   //     (p: any) =>
//   //       p.chain === "Base" &&
//   //       p.project === strategy.protocolName.toLowerCase() &&
//   //       p.symbol.includes(strategy.token)
//   //   );
//   //   if (match) {
//   //     strategy.apy = match.apy / 100; // DeFiLlama returns percentage
//   //   }
//   // }
//   console.log("refreshApyForAllStrategies() called - not yet implemented");
// }

/**
 * TODO: Fetch APY for a single strategy from its specific protocol
 */
// export async function fetchApyForStrategy(strategyId: string): Promise<number> {
//   const strategy = strategies.find((s) => s.id === strategyId);
//   if (!strategy) throw new Error(`Strategy not found: ${strategyId}`);
//
//   // Protocol-specific fetching logic would go here
//   // e.g., for Aave: query their subgraph or on-chain rates
//   // e.g., for Moonwell: use their API or read from contracts
//
//   return strategy.apy; // For now, return mocked value
// }
