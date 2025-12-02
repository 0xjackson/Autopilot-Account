// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title IYieldAdapter
 * @notice Interface for yield adapters that wrap ERC-4626 vaults or similar yield sources
 * @dev Provides a consistent interface for the AutoYieldModule to interact with various yield strategies
 */
interface IYieldAdapter {
    /**
     * @notice Deposit tokens into the yield strategy
     * @param token Address of the token to deposit
     * @param amount Amount to deposit
     * @return shares Amount of shares/receipt tokens received
     */
    function deposit(address token, uint256 amount) external returns (uint256 shares);

    /**
     * @notice Withdraw tokens from the yield strategy
     * @param token Address of the token to withdraw
     * @param amount Amount of underlying tokens to withdraw
     * @return actualAmount Actual amount withdrawn (may differ due to fees/slippage)
     */
    function withdraw(address token, uint256 amount) external returns (uint256 actualAmount);

    /**
     * @notice Get the total value of deposited assets for an account
     * @param token Address of the underlying token
     * @param account Address of the account to check
     * @return value Total value in terms of the underlying token
     */
    function totalValue(address token, address account) external view returns (uint256 value);

    /**
     * @notice Get the current balance of shares for an account
     * @param token Address of the underlying token
     * @param account Address of the account to check
     * @return shares Balance of shares/receipt tokens
     */
    function shareBalance(address token, address account) external view returns (uint256 shares);

    /**
     * @notice Convert shares to underlying token amount
     * @param token Address of the underlying token
     * @param shares Amount of shares
     * @return amount Equivalent amount of underlying tokens
     */
    function sharesToUnderlying(address token, uint256 shares) external view returns (uint256 amount);

    /**
     * @notice Convert underlying token amount to shares
     * @param token Address of the underlying token
     * @param amount Amount of underlying tokens
     * @return shares Equivalent amount of shares
     */
    function underlyingToShares(address token, uint256 amount) external view returns (uint256 shares);

    /**
     * @notice Get the address of the underlying vault/strategy
     * @param token Address of the underlying token
     * @return vault Address of the vault contract
     */
    function getVault(address token) external view returns (address vault);
}
