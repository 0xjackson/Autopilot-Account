/**
 * Bundler Service
 *
 * Builds and submits UserOperations for automation tasks using viem.
 * Uses CDP Bundler/Paymaster with standard ERC-4337 methods.
 */

// Re-export public API
export {
  submitRebalanceUserOp,
  submitMigrateStrategyUserOp,
  submitSweepDustUserOp,
} from "./submit";

// Re-export constants for external use
export {
  CONTRACTS,
  AUTO_YIELD_MODULE_ABI,
} from "./constants";

// Convenience aliases for backward compatibility
export const AUTO_YIELD_MODULE_ADDRESS = "0x71b5A4663A49FF02BE672Ea9560256D2268727B7";
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Re-export health check
export { isBundlerHealthy } from "./rpc";
