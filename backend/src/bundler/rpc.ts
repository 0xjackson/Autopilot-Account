import { createPublicClient, http, toHex, type Hex, type Address } from "viem";
import { base } from "viem/chains";
import { CONTRACTS, ENTRYPOINT_ABI, CHAIN_ID_HEX } from "./constants";
import {
  type PackedUserOperation,
  serializeUserOp,
  getNonceKey,
  buildPaymasterAndData,
} from "./userOp";

const CDP_BUNDLER_URL = process.env.CDP_BUNDLER_URL;

export const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

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

export interface PaymasterStubInput {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

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

export async function getNonce(walletAddress: Address): Promise<bigint> {
  const key = getNonceKey(CONTRACTS.VALIDATOR);
  return publicClient.readContract({
    address: CONTRACTS.ENTRYPOINT,
    abi: ENTRYPOINT_ABI,
    functionName: "getNonce",
    args: [walletAddress, key],
  });
}

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

export async function estimateUserOperationGas(
  userOp: PackedUserOperation
): Promise<GasEstimate> {
  return bundlerRpc<GasEstimate>("eth_estimateUserOperationGas", [
    serializeUserOp(userOp),
    CONTRACTS.ENTRYPOINT,
  ]);
}

export async function getPaymasterStubData(
  input: PaymasterStubInput
): Promise<Hex> {
  const result = await bundlerRpc<Record<string, unknown>>("pm_getPaymasterStubData", [
    {
      sender: input.sender,
      nonce: toHex(input.nonce),
      initCode: input.initCode,
      callData: input.callData,
      accountGasLimits: input.accountGasLimits,
      preVerificationGas: toHex(input.preVerificationGas),
      maxFeePerGas: toHex(input.maxFeePerGas),
      maxPriorityFeePerGas: toHex(input.maxPriorityFeePerGas),
    },
    CONTRACTS.ENTRYPOINT,
    CHAIN_ID_HEX,
  ]);

  // Handle both ERC-7677 response formats
  const paymasterAndData = result.paymasterAndData as Hex | undefined;

  // If we get paymasterAndData directly, return it
  if (paymasterAndData) {
    return paymasterAndData;
  }

  const paymaster = result.paymaster as Address;
  // Use default gas limits if not provided (100k each)
  const paymasterVerificationGasLimit = (result.paymasterVerificationGasLimit as Hex) || "0x186a0";
  const paymasterPostOpGasLimit = (result.paymasterPostOpGasLimit as Hex) || "0x186a0";
  const paymasterData = (result.paymasterData || "0x") as Hex;

  return buildPaymasterAndData(
    paymaster,
    BigInt(paymasterVerificationGasLimit),
    BigInt(paymasterPostOpGasLimit),
    paymasterData
  );
}

export async function getPaymasterData(
  input: PaymasterStubInput
): Promise<Hex> {
  const result = await bundlerRpc<PaymasterResult>("pm_getPaymasterData", [
    {
      sender: input.sender,
      nonce: toHex(input.nonce),
      initCode: input.initCode,
      callData: input.callData,
      accountGasLimits: input.accountGasLimits,
      preVerificationGas: toHex(input.preVerificationGas),
      maxFeePerGas: toHex(input.maxFeePerGas),
      maxPriorityFeePerGas: toHex(input.maxPriorityFeePerGas),
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

export async function sendUserOperation(userOp: PackedUserOperation): Promise<Hex> {
  return bundlerRpc<Hex>("eth_sendUserOperation", [
    serializeUserOp(userOp),
    CONTRACTS.ENTRYPOINT,
  ]);
}

export async function getUserOperationReceipt(
  userOpHash: Hex
): Promise<UserOpReceipt | null> {
  return bundlerRpc<UserOpReceipt | null>("eth_getUserOperationReceipt", [userOpHash]);
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
  if (!CDP_BUNDLER_URL) return false;

  try {
    const entryPoints = await bundlerRpc<Address[]>("eth_supportedEntryPoints", []);
    return entryPoints.includes(CONTRACTS.ENTRYPOINT);
  } catch {
    return false;
  }
}
