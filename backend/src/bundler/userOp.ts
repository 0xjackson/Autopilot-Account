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

const VALIDATOR_MODE_DEFAULT = "0x00" as Hex;
const VALIDATOR_TYPE_VALIDATOR = "0x01" as Hex;

export function getNonceKey(validatorAddr: Address, nonceKey: bigint = 0n): bigint {
  const encoding = pad(
    concat([
      VALIDATOR_MODE_DEFAULT,
      VALIDATOR_TYPE_VALIDATOR,
      validatorAddr,
      pad(toHex(nonceKey), { size: 2 }),
    ]),
    { size: 24 }
  ) as Hex;
  return BigInt(encoding);
}

export function packUint128(high: bigint, low: bigint): Hex {
  return concat([
    pad(toHex(high), { size: 16 }),
    pad(toHex(low), { size: 16 }),
  ]) as Hex;
}

export function getUserOpHashV07(
  userOp: {
    sender: Address;
    nonce: bigint;
    factory: Address | null;
    factoryData: Hex | null;
    callData: Hex;
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    paymaster: Address | null;
    paymasterVerificationGasLimit: bigint | null;
    paymasterPostOpGasLimit: bigint | null;
    paymasterData: Hex | null;
  },
  chainId: bigint = CHAIN_ID
): Hex {
  const initCode: Hex = userOp.factory
    ? concat([userOp.factory, userOp.factoryData || "0x"]) as Hex
    : "0x";

  const accountGasLimits = packUint128(userOp.verificationGasLimit, userOp.callGasLimit);
  const gasFees = packUint128(userOp.maxPriorityFeePerGas, userOp.maxFeePerGas);

  const paymasterAndData: Hex = userOp.paymaster
    ? concat([
        userOp.paymaster,
        pad(toHex(userOp.paymasterVerificationGasLimit || 0n), { size: 16 }),
        pad(toHex(userOp.paymasterPostOpGasLimit || 0n), { size: 16 }),
        userOp.paymasterData || "0x",
      ]) as Hex
    : "0x";

  const packedUserOp = keccak256(
    encodeAbiParameters(
      parseAbiParameters("address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32"),
      [
        userOp.sender,
        userOp.nonce,
        keccak256(initCode),
        keccak256(userOp.callData),
        accountGasLimits,
        userOp.preVerificationGas,
        gasFees,
        keccak256(paymasterAndData),
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
