/**
 * CDP Bundler and Paymaster RPC calls
 */

import { createPublicClient, http, toHex, type Hex, type Address } from "viem";
import { base } from "viem/chains";
import { CONTRACTS, ENTRYPOINT_ABI, CHAIN_ID_HEX } from "./constants";
import {
  type PackedUserOperation,
  serializeUserOp,
  getNonceKey,
  buildPaymasterAndData,
} from "./userOp";

// =============================================================================
// Configuration
// =============================================================================

const CDP_BUNDLER_URL = process.env.CDP_BUNDLER_URL;

// =============================================================================
// Public Client
// =============================================================================

export const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

// =============================================================================
// Types
// =============================================================================

export interface GasEstimate {
  preVerificationGas: Hex;
  verificationGasLimit: Hex;
  callGasLimit: Hex;
}

export interface PaymasterResult {
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit: Hex;
  paymasterPostOpGasLimit: Hex;
}

export interface UserOpReceipt {
  receipt: {
    transactionHash: Hex;
    blockNumber: Hex;
    gasUsed: Hex;
  };
  success: boolean;
}

// =============================================================================
// Base RPC Call
// =============================================================================

async function bundlerRpc<T>(method: string, params: unknown[]): Promise<T> {
  if (!CDP_BUNDLER_URL) {
    throw new Error("CDP_BUNDLER_URL not configured");
  }

  const response = await fetch(CDP_BUNDLER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const data = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };

  if (data.error) {
    const errorMsg = data.error.message || JSON.stringify(data.error);
    throw new Error(`Bundler RPC error (${method}): ${errorMsg}`);
  }

  return data.result as T;
}

// =============================================================================
// Nonce
// =============================================================================

/**
 * Get the current nonce for a wallet from EntryPoint
 */
export async function getNonce(walletAddress: Address): Promise<bigint> {
  const key = getNonceKey(CONTRACTS.VALIDATOR);

  const nonce = await publicClient.readContract({
    address: CONTRACTS.ENTRYPOINT,
    abi: ENTRYPOINT_ABI,
    functionName: "getNonce",
    args: [walletAddress, key],
  });

  return nonce;
}

// =============================================================================
// Gas Estimation
// =============================================================================

/**
 * Get current gas prices from the network
 */
export async function getGasPrices(): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  const feeData = await publicClient.estimateFeesPerGas();
  return {
    maxFeePerGas: feeData.maxFeePerGas ?? 1000000000n,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 1000000000n,
  };
}

/**
 * Estimate gas for a UserOperation
 */
export async function estimateUserOperationGas(
  userOp: PackedUserOperation
): Promise<GasEstimate> {
  return bundlerRpc<GasEstimate>("eth_estimateUserOperationGas", [
    serializeUserOp(userOp),
    CONTRACTS.ENTRYPOINT,
  ]);
}

// =============================================================================
// Paymaster
// =============================================================================

/**
 * Get paymaster stub data (for gas estimation)
 */
export async function getPaymasterStubData(
  userOp: Partial<PackedUserOperation>
): Promise<Hex> {
  const result = await bundlerRpc<PaymasterResult>("pm_getPaymasterStubData", [
    {
      sender: userOp.sender,
      nonce: toHex(userOp.nonce!),
      initCode: userOp.initCode,
      callData: userOp.callData,
      accountGasLimits: userOp.accountGasLimits,
      preVerificationGas: toHex(userOp.preVerificationGas!),
      gasFees: userOp.gasFees,
    },
    CONTRACTS.ENTRYPOINT,
    CHAIN_ID_HEX,
  ]);

  return buildPaymasterAndData(
    result.paymaster,
    BigInt(result.paymasterVerificationGasLimit),
    BigInt(result.paymasterPostOpGasLimit),
    result.paymasterData
  );
}

/**
 * Get final paymaster data (after gas estimation)
 */
export async function getPaymasterData(
  userOp: Omit<PackedUserOperation, "signature" | "paymasterAndData">
): Promise<Hex> {
  const result = await bundlerRpc<PaymasterResult>("pm_getPaymasterData", [
    {
      sender: userOp.sender,
      nonce: toHex(userOp.nonce),
      initCode: userOp.initCode,
      callData: userOp.callData,
      accountGasLimits: userOp.accountGasLimits,
      preVerificationGas: toHex(userOp.preVerificationGas),
      gasFees: userOp.gasFees,
    },
    CONTRACTS.ENTRYPOINT,
    CHAIN_ID_HEX,
  ]);

  return buildPaymasterAndData(
    result.paymaster,
    BigInt(result.paymasterVerificationGasLimit),
    BigInt(result.paymasterPostOpGasLimit),
    result.paymasterData
  );
}

// =============================================================================
// Submission
// =============================================================================

/**
 * Submit UserOp to bundler
 */
export async function sendUserOperation(userOp: PackedUserOperation): Promise<Hex> {
  return bundlerRpc<Hex>("eth_sendUserOperation", [
    serializeUserOp(userOp),
    CONTRACTS.ENTRYPOINT,
  ]);
}

/**
 * Get UserOp receipt
 */
export async function getUserOperationReceipt(
  userOpHash: Hex
): Promise<UserOpReceipt | null> {
  return bundlerRpc<UserOpReceipt | null>("eth_getUserOperationReceipt", [userOpHash]);
}

/**
 * Wait for UserOp receipt with polling
 */
export async function waitForUserOperationReceipt(
  userOpHash: Hex,
  timeout = 60000,
  pollInterval = 2000
): Promise<UserOpReceipt> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const receipt = await getUserOperationReceipt(userOpHash);

    if (receipt) {
      return receipt;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`UserOp receipt timeout after ${timeout}ms`);
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Check if bundler is configured and reachable
 */
export async function isBundlerHealthy(): Promise<boolean> {
  if (!CDP_BUNDLER_URL) {
    return false;
  }

  try {
    const entryPoints = await bundlerRpc<Address[]>("eth_supportedEntryPoints", []);
    return entryPoints.includes(CONTRACTS.ENTRYPOINT);
  } catch {
    return false;
  }
}
