/**
 * Adapter Address Mapping
 *
 * Maps protocol sources to their corresponding IYieldAdapter contract addresses.
 * These adapters implement the IYieldAdapter interface from the PRD:
 *   - deposit(uint256 amount)
 *   - withdraw(uint256 amount) returns (uint256 withdrawn)
 *   - totalValue() returns (uint256)
 *
 * NOTE: These are PLACEHOLDER addresses until real adapters are deployed.
 * Each adapter wraps a specific protocol's yield source (vault, lending pool, etc.)
 */

// Chain IDs (duplicated here to avoid circular dependency with strategies.ts)
const CHAIN_IDS = {
  BASE_MAINNET: 8453,
  BASE_SEPOLIA: 84532,
} as const;

/**
 * Supported protocol sources from yieldAggregator
 */
export type ProtocolSource = "morpho" | "aave" | "moonwell";

/**
 * Key for adapter lookup: "chainId:source:underlying"
 */
export type AdapterKey = `${number}:${ProtocolSource}:${string}`;

/**
 * Generate an adapter key
 */
export function makeAdapterKey(
  chainId: number,
  source: ProtocolSource,
  underlyingSymbol: string
): AdapterKey {
  return `${chainId}:${source}:${underlyingSymbol.toUpperCase()}` as AdapterKey;
}

/**
 * Placeholder adapter addresses by protocol and asset
 *
 * Format: 0xAdapter<Protocol><Asset>
 * These will be replaced with real deployed addresses once adapters are on-chain.
 */
export const ADAPTER_ADDRESSES: Record<AdapterKey, string> = {
  // ============ Base Mainnet (8453) ============

  // Morpho adapters
  [`${CHAIN_IDS.BASE_MAINNET}:morpho:USDC`]: "0xAdapterMorphoUSDC0000000000000000000001",
  [`${CHAIN_IDS.BASE_MAINNET}:morpho:WETH`]: "0xAdapterMorphoWETH0000000000000000000002",

  // Aave V3 adapters
  [`${CHAIN_IDS.BASE_MAINNET}:aave:USDC`]: "0xAdapterAaveUSDC00000000000000000000003",
  [`${CHAIN_IDS.BASE_MAINNET}:aave:WETH`]: "0xAdapterAaveWETH00000000000000000000004",

  // Moonwell adapters
  [`${CHAIN_IDS.BASE_MAINNET}:moonwell:USDC`]: "0xAdapterMoonwellUSDC000000000000000005",
  [`${CHAIN_IDS.BASE_MAINNET}:moonwell:WETH`]: "0xAdapterMoonwellWETH000000000000000006",

  // ============ Base Sepolia (84532) ============

  // Test adapters for Sepolia
  [`${CHAIN_IDS.BASE_SEPOLIA}:morpho:USDC`]: "0xAdapterMorphoUSDCSepolia00000000000007",
  [`${CHAIN_IDS.BASE_SEPOLIA}:aave:USDC`]: "0xAdapterAaveUSDCSepolia000000000000008",
  [`${CHAIN_IDS.BASE_SEPOLIA}:moonwell:USDC`]: "0xAdapterMoonwellUSDCSepolia0000000009",
};

/**
 * Default/fallback adapter address for unknown combinations
 */
export const DEFAULT_ADAPTER_ADDRESS = "0xAdapterUnknown0000000000000000000000000";

/**
 * Get the adapter address for a given protocol source and underlying asset
 *
 * @param chainId - Chain ID
 * @param source - Protocol source (morpho, aave, moonwell)
 * @param underlyingSymbol - Underlying asset symbol (USDC, WETH, etc.)
 * @returns Adapter address (placeholder or default)
 */
export function getAdapterAddress(
  chainId: number,
  source: ProtocolSource,
  underlyingSymbol: string
): string {
  const key = makeAdapterKey(chainId, source, underlyingSymbol);
  return ADAPTER_ADDRESSES[key] || DEFAULT_ADAPTER_ADDRESS;
}

/**
 * Check if an adapter address is a placeholder (not yet deployed)
 */
export function isPlaceholderAdapter(address: string): boolean {
  return address.startsWith("0xAdapter");
}

/**
 * Get all registered adapter keys
 */
export function getRegisteredAdapters(): AdapterKey[] {
  return Object.keys(ADAPTER_ADDRESSES) as AdapterKey[];
}
