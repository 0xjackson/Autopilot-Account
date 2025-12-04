// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IYieldAdapter} from "../interfaces/IYieldAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MorphoAdapter
 * @notice Adapter for Morpho MetaMorpho vaults (ERC-4626 compliant)
 * @dev Wraps a single MetaMorpho vault. Deploy one adapter per vault.
 *
 *      Design: The adapter holds vault shares on behalf of users and tracks
 *      ownership internally. This avoids the need for users to approve the
 *      adapter for share transfers on every withdrawal.
 *
 *      MetaMorpho vaults on Base offer 5-7% APY on USDC.
 */
contract MorphoAdapter is IYieldAdapter {
    using SafeERC20 for IERC20;

    // ============ Errors ============
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientShares();

    // ============ Events ============
    event Deposited(address indexed account, uint256 assets, uint256 shares);
    event Withdrawn(address indexed account, uint256 assets, uint256 shares);

    // ============ Immutables ============

    /// @notice The MetaMorpho vault (ERC-4626)
    IERC4626 public immutable _vault;

    /// @notice The underlying asset (e.g., USDC)
    IERC20 public immutable _asset;

    // ============ State ============

    /// @notice Shares owned by each account (held by this adapter)
    mapping(address => uint256) public sharesOf;

    /// @notice Total shares held by this adapter
    uint256 public totalSharesHeld;

    // ============ Constructor ============

    /**
     * @param vaultAddress Address of the MetaMorpho vault
     */
    constructor(address vaultAddress) {
        if (vaultAddress == address(0)) revert ZeroAddress();

        _vault = IERC4626(vaultAddress);
        _asset = IERC20(_vault.asset());
    }

    // ============ IYieldAdapter Implementation ============

    /**
     * @inheritdoc IYieldAdapter
     * @dev Flow:
     *      1. Pull underlying tokens from caller
     *      2. Approve vault to spend tokens
     *      3. Deposit to vault (adapter receives shares)
     *      4. Credit shares to caller's internal balance
     */
    function deposit(uint256 amount) external override returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();

        // Pull tokens from caller
        _asset.safeTransferFrom(msg.sender, address(this), amount);

        // Approve vault to spend tokens
        _asset.approve(address(_vault), amount);

        // Deposit to vault - shares come to this adapter
        shares = _vault.deposit(amount, address(this));

        // Credit shares to caller
        sharesOf[msg.sender] += shares;
        totalSharesHeld += shares;

        emit Deposited(msg.sender, amount, shares);
    }

    /**
     * @inheritdoc IYieldAdapter
     * @dev Flow:
     *      1. Check caller has enough shares
     *      2. Redeem shares from vault (adapter burns its shares)
     *      3. Debit caller's internal share balance
     *      4. Transfer assets to caller
     */
    function withdraw(uint256 amount) external override returns (uint256 actualAmount) {
        if (amount == 0) revert ZeroAmount();

        // Calculate shares needed
        uint256 sharesToBurn = _vault.previewWithdraw(amount);
        uint256 callerShares = sharesOf[msg.sender];

        if (callerShares < sharesToBurn) revert InsufficientShares();

        // Debit shares from caller's balance
        sharesOf[msg.sender] -= sharesToBurn;
        totalSharesHeld -= sharesToBurn;

        // Withdraw from vault - adapter burns its shares, assets go to caller
        actualAmount = _vault.withdraw(amount, msg.sender, address(this));

        emit Withdrawn(msg.sender, actualAmount, sharesToBurn);
    }

    /**
     * @inheritdoc IYieldAdapter
     * @dev Returns value of caller's shares in underlying tokens
     */
    function totalValue() external view override returns (uint256) {
        uint256 shares = sharesOf[msg.sender];
        return _vault.convertToAssets(shares);
    }

    /**
     * @inheritdoc IYieldAdapter
     */
    function asset() external view override returns (address) {
        return address(_asset);
    }

    /**
     * @inheritdoc IYieldAdapter
     */
    function vault() external view override returns (address) {
        return address(_vault);
    }

    // ============ View Helpers ============

    /**
     * @notice Get total value for any account
     * @param account Account to check
     * @return Total value in underlying tokens
     */
    function totalValueOf(address account) external view returns (uint256) {
        uint256 shares = sharesOf[account];
        return _vault.convertToAssets(shares);
    }

    /**
     * @notice Preview how many shares would be received for a deposit
     * @param assets Amount of underlying to deposit
     * @return shares Amount of shares that would be received
     */
    function previewDeposit(uint256 assets) external view returns (uint256 shares) {
        return _vault.previewDeposit(assets);
    }

    /**
     * @notice Preview how many shares would be burned for a withdrawal
     * @param assets Amount of underlying to withdraw
     * @return shares Amount of shares that would be burned
     */
    function previewWithdraw(uint256 assets) external view returns (uint256 shares) {
        return _vault.previewWithdraw(assets);
    }
}
