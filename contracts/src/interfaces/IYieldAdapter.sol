// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title IYieldAdapter
 * @notice Interface for yield adapters that wrap ERC-4626 vaults or similar yield sources
 * @dev Each adapter instance handles ONE token and ONE vault.
 *      This keeps the interface simple and adapters stateless.
 *      Deploy multiple adapters for multiple vaults.
 */
interface IYieldAdapter {
    /**
     * @notice Deposit tokens into the yield strategy
     * @dev Caller must have approved this adapter to spend the tokens.
     *      The adapter pulls tokens from caller, deposits to vault,
     *      and vault shares are credited to the CALLER (not the adapter).
     * @param amount Amount of underlying tokens to deposit
     * @return shares Amount of vault shares received
     */
    function deposit(uint256 amount) external returns (uint256 shares);

    /**
     * @notice Withdraw tokens from the yield strategy
     * @dev Burns caller's vault shares and sends underlying tokens to caller.
     * @param amount Amount of underlying tokens to withdraw
     * @return actualAmount Actual amount withdrawn (may differ due to rounding)
     */
    function withdraw(uint256 amount) external returns (uint256 actualAmount);

    /**
     * @notice Get total value of caller's deposits in underlying token terms
     * @return value Total value (shares converted to underlying)
     */
    function totalValue() external view returns (uint256 value);

    /**
     * @notice Get the underlying asset address (e.g., USDC)
     * @return The token address this adapter accepts
     */
    function asset() external view returns (address);

    /**
     * @notice Get the vault address this adapter wraps
     * @return The vault contract address
     */
    function vault() external view returns (address);
}
