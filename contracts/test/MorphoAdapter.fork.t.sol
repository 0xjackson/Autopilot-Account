// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import {MorphoAdapter} from "../src/adapters/MorphoAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title MorphoAdapterForkTest
 * @notice Fork test against real Morpho vaults on Base mainnet
 * @dev Run with: forge test --match-contract MorphoAdapterForkTest --fork-url https://mainnet.base.org -vvv
 */
contract MorphoAdapterForkTest is Test {
    // ============ Base Mainnet Addresses ============

    /// @notice Native USDC on Base
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    /// @notice Moonwell Flagship USDC MetaMorpho vault (high TVL, ~5% APY)
    /// From Morpho API - this is a popular USDC vault on Base
    address constant MORPHO_VAULT_MOONWELL_USDC = 0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca;

    /// @notice Steakhouse USDC vault (another popular option)
    address constant MORPHO_VAULT_STEAKHOUSE_USDC = 0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183;

    /// @notice Gauntlet USDC Prime vault
    address constant MORPHO_VAULT_GAUNTLET_USDC = 0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61;

    // ============ Test State ============

    MorphoAdapter public adapter;
    IERC20 public usdc;
    IERC4626 public vault;

    address public user;
    uint256 public constant DEPOSIT_AMOUNT = 1000e6; // 1000 USDC

    // ============ Setup ============

    function setUp() public {
        // We'll test with Moonwell Flagship USDC vault (high TVL)
        vault = IERC4626(MORPHO_VAULT_MOONWELL_USDC);
        usdc = IERC20(USDC);

        // Deploy adapter pointing to the real vault
        adapter = new MorphoAdapter(address(vault));

        // Create a test user
        user = makeAddr("user");

        // Deal USDC to user (fork magic - gives us tokens without needing a whale)
        deal(USDC, user, DEPOSIT_AMOUNT * 10);
    }

    // ============ Basic Tests ============

    function test_adapterPointsToCorrectVault() public view {
        assertEq(adapter.vault(), address(vault));
        assertEq(adapter.asset(), USDC);
    }

    function test_vaultIsERC4626Compliant() public view {
        // Verify the vault responds to ERC4626 calls
        assertEq(vault.asset(), USDC);
        assertGt(vault.totalAssets(), 0, "Vault should have assets");
    }

    function test_adapterTracksSharesInternally() public {
        vm.startPrank(user);

        usdc.approve(address(adapter), DEPOSIT_AMOUNT);
        uint256 shares = adapter.deposit(DEPOSIT_AMOUNT);

        // Adapter should track user's shares internally
        assertEq(adapter.sharesOf(user), shares, "Adapter should track user shares");

        // Vault shares should be held by adapter, not user
        assertEq(vault.balanceOf(address(adapter)), shares, "Vault shares held by adapter");
        assertEq(vault.balanceOf(user), 0, "User should have no direct vault shares");

        vm.stopPrank();
    }

    // ============ Deposit Tests ============

    function test_deposit() public {
        vm.startPrank(user);

        // Approve adapter to spend USDC
        usdc.approve(address(adapter), DEPOSIT_AMOUNT);

        // Record balances before
        uint256 usdcBefore = usdc.balanceOf(user);
        uint256 sharesBefore = adapter.sharesOf(user);

        // Deposit
        uint256 sharesReceived = adapter.deposit(DEPOSIT_AMOUNT);

        // Verify
        assertGt(sharesReceived, 0, "Should receive shares");
        assertEq(usdc.balanceOf(user), usdcBefore - DEPOSIT_AMOUNT, "USDC should be spent");
        assertEq(adapter.sharesOf(user), sharesBefore + sharesReceived, "Should have shares tracked by adapter");

        vm.stopPrank();
    }

    function test_depositAndCheckValue() public {
        vm.startPrank(user);

        usdc.approve(address(adapter), DEPOSIT_AMOUNT);
        adapter.deposit(DEPOSIT_AMOUNT);

        // Check total value - should be approximately equal to deposit (minus any fees)
        uint256 value = adapter.totalValueOf(user);

        // Allow 1% slippage for any deposit fees
        assertApproxEqRel(value, DEPOSIT_AMOUNT, 0.01e18, "Value should be ~deposit amount");

        vm.stopPrank();
    }

    // ============ Withdraw Tests ============

    function test_withdraw() public {
        vm.startPrank(user);

        // First deposit
        usdc.approve(address(adapter), DEPOSIT_AMOUNT);
        adapter.deposit(DEPOSIT_AMOUNT);

        uint256 valueAfterDeposit = adapter.totalValueOf(user);
        uint256 usdcBefore = usdc.balanceOf(user);

        // Withdraw a fixed small amount (100 USDC)
        uint256 withdrawAmount = 100e6;
        adapter.withdraw(withdrawAmount);

        // User should have received USDC
        uint256 usdcReceived = usdc.balanceOf(user) - usdcBefore;
        assertGt(usdcReceived, 0, "Should receive USDC");
        assertApproxEqAbs(usdcReceived, withdrawAmount, 1e6, "Should receive ~requested amount");

        // Value should be reduced
        uint256 valueAfterWithdraw = adapter.totalValueOf(user);
        assertLt(valueAfterWithdraw, valueAfterDeposit, "Value should decrease after withdraw");

        vm.stopPrank();
    }

    function test_withdrawAll() public {
        vm.startPrank(user);

        // Deposit
        usdc.approve(address(adapter), DEPOSIT_AMOUNT);
        adapter.deposit(DEPOSIT_AMOUNT);

        // Get current value
        uint256 currentValue = adapter.totalValueOf(user);
        uint256 usdcBefore = usdc.balanceOf(user);

        // Withdraw all
        adapter.withdraw(currentValue);

        // Should have very little or no value left
        uint256 remainingValue = adapter.totalValueOf(user);
        assertLt(remainingValue, 1e6, "Should have almost no value left"); // < $1

        // Should have received USDC
        assertGt(usdc.balanceOf(user), usdcBefore, "Should receive USDC");

        vm.stopPrank();
    }

    // ============ Integration Tests ============

    function test_fullCycle() public {
        vm.startPrank(user);

        uint256 initialBalance = usdc.balanceOf(user);

        // 1. Deposit
        usdc.approve(address(adapter), DEPOSIT_AMOUNT);
        adapter.deposit(DEPOSIT_AMOUNT);

        assertEq(usdc.balanceOf(user), initialBalance - DEPOSIT_AMOUNT);

        // 2. Check value
        uint256 valueInVault = adapter.totalValueOf(user);
        assertApproxEqRel(valueInVault, DEPOSIT_AMOUNT, 0.01e18);

        // 3. Withdraw everything
        adapter.withdraw(valueInVault);

        // 4. Should have approximately same USDC back (minus any fees)
        uint256 finalBalance = usdc.balanceOf(user);
        assertApproxEqRel(finalBalance, initialBalance, 0.02e18, "Should recover most funds");

        vm.stopPrank();
    }

    // ============ Multiple Vault Tests ============

    function test_steakhouseVault() public {
        // Test with Steakhouse vault
        MorphoAdapter steakhouseAdapter = new MorphoAdapter(MORPHO_VAULT_STEAKHOUSE_USDC);

        assertEq(steakhouseAdapter.asset(), USDC);

        vm.startPrank(user);
        usdc.approve(address(steakhouseAdapter), DEPOSIT_AMOUNT);
        uint256 shares = steakhouseAdapter.deposit(DEPOSIT_AMOUNT);
        assertGt(shares, 0, "Should receive shares from Steakhouse vault");
        assertEq(steakhouseAdapter.sharesOf(user), shares, "Shares tracked correctly");

        uint256 value = steakhouseAdapter.totalValueOf(user);
        assertApproxEqRel(value, DEPOSIT_AMOUNT, 0.01e18);
        vm.stopPrank();
    }

    function test_gauntletVault() public {
        // Test with Gauntlet vault
        MorphoAdapter gauntletAdapter = new MorphoAdapter(MORPHO_VAULT_GAUNTLET_USDC);

        assertEq(gauntletAdapter.asset(), USDC);

        vm.startPrank(user);
        usdc.approve(address(gauntletAdapter), DEPOSIT_AMOUNT);
        uint256 shares = gauntletAdapter.deposit(DEPOSIT_AMOUNT);
        assertGt(shares, 0, "Should receive shares from Gauntlet vault");
        assertEq(gauntletAdapter.sharesOf(user), shares, "Shares tracked correctly");

        uint256 value = gauntletAdapter.totalValueOf(user);
        assertApproxEqRel(value, DEPOSIT_AMOUNT, 0.01e18);
        vm.stopPrank();
    }

    // ============ Edge Cases ============

    function test_depositZeroReverts() public {
        vm.startPrank(user);
        vm.expectRevert(MorphoAdapter.ZeroAmount.selector);
        adapter.deposit(0);
        vm.stopPrank();
    }

    function test_withdrawZeroReverts() public {
        vm.startPrank(user);
        vm.expectRevert(MorphoAdapter.ZeroAmount.selector);
        adapter.withdraw(0);
        vm.stopPrank();
    }

    function test_withdrawMoreThanBalanceReverts() public {
        vm.startPrank(user);

        // Deposit some
        usdc.approve(address(adapter), DEPOSIT_AMOUNT);
        adapter.deposit(DEPOSIT_AMOUNT);

        // Try to withdraw way more
        vm.expectRevert(MorphoAdapter.InsufficientShares.selector);
        adapter.withdraw(DEPOSIT_AMOUNT * 10);

        vm.stopPrank();
    }

    // ============ View Function Tests ============

    function test_previewDeposit() public {
        uint256 expectedShares = adapter.previewDeposit(DEPOSIT_AMOUNT);

        vm.startPrank(user);
        usdc.approve(address(adapter), DEPOSIT_AMOUNT);
        uint256 actualShares = adapter.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        // Preview should be accurate (within 0.1% due to potential block changes)
        assertApproxEqRel(actualShares, expectedShares, 0.001e18);
    }

    function test_previewWithdraw() public {
        vm.startPrank(user);
        usdc.approve(address(adapter), DEPOSIT_AMOUNT);
        adapter.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        uint256 sharesNeeded = adapter.previewWithdraw(DEPOSIT_AMOUNT / 2);
        assertGt(sharesNeeded, 0, "Should need shares to withdraw");
    }

    function test_totalSharesHeldTracking() public {
        vm.startPrank(user);
        usdc.approve(address(adapter), DEPOSIT_AMOUNT);
        uint256 shares = adapter.deposit(DEPOSIT_AMOUNT);
        vm.stopPrank();

        assertEq(adapter.totalSharesHeld(), shares, "Total shares held should match");
    }
}
