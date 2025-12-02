// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IYieldAdapter} from "../interfaces/IYieldAdapter.sol";

/**
 * @title MockYieldVault
 * @notice Mock ERC-4626-like vault for testing and demo purposes
 * @dev Implements both the vault logic and IYieldAdapter interface for simplicity.
 *      In production, these would be separate contracts.
 *
 *      This mock vault:
 *      - Accepts USDC deposits
 *      - Issues shares 1:1 initially
 *      - Simulates yield by allowing manual share price increases
 *      - Implements IYieldAdapter so it can be used directly
 */
contract MockYieldVault is IYieldAdapter {
    // ============ Errors ============
    error InsufficientShares();
    error InsufficientAllowance();
    error TransferFailed();

    // ============ Events ============
    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
    event YieldAccrued(uint256 newSharePrice);

    // ============ State ============

    /// @notice The underlying asset (USDC)
    address public immutable asset;

    /// @notice Total shares minted
    uint256 public totalShares;

    /// @notice Shares per account
    mapping(address => uint256) public shares;

    /// @notice Share price in underlying (scaled by 1e18)
    /// @dev Starts at 1e18 (1:1), increases to simulate yield
    uint256 public sharePrice = 1e18;

    /// @notice Name of the vault token
    string public name = "Mock Yield Vault";

    /// @notice Symbol of the vault token
    string public symbol = "myvUSDC";

    // ============ Constructor ============

    /**
     * @notice Initialize the mock vault
     * @param _asset Address of the underlying asset (USDC)
     */
    constructor(address _asset) {
        asset = _asset;
    }

    // ============ ERC-4626-like Functions ============

    /**
     * @notice Deposit assets and receive shares
     * @param assets Amount of underlying to deposit
     * @param receiver Address to receive shares
     * @return sharesOut Amount of shares minted
     */
    function depositAssets(uint256 assets, address receiver) external returns (uint256 sharesOut) {
        sharesOut = convertToShares(assets);

        // TODO: Transfer assets from caller
        // IERC20(asset).transferFrom(msg.sender, address(this), assets);

        shares[receiver] += sharesOut;
        totalShares += sharesOut;

        emit Deposit(msg.sender, receiver, assets, sharesOut);
    }

    /**
     * @notice Withdraw assets by burning shares
     * @param assets Amount of underlying to withdraw
     * @param receiver Address to receive assets
     * @param owner Owner of the shares
     * @return sharesIn Amount of shares burned
     */
    function withdrawAssets(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256 sharesIn) {
        sharesIn = convertToShares(assets);

        if (shares[owner] < sharesIn) revert InsufficientShares();

        shares[owner] -= sharesIn;
        totalShares -= sharesIn;

        // TODO: Transfer assets to receiver
        // IERC20(asset).transfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, sharesIn);

        // Silence unused warning
        receiver;
    }

    /**
     * @notice Redeem shares for underlying
     * @param sharesToRedeem Amount of shares to redeem
     * @param receiver Address to receive assets
     * @param owner Owner of the shares
     * @return assets Amount of underlying received
     */
    function redeem(
        uint256 sharesToRedeem,
        address receiver,
        address owner
    ) external returns (uint256 assets) {
        if (shares[owner] < sharesToRedeem) revert InsufficientShares();

        assets = convertToAssets(sharesToRedeem);

        shares[owner] -= sharesToRedeem;
        totalShares -= sharesToRedeem;

        // TODO: Transfer assets to receiver
        // IERC20(asset).transfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, owner, assets, sharesToRedeem);
    }

    // ============ View Functions ============

    /**
     * @notice Convert assets to shares
     * @param assets Amount of underlying
     * @return Amount of shares
     */
    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * 1e18) / sharePrice;
    }

    /**
     * @notice Convert shares to assets
     * @param _shares Amount of shares
     * @return Amount of underlying
     */
    function convertToAssets(uint256 _shares) public view returns (uint256) {
        return (_shares * sharePrice) / 1e18;
    }

    /**
     * @notice Get total assets held by the vault
     * @return Total underlying assets
     */
    function totalAssets() external view returns (uint256) {
        return convertToAssets(totalShares);
    }

    // ============ Mock Functions (for testing) ============

    /**
     * @notice Simulate yield accrual by increasing share price
     * @param newSharePrice New share price (scaled by 1e18)
     */
    function accrueYield(uint256 newSharePrice) external {
        sharePrice = newSharePrice;
        emit YieldAccrued(newSharePrice);
    }

    /**
     * @notice Simulate yield accrual by percentage
     * @param basisPoints Yield in basis points (100 = 1%)
     */
    function accrueYieldBps(uint256 basisPoints) external {
        sharePrice = sharePrice + (sharePrice * basisPoints) / 10000;
        emit YieldAccrued(sharePrice);
    }

    // ============ IYieldAdapter Implementation ============

    /**
     * @inheritdoc IYieldAdapter
     */
    function deposit(address token, uint256 amount) external override returns (uint256) {
        if (token != asset) revert TransferFailed();
        // In a real implementation, would transfer and deposit
        uint256 sharesOut = convertToShares(amount);
        shares[msg.sender] += sharesOut;
        totalShares += sharesOut;
        emit Deposit(msg.sender, msg.sender, amount, sharesOut);
        return sharesOut;
    }

    /**
     * @inheritdoc IYieldAdapter
     */
    function withdraw(address token, uint256 amount) external override returns (uint256) {
        if (token != asset) revert TransferFailed();
        uint256 sharesIn = convertToShares(amount);
        if (shares[msg.sender] < sharesIn) revert InsufficientShares();
        shares[msg.sender] -= sharesIn;
        totalShares -= sharesIn;
        emit Withdraw(msg.sender, msg.sender, msg.sender, amount, sharesIn);
        return amount;
    }

    /**
     * @inheritdoc IYieldAdapter
     */
    function totalValue(address token, address account) external view override returns (uint256) {
        if (token != asset) return 0;
        return convertToAssets(shares[account]);
    }

    /**
     * @inheritdoc IYieldAdapter
     */
    function shareBalance(address token, address account) external view override returns (uint256) {
        if (token != asset) return 0;
        return shares[account];
    }

    /**
     * @inheritdoc IYieldAdapter
     */
    function sharesToUnderlying(address token, uint256 _shares) external view override returns (uint256) {
        if (token != asset) return 0;
        return convertToAssets(_shares);
    }

    /**
     * @inheritdoc IYieldAdapter
     */
    function underlyingToShares(address token, uint256 amount) external view override returns (uint256) {
        if (token != asset) return 0;
        return convertToShares(amount);
    }

    /**
     * @inheritdoc IYieldAdapter
     */
    function getVault(address token) external view override returns (address) {
        if (token != asset) return address(0);
        return address(this);
    }
}
