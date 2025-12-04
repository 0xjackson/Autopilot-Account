// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IModule, IExecutorModule, MODULE_TYPE_EXECUTOR} from "./interfaces/IERC7579Module.sol";
import {IYieldAdapter} from "./interfaces/IYieldAdapter.sol";
import {IKernel} from "./interfaces/IKernel.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title AutoYieldModule
 * @notice ERC-7579 executor module that automatically manages yield allocation
 * @dev The brain of Autopilot Wallet. Installed on each Kernel smart account.
 *
 *      Core functionality:
 *      1. executeWithAutoYield() - User spending with auto-unstake
 *      2. rebalance() - Move excess checking balance to yield
 *      3. migrateStrategy() - Switch between yield adapters
 *
 *      All operations happen within a single userOp.
 */
contract AutoYieldModule is IExecutorModule {
    using SafeERC20 for IERC20;

    // ============ Errors ============
    error NotInitialized();
    error AlreadyInitialized();
    error InvalidAdapter();
    error AdapterNotAllowed();
    error InsufficientBalance();
    error UnauthorizedCaller();

    // ============ Events ============
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

    // ============ Storage ============

    /// @notice Whether an account has been initialized
    mapping(address account => bool) public isInitialized;

    /// @notice Checking threshold per account per token
    /// @dev Balance to keep liquid. Excess goes to yield.
    mapping(address account => mapping(address token => uint256)) public checkingThreshold;

    /// @notice Current yield adapter per account per token
    mapping(address account => mapping(address token => address)) public currentAdapter;

    /// @notice Allowed adapters per account (whitelist for security)
    mapping(address account => mapping(address adapter => bool)) public allowedAdapters;

    /// @notice Automation key per account (can call rebalance/migrate)
    mapping(address account => address) public automationKey;

    // ============ Modifiers ============

    /**
     * @dev Only the smart account itself or authorized automation key can call
     */
    modifier onlyAuthorized(address account) {
        if (msg.sender != account && msg.sender != automationKey[account]) {
            revert UnauthorizedCaller();
        }
        _;
    }

    /**
     * @dev Only the smart account itself can call (owner operations)
     */
    modifier onlyAccount(address account) {
        if (msg.sender != account) {
            revert UnauthorizedCaller();
        }
        _;
    }

    // ============ ERC-7579 Module Interface ============

    /**
     * @notice Called when module is installed on an account
     * @param data Encoded (defaultAdapter, automationKey, initialThreshold)
     */
    function onInstall(bytes calldata data) external override {
        address account = msg.sender;
        if (isInitialized[account]) revert AlreadyInitialized();

        // Decode initialization data
        (address defaultAdapter, address _automationKey, uint256 initialThreshold) =
            abi.decode(data, (address, address, uint256));

        if (defaultAdapter == address(0)) revert InvalidAdapter();

        // Set up the account
        isInitialized[account] = true;
        automationKey[account] = _automationKey;

        // Allow and set the default adapter for USDC
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
     * @param data Optional de-init data (unused)
     */
    function onUninstall(bytes calldata data) external override {
        address account = msg.sender;
        isInitialized[account] = false;
        // Note: User should flush funds to checking before uninstalling
        data; // silence warning
    }

    /**
     * @notice Check if this module is of a certain type
     * @param moduleTypeId Module type ID to check
     * @return True if this is an executor module
     */
    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_EXECUTOR;
    }

    // ============ Core Functions ============

    /**
     * @notice Execute a call with automatic yield management
     * @dev The main user-facing function. Sequence:
     *      1. Check if checking balance covers amount + threshold
     *      2. If not, withdraw deficit from yield
     *      3. Execute the user's intended call
     *      4. If surplus remains, deposit to yield
     *
     * @param token Token being spent (for auto-unstake)
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

        // Step 1: Get current checking balance
        uint256 checking = IERC20(token).balanceOf(account);

        // Step 2: Calculate how much we need (for token transfers embedded in data)
        // For simple transfers, we parse the amount from data
        // For complex calls, user should ensure sufficient balance
        uint256 amountNeeded = _extractTransferAmount(data, token);
        uint256 required = amountNeeded + threshold;

        // Step 3: Withdraw from yield if checking is insufficient
        if (checking < required && adapter != address(0)) {
            uint256 deficit = required - checking;
            uint256 yieldBalance = _getYieldBalance(account, adapter);

            if (yieldBalance > 0) {
                uint256 toWithdraw = deficit > yieldBalance ? yieldBalance : deficit;
                _withdrawFromYield(account, adapter, toWithdraw);
                emit Withdrawn(account, token, toWithdraw);
            }
        }

        // Step 4: Execute the user's call via the Kernel account
        IKernel(account).execute(to, value, data);

        // Step 5: Check if we should deposit surplus to yield
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
     * @dev Called by automation after user receives funds.
     *      Deposits any excess above threshold into yield.
     *
     * @param token Token to rebalance
     */
    function rebalance(address token) external onlyAuthorized(msg.sender) {
        address account = msg.sender;
        if (!isInitialized[account]) revert NotInitialized();

        uint256 threshold = checkingThreshold[account][token];
        address adapter = currentAdapter[account][token];

        if (adapter == address(0)) return; // No adapter configured

        uint256 checking = IERC20(token).balanceOf(account);

        if (checking > threshold) {
            uint256 surplus = checking - threshold;
            _depositToYield(account, adapter, token, surplus);
            emit Rebalanced(account, token, surplus);
        }
    }

    /**
     * @notice Migrate funds from current adapter to a new one
     * @dev Called by automation when a better yield source is found.
     *      The new adapter must be in the allowlist.
     *
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
        if (oldAdapter == newAdapter) return; // Already on this adapter

        // Step 1: Withdraw everything from old adapter
        if (oldAdapter != address(0)) {
            uint256 yieldBalance = _getYieldBalance(account, oldAdapter);
            if (yieldBalance > 0) {
                _withdrawFromYield(account, oldAdapter, yieldBalance);
            }
        }

        // Step 2: Deposit surplus to new adapter (respecting threshold)
        uint256 threshold = checkingThreshold[account][token];
        uint256 checking = IERC20(token).balanceOf(account);

        if (checking > threshold) {
            uint256 toDeposit = checking - threshold;
            _depositToYield(account, newAdapter, token, toDeposit);
        }

        // Step 3: Update current adapter
        currentAdapter[account][token] = newAdapter;

        emit StrategyMigrated(account, token, oldAdapter, newAdapter);
    }

    /**
     * @notice Emergency: withdraw all funds from yield to checking
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

    // ============ Configuration Functions (Owner Only) ============

    /**
     * @notice Set the checking threshold for a token
     * @param token Token address
     * @param threshold New threshold (e.g., 100e6 for 100 USDC)
     */
    function setCheckingThreshold(address token, uint256 threshold) external onlyAccount(msg.sender) {
        checkingThreshold[msg.sender][token] = threshold;
        emit ThresholdUpdated(msg.sender, token, threshold);
    }

    /**
     * @notice Set the current adapter for a token
     * @param token Token address
     * @param adapter Adapter address (must be allowed)
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
     * @param key New automation key (address(0) to disable)
     */
    function setAutomationKey(address key) external onlyAccount(msg.sender) {
        automationKey[msg.sender] = key;
        emit AutomationKeyUpdated(msg.sender, key);
    }

    // ============ View Functions ============

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
     * @return Yield balance in underlying tokens
     */
    function getYieldBalance(address account, address token) external view returns (uint256) {
        address adapter = currentAdapter[account][token];
        if (adapter == address(0)) return 0;
        return _getYieldBalance(account, adapter);
    }

    // ============ Internal Functions ============

    /**
     * @dev Get yield balance from adapter
     *      Note: We need to call as the account since totalValue() uses msg.sender
     */
    function _getYieldBalance(address account, address adapter) internal view returns (uint256) {
        // The adapter tracks balances by msg.sender, but we're calling from the module
        // So we need a different approach - check the vault shares directly
        // For now, we'll use a try/catch with the adapter's totalValueOf if available
        try IYieldAdapterExtended(adapter).totalValueOf(account) returns (uint256 value) {
            return value;
        } catch {
            // Fallback: assume adapter uses msg.sender and return 0
            // This will be fixed when we integrate properly with Kernel execution
            return 0;
        }
    }

    /**
     * @dev Deposit to yield via Kernel execution
     */
    function _depositToYield(
        address account,
        address adapter,
        address token,
        uint256 amount
    ) internal {
        // Approve adapter to spend tokens
        bytes memory approveData = abi.encodeCall(IERC20.approve, (adapter, amount));
        IKernel(account).execute(token, 0, approveData);

        // Call adapter.deposit(amount)
        bytes memory depositData = abi.encodeCall(IYieldAdapter.deposit, (amount));
        IKernel(account).execute(adapter, 0, depositData);
    }

    /**
     * @dev Withdraw from yield via Kernel execution
     */
    function _withdrawFromYield(
        address account,
        address adapter,
        uint256 amount
    ) internal {
        bytes memory withdrawData = abi.encodeCall(IYieldAdapter.withdraw, (amount));
        IKernel(account).execute(adapter, 0, withdrawData);
    }

    /**
     * @dev Extract transfer amount from calldata
     *      Handles ERC20.transfer(to, amount) calls
     */
    function _extractTransferAmount(bytes calldata data, address token) internal pure returns (uint256) {
        // Check if this is an ERC20 transfer call
        if (data.length >= 68) {
            bytes4 selector = bytes4(data[:4]);
            // transfer(address,uint256) selector
            if (selector == IERC20.transfer.selector) {
                // Amount is the second parameter (bytes 36-68)
                return abi.decode(data[36:68], (uint256));
            }
        }
        token; // silence warning
        return 0;
    }
}

/**
 * @dev Extended interface for adapters that support totalValueOf
 */
interface IYieldAdapterExtended {
    function totalValueOf(address account) external view returns (uint256);
}
