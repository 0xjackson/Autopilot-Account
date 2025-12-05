import { type Address } from "viem";

// Deployed contract addresses on Base Mainnet (v4 - December 5, 2024)
export const CONTRACTS = {
  // AutopilotFactory - deploys smart wallets with AutoYieldModule pre-installed
  FACTORY: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ||
    "0xA5BC2a02C397F66fBCFC445457325F36106788d1") as Address,

  // AutoYieldModule - manages yield allocation for smart wallets (direct ERC-4626)
  MODULE: (process.env.NEXT_PUBLIC_MODULE_ADDRESS ||
    "0xdCB9c356310DdBD693fbA8bF5e271123808cF6dd") as Address,

  // AutomationValidator - ERC-7579 validator for automation key signatures
  VALIDATOR: (process.env.NEXT_PUBLIC_VALIDATOR_ADDRESS ||
    "0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b") as Address,

  // USDC on Base Mainnet
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
} as const;

// Backend API URL
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// AutopilotFactory ABI - matches AutopilotFactory.sol
export const FACTORY_ABI = [
  // Create wallet for msg.sender
  {
    name: "createAccount",
    type: "function",
    inputs: [{ name: "salt", type: "bytes32" }],
    outputs: [{ name: "account", type: "address" }],
    stateMutability: "nonpayable",
  },
  // Create wallet for specified owner
  {
    name: "createAccountFor",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "account", type: "address" }],
    stateMutability: "nonpayable",
  },
  // Predict wallet address before deployment
  {
    name: "getAddress",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  // Check if owner already has a wallet
  {
    name: "hasAccount",
    type: "function",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  // Get existing wallet address for owner
  {
    name: "accountOf",
    type: "function",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  // Default threshold constant (1 USDC in v4)
  {
    name: "DEFAULT_THRESHOLD",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // Current default threshold
  {
    name: "defaultThreshold",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// AutoYieldModule ABI - for dashboard views and configuration
export const MODULE_ABI = [
  // View functions for balances
  {
    name: "getTotalBalance",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "getCheckingBalance",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "getYieldBalance",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // Configuration state (public mappings)
  {
    name: "checkingThreshold",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "isInitialized",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "currentVault",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    name: "automationKey",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    name: "allowedVaults",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
      { name: "vault", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  // Configuration functions (called via smart wallet - onlyAccount modifier)
  {
    name: "setCheckingThreshold",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "threshold", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setAutomationKey",
    type: "function",
    inputs: [{ name: "key", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setCurrentVault",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "vault", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setVaultAllowed",
    type: "function",
    inputs: [
      { name: "vault", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "flushToChecking",
    type: "function",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // Core execution
  {
    name: "executeWithAutoYield",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // Automation functions (onlyAuthorized - account or automationKey)
  {
    name: "rebalance",
    type: "function",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "migrateStrategy",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "newVault", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// Chain configuration - Base Mainnet
export const CHAIN_CONFIG = {
  CHAIN_ID: 8453,
  BLOCK_EXPLORER: "https://basescan.org",
  RPC_URL: "https://mainnet.base.org",
} as const;

// Helper to check if factory is deployed
export function isFactoryReady(): boolean {
  return CONTRACTS.FACTORY !== "0x0000000000000000000000000000000000000000";
}
