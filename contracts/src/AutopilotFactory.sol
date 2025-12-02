// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AutopilotAccount} from "./AutopilotAccount.sol";

/**
 * @title AutopilotFactory
 * @notice Factory contract for deploying AutopilotAccount instances
 * @dev Deploys deterministic accounts using CREATE2
 *
 *      In production, this may wrap or extend the ZeroDev KernelFactory
 *      to pre-install the AutoYieldModule on all new accounts.
 */
contract AutopilotFactory {
    // ============ Errors ============
    error AccountAlreadyExists();
    error DeploymentFailed();

    // ============ Events ============
    event AccountCreated(address indexed account, address indexed owner, uint256 salt);

    // ============ State ============

    /// @notice Address of the AutoYieldModule to install on new accounts
    address public immutable autoYieldModule;

    /// @notice Address of the default YieldAdapter
    address public immutable defaultAdapter;

    /// @notice Mapping of owner to their deployed account
    mapping(address => address) public accountOf;

    // ============ Constructor ============

    /**
     * @notice Initialize the factory
     * @param _autoYieldModule Address of the AutoYieldModule implementation
     * @param _defaultAdapter Address of the default YieldAdapter
     */
    constructor(address _autoYieldModule, address _defaultAdapter) {
        autoYieldModule = _autoYieldModule;
        defaultAdapter = _defaultAdapter;
    }

    // ============ External Functions ============

    /**
     * @notice Deploy a new AutopilotAccount for the caller
     * @param salt Salt for CREATE2 deterministic deployment
     * @return account Address of the deployed account
     */
    function createAccount(uint256 salt) external returns (address account) {
        return createAccountFor(msg.sender, salt);
    }

    /**
     * @notice Deploy a new AutopilotAccount for a specific owner
     * @param owner Owner of the new account
     * @param salt Salt for CREATE2 deterministic deployment
     * @return account Address of the deployed account
     */
    function createAccountFor(address owner, uint256 salt) public returns (address account) {
        // Check if account already exists
        if (accountOf[owner] != address(0)) revert AccountAlreadyExists();

        // TODO: Implement CREATE2 deployment
        // For now, use regular CREATE
        account = address(new AutopilotAccount(owner));

        if (account == address(0)) revert DeploymentFailed();

        // TODO: Install AutoYieldModule on the new account
        // AutopilotAccount(account).installModule(2, autoYieldModule, abi.encode(defaultAdapter));

        accountOf[owner] = account;

        emit AccountCreated(account, owner, salt);
    }

    /**
     * @notice Compute the address of an account before deployment
     * @param owner Owner of the account
     * @param salt Salt for CREATE2
     * @return The predicted account address
     */
    function getAddress(address owner, uint256 salt) external view returns (address) {
        // TODO: Implement CREATE2 address computation
        // For now, return zero as placeholder
        owner; // silence unused warning
        salt;  // silence unused warning
        return address(0);
    }

    /**
     * @notice Check if an account exists for an owner
     * @param owner Owner to check
     * @return True if account exists
     */
    function hasAccount(address owner) external view returns (bool) {
        return accountOf[owner] != address(0);
    }
}
