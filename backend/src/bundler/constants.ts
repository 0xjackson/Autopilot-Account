import type { Address } from "viem";

export const CONTRACTS = {
  FACTORY: (process.env.FACTORY_ADDRESS || "0xA5BC2a02C397F66fBCFC445457325F36106788d1") as Address,
  MODULE: (process.env.AUTO_YIELD_MODULE_ADDRESS || "0xdCB9c356310DdBD693fbA8bF5e271123808cF6dd") as Address,
  VALIDATOR: "0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b" as Address,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  ENTRYPOINT: "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as Address,
} as const;

export const CHAIN_ID = 8453n;

export const AUTO_YIELD_MODULE_ABI = [
  { name: "rebalance", type: "function", inputs: [{ name: "token", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { name: "migrateStrategy", type: "function", inputs: [{ name: "token", type: "address" }, { name: "newVault", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { name: "sweepDustAndCompound", type: "function", inputs: [], outputs: [], stateMutability: "nonpayable" },
] as const;

export const KERNEL_EXECUTE_ABI = [
  { name: "execute", type: "function", inputs: [{ name: "mode", type: "bytes32" }, { name: "executionCalldata", type: "bytes" }], outputs: [], stateMutability: "payable" },
] as const;

export const EXEC_MODE_DEFAULT = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export const ENTRYPOINT_ABI = [
  { name: "getNonce", type: "function", inputs: [{ name: "sender", type: "address" }, { name: "key", type: "uint192" }], outputs: [{ name: "nonce", type: "uint256" }], stateMutability: "view" },
] as const;
