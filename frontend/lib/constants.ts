import { type Address } from "viem";

export const CONTRACTS = {
  // Factory address - Jackson will provide after deployment
  // For now, use a placeholder
  FACTORY: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ||
    "0x0000000000000000000000000000000000000000") as Address,

  // AutoYieldModule - Jackson will provide
  MODULE: (process.env.NEXT_PUBLIC_MODULE_ADDRESS ||
    "0x0000000000000000000000000000000000000000") as Address,

  // USDC on Base
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
} as const;

// Backend API URL
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Factory ABI - just the functions we need
// Jackson will provide the full ABI, but this is the shape:
export const FACTORY_ABI = [
  {
    name: "createAccount",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [
      { name: "account", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    name: "getAddress",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [
      { name: "", type: "address" },
    ],
    stateMutability: "view",
  },
] as const;

// Chain configuration
export const CHAIN_CONFIG = {
  CHAIN_ID: 84532, // Base Sepolia
  BLOCK_EXPLORER: "https://sepolia.basescan.org",
  RPC_URL: "https://sepolia.base.org",
} as const;

// Helper to check if factory is deployed
export function isFactoryReady(): boolean {
  return CONTRACTS.FACTORY !== "0x0000000000000000000000000000000000000000";
}
