// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IModule, IExecutorModule, MODULE_TYPE_EXECUTOR} from "./interfaces/IERC7579Module.sol";
import {IYieldAdapter} from "./interfaces/IYieldAdapter.sol";
import {IKernel} from "./interfaces/IKernel.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

//     ___         __              _ __      __
//    /   | __  __/ /_____  ____  (_) /___  / /_
//   / /| |/ / / / __/ __ \/ __ \/ / / __ \/ __/
//  / ___ / /_/ / /_/ /_/ / /_/ / / / /_/ / /_
// /_/  |_\__,_/\__/\____/ .___/_/_/\____/\__/
//                      /_/
//
// ERC-7579 executor module for automatic yield management
// https://github.com/autopilot-wallet

/**
 * @title AutoYieldModule
 * @author Autopilot
 * @notice Automatically manages yield allocation for smart wallet balances
 */
contract AutoYieldModule is IExecutorModule {
    using SafeERC20 for IERC20;

    error NotInitialized();
    error AlreadyInitialized();
    error InvalidAdapter();
    error AdapterNotAllowed();
    error InsufficientBalance();
    error UnauthorizedCaller();

    event Initialized(address indexed account, address indexed adapter);
    event ThresholdUpdated(address indexed account, address indexed token, uint256 threshold);
    event AdapterUpdated(address indexed account, address indexed token, address adapter);
    event AdapterAllowed(address indexed account, address indexed adapter, bool allowed);
    event AutomationKeyUpdated(address indexed account, address indexed automationKey);
    event Deposited(address indexed account, address indexed token, uint256 amount);
    event Withdrawn(address indexed account, address indexed token, uint256 amount);
    event Rebalanced(address indexed account, address indexed token, uint256 deposited);
    event StrategyMigrated(address indexed account, address indexed token, address from, address to);
    event ExecutedWithAutoYield(address indexed account, address indexed to, uint256 value);

    mapping(address account => bool) public isInitialized;
    mapping(address account => mapping(address token => uint256)) public checkingThreshold;
    mapping(address account => mapping(address token => address)) public currentAdapter;
    mapping(address account => mapping(address adapter => bool)) public allowedAdapters;
    mapping(address account => address) public automationKey;

    modifier onlyAuthorized(address account) {
        if (msg.sender != account && msg.sender != automationKey[account]) {
            revert UnauthorizedCaller();
        }
        _;
    }

    modifier onlyAccount(address account) {
        if (msg.sender != account) {
            revert UnauthorizedCaller();
        }
        _;
    }

    /**
     * @notice Called when module is installed on an account
     * @param data Encoded (defaultAdapter, automationKey, initialThreshold)
     */
    function onInstall(bytes calldata data) external override {
        address account = msg.sender;
        if (isInitialized[account]) revert AlreadyInitialized();

        (address defaultAdapter, address _automationKey, uint256 initialThreshold) =
            abi.decode(data, (address, address, uint256));

        if (defaultAdapter == address(0)) revert InvalidAdapter();

        isInitialized[account] = true;
        automationKey[account] = _automationKey;

        address usdc = IYieldAdapter(defaultAdapter).asset();
        allowedAdapters[account][defaultAdapter] = true;
        currentAdapter[account][usdc] = defaultAdapter;
        checkingThreshold[account][usdc] = initialThreshold;

        emit Initialized(account, defaultAdapter);
        emit AdapterAllowed(account, defaultAdapter, true);
        emit AutomationKeyUpdated(account, _automationKey);
    }

    /**
     * @notice Called when module is uninstalled from an account
     * @param data Unused
     */
    function onUninstall(bytes calldata data) external override {
        address account = msg.sender;
        isInitialized[account] = false;
        data;
    }

    /**
     * @notice Check if this module is of a certain type
     * @param moduleTypeId Module type ID to check
     * @return True if this is an executor module
     */
    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_EXECUTOR;
    }

    /**
     * @notice Execute a call with automatic yield management
     * @param token Token being spent
     * @param to Target address for the call
     * @param value ETH value to send
     * @param data Calldata for the call
     */
    function executeWithAutoYield(
        address token,
        address to,
        uint256 value,
        bytes calldata data
    ) external {
        address account = msg.sender;
        if (!isInitialized[account]) revert NotInitialized();

        uint256 threshold = checkingThreshold[account][token];
        address adapter = currentAdapter[account][token];

        uint256 checking = IERC20(token).balanceOf(account);
        uint256 amountNeeded = _extractTransferAmount(data, token);
        uint256 required = amountNeeded + threshold;

        if (checking < required && adapter != address(0)) {
            uint256 deficit = required - checking;
            uint256 yieldBalance = _getYieldBalance(account, adapter);

            if (yieldBalance > 0) {
                uint256 toWithdraw = deficit > yieldBalance ? yieldBalance : deficit;
                _withdrawFromYield(account, adapter, toWithdraw);
                emit Withdrawn(account, token, toWithdraw);
            }
        }

        IKernel(account).execute(to, value, data);

        uint256 newChecking = IERC20(token).balanceOf(account);
        if (newChecking > threshold && adapter != address(0)) {
            uint256 surplus = newChecking - threshold;
            _depositToYield(account, adapter, token, surplus);
            emit Deposited(account, token, surplus);
        }

        emit ExecutedWithAutoYield(account, to, value);
    }

    /**
     * @notice Rebalance funds between checking and yield
     * @param token Token to rebalance
     */
    function rebalance(address token) external onlyAuthorized(msg.sender) {
        address account = msg.sender;
        if (!isInitialized[account]) revert NotInitialized();

        uint256 threshold = checkingThreshold[account][token];
        address adapter = currentAdapter[account][token];

        if (adapter == address(0)) return;

        uint256 checking = IERC20(token).balanceOf(account);

        if (checking > threshold) {
            uint256 surplus = checking - threshold;
            _depositToYield(account, adapter, token, surplus);
            emit Rebalanced(account, token, surplus);
        }
    }

    /**
     * @notice Migrate funds from current adapter to a new one
     * @param token Token to migrate
     * @param newAdapter Address of the new adapter
     */
    function migrateStrategy(
        address token,
        address newAdapter
    ) external onlyAuthorized(msg.sender) {
        address account = msg.sender;
        if (!isInitialized[account]) revert NotInitialized();
        if (!allowedAdapters[account][newAdapter]) revert AdapterNotAllowed();

        address oldAdapter = currentAdapter[account][token];
        if (oldAdapter == newAdapter) return;

        if (oldAdapter != address(0)) {
            uint256 yieldBalance = _getYieldBalance(account, oldAdapter);
            if (yieldBalance > 0) {
                _withdrawFromYield(account, oldAdapter, yieldBalance);
            }
        }

        uint256 threshold = checkingThreshold[account][token];
        uint256 checking = IERC20(token).balanceOf(account);

        if (checking > threshold) {
            uint256 toDeposit = checking - threshold;
            _depositToYield(account, newAdapter, token, toDeposit);
        }

        currentAdapter[account][token] = newAdapter;

        emit StrategyMigrated(account, token, oldAdapter, newAdapter);
    }

    /**
     * @notice Withdraw all funds from yield to checking
     * @param token Token to flush
     */
    function flushToChecking(address token) external onlyAccount(msg.sender) {
        address account = msg.sender;
        address adapter = currentAdapter[account][token];

        if (adapter != address(0)) {
            uint256 yieldBalance = _getYieldBalance(account, adapter);
            if (yieldBalance > 0) {
                _withdrawFromYield(account, adapter, yieldBalance);
                emit Withdrawn(account, token, yieldBalance);
            }
        }
    }

    /**
     * @notice Set the checking threshold for a token
     * @param token Token address
     * @param threshold New threshold
     */
    function setCheckingThreshold(address token, uint256 threshold) external onlyAccount(msg.sender) {
        checkingThreshold[msg.sender][token] = threshold;
        emit ThresholdUpdated(msg.sender, token, threshold);
    }

    /**
     * @notice Set the current adapter for a token
     * @param token Token address
     * @param adapter Adapter address
     */
    function setCurrentAdapter(address token, address adapter) external onlyAccount(msg.sender) {
        if (adapter != address(0) && !allowedAdapters[msg.sender][adapter]) {
            revert AdapterNotAllowed();
        }
        currentAdapter[msg.sender][token] = adapter;
        emit AdapterUpdated(msg.sender, token, adapter);
    }

    /**
     * @notice Add or remove an adapter from the allowlist
     * @param adapter Adapter address
     * @param allowed Whether to allow or disallow
     */
    function setAdapterAllowed(address adapter, bool allowed) external onlyAccount(msg.sender) {
        allowedAdapters[msg.sender][adapter] = allowed;
        emit AdapterAllowed(msg.sender, adapter, allowed);
    }

    /**
     * @notice Set the automation key for background operations
     * @param key New automation key
     */
    function setAutomationKey(address key) external onlyAccount(msg.sender) {
        automationKey[msg.sender] = key;
        emit AutomationKeyUpdated(msg.sender, key);
    }

    /**
     * @notice Get total balance (checking + yield) for a token
     * @param account Account address
     * @param token Token address
     * @return Total balance
     */
    function getTotalBalance(address account, address token) external view returns (uint256) {
        uint256 checking = IERC20(token).balanceOf(account);
        address adapter = currentAdapter[account][token];

        if (adapter == address(0)) return checking;

        uint256 yield_ = _getYieldBalance(account, adapter);
        return checking + yield_;
    }

    /**
     * @notice Get checking balance for a token
     * @param account Account address
     * @param token Token address
     * @return Checking balance
     */
    function getCheckingBalance(address account, address token) external view returns (uint256) {
        return IERC20(token).balanceOf(account);
    }

    /**
     * @notice Get yield balance for a token
     * @param account Account address
     * @param token Token address
     * @return Yield balance
     */
    function getYieldBalance(address account, address token) external view returns (uint256) {
        address adapter = currentAdapter[account][token];
        if (adapter == address(0)) return 0;
        return _getYieldBalance(account, adapter);
    }

    function _getYieldBalance(address account, address adapter) internal view returns (uint256) {
        try IYieldAdapterExtended(adapter).totalValueOf(account) returns (uint256 value) {
            return value;
        } catch {
            return 0;
        }
    }

    function _depositToYield(
        address account,
        address adapter,
        address token,
        uint256 amount
    ) internal {
        bytes memory approveData = abi.encodeCall(IERC20.approve, (adapter, amount));
        IKernel(account).execute(token, 0, approveData);

        bytes memory depositData = abi.encodeCall(IYieldAdapter.deposit, (amount));
        IKernel(account).execute(adapter, 0, depositData);
    }

    function _withdrawFromYield(
        address account,
        address adapter,
        uint256 amount
    ) internal {
        bytes memory withdrawData = abi.encodeCall(IYieldAdapter.withdraw, (amount));
        IKernel(account).execute(adapter, 0, withdrawData);
    }

    function _extractTransferAmount(bytes calldata data, address token) internal pure returns (uint256) {
        if (data.length >= 68) {
            bytes4 selector = bytes4(data[:4]);
            if (selector == IERC20.transfer.selector) {
                return abi.decode(data[36:68], (uint256));
            }
        }
        token;
        return 0;
    }
}

interface IYieldAdapterExtended {
    function totalValueOf(address account) external view returns (uint256);
}
