/**
 * Yield Aggregator Service
 *
 * Fetches and aggregates yield vault data from multiple protocols:
 * - Morpho Blue (via GraphQL API)
 * - Aave V3 (via GraphQL API)
 * - Moonwell (via Moonwell SDK)
 *
 * Returns unified vault data sorted by APY for strategy selection.
 */

import axios, { AxiosError } from "axios";
import { createMoonwellClient } from "@moonwell-fi/moonwell-sdk";

// =============================================================================
// Configuration
// =============================================================================

const MORPHO_API = "https://blue-api.morpho.org/graphql";
const AAVE_API = "https://api.v3.aave.com/graphql";
const BASE_CHAIN_ID = 8453;

// Native USDC on Base mainnet
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Request timeout in ms
const REQUEST_TIMEOUT_MS = 15000;

// =============================================================================
// Types
// =============================================================================

/**
 * Reward token information for vaults with incentives
 */
export interface Reward {
  symbol: string;
  apy: number; // As decimal (0.05 = 5%)
}

/**
 * Unified vault representation across protocols
 */
export interface Vault {
  // Identification
  name: string;
  address: string;
  symbol: string;

  // Yield data
  apy: number; // Total effective APY (decimal: 0.05 = 5%)
  baseApy: number; // Base lending APY without rewards
  rewards: Reward[];

  // Risk/size data
  tvlUsd: number;

  // Metadata
  source: "morpho" | "aave" | "moonwell";
  chainId: number;
  underlyingAsset: string;
  underlyingAssetAddress: string;
}

/**
 * Options for fetching best vaults
 */
export interface GetBestVaultsOptions {
  assetSymbol?: string;
  chainId?: number;
  excludeWarnings?: boolean;
  minTvlUsd?: number;
  topN?: number;
}

/**
 * Result of fetching vaults
 */
export interface VaultFetchResult {
  vaults: Vault[];
  errors: string[];
  fetchedAt: Date;
}

// =============================================================================
// GraphQL Queries
// =============================================================================

const MORPHO_GET_ASSET_QUERY = `
query GetChainAsset($chainId: Int!, $assetSymbol: String!) {
  assets(where: {chainId_in: [$chainId], symbol_in: [$assetSymbol]}) {
    items { address }
  }
}
`;

const MORPHO_LIST_VAULTS_QUERY = `
query ListVaults($skip: Int!, $chainId: Int!, $assetAddress: String!) {
  vaults(first: 100, skip: $skip, where: {chainId_in: [$chainId], assetAddress_in: [$assetAddress]}) {
    items {
      name
      address
      symbol
      warnings { type level }
      state {
        totalAssetsUsd
        netApy
        netApyWithoutRewards
        rewards {
          supplyApr
          asset { address symbol }
        }
      }
      asset {
        address
        symbol
      }
    }
    pageInfo { count limit }
  }
}
`;

const AAVE_LIST_MARKETS_QUERY = `
query GetMarkets($chainIds: [Int!]!) {
  markets(request: { chainIds: $chainIds }) {
    name
    address
    totalMarketSize
    chain { chainId name }
    reserves {
      underlyingToken { symbol address }
      aToken { address symbol }
      size { usd }
      supplyInfo {
        apy { value }
        total { value }
      }
      isFrozen
      isPaused
    }
  }
}
`;

// =============================================================================
// Morpho Fetcher
// =============================================================================

interface MorphoAssetResponse {
  data: {
    assets: {
      items: Array<{ address: string }>;
    };
  };
}

interface MorphoVaultItem {
  name: string;
  address: string;
  symbol: string;
  warnings: Array<{ type: string; level: string }>;
  state: {
    totalAssetsUsd: number;
    netApy: number;
    netApyWithoutRewards: number;
    rewards: Array<{
      supplyApr: number;
      asset: { address: string; symbol: string };
    }>;
  };
  asset: {
    address: string;
    symbol: string;
  };
}

interface MorphoVaultsResponse {
  data: {
    vaults: {
      items: MorphoVaultItem[];
      pageInfo: { count: number; limit: number };
    };
  };
}

/**
 * Fetch vaults from Morpho Blue API
 */
async function getMorphoVaults(
  assetSymbol: string,
  chainId: number,
  excludeWarnings: boolean
): Promise<Vault[]> {
  // Step 1: Get asset address for the symbol on this chain
  const assetResponse = await axios.post<MorphoAssetResponse>(
    MORPHO_API,
    {
      query: MORPHO_GET_ASSET_QUERY,
      variables: { chainId, assetSymbol },
    },
    { timeout: REQUEST_TIMEOUT_MS }
  );

  const assets = assetResponse.data.data?.assets?.items;
  if (!assets || assets.length === 0) {
    console.log(`Morpho: Asset ${assetSymbol} not found on chain ${chainId}`);
    return [];
  }

  // Use the canonical USDC address for Base if multiple found
  let assetAddress = assets[0].address;
  if (assetSymbol === "USDC" && chainId === BASE_CHAIN_ID) {
    const baseUsdc = assets.find(
      (a) => a.address.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase()
    );
    if (baseUsdc) {
      assetAddress = baseUsdc.address;
    }
  }

  // Step 2: Fetch all vaults (with pagination)
  const allVaultItems: MorphoVaultItem[] = [];
  let skip = 0;

  while (true) {
    const vaultsResponse = await axios.post<MorphoVaultsResponse>(
      MORPHO_API,
      {
        query: MORPHO_LIST_VAULTS_QUERY,
        variables: { chainId, assetAddress, skip },
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const vaultsData = vaultsResponse.data.data?.vaults;
    if (!vaultsData) break;

    allVaultItems.push(...vaultsData.items);

    // Check if we've fetched all pages
    if (vaultsData.pageInfo.count < vaultsData.pageInfo.limit) {
      break;
    }
    skip += vaultsData.pageInfo.count;

    // Safety limit to prevent infinite loops
    if (skip > 1000) break;
  }

  // Step 3: Parse and filter vaults
  const vaults: Vault[] = [];

  for (const v of allVaultItems) {
    // Skip vaults with warnings if requested
    if (excludeWarnings && v.warnings && v.warnings.length > 0) {
      continue;
    }

    const state = v.state;
    vaults.push({
      name: v.name,
      address: v.address,
      symbol: v.symbol,
      tvlUsd: state.totalAssetsUsd || 0,
      apy: state.netApy || 0,
      baseApy: state.netApyWithoutRewards || 0,
      rewards: (state.rewards || []).map((r) => ({
        symbol: r.asset.symbol,
        apy: r.supplyApr || 0,
      })),
      source: "morpho",
      chainId,
      underlyingAsset: v.asset?.symbol || assetSymbol,
      underlyingAssetAddress: v.asset?.address || assetAddress,
    });
  }

  return vaults;
}

// =============================================================================
// Aave Fetcher (Markets API)
// =============================================================================

interface AaveReserve {
  underlyingToken: { symbol: string; address: string };
  aToken: { address: string; symbol: string };
  size: { usd: string };
  supplyInfo: {
    apy: { value: string };
    total: { value: string };
  };
  isFrozen: boolean;
  isPaused: boolean;
}

interface AaveMarket {
  name: string;
  address: string;
  totalMarketSize: string;
  chain: { chainId: number; name: string };
  reserves: AaveReserve[];
}

interface AaveMarketsResponse {
  data: {
    markets: AaveMarket[];
  };
}

/**
 * Fetch reserves from Aave V3 Markets API
 *
 * This uses the correct Markets API which returns actual Aave lending pools
 * with real TVL and APY data, unlike the Vaults API which returns user-created
 * vault wrappers.
 */
async function getAaveVaults(
  assetSymbol: string,
  chainId: number
): Promise<Vault[]> {
  const response: { data: AaveMarketsResponse } = await axios.post(
    AAVE_API,
    {
      query: AAVE_LIST_MARKETS_QUERY,
      variables: { chainIds: [chainId] },
    },
    { timeout: REQUEST_TIMEOUT_MS }
  );

  const markets = response.data.data?.markets;
  if (!markets || markets.length === 0) {
    console.log(`Aave: No markets found for chain ${chainId}`);
    return [];
  }

  const vaults: Vault[] = [];

  for (const market of markets) {
    // Find the reserve matching our asset
    for (const reserve of market.reserves) {
      // Filter: only matching asset symbol
      if (reserve.underlyingToken.symbol !== assetSymbol) continue;

      // Skip frozen or paused reserves
      if (reserve.isFrozen || reserve.isPaused) continue;

      const apy = parseFloat(reserve.supplyInfo.apy.value || "0");
      const tvlUsd = parseFloat(reserve.size.usd || "0");

      vaults.push({
        name: `${market.name} ${assetSymbol}`,
        address: reserve.aToken.address, // Use aToken address as the "vault" address
        symbol: reserve.aToken.symbol,
        tvlUsd,
        apy,
        baseApy: apy, // Aave base APY is the same as total (no separate rewards in this query)
        rewards: [], // TODO: Could add incentives from the incentives field if needed
        source: "aave",
        chainId: market.chain.chainId,
        underlyingAsset: reserve.underlyingToken.symbol,
        underlyingAssetAddress: reserve.underlyingToken.address,
      });
    }
  }

  return vaults;
}

// =============================================================================
// Moonwell Fetcher (via SDK)
// =============================================================================

// Create a singleton Moonwell client for Base
const moonwellClient = createMoonwellClient({
  networks: {
    base: {
      rpcUrls: ["https://mainnet.base.org", "https://base.llamarpc.com"],
    },
  },
});

/**
 * Fetch markets from Moonwell via SDK
 *
 * Moonwell is a native Base lending protocol similar to Aave/Compound.
 * The SDK provides direct access to market data including APY and TVL.
 */
async function getMoonwellVaults(
  assetSymbol: string,
  chainId: number
): Promise<Vault[]> {
  // Moonwell SDK only supports specific chains
  if (chainId !== BASE_CHAIN_ID) {
    console.log(`Moonwell: Chain ${chainId} not supported, only Base (8453)`);
    return [];
  }

  const markets = await moonwellClient.getMarkets({
    includeLiquidStakingRewards: true,
  });

  if (!markets || markets.length === 0) {
    console.log("Moonwell: No markets found");
    return [];
  }

  const vaults: Vault[] = [];

  for (const market of markets) {
    // Filter by asset symbol
    if (market.underlyingToken.symbol !== assetSymbol) continue;

    // Skip paused markets
    if (market.mintPaused) continue;

    // Moonwell SDK returns APY/APR as percentages (e.g., 5.83 = 5.83%)
    // We normalize to decimals (0.0583) to match Morpho/Aave format
    const totalApr = (market.totalSupplyApr || 0) / 100;
    const baseApy = (market.baseSupplyApy || 0) / 100;

    // Map rewards to our format (also normalize from percentage to decimal)
    const rewards: Reward[] = (market.rewards || [])
      .filter((r) => r.supplyApr > 0)
      .map((r) => ({
        symbol: r.token.symbol,
        apy: r.supplyApr / 100,
      }));

    vaults.push({
      name: `Moonwell ${market.underlyingToken.symbol}`,
      address: market.marketToken.address,
      symbol: market.marketToken.symbol,
      tvlUsd: market.totalSupplyUsd || 0,
      apy: totalApr, // Total APR (base + rewards)
      baseApy: baseApy,
      rewards,
      source: "moonwell",
      chainId: market.chainId,
      underlyingAsset: market.underlyingToken.symbol,
      underlyingAssetAddress: market.underlyingToken.address,
    });
  }

  return vaults;
}

// =============================================================================
// Main Aggregator
// =============================================================================

/**
 * Fetch and aggregate vaults from all supported protocols
 *
 * @param options - Filtering and sorting options
 * @returns Sorted list of vaults with any errors encountered
 */
export async function getBestVaults(
  options: GetBestVaultsOptions = {}
): Promise<VaultFetchResult> {
  const {
    assetSymbol = "USDC",
    chainId = BASE_CHAIN_ID,
    excludeWarnings = true,
    minTvlUsd = 100000,
    topN,
  } = options;

  const errors: string[] = [];

  // Fetch from all sources in parallel
  const [morphoResult, aaveResult, moonwellResult] = await Promise.allSettled([
    getMorphoVaults(assetSymbol, chainId, excludeWarnings),
    getAaveVaults(assetSymbol, chainId),
    getMoonwellVaults(assetSymbol, chainId),
  ]);

  // Collect vaults and errors
  let morphoVaults: Vault[] = [];
  let aaveVaults: Vault[] = [];
  let moonwellVaults: Vault[] = [];

  if (morphoResult.status === "fulfilled") {
    morphoVaults = morphoResult.value;
  } else {
    const error = morphoResult.reason;
    const message =
      error instanceof AxiosError
        ? `Morpho API error: ${error.message}`
        : `Morpho fetch error: ${String(error)}`;
    errors.push(message);
    console.error(message);
  }

  if (aaveResult.status === "fulfilled") {
    aaveVaults = aaveResult.value;
  } else {
    const error = aaveResult.reason;
    const message =
      error instanceof AxiosError
        ? `Aave API error: ${error.message}`
        : `Aave fetch error: ${String(error)}`;
    errors.push(message);
    console.error(message);
  }

  if (moonwellResult.status === "fulfilled") {
    moonwellVaults = moonwellResult.value;
  } else {
    const error = moonwellResult.reason;
    const message = `Moonwell fetch error: ${String(error)}`;
    errors.push(message);
    console.error(message);
  }

  // Merge all vaults
  let allVaults = [...morphoVaults, ...aaveVaults, ...moonwellVaults];

  // Filter by minimum TVL
  if (minTvlUsd > 0) {
    allVaults = allVaults.filter((v) => v.tvlUsd >= minTvlUsd);
  }

  // Sort by APY (highest first)
  allVaults.sort((a, b) => b.apy - a.apy);

  // Return top N if specified
  const vaults = topN ? allVaults.slice(0, topN) : allVaults;

  return {
    vaults,
    errors,
    fetchedAt: new Date(),
  };
}

/**
 * Get the single best vault for a given asset
 */
export async function getBestVault(
  assetSymbol: string = "USDC",
  chainId: number = BASE_CHAIN_ID,
  minTvlUsd: number = 10000
): Promise<Vault | null> {
  const result = await getBestVaults({
    assetSymbol,
    chainId,
    excludeWarnings: true,
    minTvlUsd,
    topN: 1,
  });

  return result.vaults.length > 0 ? result.vaults[0] : null;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format APY as percentage string
 */
export function formatApy(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`;
}

/**
 * Format TVL as USD string
 */
export function formatTvl(tvlUsd: number): string {
  if (tvlUsd >= 1_000_000) {
    return `$${(tvlUsd / 1_000_000).toFixed(2)}M`;
  }
  if (tvlUsd >= 1_000) {
    return `$${(tvlUsd / 1_000).toFixed(2)}K`;
  }
  return `$${tvlUsd.toFixed(2)}`;
}

/**
 * Print vault summary to console (for debugging/CLI)
 */
export function printVaultSummary(vault: Vault): void {
  console.log(`[${vault.source.toUpperCase()}] ${vault.name}`);
  console.log(`  Address: ${vault.address}`);
  console.log(
    `  APY: ${formatApy(vault.apy)} (base: ${formatApy(vault.baseApy)})`
  );
  console.log(`  TVL: ${formatTvl(vault.tvlUsd)}`);

  if (vault.rewards.length > 0) {
    for (const r of vault.rewards) {
      console.log(`  └─ ${r.symbol}: +${formatApy(r.apy)}`);
    }
  }
  console.log();
}

// =============================================================================
// CLI Entry Point (for testing)
// =============================================================================

async function main() {
  console.log("Fetching best USDC vaults on Base...\n");

  const result = await getBestVaults({
    assetSymbol: "USDC",
    chainId: BASE_CHAIN_ID,
    minTvlUsd: 1000, // Filter out tiny test vaults
    topN: 10,
  });

  if (result.errors.length > 0) {
    console.log("Errors encountered:");
    result.errors.forEach((e) => console.log(`  - ${e}`));
    console.log();
  }

  console.log(`Found ${result.vaults.length} vaults:\n`);

  for (const vault of result.vaults) {
    printVaultSummary(vault);
  }

  console.log(`Fetched at: ${result.fetchedAt.toISOString()}`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
