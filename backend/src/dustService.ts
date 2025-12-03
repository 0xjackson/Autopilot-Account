/**
 * B4: Dust Token Metadata Service
 *
 * Service layer for managing dust token metadata and configuration.
 * Provides functions to query dust tokens, get consolidation config,
 * and (in future) read wallet balances.
 */

import {
  DustTokenMeta,
  DustConfig,
  DustBalance,
  DustSummaryResponse,
} from "./types";
import {
  dustTokens,
  DEFAULT_CONSOLIDATION_TOKEN,
  DEFAULT_CONSOLIDATION_ADDRESS,
} from "./dustConfig";
import { CHAIN_IDS } from "./strategies";

// ============================================================================
// Constants
// ============================================================================

/** Default chain ID for dust operations */
export const DEFAULT_DUST_CHAIN_ID = CHAIN_IDS.BASE_MAINNET;

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get all dust tokens for a specific chain
 *
 * @param chainId - Chain ID to filter by
 * @returns Array of dust token metadata
 */
export function getDustTokens(chainId: number): DustTokenMeta[] {
  return dustTokens.filter((t) => t.chainId === chainId);
}

/**
 * Get only tokens marked as dust sources for a chain
 *
 * @param chainId - Chain ID to filter by
 * @returns Array of dust source tokens
 */
export function getDustSources(chainId: number): DustTokenMeta[] {
  return dustTokens.filter((t) => t.chainId === chainId && t.isDustSource);
}

/**
 * Get tokens that can be used as consolidation targets
 *
 * @param chainId - Chain ID to filter by
 * @returns Array of consolidation target tokens
 */
export function getConsolidationTargets(chainId: number): DustTokenMeta[] {
  return dustTokens.filter((t) => t.chainId === chainId && t.isConsolidationTarget);
}

/**
 * Get a specific token by address
 *
 * @param chainId - Chain ID
 * @param tokenAddress - Token contract address
 * @returns Token metadata or undefined
 */
export function getTokenByAddress(
  chainId: number,
  tokenAddress: string
): DustTokenMeta | undefined {
  const normalizedAddress = tokenAddress.toLowerCase();
  return dustTokens.find(
    (t) =>
      t.chainId === chainId &&
      t.tokenAddress.toLowerCase() === normalizedAddress
  );
}

/**
 * Get a specific token by symbol
 *
 * @param chainId - Chain ID
 * @param symbol - Token symbol (case-insensitive)
 * @returns Token metadata or undefined
 */
export function getTokenBySymbol(
  chainId: number,
  symbol: string
): DustTokenMeta | undefined {
  const normalizedSymbol = symbol.toUpperCase();
  return dustTokens.find(
    (t) =>
      t.chainId === chainId &&
      t.symbol.toUpperCase() === normalizedSymbol
  );
}

/**
 * Get the default consolidation token for a chain
 *
 * @param chainId - Chain ID
 * @returns Token metadata for default consolidation target, or undefined
 */
export function getDefaultConsolidationToken(
  chainId: number
): DustTokenMeta | undefined {
  const symbol = DEFAULT_CONSOLIDATION_TOKEN[chainId];
  if (!symbol) return undefined;
  return getTokenBySymbol(chainId, symbol);
}

// ============================================================================
// Configuration Functions
// ============================================================================

/**
 * Get full dust configuration for a chain with a specific consolidation token
 *
 * @param chainId - Chain ID
 * @param consolidationSymbol - Token symbol to consolidate into (default: USDC)
 * @returns Dust configuration object
 */
export function getDustConfig(
  chainId: number,
  consolidationSymbol?: string
): DustConfig | null {
  // Get consolidation token (use default if not specified)
  const targetSymbol = consolidationSymbol || DEFAULT_CONSOLIDATION_TOKEN[chainId];
  if (!targetSymbol) return null;

  const consolidationToken = getTokenBySymbol(chainId, targetSymbol);
  if (!consolidationToken) return null;

  // Get all dust sources that should consolidate to this token
  const dustSources = getDustSources(chainId).filter(
    (t) =>
      !t.consolidationTarget ||
      t.consolidationTarget.toLowerCase() === consolidationToken.tokenAddress.toLowerCase()
  );

  // Get all available consolidation targets
  const consolidationTargets = getConsolidationTargets(chainId);

  return {
    chainId,
    defaultConsolidationToken: consolidationToken.symbol,
    defaultConsolidationAddress: consolidationToken.tokenAddress,
    trackedDustTokens: dustSources,
    consolidationTargets,
  };
}

/**
 * Get dust configuration by consolidation token address
 *
 * @param chainId - Chain ID
 * @param consolidationAddress - Token address to consolidate into
 * @returns Dust configuration object or null
 */
export function getDustConfigByAddress(
  chainId: number,
  consolidationAddress: string
): DustConfig | null {
  const token = getTokenByAddress(chainId, consolidationAddress);
  if (!token || !token.isConsolidationTarget) return null;
  return getDustConfig(chainId, token.symbol);
}

// ============================================================================
// Wallet Summary (Stub for future implementation)
// ============================================================================

/**
 * Get dust summary for a wallet (STUB - returns mock data)
 *
 * TODO (B5+): Implement actual on-chain balance reading via:
 * - Multicall contract to batch balance queries
 * - Alchemy/Infura enhanced APIs
 * - The Graph subgraphs
 *
 * @param wallet - Wallet address
 * @param chainId - Chain ID
 * @param consolidationSymbol - Consolidation token symbol
 * @returns Mock dust summary
 */
export function getDustSummary(
  wallet: string,
  chainId: number,
  consolidationSymbol?: string
): DustSummaryResponse {
  const config = getDustConfig(chainId, consolidationSymbol);
  const consolidationToken = consolidationSymbol || DEFAULT_CONSOLIDATION_TOKEN[chainId] || "USDC";

  // Mock balances for demo purposes
  const mockBalances: DustBalance[] = getDustSources(chainId)
    .slice(0, 3) // Just show first 3 for demo
    .map((token) => ({
      token,
      balance: "1000000000000000000", // 1 token in wei (mock)
      balanceUsd: Math.random() * 10, // Random USD value for demo
      isDust: true,
    }));

  return {
    wallet,
    chainId,
    consolidationToken,
    dustBalances: mockBalances,
    totalDustValueUsd: mockBalances.reduce((sum, b) => sum + (b.balanceUsd || 0), 0),
    note: "TODO: This is mock data. Real implementation will read on-chain balances via multicall or indexed data.",
  };
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a token address is a known consolidation target
 *
 * @param chainId - Chain ID
 * @param tokenAddress - Token address to check
 * @returns true if valid consolidation target
 */
export function isValidConsolidationTarget(
  chainId: number,
  tokenAddress: string
): boolean {
  const token = getTokenByAddress(chainId, tokenAddress);
  return token?.isConsolidationTarget === true;
}

/**
 * Check if a token symbol is a known consolidation target
 *
 * @param chainId - Chain ID
 * @param symbol - Token symbol to check
 * @returns true if valid consolidation target
 */
export function isValidConsolidationSymbol(
  chainId: number,
  symbol: string
): boolean {
  const token = getTokenBySymbol(chainId, symbol);
  return token?.isConsolidationTarget === true;
}

/**
 * Get supported chain IDs for dust operations
 */
export function getSupportedDustChainIds(): number[] {
  const chainIds = new Set<number>();
  dustTokens.forEach((t) => chainIds.add(t.chainId));
  return Array.from(chainIds);
}

// ============================================================================
// TODO: Future implementations
// ============================================================================

// TODO: Fetch real token balances from chain
// export async function fetchWalletDustBalances(
//   wallet: string,
//   chainId: number
// ): Promise<DustBalance[]> {
//   // Use multicall to batch ERC20.balanceOf calls
//   // Or use Alchemy's getTokenBalances API
//   throw new Error("Not implemented");
// }

// TODO: Estimate swap value for dust tokens
// export async function estimateDustSwapValue(
//   dustBalances: DustBalance[],
//   consolidationToken: string
// ): Promise<number> {
//   // Query DEX routers for swap quotes
//   // Or use price oracles
//   throw new Error("Not implemented");
// }

// TODO: Auto-discover new dust tokens in wallet
// export async function discoverDustTokens(
//   wallet: string,
//   chainId: number
// ): Promise<DustTokenMeta[]> {
//   // Use token transfer events or balance indexers
//   // to find tokens not in our registry
//   throw new Error("Not implemented");
// }
