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
 * Encode nonce for Kernel v3 with specific validator.
 *
 * Nonce structure (256 bits):
 * - bits 0-63: sequential nonce
 * - bits 64-79: key (unused)
 * - bits 80-239: validator address
 * - bits 240-247: validator type (0x01 = secondary)
 * - bits 248-255: mode (0x00 = default)
 */
export function encodeNonceForValidator(
  validatorAddr: Address,
  sequentialNonce: bigint
): bigint {
  return (
    sequentialNonce |
    (BigInt(validatorAddr) << 80n) |
    (0x01n << 240n)
  );
}

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
