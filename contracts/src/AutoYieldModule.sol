// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IModule, IExecutorModule, MODULE_TYPE_EXECUTOR} from "./interfaces/IERC7579Module.sol";
import {IYieldAdapter} from "./interfaces/IYieldAdapter.sol";

/**
 * @title AutoYieldModule
 * @notice ERC-7579 executor module that automatically manages yield allocation
 * @dev This module implements the core Autopilot Wallet logic:
 *      1. Maintains a configurable checking balance threshold
 *      2. Automatically deposits excess into yield strategies
 *      3. Automatically withdraws from yield when spending exceeds checking balance
 *      4. Optionally sweeps dust tokens into USDC
 *
 *      All operations happen within a single userOp via executeWithAutoYield()
 */
contract AutoYieldModule is IExecutorModule {
    // ============ Errors ============
    error NotSmartAccount();
    error InvalidAdapter();
    error InvalidThreshold();
    error InsufficientBalance();
    error TransferFailed();

    // ============ Events ============
    event ConfigUpdated(address indexed account, address token, uint256 threshold, bool yieldEnabled);
    event YieldDeposited(address indexed account, address indexed token, uint256 amount);
    event YieldWithdrawn(address indexed account, address indexed token, uint256 amount);
    event DustSwept(address indexed account, address indexed fromToken, uint256 amount);
    event ExecutedWithAutoYield(address indexed account, address indexed to, uint256 amount);

    // ============ Structs ============

    /**
     * @notice Configuration for a token on an account
     */
    struct TokenConfig {
        uint256 checkingThreshold;  // Minimum balance to keep in checking
        bool yieldEnabled;          // Whether auto-yield is enabled for this token
        bool dustSweepEnabled;      // Whether dust sweep is enabled
        uint256 dustThreshold;      // Minimum USD value to keep (sweep below this)
    }

    // ============ State ============

    /// @notice Yield adapter for interacting with vaults
    IYieldAdapter public yieldAdapter;

    /// @notice Configuration per account per token
    mapping(address account => mapping(address token => TokenConfig)) public tokenConfigs;

    /// @notice Default configuration for new accounts
    TokenConfig public defaultConfig;

    // ============ Constructor ============

    constructor() {
        // Set sensible defaults
        defaultConfig = TokenConfig({
            checkingThreshold: 500e6,  // 500 USDC (6 decimals)
            yieldEnabled: true,
            dustSweepEnabled: true,
            dustThreshold: 1e6         // $1 USD
        });
    }

    // ============ ERC-7579 Module Interface ============

    /**
     * @notice Called when the module is installed on an account
     * @param data Encoded (adapter address, optional initial config)
     */
    function onInstall(bytes calldata data) external override {
        // Decode adapter address from init data
        address adapter = abi.decode(data, (address));
        if (adapter == address(0)) revert InvalidAdapter();

        // Store adapter (in production, this would be per-account)
        yieldAdapter = IYieldAdapter(adapter);

        // Initialize with default config for USDC
        // TODO: Get USDC address from config or parameter
    }

    /**
     * @notice Called when the module is uninstalled from an account
     * @param data Optional de-init data
     */
    function onUninstall(bytes calldata data) external override {
        // TODO: Withdraw all funds from yield back to checking
        data; // silence unused warning
    }

    /**
     * @notice Check if this module is of a certain type
     * @param moduleTypeId The module type ID to check
     * @return True if this is an executor module
     */
    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_EXECUTOR;
    }

    // ============ Core Functions ============

    /**
     * @notice Execute a transfer with automatic yield management
     * @dev This is the main entry point for Autopilot functionality.
     *      Sequence:
     *      1. Check if spendable balance >= amount + threshold
     *      2. If not, withdraw deficit from yield
     *      3. Execute the transfer
     *      4. If balance > threshold, deposit surplus to yield
     *
     * @param token Token to transfer (address(0) for ETH)
     * @param to Recipient address
     * @param amount Amount to transfer
     * @param data Additional calldata (for contract calls)
     */
    function executeWithAutoYield(
        address token,
        address to,
        uint256 amount,
        bytes calldata data
    ) external {
        address account = msg.sender;
        TokenConfig memory config = tokenConfigs[account][token];

        // TODO: Implement the core logic:
        // 1. Get current checking balance
        // 2. Calculate if we need to withdraw from yield
        // 3. Withdraw if needed
        // 4. Execute the transfer
        // 5. Check if we should deposit surplus to yield
        // 6. Deposit if needed

        emit ExecutedWithAutoYield(account, to, amount);

        // Silence unused warnings for skeleton
        data;
        config;
    }

    /**
     * @notice Manually rebalance funds between checking and yield
     * @param token Token to rebalance
     */
    function rebalance(address token) external {
        address account = msg.sender;
        TokenConfig memory config = tokenConfigs[account][token];

        if (!config.yieldEnabled) return;

        // TODO: Implement rebalance logic
        // 1. Get current checking balance
        // 2. If balance > threshold, deposit excess
        // 3. If balance < threshold and yield > 0, withdraw to meet threshold
    }

    /**
     * @notice Sweep dust tokens into USDC
     * @param tokens Array of token addresses to sweep
     */
    function sweepDust(address[] calldata tokens) external {
        address account = msg.sender;

        for (uint256 i = 0; i < tokens.length; i++) {
            // TODO: Implement dust sweep
            // 1. Check if token balance is below dust threshold
            // 2. If so, swap to USDC via Aerodrome/Uniswap
            // 3. Deposit swapped USDC to yield if configured

            emit DustSwept(account, tokens[i], 0);
        }
    }

    // ============ Configuration Functions ============

    /**
     * @notice Update configuration for a token
     * @param token Token address
     * @param threshold New checking threshold
     * @param yieldEnabled Whether yield is enabled
     * @param dustSweepEnabled Whether dust sweep is enabled
     * @param dustThreshold Dust threshold in USD
     */
    function setTokenConfig(
        address token,
        uint256 threshold,
        bool yieldEnabled,
        bool dustSweepEnabled,
        uint256 dustThreshold
    ) external {
        address account = msg.sender;

        tokenConfigs[account][token] = TokenConfig({
            checkingThreshold: threshold,
            yieldEnabled: yieldEnabled,
            dustSweepEnabled: dustSweepEnabled,
            dustThreshold: dustThreshold
        });

        emit ConfigUpdated(account, token, threshold, yieldEnabled);
    }

    /**
     * @notice Get configuration for a token
     * @param account Account address
     * @param token Token address
     * @return config The token configuration
     */
    function getTokenConfig(
        address account,
        address token
    ) external view returns (TokenConfig memory config) {
        config = tokenConfigs[account][token];

        // Return defaults if not configured
        if (config.checkingThreshold == 0 && !config.yieldEnabled) {
            config = defaultConfig;
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get total balance (checking + yield) for a token
     * @param account Account address
     * @param token Token address
     * @return total Total balance
     */
    function getTotalBalance(address account, address token) external view returns (uint256 total) {
        // TODO: Implement
        // return checkingBalance + yieldAdapter.totalValue(token, account);
        account; token; // silence warnings
        return 0;
    }

    /**
     * @notice Get checking balance for a token
     * @param account Account address
     * @param token Token address
     * @return balance Checking balance
     */
    function getCheckingBalance(address account, address token) external view returns (uint256 balance) {
        // TODO: Implement - return actual token balance of account
        account; token; // silence warnings
        return 0;
    }

    /**
     * @notice Get yield balance for a token
     * @param account Account address
     * @param token Token address
     * @return balance Yield balance (in underlying tokens)
     */
    function getYieldBalance(address account, address token) external view returns (uint256 balance) {
        // TODO: Implement
        // return yieldAdapter.totalValue(token, account);
        account; token; // silence warnings
        return 0;
    }
}
