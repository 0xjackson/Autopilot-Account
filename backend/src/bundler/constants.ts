/**
 * Contract addresses and ABIs for the Autopilot system
 */

import type { Address } from "viem";

// =============================================================================
// Contract Addresses (Base Mainnet)
// =============================================================================

export const CONTRACTS = {
  FACTORY: "0xcf10279BAA0d5407Dbb637517d23055A55E72923" as Address,
  MODULE: "0x71b5A4663A49FF02BE672Ea9560256D2268727B7" as Address,
  VALIDATOR: "0xe29ed376a2780f653C14EEC203eD25094c0E772A" as Address,
  ADAPTER: "0x42EFecD83447e5b90c5F706309FaC8f9615bd68F" as Address,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  ENTRYPOINT: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as Address,
} as const;

// Base chain ID
export const CHAIN_ID = 8453n;
export const CHAIN_ID_HEX = "0x2105";

// =============================================================================
// ABIs
// =============================================================================

export const AUTO_YIELD_MODULE_ABI = [
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
      { name: "newAdapter", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "sweepDustAndCompound",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const KERNEL_EXECUTE_ABI = [
  {
    name: "execute",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

export const ENTRYPOINT_ABI = [
  {
    name: "getNonce",
    type: "function",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
