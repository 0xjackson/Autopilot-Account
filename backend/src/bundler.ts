/**
 * Bundler Service
 *
 * Builds and submits UserOperations for automation tasks.
 * Uses ZeroDev SDK with CDP Bundler/Paymaster.
 *
 * This service is responsible for:
 * - Building UserOps for rebalance, migrateStrategy, and sweepDustAndCompound
 * - Signing with the automation session key
 * - Submitting to the CDP bundler
 * - Waiting for transaction confirmation
 *
 * @see TEAM-TASKS.md - Bryce Task 5
 * @see hackathon-prd.md - Section 5.6 (Backend Optimizer Service)
 */

import { createKernelAccountClient, createKernelAccount } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import {
  http,
  createPublicClient,
  encodeFunctionData,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// Get the EntryPoint object for v0.7
const ENTRY_POINT_V07 = getEntryPoint("0.7");

// =============================================================================
// Configuration (from environment)
// =============================================================================

const CDP_BUNDLER_URL = process.env.CDP_BUNDLER_URL;
const AUTOMATION_PRIVATE_KEY = process.env.AUTOMATION_PRIVATE_KEY as Hex | undefined;

// Contract addresses - Jackson will provide these after deployment
const AUTO_YIELD_MODULE_ADDRESS = (process.env.AUTO_YIELD_MODULE_ADDRESS ||
  "0x1111111111111111111111111111111111111111") as Address;

// USDC on Base mainnet
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;

// Log warnings for missing configuration
function logConfigWarnings(): void {
  if (!CDP_BUNDLER_URL) {
    console.warn(
      "[bundler] WARNING: CDP_BUNDLER_URL not set. UserOp submission will fail."
    );
    console.warn(
      "[bundler]   Get your endpoint from: https://portal.cdp.coinbase.com"
    );
  }
  if (!AUTOMATION_PRIVATE_KEY) {
    console.warn(
      "[bundler] WARNING: AUTOMATION_PRIVATE_KEY not set. Run: npm run generate-session-key"
    );
  }
  if (!process.env.AUTO_YIELD_MODULE_ADDRESS) {
    console.warn(
      "[bundler] WARNING: AUTO_YIELD_MODULE_ADDRESS not set. Using placeholder."
    );
    console.warn(
      "[bundler]   Jackson will provide this after contract deployment."
    );
  }
}

// Log warnings on module load
logConfigWarnings();

// =============================================================================
// ABI Fragments for AutoYieldModule
// =============================================================================

/**
 * ABI fragments for the AutoYieldModule contract functions that the
 * automation key is authorized to call.
 *
 * @see contracts/src/modules/AutoYieldModule.sol
 */
const AUTO_YIELD_MODULE_ABI = [
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

// =============================================================================
// Viem Public Client
// =============================================================================

const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

// =============================================================================
// Automation Client Setup
// =============================================================================

/**
 * Create a Kernel account client for submitting automation UserOps
 *
 * TODO (Jackson): Verify this works with Kernel's session key validation.
 * The session key should only be valid for rebalance/migrateStrategy/sweepDust.
 * The current implementation uses ECDSA validation - we may need to adjust
 * based on how the factory configures session key permissions.
 *
 * @param walletAddress - The smart wallet address to operate on
 * @returns A Kernel account client configured for automation
 */
async function createAutomationClient(walletAddress: Address) {
  if (!AUTOMATION_PRIVATE_KEY) {
    throw new Error(
      "AUTOMATION_PRIVATE_KEY not configured. Run: npm run generate-session-key"
    );
  }

  if (!CDP_BUNDLER_URL) {
    throw new Error(
      "CDP_BUNDLER_URL not configured. Get from: https://portal.cdp.coinbase.com"
    );
  }

  const signer = privateKeyToAccount(AUTOMATION_PRIVATE_KEY);
  console.log("[bundler] Using automation signer:", signer.address);

  // Create ECDSA validator for the automation key
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint: ENTRY_POINT_V07,
    kernelVersion: KERNEL_V3_1,
  });

  // Create kernel account instance
  // TODO: This creates a NEW account - we need to use an existing deployed account
  // For now this is a placeholder. The actual implementation will need to:
  // 1. Connect to an existing Kernel account at walletAddress
  // 2. Use session key validation instead of full ECDSA validation
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint: ENTRY_POINT_V07,
    kernelVersion: KERNEL_V3_1,
  });

  console.log("[bundler] Kernel account address:", kernelAccount.address);
  console.log("[bundler] Target wallet address:", walletAddress);

  // Create the kernel client with CDP bundler
  const kernelClient = createKernelAccountClient({
    account: kernelAccount,
    chain: base,
    bundlerTransport: http(CDP_BUNDLER_URL),
    // CDP endpoint handles both bundling and paymaster (gas sponsorship)
  });

  return kernelClient;
}

// =============================================================================
// UserOp Submission Functions
// =============================================================================

/**
 * Submit a rebalance UserOp
 *
 * Moves excess checking balance into yield. Called when the wallet's
 * checking balance exceeds the threshold after receiving funds.
 *
 * @param walletAddress - The smart wallet to rebalance
 * @param tokenAddress - Token to rebalance (default: USDC)
 * @returns The UserOp hash
 */
export async function submitRebalanceUserOp(
  walletAddress: Address,
  tokenAddress: Address = USDC_ADDRESS
): Promise<Hex> {
  console.log(`[bundler] Building rebalance UserOp`);
  console.log(`[bundler]   Wallet: ${walletAddress}`);
  console.log(`[bundler]   Token: ${tokenAddress}`);

  try {
    const client = await createAutomationClient(walletAddress);

    const callData = encodeFunctionData({
      abi: AUTO_YIELD_MODULE_ABI,
      functionName: "rebalance",
      args: [tokenAddress],
    });

    console.log(`[bundler] Encoded callData: ${callData.slice(0, 20)}...`);
    console.log(`[bundler] Target: ${AUTO_YIELD_MODULE_ADDRESS}`);

    const userOpHash = await client.sendUserOperation({
      callData: await client.account.encodeCalls([
        {
          to: AUTO_YIELD_MODULE_ADDRESS,
          data: callData,
          value: 0n,
        },
      ]),
    });

    console.log(`[bundler] Submitted rebalance UserOp: ${userOpHash}`);

    const receipt = await client.waitForUserOperationReceipt({
      hash: userOpHash,
    });
    console.log(`[bundler] Confirmed in tx: ${receipt.receipt.transactionHash}`);

    return userOpHash;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bundler] rebalance failed:`, message);
    throw new Error(`Failed to submit rebalance UserOp: ${message}`);
  }
}

/**
 * Submit a migrateStrategy UserOp
 *
 * Moves funds from current vault to a better yielding vault.
 * Called by the scheduler when a higher APY vault is detected.
 *
 * @param walletAddress - The smart wallet to migrate
 * @param tokenAddress - Token to migrate (e.g., USDC)
 * @param newAdapterAddress - The adapter for the new vault
 * @returns The UserOp hash
 */
export async function submitMigrateStrategyUserOp(
  walletAddress: Address,
  tokenAddress: Address,
  newAdapterAddress: Address
): Promise<Hex> {
  console.log(`[bundler] Building migrateStrategy UserOp`);
  console.log(`[bundler]   Wallet: ${walletAddress}`);
  console.log(`[bundler]   Token: ${tokenAddress}`);
  console.log(`[bundler]   New Adapter: ${newAdapterAddress}`);

  try {
    const client = await createAutomationClient(walletAddress);

    const callData = encodeFunctionData({
      abi: AUTO_YIELD_MODULE_ABI,
      functionName: "migrateStrategy",
      args: [tokenAddress, newAdapterAddress],
    });

    console.log(`[bundler] Encoded callData: ${callData.slice(0, 20)}...`);
    console.log(`[bundler] Target: ${AUTO_YIELD_MODULE_ADDRESS}`);

    const userOpHash = await client.sendUserOperation({
      callData: await client.account.encodeCalls([
        {
          to: AUTO_YIELD_MODULE_ADDRESS,
          data: callData,
          value: 0n,
        },
      ]),
    });

    console.log(`[bundler] Submitted migrateStrategy UserOp: ${userOpHash}`);

    const receipt = await client.waitForUserOperationReceipt({
      hash: userOpHash,
    });
    console.log(`[bundler] Confirmed in tx: ${receipt.receipt.transactionHash}`);

    return userOpHash;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bundler] migrateStrategy failed:`, message);
    throw new Error(`Failed to submit migrateStrategy UserOp: ${message}`);
  }
}

/**
 * Submit a sweepDustAndCompound UserOp
 *
 * Swaps dust tokens to USDC and deposits into yield.
 * Called periodically or when dust value exceeds threshold.
 *
 * @param walletAddress - The smart wallet to sweep
 * @returns The UserOp hash
 */
export async function submitSweepDustUserOp(
  walletAddress: Address
): Promise<Hex> {
  console.log(`[bundler] Building sweepDustAndCompound UserOp`);
  console.log(`[bundler]   Wallet: ${walletAddress}`);

  try {
    const client = await createAutomationClient(walletAddress);

    const callData = encodeFunctionData({
      abi: AUTO_YIELD_MODULE_ABI,
      functionName: "sweepDustAndCompound",
      args: [],
    });

    console.log(`[bundler] Encoded callData: ${callData.slice(0, 20)}...`);
    console.log(`[bundler] Target: ${AUTO_YIELD_MODULE_ADDRESS}`);

    const userOpHash = await client.sendUserOperation({
      callData: await client.account.encodeCalls([
        {
          to: AUTO_YIELD_MODULE_ADDRESS,
          data: callData,
          value: 0n,
        },
      ]),
    });

    console.log(`[bundler] Submitted sweepDustAndCompound UserOp: ${userOpHash}`);

    const receipt = await client.waitForUserOperationReceipt({
      hash: userOpHash,
    });
    console.log(`[bundler] Confirmed in tx: ${receipt.receipt.transactionHash}`);

    return userOpHash;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bundler] sweepDustAndCompound failed:`, message);
    throw new Error(`Failed to submit sweepDustAndCompound UserOp: ${message}`);
  }
}

// =============================================================================
// Exports for Scheduler Integration (Task 6)
// =============================================================================

export {
  AUTO_YIELD_MODULE_ADDRESS,
  USDC_ADDRESS,
  AUTO_YIELD_MODULE_ABI,
};
