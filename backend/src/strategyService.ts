import { Strategy, RiskTier, ScoredStrategy, StrategyPreferences } from "./types";
import { strategies, CHAIN_IDS } from "./strategies";

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
 * Get all active strategies for a given token and chain, sorted by APY descending
 *
 * @param token - Token symbol (case-insensitive), e.g. "USDC"
 * @param chainId - Chain ID, e.g. 8453 for Base mainnet
 * @returns Array of strategies sorted by APY (highest first)
 */
export function getStrategiesForToken(
  token: string,
  chainId: number
): Strategy[] {
  const normalizedToken = token.toUpperCase();

  return strategies
    .filter(
      (s) =>
        s.token.toUpperCase() === normalizedToken &&
        s.chainId === chainId &&
        s.isActive
    )
    .sort((a, b) => b.apy - a.apy); // Sort by APY descending
}

/**
 * Get the single best (highest APY) strategy for a given token and chain
 *
 * @param token - Token symbol (case-insensitive), e.g. "USDC"
 * @param chainId - Chain ID, e.g. 8453 for Base mainnet
 * @returns The highest APY strategy, or undefined if none found
 */
export function getBestStrategy(
  token: string,
  chainId: number
): Strategy | undefined {
  const sorted = getStrategiesForToken(token, chainId);
  return sorted.length > 0 ? sorted[0] : undefined;
}

/**
 * Get all unique tokens that have active strategies on a given chain
 *
 * @param chainId - Chain ID to filter by
 * @returns Array of unique token symbols
 */
export function getAvailableTokens(chainId: number): string[] {
  const tokens = new Set<string>();
  strategies
    .filter((s) => s.chainId === chainId && s.isActive)
    .forEach((s) => tokens.add(s.token));
  return Array.from(tokens);
}

/**
 * Get all supported chain IDs that have active strategies
 *
 * @returns Array of unique chain IDs
 */
export function getSupportedChainIds(): number[] {
  const chainIds = new Set<number>();
  strategies.filter((s) => s.isActive).forEach((s) => chainIds.add(s.chainId));
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
 * Get recommended strategies filtered by user preferences and scored
 *
 * @param token - Token symbol (case-insensitive), e.g. "USDC"
 * @param chainId - Chain ID, e.g. 8453 for Base mainnet
 * @param riskTolerance - Maximum risk level user will accept
 * @param minApy - Minimum acceptable APY as decimal (e.g., 0.05 for 5%)
 * @returns Object with scored strategies sorted by score, best strategy, and metadata
 */
export function getRecommendedStrategies(
  token: string,
  chainId: number,
  riskTolerance: RiskTier = DEFAULTS.RISK_TOLERANCE,
  minApy: number = DEFAULTS.MIN_APY
): {
  strategies: ScoredStrategy[];
  bestStrategy: ScoredStrategy | null;
  totalAvailable: number;
} {
  // Get all active strategies for this token/chain
  const allStrategies = getStrategiesForToken(token, chainId);
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
  };
}

/**
 * Validate that a string is a valid RiskTier
 */
export function isValidRiskTier(value: string): value is RiskTier {
  return value === "low" || value === "med" || value === "high";
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
