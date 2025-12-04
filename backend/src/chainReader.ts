/**
 * Chain Reader - On-chain state reading with multicall
 *
 * Reads wallet balances and thresholds in batched RPC calls
 * to determine which wallets need rebalancing.
 */

import { createPublicClient, http, parseAbi, Address } from "viem";
import { base } from "viem/chains";

// ============================================================================
// Configuration
// ============================================================================

/** Contract addresses on Base mainnet */
const CONTRACTS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  AUTO_YIELD_MODULE: "0x71b5A4663A49FF02BE672Ea9560256D2268727B7" as Address,
};

/** Minimal ABIs for the calls we need */
const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

const AUTO_YIELD_MODULE_ABI = parseAbi([
  "function checkingThreshold(address account, address token) view returns (uint256)",
  "function getYieldBalance(address account, address token) view returns (uint256)",
  "function currentAdapter(address account, address token) view returns (address)",
]);

// ============================================================================
// Types
// ============================================================================

export interface WalletCheckResult {
  wallet: Address;
  checkingBalance: bigint;
  threshold: bigint;
  yieldBalance: bigint;
  needsRebalance: boolean;
  surplus: bigint;
  hasAdapter: boolean;
}

export interface ChainReaderConfig {
  rpcUrl: string;
}

// ============================================================================
// Client Management
// ============================================================================

// Using 'any' to avoid viem version conflicts with moonwell-sdk
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let publicClient: any = null;

/**
 * Initialize the chain reader with an RPC URL
 */
export function initChainReader(config: ChainReaderConfig): void {
  publicClient = createPublicClient({
    chain: base,
    transport: http(config.rpcUrl),
    batch: {
      multicall: true,
    },
  });
  console.log("[chainReader] Initialized with RPC:", config.rpcUrl.substring(0, 40) + "...");
}

/**
 * Get the public client (throws if not initialized)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClient(): any {
  if (!publicClient) {
    throw new Error("Chain reader not initialized. Call initChainReader() first.");
  }
  return publicClient;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Check multiple wallets for rebalance needs in a single multicall
 *
 * For each wallet, reads:
 *   - USDC balance (checking)
 *   - Checking threshold from AutoYieldModule
 *   - Current adapter (to know if yield is configured)
 *   - Yield balance (for logging/info)
 *
 * Returns which wallets have surplus above threshold and need rebalancing.
 */
export async function checkWalletsForRebalance(
  wallets: string[]
): Promise<WalletCheckResult[]> {
  if (wallets.length === 0) {
    return [];
  }

  const client = getClient();
  const walletAddresses = wallets.map((w) => w.toLowerCase() as Address);

  // Build multicall contracts array
  // For each wallet: balance, threshold, adapter, yieldBalance = 4 calls
  const contracts = walletAddresses.flatMap((wallet) => [
    {
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [wallet],
    },
    {
      address: CONTRACTS.AUTO_YIELD_MODULE,
      abi: AUTO_YIELD_MODULE_ABI,
      functionName: "checkingThreshold" as const,
      args: [wallet, CONTRACTS.USDC],
    },
    {
      address: CONTRACTS.AUTO_YIELD_MODULE,
      abi: AUTO_YIELD_MODULE_ABI,
      functionName: "currentAdapter" as const,
      args: [wallet, CONTRACTS.USDC],
    },
    {
      address: CONTRACTS.AUTO_YIELD_MODULE,
      abi: AUTO_YIELD_MODULE_ABI,
      functionName: "getYieldBalance" as const,
      args: [wallet, CONTRACTS.USDC],
    },
  ]);

  // Execute multicall
  const results = await client.multicall({
    contracts,
    allowFailure: true,
  });

  // Parse results (4 results per wallet)
  const walletResults: WalletCheckResult[] = [];

  for (let i = 0; i < walletAddresses.length; i++) {
    const baseIndex = i * 4;
    const wallet = walletAddresses[i];

    // Extract results with fallbacks for failures
    const balanceResult = results[baseIndex];
    const thresholdResult = results[baseIndex + 1];
    const adapterResult = results[baseIndex + 2];
    const yieldBalanceResult = results[baseIndex + 3];

    const checkingBalance =
      balanceResult.status === "success" ? (balanceResult.result as bigint) : 0n;
    const threshold =
      thresholdResult.status === "success" ? (thresholdResult.result as bigint) : 0n;
    const adapter =
      adapterResult.status === "success" ? (adapterResult.result as Address) : null;
    const yieldBalance =
      yieldBalanceResult.status === "success" ? (yieldBalanceResult.result as bigint) : 0n;

    // Check if adapter is configured (not zero address)
    const hasAdapter = adapter !== null && adapter !== "0x0000000000000000000000000000000000000000";

    // Calculate surplus and determine if rebalance needed
    const surplus = checkingBalance > threshold ? checkingBalance - threshold : 0n;
    const needsRebalance = surplus > 0n && hasAdapter;

    walletResults.push({
      wallet,
      checkingBalance,
      threshold,
      yieldBalance,
      needsRebalance,
      surplus,
      hasAdapter,
    });
  }

  return walletResults;
}

/**
 * Check a single wallet (convenience wrapper)
 */
export async function checkWalletForRebalance(
  wallet: string
): Promise<WalletCheckResult | null> {
  const results = await checkWalletsForRebalance([wallet]);
  return results[0] || null;
}

/**
 * Format balance for logging (USDC has 6 decimals)
 */
export function formatUSDC(amount: bigint): string {
  const decimals = 6;
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 2);
  return `${whole}.${fractionStr}`;
}
