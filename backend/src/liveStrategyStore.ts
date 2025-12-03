/**
 * Live Strategy Store
 *
 * Caching layer for live yield vault data from yieldAggregator.
 * Caches results by chainId with a 5-minute TTL to avoid hammering external APIs.
 */

import { getBestVaults, Vault, VaultFetchResult } from "./yieldAggregator";

// =============================================================================
// Configuration
// =============================================================================

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Default chain ID (Base mainnet) */
const DEFAULT_CHAIN_ID = 8453;

// =============================================================================
// Types
// =============================================================================

/**
 * Metadata about a cache entry
 */
export interface CacheMetadata {
  /** Source of the data */
  dataSource: "live";
  /** When the data was fetched */
  fetchedAt: Date;
  /** When the cache entry expires */
  expiresAt: Date;
}

/**
 * Result returned from the live strategy store
 */
export interface LiveStrategyResult {
  /** Cached vault strategies */
  strategies: Vault[];
  /** Cache metadata */
  metadata: CacheMetadata;
  /** Any errors encountered during fetch */
  errors: string[];
}

/**
 * Internal cache entry structure
 */
interface CacheEntry {
  result: LiveStrategyResult;
  expiresAt: Date;
}

// =============================================================================
// Cache Store
// =============================================================================

/** In-memory cache keyed by chainId */
const cache = new Map<number, CacheEntry>();

/**
 * Check if a cache entry is still valid (not expired)
 */
function isCacheValid(entry: CacheEntry): boolean {
  return new Date() < entry.expiresAt;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Force a fresh fetch of strategies and update the cache
 *
 * @param chainId - Chain ID to fetch strategies for (default: 8453 Base)
 * @returns Fresh strategy data with metadata
 * @throws Error if the fetch fails completely
 */
export async function refreshLiveStrategies(
  chainId: number = DEFAULT_CHAIN_ID
): Promise<LiveStrategyResult> {
  console.log(
    `[liveStrategyStore] Refreshing strategies for chain ${chainId}...`
  );

  const fetchedAt = new Date();

  // Fetch from all sources via yieldAggregator
  let fetchResult: VaultFetchResult;
  try {
    fetchResult = await getBestVaults({
      chainId,
      assetSymbol: "USDC",
      excludeWarnings: true,
      minTvlUsd: 100000, // 100k minimum TVL
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown fetch error";
    console.error(`[liveStrategyStore] Fetch failed for chain ${chainId}:`, message);
    throw new Error(`Failed to fetch strategies for chain ${chainId}: ${message}`);
  }

  // If we got zero vaults AND there were errors, that's a problem
  if (fetchResult.vaults.length === 0 && fetchResult.errors.length > 0) {
    const errorSummary = fetchResult.errors.join("; ");
    console.error(
      `[liveStrategyStore] All sources failed for chain ${chainId}:`,
      errorSummary
    );
    throw new Error(`All yield sources failed for chain ${chainId}: ${errorSummary}`);
  }

  const expiresAt = new Date(fetchedAt.getTime() + CACHE_TTL_MS);

  const result: LiveStrategyResult = {
    strategies: fetchResult.vaults,
    metadata: {
      dataSource: "live",
      fetchedAt,
      expiresAt,
    },
    errors: fetchResult.errors,
  };

  // Store in cache
  cache.set(chainId, {
    result,
    expiresAt,
  });

  console.log(
    `[liveStrategyStore] Cached ${result.strategies.length} strategies for chain ${chainId} (expires: ${expiresAt.toISOString()})`
  );

  return result;
}

/**
 * Get cached strategies, refreshing if stale or missing
 *
 * @param chainId - Chain ID to get strategies for (default: 8453 Base)
 * @returns Cached or fresh strategy data
 * @throws Error if refresh fails when cache is stale
 */
export async function getCachedStrategies(
  chainId: number = DEFAULT_CHAIN_ID
): Promise<LiveStrategyResult> {
  const entry = cache.get(chainId);

  // Cache hit and still valid
  if (entry && isCacheValid(entry)) {
    console.log(
      `[liveStrategyStore] Cache hit for chain ${chainId} (expires: ${entry.expiresAt.toISOString()})`
    );
    return entry.result;
  }

  // Cache miss or stale - trigger refresh
  if (entry) {
    console.log(`[liveStrategyStore] Cache stale for chain ${chainId}, refreshing...`);
  } else {
    console.log(`[liveStrategyStore] Cache miss for chain ${chainId}, fetching...`);
  }

  return refreshLiveStrategies(chainId);
}

/**
 * Check if cache exists and is valid for a chain
 *
 * @param chainId - Chain ID to check
 * @returns true if cache is valid
 */
export function hasFreshCache(chainId: number = DEFAULT_CHAIN_ID): boolean {
  const entry = cache.get(chainId);
  return entry !== undefined && isCacheValid(entry);
}

/**
 * Get cache status for a chain (for debugging/monitoring)
 *
 * @param chainId - Chain ID to check
 * @returns Cache status info or null if no cache
 */
export function getCacheStatus(
  chainId: number = DEFAULT_CHAIN_ID
): { isFresh: boolean; expiresAt: Date; strategyCount: number } | null {
  const entry = cache.get(chainId);
  if (!entry) return null;

  return {
    isFresh: isCacheValid(entry),
    expiresAt: entry.expiresAt,
    strategyCount: entry.result.strategies.length,
  };
}

/**
 * Clear cache for a specific chain or all chains
 *
 * @param chainId - Chain ID to clear, or undefined to clear all
 */
export function clearCache(chainId?: number): void {
  if (chainId !== undefined) {
    cache.delete(chainId);
    console.log(`[liveStrategyStore] Cleared cache for chain ${chainId}`);
  } else {
    cache.clear();
    console.log(`[liveStrategyStore] Cleared all caches`);
  }
}

/**
 * Get the cache TTL in milliseconds
 */
export function getCacheTtlMs(): number {
  return CACHE_TTL_MS;
}

// =============================================================================
// Executable Strategies (Morpho-only for now)
// =============================================================================

/**
 * Protocols that have deployed adapters and can be used by the scheduler.
 * Until adapters are deployed for all protocols, we limit execution to Morpho.
 */
const EXECUTABLE_PROTOCOLS = ["morpho"] as const;

/**
 * Get strategies that are safe for the scheduler to execute.
 * Currently limited to Morpho vaults until adapters for other protocols are deployed.
 *
 * @param chainId - Chain ID to get strategies for (default: 8453 Base)
 * @returns Filtered strategy data (Morpho-only) with metadata
 */
export async function getExecutableStrategies(
  chainId: number = DEFAULT_CHAIN_ID
): Promise<LiveStrategyResult> {
  const fullResult = await getCachedStrategies(chainId);

  // Filter to only executable protocols (Morpho for now)
  const executableStrategies = fullResult.strategies.filter((vault) =>
    EXECUTABLE_PROTOCOLS.includes(vault.source as typeof EXECUTABLE_PROTOCOLS[number])
  );

  console.log(
    `[liveStrategyStore] Filtered to ${executableStrategies.length} executable strategies (Morpho-only) from ${fullResult.strategies.length} total`
  );

  return {
    ...fullResult,
    strategies: executableStrategies,
  };
}
