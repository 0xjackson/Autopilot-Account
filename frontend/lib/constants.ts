import { type Address, type Abi } from "viem";

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

  // EntryPoint v0.7 (per PRD)
  ENTRY_POINT: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as Address,
} as const;

/**
 * Placeholder contract addresses - will be filled after deployment
 * Use these when checking if contracts are ready
 */
export const FACTORY_ADDRESS: Address | null =
  CONTRACTS.FACTORY === "0x0000000000000000000000000000000000000000"
    ? null
    : CONTRACTS.FACTORY;

export const AUTOMATION_MODULE_ADDRESS: Address | null =
  CONTRACTS.MODULE === "0x0000000000000000000000000000000000000000"
    ? null
    : CONTRACTS.MODULE;

/**
 * AutopilotFactory ABI - placeholder until contract is deployed
 * Will be replaced with actual ABI from contract compilation
 *
 * Per PRD Section 4.2: createAccountFor(owner, salt) returns account address
 */
export const FACTORY_ABI: Abi | null = [
  {
    name: "createAccountFor",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "account", type: "address" }],
  },
  {
    name: "getAddress",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "accountOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const satisfies Abi;

/**
 * Check if factory contract is deployed and ready
 */
export function isFactoryReady(): boolean {
  return FACTORY_ADDRESS !== null;
}

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
