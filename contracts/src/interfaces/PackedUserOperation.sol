// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title PackedUserOperation
 * @notice ERC-4337 EntryPoint v0.7 UserOperation struct
 * @dev This is the packed format used by EntryPoint 0.7
 *      Address: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
 */
struct PackedUserOperation {
    /// @notice The sender account of this request
    address sender;
    /// @notice Unique value the sender uses to verify it is not a replay
    uint256 nonce;
    /// @notice If set, creates account contract via factory (or EIP-7702 delegation)
    bytes initCode;
    /// @notice The method call to execute on this account
    bytes callData;
    /// @notice Packed verification and call gas limits (128 bits each)
    bytes32 accountGasLimits;
    /// @notice Gas not calculated by handleOps, but added to gas paid
    uint256 preVerificationGas;
    /// @notice Packed maxPriorityFeePerGas and maxFeePerGas (128 bits each)
    bytes32 gasFees;
    /// @notice Paymaster address + verification/postOp gas limits + paymaster data
    bytes paymasterAndData;
    /// @notice Sender-verified signature over the request
    bytes signature;
}
