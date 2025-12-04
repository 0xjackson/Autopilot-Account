// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IYieldAdapter} from "../interfaces/IYieldAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockYieldVault
 * @notice Mock ERC-4626-like vault for testing and demos
 * @dev Implements IYieldAdapter directly (acts as both vault AND adapter).
 *
 *      Features:
 *      - Accepts deposits of underlying token (e.g., USDC)
 *      - Issues shares 1:1 initially
 *      - Owner can call accrueYield() to simulate yield (increases share price)
 *      - Real ERC20 transfers (not just accounting)
 */
contract MockYieldVault is IYieldAdapter {
    using SafeERC20 for IERC20;

    // ============ Errors ============
    error InsufficientShares();
    error InsufficientBalance();

    // ============ Events ============
    event Deposit(address indexed account, uint256 assets, uint256 shares);
    event Withdraw(address indexed account, uint256 assets, uint256 shares);
    event YieldAccrued(uint256 oldSharePrice, uint256 newSharePrice);

    // ============ State ============

    /// @notice The underlying asset (e.g., USDC)
    IERC20 public immutable _asset;

    /// @notice Total shares outstanding
    uint256 public totalShares;

    /// @notice Shares per account
    mapping(address => uint256) public shares;

    /// @notice Share price scaled by 1e18 (starts at 1:1)
    uint256 public sharePrice = 1e18;

    /// @notice Vault name
    string public constant name = "Mock Yield Vault";

    /// @notice Vault symbol
    string public constant symbol = "mockVault";

    // ============ Constructor ============

    /**
     * @param assetToken Address of the underlying token (USDC)
     */
    constructor(address assetToken) {
        _asset = IERC20(assetToken);
    }

    // ============ IYieldAdapter Implementation ============

    /**
     * @inheritdoc IYieldAdapter
     */
    function deposit(uint256 amount) external override returns (uint256 sharesOut) {
        if (amount == 0) return 0;

        // Calculate shares to mint
        sharesOut = _convertToShares(amount);

        // Transfer tokens from caller to vault
        _asset.safeTransferFrom(msg.sender, address(this), amount);

        // Mint shares to caller
        shares[msg.sender] += sharesOut;
        totalShares += sharesOut;

        emit Deposit(msg.sender, amount, sharesOut);
    }

    /**
     * @inheritdoc IYieldAdapter
     */
    function withdraw(uint256 amount) external override returns (uint256 actualAmount) {
        if (amount == 0) return 0;

        // Calculate shares to burn
        uint256 sharesToBurn = _convertToShares(amount);

        if (shares[msg.sender] < sharesToBurn) revert InsufficientShares();

        // Check vault has enough balance
        uint256 vaultBalance = _asset.balanceOf(address(this));
        actualAmount = amount > vaultBalance ? vaultBalance : amount;

        // Recalculate shares if we're withdrawing less
        if (actualAmount < amount) {
            sharesToBurn = _convertToShares(actualAmount);
        }

        // Burn shares
        shares[msg.sender] -= sharesToBurn;
        totalShares -= sharesToBurn;

        // Transfer tokens to caller
        _asset.safeTransfer(msg.sender, actualAmount);

        emit Withdraw(msg.sender, actualAmount, sharesToBurn);
    }

    /**
     * @inheritdoc IYieldAdapter
     */
    function totalValue() external view override returns (uint256) {
        return _convertToAssets(shares[msg.sender]);
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
        return address(this);
    }

    // ============ View Functions ============

    /**
     * @notice Get total value for any account
     * @param account Account to check
     * @return Total value in underlying tokens
     */
    function totalValueOf(address account) external view returns (uint256) {
        return _convertToAssets(shares[account]);
    }

    /**
     * @notice Get share balance for any account
     * @param account Account to check
     * @return Share balance
     */
    function sharesOf(address account) external view returns (uint256) {
        return shares[account];
    }

    /**
     * @notice Total assets held by vault
     */
    function totalAssets() external view returns (uint256) {
        return _asset.balanceOf(address(this));
    }

    // ============ Mock Functions (for testing/demos) ============

    /**
     * @notice Simulate yield by increasing share price
     * @param newSharePrice New price (1e18 = 1:1, 1.05e18 = 5% yield)
     */
    function accrueYield(uint256 newSharePrice) external {
        uint256 oldPrice = sharePrice;
        sharePrice = newSharePrice;
        emit YieldAccrued(oldPrice, newSharePrice);
    }

    /**
     * @notice Simulate yield by basis points
     * @param bps Basis points to add (100 = 1%)
     */
    function accrueYieldBps(uint256 bps) external {
        uint256 oldPrice = sharePrice;
        sharePrice = sharePrice + (sharePrice * bps) / 10000;
        emit YieldAccrued(oldPrice, sharePrice);
    }

    // ============ Internal Functions ============

    function _convertToShares(uint256 assets) internal view returns (uint256) {
        return (assets * 1e18) / sharePrice;
    }

    function _convertToAssets(uint256 _shares) internal view returns (uint256) {
        return (_shares * sharePrice) / 1e18;
    }
}
