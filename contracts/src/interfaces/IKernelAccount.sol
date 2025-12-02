// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title IKernelAccount
 * @notice Minimal interface for ZeroDev Kernel v3 smart account
 * @dev This is a simplified interface, not the full Kernel implementation.
 *      For full functionality, see: https://github.com/zerodevapp/kernel
 */
interface IKernelAccount {
    /**
     * @notice Execute a single call from the account
     * @param to Target address
     * @param value ETH value to send
     * @param data Calldata to execute
     */
    function execute(address to, uint256 value, bytes calldata data) external;

    /**
     * @notice Execute multiple calls from the account
     * @param calls Array of calls to execute
     */
    function executeBatch(Call[] calldata calls) external;

    /**
     * @notice Install a module on the account
     * @param moduleTypeId Type of module (validator, executor, etc.)
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

/**
 * @notice Structure for batch execution calls
 */
struct Call {
    address to;
    uint256 value;
    bytes data;
}
