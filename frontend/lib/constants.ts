import { type Address } from "viem";

/**
 * Contract addresses for Base Sepolia
 * These will be updated after deployment
 */
export const CONTRACTS = {
  // AutoYieldAccountFactory - deploys new smart accounts
  FACTORY: "0x0000000000000000000000000000000000000000" as Address,

  // AutoYieldModule - the 7579 module for yield automation
  MODULE: "0x0000000000000000000000000000000000000000" as Address,

  // AutoYieldPaymaster - sponsors gas for wallet operations
  PAYMASTER: "0x0000000000000000000000000000000000000000" as Address,

  // Mock Yield Vault - ERC-4626 vault for demo
  YIELD_VAULT: "0x0000000000000000000000000000000000000000" as Address,

  // USDC on Base Sepolia
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,

  // EntryPoint v0.6
  ENTRY_POINT: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" as Address,
} as const;

/**
 * Default wallet configuration
 */
export const DEFAULT_CONFIG = {
  // Default checking threshold in USDC (with 6 decimals)
  CHECKING_THRESHOLD: BigInt(100 * 1e6), // 100 USDC

  // Default max allocation to yield (in basis points, 10000 = 100%)
  MAX_ALLOCATION_BP: 9000, // 90%
} as const;

/**
 * Chain configuration
 */
export const CHAIN_CONFIG = {
  CHAIN_ID: 84532, // Base Sepolia
  BLOCK_EXPLORER: "https://sepolia.basescan.org",
  RPC_URL: "https://sepolia.base.org",
} as const;
