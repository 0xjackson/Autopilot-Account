import { createPublicClient, http, toHex, type Hex, type Address } from "viem";
import { base } from "viem/chains";
import { CONTRACTS, ENTRYPOINT_ABI, CHAIN_ID } from "./constants";
import { getNonceKey, getNonceKeyForRoot } from "./userOp";

const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;
const PIMLICO_URL = `https://api.pimlico.io/v2/base/rpc?apikey=${PIMLICO_API_KEY}`;

export const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

export interface UserOperationV07 {
  sender: Address;
  nonce: Hex;
  factory: Address | null;
  factoryData: Hex | null;
  callData: Hex;
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  paymaster: Address | null;
  paymasterVerificationGasLimit: Hex | null;
  paymasterPostOpGasLimit: Hex | null;
  paymasterData: Hex | null;
  signature: Hex;
}

export interface GasEstimate {
  preVerificationGas: Hex;
  verificationGasLimit: Hex;
  callGasLimit: Hex;
  paymasterVerificationGasLimit?: Hex;
  paymasterPostOpGasLimit?: Hex;
}

export interface UserOpReceipt {
  receipt: {
    transactionHash: Hex;
    blockNumber: Hex;
    gasUsed: Hex;
  };
  success: boolean;
}

export interface SponsorUserOpResult {
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit: Hex;
  paymasterPostOpGasLimit: Hex;
  preVerificationGas: Hex;
  verificationGasLimit: Hex;
  callGasLimit: Hex;
}

interface PimlicoGasPrice {
  slow: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  standard: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
}

async function pimlicoRpc<T>(method: string, params: unknown[]): Promise<T> {
  if (!PIMLICO_API_KEY) {
    throw new Error("PIMLICO_API_KEY not configured");
  }

  const response = await fetch(PIMLICO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  const data = (await response.json()) as {
    result?: T;
    error?: { message?: string; code?: number };
  };

  if (data.error) {
    throw new Error(`Pimlico RPC error (${method}): ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result as T;
}

export async function getNonce(walletAddress: Address): Promise<bigint> {
  const key = getNonceKey(CONTRACTS.VALIDATOR);
  return publicClient.readContract({
    address: CONTRACTS.ENTRYPOINT,
    abi: ENTRYPOINT_ABI,
    functionName: "getNonce",
    args: [walletAddress, key],
  });
}

// Get nonce using root validator (ECDSA validator for user-signed ops)
// Uses VALIDATION_TYPE_ROOT so Kernel uses the stored rootValidator
export async function getNonceForEcdsa(walletAddress: Address): Promise<bigint> {
  const key = getNonceKeyForRoot();
  return publicClient.readContract({
    address: CONTRACTS.ENTRYPOINT,
    abi: ENTRYPOINT_ABI,
    functionName: "getNonce",
    args: [walletAddress, key],
  });
}

// pm_getPaymasterStubData returns gas limits (for unsigned userOps)
// Note: paymasterVerificationGasLimit may be missing for some paymasters
export interface PaymasterStubDataResult {
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit?: Hex; // Optional - may not be returned
  paymasterPostOpGasLimit?: Hex; // Optional - may not be returned
}

// pm_getPaymasterData only returns paymaster + data (NO gas limits!)
export interface PaymasterDataResult {
  paymaster: Address;
  paymasterData: Hex;
}

// Get paymaster data without requiring signature
export async function getPaymasterData(
  userOp: {
    sender: Address;
    nonce: Hex;
    factory: Address | null;
    factoryData: Hex | null;
    callData: Hex;
    callGasLimit: Hex;
    verificationGasLimit: Hex;
    preVerificationGas: Hex;
    maxFeePerGas: Hex;
    maxPriorityFeePerGas: Hex;
    paymaster: Address | null;
    paymasterVerificationGasLimit: Hex | null;
    paymasterPostOpGasLimit: Hex | null;
    paymasterData: Hex | null;
  }
): Promise<PaymasterDataResult> {
  return pimlicoRpc<PaymasterDataResult>(
    "pm_getPaymasterData",
    [
      userOp,
      CONTRACTS.ENTRYPOINT,
      toHex(CHAIN_ID),
      null, // context - null for sponsorship
    ]
  );
}

// Get paymaster STUB data - returns gas limits for unsigned userOps
// Use this first to get paymasterVerificationGasLimit and paymasterPostOpGasLimit
export async function getPaymasterStubData(
  userOp: {
    sender: Address;
    nonce: Hex;
    factory: Address | null;
    factoryData: Hex | null;
    callData: Hex;
    callGasLimit: Hex;
    verificationGasLimit: Hex;
    preVerificationGas: Hex;
    maxFeePerGas: Hex;
    maxPriorityFeePerGas: Hex;
    paymaster: Address | null;
    paymasterVerificationGasLimit: Hex | null;
    paymasterPostOpGasLimit: Hex | null;
    paymasterData: Hex | null;
  }
): Promise<PaymasterStubDataResult> {
  const result = await pimlicoRpc<PaymasterStubDataResult>(
    "pm_getPaymasterStubData",
    [
      userOp,
      CONTRACTS.ENTRYPOINT,
      toHex(CHAIN_ID),
      null, // context - null for sponsorship
    ]
  );
  console.log("[DEBUG] pm_getPaymasterStubData raw response:", JSON.stringify(result, null, 2));
  return result;
}

export async function getGasPrices(): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  const gasPrice = await pimlicoRpc<PimlicoGasPrice>("pimlico_getUserOperationGasPrice", []);
  return {
    maxFeePerGas: BigInt(gasPrice.fast.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(gasPrice.fast.maxPriorityFeePerGas),
  };
}

export async function estimateUserOperationGas(userOp: UserOperationV07): Promise<GasEstimate> {
  return pimlicoRpc<GasEstimate>("eth_estimateUserOperationGas", [userOp, CONTRACTS.ENTRYPOINT]);
}

export async function sponsorUserOperation(userOp: UserOperationV07): Promise<SponsorUserOpResult> {
  return pimlicoRpc<SponsorUserOpResult>("pm_sponsorUserOperation", [userOp, CONTRACTS.ENTRYPOINT]);
}

export async function sendUserOperation(userOp: UserOperationV07): Promise<Hex> {
  return pimlicoRpc<Hex>("eth_sendUserOperation", [userOp, CONTRACTS.ENTRYPOINT]);
}

export async function getUserOperationReceipt(userOpHash: Hex): Promise<UserOpReceipt | null> {
  return pimlicoRpc<UserOpReceipt | null>("eth_getUserOperationReceipt", [userOpHash]);
}

export async function waitForUserOperationReceipt(
  userOpHash: Hex,
  timeout = 60000,
  pollInterval = 2000
): Promise<UserOpReceipt> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const receipt = await getUserOperationReceipt(userOpHash);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  throw new Error(`UserOp receipt timeout after ${timeout}ms`);
}

export async function isBundlerHealthy(): Promise<boolean> {
  if (!PIMLICO_API_KEY) return false;
  try {
    const entryPoints = await pimlicoRpc<Address[]>("eth_supportedEntryPoints", []);
    return entryPoints.includes(CONTRACTS.ENTRYPOINT);
  } catch {
    return false;
  }
}
