// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title IKernel
 * @notice Interface for ZeroDev Kernel v3 smart account
 * @dev Based on https://github.com/zerodevapp/kernel (dev branch)
 *      Kernel v3 implements ERC-4337 + ERC-7579 for modular smart accounts.
 */

// ============ Type Definitions ============

/// @notice ValidationId is a 21-byte identifier for validators
/// Format: 1 byte validation type + 20 bytes validator address
type ValidationId is bytes21;

/// @notice Hook interface for lifecycle callbacks
interface IHook {
    function preCheck(address msgSender, uint256 value, bytes calldata data) external returns (bytes memory);
    function postCheck(bytes calldata hookData) external;
}

// ============ Libraries ============

/// @notice Library for creating ValidationId from validator address
library ValidatorLib {
    /// @notice Validation type for standard validators
    bytes1 constant VALIDATION_TYPE_VALIDATOR = 0x01;

    /// @notice Validation type for permission-based validators
    bytes1 constant VALIDATION_TYPE_PERMISSION = 0x02;

    /// @notice Create a ValidationId for a standard validator
    /// @param validator The validator contract address
    /// @return The encoded ValidationId (0x01 + validator address)
    function validatorToIdentifier(address validator) internal pure returns (ValidationId) {
        return ValidationId.wrap(bytes21(abi.encodePacked(VALIDATION_TYPE_VALIDATOR, validator)));
    }

    /// @notice Create a ValidationId for a permission-based validator
    /// @param permission The permission contract address
    /// @return The encoded ValidationId (0x02 + permission address)
    function permissionToIdentifier(address permission) internal pure returns (ValidationId) {
        return ValidationId.wrap(bytes21(abi.encodePacked(VALIDATION_TYPE_PERMISSION, permission)));
    }
}

// ============ Kernel Interface ============

interface IKernel {
    /**
     * @notice Initialize the Kernel account with a root validator
     * @param _rootValidator The ValidationId for the root validator
     * @param hook Optional hook for the root validator (address(0) for none)
     * @param validatorData Initialization data for the validator
     * @param hookData Initialization data for the hook
     * @param initConfig Array of additional initialization calls (e.g., installing modules)
     */
    function initialize(
        ValidationId _rootValidator,
        IHook hook,
        bytes calldata validatorData,
        bytes calldata hookData,
        bytes[] calldata initConfig
    ) external;

    /**
     * @notice Execute a call from this account
     * @param to Target address
     * @param value ETH value
     * @param data Calldata
     */
    function execute(address to, uint256 value, bytes calldata data) external;

    /**
     * @notice Install a module on the account
     * @param moduleTypeId Type of module (1=validator, 2=executor, 3=fallback, 4=hook)
     * @param module Module address
     * @param initData Initialization data for the module
     */
    function installModule(uint256 moduleTypeId, address module, bytes calldata initData) external;

    /**
     * @notice Uninstall a module from the account
     * @param moduleTypeId Type of module
     * @param module Module address
     * @param deInitData De-initialization data
     */
    function uninstallModule(uint256 moduleTypeId, address module, bytes calldata deInitData) external;

    /**
     * @notice Check if a module is installed
     * @param moduleTypeId Type of module
     * @param module Module address
     * @param additionalContext Additional context for the check
     * @return True if module is installed
     */
    function isModuleInstalled(
        uint256 moduleTypeId,
        address module,
        bytes calldata additionalContext
    ) external view returns (bool);
}

// ============ Kernel Factory Interface ============

interface IKernelFactory {
    /**
     * @notice Create a new Kernel account
     * @param data Initialization data (encoded call to Kernel.initialize)
     * @param salt Salt for deterministic deployment
     * @return account The deployed account address
     */
    function createAccount(bytes calldata data, bytes32 salt) external payable returns (address account);

    /**
     * @notice Compute the address of an account before deployment
     * @param data Initialization data
     * @param salt Salt for deployment
     * @return The predicted account address
     */
    function getAddress(bytes calldata data, bytes32 salt) external view returns (address);
}

// ============ Module Type Constants ============
// Module type identifiers per ERC-7579

uint256 constant MODULE_TYPE_VALIDATOR = 1;
uint256 constant MODULE_TYPE_EXECUTOR = 2;
uint256 constant MODULE_TYPE_FALLBACK = 3;
uint256 constant MODULE_TYPE_HOOK = 4;
