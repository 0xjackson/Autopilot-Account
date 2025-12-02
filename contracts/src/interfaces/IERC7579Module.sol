// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// Minimal interfaces for ERC-7579 compliant modules
// See: https://eips.ethereum.org/EIPS/eip-7579

// Module type identifiers per ERC-7579
uint256 constant MODULE_TYPE_VALIDATOR = 1;
uint256 constant MODULE_TYPE_EXECUTOR = 2;
uint256 constant MODULE_TYPE_FALLBACK = 3;
uint256 constant MODULE_TYPE_HOOK = 4;

/**
 * @title IModule
 * @notice Base interface that all ERC-7579 modules must implement
 */
interface IModule {
    /**
     * @notice Called when the module is installed on an account
     * @param data Initialization data
     */
    function onInstall(bytes calldata data) external;

    /**
     * @notice Called when the module is uninstalled from an account
     * @param data De-initialization data
     */
    function onUninstall(bytes calldata data) external;

    /**
     * @notice Check if the module is of a certain type
     * @param moduleTypeId The module type ID to check
     * @return True if the module is of the specified type
     */
    function isModuleType(uint256 moduleTypeId) external view returns (bool);
}

/**
 * @title IExecutorModule
 * @notice Interface for executor modules that can execute calls on behalf of the account
 */
interface IExecutorModule is IModule {
    // Executor modules implement custom execution logic
    // The actual execution methods are module-specific
}

/**
 * @title IValidatorModule
 * @notice Interface for validator modules that validate userOp signatures
 */
interface IValidatorModule is IModule {
    /**
     * @notice Validate a userOp signature
     * @param userOpHash Hash of the userOp
     * @param signature Signature to validate
     * @return validationData Packed validation data (see ERC-4337)
     */
    function validateUserOp(
        bytes32 userOpHash,
        bytes calldata signature
    ) external returns (uint256 validationData);
}
