// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IKernelAccount, Call} from "./interfaces/IKernelAccount.sol";

/**
 * @title AutopilotAccount
 * @notice ERC-4337 smart account wrapper based on ZeroDev Kernel v3
 * @dev This is a skeleton contract. The actual implementation will either:
 *      1. Inherit from the Kernel contract directly, or
 *      2. Be deployed via Kernel's factory with AutoYieldModule pre-installed
 *
 *      For hackathon purposes, we may use Kernel directly and just install the module.
 */
contract AutopilotAccount {
    // ============ Errors ============
    error NotAuthorized();
    error ModuleNotInstalled();

    // ============ Events ============
    event ModuleInstalled(uint256 indexed moduleTypeId, address indexed module);
    event ModuleUninstalled(uint256 indexed moduleTypeId, address indexed module);
    event Executed(address indexed to, uint256 value, bytes data);

    // ============ State ============

    /// @notice Owner of the account (EOA that controls it)
    address public owner;

    /// @notice Address of the installed AutoYieldModule
    address public autoYieldModule;

    /// @notice Mapping of installed modules by type
    mapping(uint256 => mapping(address => bool)) public installedModules;

    // ============ Constructor ============

    /**
     * @notice Initialize the account with an owner
     * @param _owner The EOA owner of this account
     */
    constructor(address _owner) {
        owner = _owner;
    }

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    modifier onlyModule() {
        if (!installedModules[2][msg.sender]) revert ModuleNotInstalled();
        _;
    }

    // ============ External Functions ============

    /**
     * @notice Execute a call from this account
     * @param to Target address
     * @param value ETH value
     * @param data Calldata
     */
    function execute(address to, uint256 value, bytes calldata data) external onlyOwner {
        // TODO: Implement execution logic
        // This will delegate to the installed module for auto-yield functionality
        emit Executed(to, value, data);
    }

    /**
     * @notice Execute multiple calls in a batch
     * @param calls Array of calls to execute
     */
    function executeBatch(Call[] calldata calls) external onlyOwner {
        // TODO: Implement batch execution
        for (uint256 i = 0; i < calls.length; i++) {
            emit Executed(calls[i].to, calls[i].value, calls[i].data);
        }
    }

    /**
     * @notice Install a module on the account
     * @param moduleTypeId Type of module (1=validator, 2=executor, etc.)
     * @param module Module address
     * @param initData Initialization data for the module
     */
    function installModule(
        uint256 moduleTypeId,
        address module,
        bytes calldata initData
    ) external onlyOwner {
        // TODO: Implement module installation
        // Should call module.onInstall(initData)
        installedModules[moduleTypeId][module] = true;

        // Track AutoYieldModule specifically
        if (moduleTypeId == 2) {
            autoYieldModule = module;
        }

        emit ModuleInstalled(moduleTypeId, module);
    }

    /**
     * @notice Uninstall a module from the account
     * @param moduleTypeId Type of module
     * @param module Module address
     * @param deInitData De-initialization data
     */
    function uninstallModule(
        uint256 moduleTypeId,
        address module,
        bytes calldata deInitData
    ) external onlyOwner {
        // TODO: Implement module uninstallation
        // Should call module.onUninstall(deInitData)
        installedModules[moduleTypeId][module] = false;

        if (autoYieldModule == module) {
            autoYieldModule = address(0);
        }

        emit ModuleUninstalled(moduleTypeId, module);
    }

    /**
     * @notice Check if a module is installed
     * @param moduleTypeId Type of module
     * @param module Module address
     * @return True if installed
     */
    function isModuleInstalled(
        uint256 moduleTypeId,
        address module,
        bytes calldata /* additionalContext */
    ) external view returns (bool) {
        return installedModules[moduleTypeId][module];
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}
}
