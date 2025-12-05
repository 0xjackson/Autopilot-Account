/**
 * Chain Reader - On-chain state reading with multicall
 */

import { createPublicClient, http, parseAbi, Address } from "viem";
import { base } from "viem/chains";

const CONTRACTS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  AUTO_YIELD_MODULE: "0xdCB9c356310DdBD693fbA8bF5e271123808cF6dd" as Address,
};

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

const AUTO_YIELD_MODULE_ABI = parseAbi([
  "function checkingThreshold(address account, address token) view returns (uint256)",
  "function getYieldBalance(address account, address token) view returns (uint256)",
  "function currentVault(address account, address token) view returns (address)",
]);

export interface WalletCheckResult {
  wallet: Address;
  checkingBalance: bigint;
  threshold: bigint;
  yieldBalance: bigint;
  needsRebalance: boolean;
  surplus: bigint;
  hasVault: boolean;
  currentVault: Address | null;
}

export interface ChainReaderConfig {
  rpcUrl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let publicClient: any = null;

export function initChainReader(config: ChainReaderConfig): void {
  publicClient = createPublicClient({
    chain: base,
    transport: http(config.rpcUrl),
    batch: { multicall: true },
  });
  console.log("[chainReader] Initialized with RPC:", config.rpcUrl.substring(0, 40) + "...");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClient(): any {
  if (!publicClient) {
    throw new Error("Chain reader not initialized. Call initChainReader() first.");
  }
  return publicClient;
}

export async function checkWalletsForRebalance(
  wallets: string[]
): Promise<WalletCheckResult[]> {
  if (wallets.length === 0) return [];

  const client = getClient();
  const walletAddresses = wallets.map((w) => w.toLowerCase() as Address);

  const contracts = walletAddresses.flatMap((wallet) => [
    { address: CONTRACTS.USDC, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [wallet] },
    { address: CONTRACTS.AUTO_YIELD_MODULE, abi: AUTO_YIELD_MODULE_ABI, functionName: "checkingThreshold" as const, args: [wallet, CONTRACTS.USDC] },
    { address: CONTRACTS.AUTO_YIELD_MODULE, abi: AUTO_YIELD_MODULE_ABI, functionName: "currentVault" as const, args: [wallet, CONTRACTS.USDC] },
    { address: CONTRACTS.AUTO_YIELD_MODULE, abi: AUTO_YIELD_MODULE_ABI, functionName: "getYieldBalance" as const, args: [wallet, CONTRACTS.USDC] },
  ]);

  const results = await client.multicall({ contracts, allowFailure: true });

  const walletResults: WalletCheckResult[] = [];

  for (let i = 0; i < walletAddresses.length; i++) {
    const baseIndex = i * 4;
    const wallet = walletAddresses[i];

    const balanceResult = results[baseIndex];
    const thresholdResult = results[baseIndex + 1];
    const vaultResult = results[baseIndex + 2];
    const yieldBalanceResult = results[baseIndex + 3];

    const checkingBalance = balanceResult.status === "success" ? (balanceResult.result as bigint) : 0n;
    const threshold = thresholdResult.status === "success" ? (thresholdResult.result as bigint) : 0n;
    const vault = vaultResult.status === "success" ? (vaultResult.result as Address) : null;
    const yieldBalance = yieldBalanceResult.status === "success" ? (yieldBalanceResult.result as bigint) : 0n;

    const hasVault = vault !== null && vault !== "0x0000000000000000000000000000000000000000";
    const surplus = checkingBalance > threshold ? checkingBalance - threshold : 0n;
    const needsRebalance = surplus > 0n && hasVault;

    walletResults.push({
      wallet,
      checkingBalance,
      threshold,
      yieldBalance,
      needsRebalance,
      surplus,
      hasVault,
      currentVault: hasVault ? vault : null,
    });
  }

  return walletResults;
}

export async function checkWalletForRebalance(wallet: string): Promise<WalletCheckResult | null> {
  const results = await checkWalletsForRebalance([wallet]);
  return results[0] || null;
}

export function formatUSDC(amount: bigint): string {
  const decimals = 6;
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 2);
  return `${whole}.${fractionStr}`;
}
