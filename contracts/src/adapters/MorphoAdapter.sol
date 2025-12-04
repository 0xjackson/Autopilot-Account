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
 *      MetaMorpho vaults on Base offer 5-7% APY on USDC.
 *      All MetaMorpho vaults implement ERC-4626, making this adapter simple.
 *
 *      Example vaults on Base mainnet:
 *      - Steakhouse USDC: 0xBEEF...
 *      - Gauntlet USDC: 0x...
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
     *      3. Deposit to vault, receive shares
     *      4. Shares are held by THIS contract, tracked per caller
     *
     *      Note: In this implementation, shares go to the CALLER directly.
     *      The vault.deposit() sends shares to the receiver we specify.
     */
    function deposit(uint256 amount) external override returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();

        // Pull tokens from caller (caller must have approved this adapter)
        _asset.safeTransferFrom(msg.sender, address(this), amount);

        // Approve vault to spend tokens
        _asset.approve(address(_vault), amount);

        // Deposit to vault - shares go directly to caller
        shares = _vault.deposit(amount, msg.sender);

        emit Deposited(msg.sender, amount, shares);
    }

    /**
     * @inheritdoc IYieldAdapter
     * @dev Flow:
     *      1. Calculate shares needed for the requested amount
     *      2. Withdraw from vault (burns caller's shares)
     *      3. Assets sent directly to caller
     */
    function withdraw(uint256 amount) external override returns (uint256 actualAmount) {
        if (amount == 0) revert ZeroAmount();

        // Check caller has enough shares
        uint256 sharesNeeded = _vault.previewWithdraw(amount);
        uint256 callerShares = _vault.balanceOf(msg.sender);

        if (callerShares < sharesNeeded) revert InsufficientShares();

        // Withdraw from vault - assets go to caller, burns caller's shares
        actualAmount = _vault.withdraw(amount, msg.sender, msg.sender);

        emit Withdrawn(msg.sender, actualAmount, sharesNeeded);
    }

    /**
     * @inheritdoc IYieldAdapter
     * @dev Returns value of caller's shares in underlying tokens
     */
    function totalValue() external view override returns (uint256) {
        uint256 shares = _vault.balanceOf(msg.sender);
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
        uint256 shares = _vault.balanceOf(account);
        return _vault.convertToAssets(shares);
    }

    /**
     * @notice Get share balance for any account
     * @param account Account to check
     * @return Share balance in the vault
     */
    function sharesOf(address account) external view returns (uint256) {
        return _vault.balanceOf(account);
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
     * @notice Preview how many assets would be received for a withdrawal
     * @param assets Amount of underlying to withdraw
     * @return shares Amount of shares that would be burned
     */
    function previewWithdraw(uint256 assets) external view returns (uint256 shares) {
        return _vault.previewWithdraw(assets);
    }
}
