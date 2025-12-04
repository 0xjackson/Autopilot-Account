/**
 * UserOperation building, nonce encoding, and hash calculation
 */

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

// =============================================================================
// Types
// =============================================================================

export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex; // packed: verificationGasLimit (16 bytes) | callGasLimit (16 bytes)
  preVerificationGas: bigint;
  gasFees: Hex; // packed: maxPriorityFeePerGas (16 bytes) | maxFeePerGas (16 bytes)
  paymasterAndData: Hex;
  signature: Hex;
}

// =============================================================================
// Nonce Encoding
// =============================================================================

/**
 * Encode nonce for Kernel v3 with specific validator
 *
 * Kernel v3 nonce structure (256 bits):
 * - bits 0-63: sequential nonce
 * - bits 64-79: key (unused, 0)
 * - bits 80-239: validator address (160 bits)
 * - bits 240-247: validator type (0x01 for secondary validator)
 * - bits 248-255: mode (0x00 for default)
 */
export function encodeNonceForValidator(
  validatorAddr: Address,
  sequentialNonce: bigint
): bigint {
  const mode = 0x00n;
  const vType = 0x01n; // Secondary validator
  const key = 0n;

  return (
    sequentialNonce |
    (key << 64n) |
    (BigInt(validatorAddr) << 80n) |
    (vType << 240n) |
    (mode << 248n)
  );
}

/**
 * Get the nonce key for querying EntryPoint
 * This encodes the validator into the key format EntryPoint expects
 */
export function getNonceKey(validatorAddr: Address): bigint {
  // Key format for Kernel v3: (validatorType << 8) | mode, shifted with validator
  return (0x01n << 8n) | 0x00n | (BigInt(validatorAddr) << 16n);
}

// =============================================================================
// Gas Packing
// =============================================================================

/**
 * Pack two uint128 values into bytes32
 * Used for accountGasLimits and gasFees
 */
export function packUint128(high: bigint, low: bigint): Hex {
  return concat([
    pad(toHex(high), { size: 16 }),
    pad(toHex(low), { size: 16 }),
  ]) as Hex;
}

/**
 * Build paymasterAndData from paymaster response
 */
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

// =============================================================================
// UserOp Hash Calculation
// =============================================================================

/**
 * Calculate userOpHash per ERC-4337 v0.7 spec
 */
export function getUserOpHash(
  userOp: PackedUserOperation,
  chainId: bigint = CHAIN_ID
): Hex {
  // Pack the UserOp fields
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

  // Hash with entrypoint and chainId
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, address, uint256"), [
      packedUserOp,
      CONTRACTS.ENTRYPOINT,
      chainId,
    ])
  );
}

// =============================================================================
// UserOp Serialization (for RPC)
// =============================================================================

/**
 * Serialize UserOp for JSON-RPC calls
 */
export function serializeUserOp(userOp: PackedUserOperation): Record<string, string> {
  return {
    sender: userOp.sender,
    nonce: toHex(userOp.nonce),
    initCode: userOp.initCode,
    callData: userOp.callData,
    accountGasLimits: userOp.accountGasLimits,
    preVerificationGas: toHex(userOp.preVerificationGas),
    gasFees: userOp.gasFees,
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature,
  };
}
