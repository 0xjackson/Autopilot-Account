import {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  concat,
  pad,
  toHex,
  type Hex,
  type Address,
} from "viem";
import { CONTRACTS, CHAIN_ID } from "./constants";

export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}

/**
 * Create the nonce key for querying EntryPoint.getNonce().
 * The key encodes the validator address and type.
 *
 * Key structure (192 bits):
 * - bits 0-7: validator type (0x01 = secondary)
 * - bits 8-167: validator address
 *
 * When passed to EntryPoint.getNonce(sender, key), the returned nonce
 * is already fully encoded and ready to use in the userOp.
 */
export function getNonceKey(validatorAddr: Address): bigint {
  return (0x01n << 8n) | (BigInt(validatorAddr) << 16n);
}

export function packUint128(high: bigint, low: bigint): Hex {
  return concat([
    pad(toHex(high), { size: 16 }),
    pad(toHex(low), { size: 16 }),
  ]) as Hex;
}

export function buildPaymasterAndData(
  paymaster: Address,
  verificationGasLimit: bigint,
  postOpGasLimit: bigint,
  paymasterData: Hex
): Hex {
  return concat([
    paymaster,
    pad(toHex(verificationGasLimit), { size: 16 }),
    pad(toHex(postOpGasLimit), { size: 16 }),
    paymasterData,
  ]) as Hex;
}

export function getUserOpHash(
  userOp: PackedUserOperation,
  chainId: bigint = CHAIN_ID
): Hex {
  const packedUserOp = keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32"
      ),
      [
        userOp.sender,
        userOp.nonce,
        keccak256(userOp.initCode),
        keccak256(userOp.callData),
        userOp.accountGasLimits as Hex,
        userOp.preVerificationGas,
        userOp.gasFees as Hex,
        keccak256(userOp.paymasterAndData),
      ]
    )
  );

  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, address, uint256"), [
      packedUserOp,
      CONTRACTS.ENTRYPOINT,
      chainId,
    ])
  );
}

// Unpack the 32-byte packed value into two 16-byte values (high, low)
function unpackUint128(packed: Hex): { high: Hex; low: Hex } {
  // packed is 66 chars (0x + 64 hex chars = 32 bytes)
  // high is first 16 bytes (32 hex chars), low is last 16 bytes
  const hex = packed.slice(2); // remove 0x
  return {
    high: `0x${hex.slice(0, 32)}` as Hex,
    low: `0x${hex.slice(32)}` as Hex,
  };
}

export function serializeUserOp(userOp: PackedUserOperation): Record<string, string> {
  // Unpack accountGasLimits: (verificationGasLimit, callGasLimit)
  const { high: verificationGasLimit, low: callGasLimit } = unpackUint128(userOp.accountGasLimits);
  // Unpack gasFees: (maxPriorityFeePerGas, maxFeePerGas)
  const { high: maxPriorityFeePerGas, low: maxFeePerGas } = unpackUint128(userOp.gasFees);

  // Parse initCode into factory + factoryData for v0.7
  // initCode = factory (20 bytes) + factoryData (rest)
  const hasFactory = userOp.initCode && userOp.initCode !== "0x" && userOp.initCode.length > 2;
  const factory = hasFactory ? (userOp.initCode.slice(0, 42) as Address) : undefined;
  const factoryData = hasFactory ? (`0x${userOp.initCode.slice(42)}` as Hex) : undefined;

  // Parse paymasterAndData into paymaster + paymasterVerificationGasLimit + paymasterPostOpGasLimit + paymasterData
  // paymasterAndData = paymaster (20 bytes) + verificationGasLimit (16 bytes) + postOpGasLimit (16 bytes) + data
  const hasPaymaster = userOp.paymasterAndData && userOp.paymasterAndData !== "0x" && userOp.paymasterAndData.length > 2;
  const paymaster = hasPaymaster ? (userOp.paymasterAndData.slice(0, 42) as Address) : undefined;
  const paymasterVerificationGasLimit = hasPaymaster ? (`0x${userOp.paymasterAndData.slice(42, 74)}` as Hex) : undefined;
  const paymasterPostOpGasLimit = hasPaymaster ? (`0x${userOp.paymasterAndData.slice(74, 106)}` as Hex) : undefined;
  const paymasterData = hasPaymaster ? (`0x${userOp.paymasterAndData.slice(106)}` as Hex) : undefined;

  // Build v0.7 unpacked format
  const result: Record<string, string | undefined> = {
    sender: userOp.sender,
    nonce: toHex(userOp.nonce),
    callData: userOp.callData,
    verificationGasLimit: trimHex(verificationGasLimit),
    callGasLimit: trimHex(callGasLimit),
    preVerificationGas: toHex(userOp.preVerificationGas),
    maxPriorityFeePerGas: trimHex(maxPriorityFeePerGas),
    maxFeePerGas: trimHex(maxFeePerGas),
    signature: userOp.signature,
  };

  // Add factory fields if present
  if (factory) {
    result.factory = factory;
    result.factoryData = factoryData;
  }

  // Add paymaster fields if present
  if (paymaster) {
    result.paymaster = paymaster;
    result.paymasterVerificationGasLimit = trimHex(paymasterVerificationGasLimit!);
    result.paymasterPostOpGasLimit = trimHex(paymasterPostOpGasLimit!);
    result.paymasterData = paymasterData;
  }

  return result as Record<string, string>;
}

// Remove leading zeros from hex string but keep at least 0x0
function trimHex(hex: Hex): Hex {
  const trimmed = hex.replace(/^0x0+/, "0x") || "0x0";
  return (trimmed === "0x" ? "0x0" : trimmed) as Hex;
}
