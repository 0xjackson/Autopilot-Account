// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import {AutoYieldModule} from "../src/AutoYieldModule.sol";
import {AutopilotFactory} from "../src/AutopilotFactory.sol";
import {AutomationValidator} from "../src/AutomationValidator.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IKernel, IKernelFactory, IHook, ValidationId, ValidatorLib} from "../src/interfaces/IKernel.sol";

/**
 * @title AutoYieldModuleForkTest
 * @notice Fork tests against real Morpho MetaMorpho vaults on Base mainnet
 * @dev Run with: forge test --match-contract AutoYieldModuleForkTest --fork-url https://mainnet.base.org -vvv
 */
contract AutoYieldModuleForkTest is Test {
    // ============ Base Mainnet Addresses ============
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant KERNEL_FACTORY = 0x2577507b78c2008Ff367261CB6285d44ba5eF2E9;
    address constant ECDSA_VALIDATOR = 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57;

    // Morpho MetaMorpho vaults on Base
    address constant VAULT_MOONWELL = 0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca;
    address constant VAULT_STEAKHOUSE = 0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183;
    address constant VAULT_GAUNTLET = 0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61;

    AutoYieldModule public module;
    AutopilotFactory public factory;
    AutomationValidator public validator;
    IERC20 public usdc;
    IERC4626 public vault;

    address public owner;
    address public automationKey;
    uint256 public automationPrivateKey;
    address public wallet;

    uint256 constant DEPOSIT_AMOUNT = 1000e6;
    uint256 constant THRESHOLD = 1e6;

    function setUp() public {
        if (block.chainid != 8453) {
            return;
        }

        usdc = IERC20(USDC);
        vault = IERC4626(VAULT_MOONWELL);

        automationPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        automationKey = vm.addr(automationPrivateKey);
        owner = makeAddr("owner");

        module = new AutoYieldModule();
        validator = new AutomationValidator();
        factory = new AutopilotFactory(
            KERNEL_FACTORY,
            ECDSA_VALIDATOR,
            address(module),
            address(validator),
            VAULT_MOONWELL,
            automationKey
        );

        wallet = factory.createAccountFor(owner, bytes32(uint256(1)));

        deal(USDC, wallet, DEPOSIT_AMOUNT * 10);
    }

    modifier onlyFork() {
        if (block.chainid != 8453) {
            console.log("SKIPPED: Not on Base mainnet (chainid:", block.chainid, ")");
            return;
        }
        _;
    }

    // ============ Initialization Tests ============

    function test_fork_01_walletInitialized() public onlyFork {
        assertTrue(module.isInitialized(wallet));
        assertEq(module.currentVault(wallet, USDC), VAULT_MOONWELL);
        assertEq(module.checkingThreshold(wallet, USDC), THRESHOLD);
        assertTrue(module.allowedVaults(wallet, VAULT_MOONWELL));
    }

    function test_fork_02_vaultIsERC4626() public onlyFork {
        assertEq(vault.asset(), USDC);
        assertGt(vault.totalAssets(), 0);
    }

    // ============ Rebalance Tests ============

    function test_fork_03_rebalanceDepositsToVault() public onlyFork {
        uint256 checkingBefore = usdc.balanceOf(wallet);
        uint256 sharesBefore = vault.balanceOf(wallet);

        assertEq(sharesBefore, 0, "Should start with no shares");
        assertGt(checkingBefore, THRESHOLD, "Should have funds above threshold");

        vm.prank(wallet);
        module.rebalance(USDC);

        uint256 checkingAfter = usdc.balanceOf(wallet);
        uint256 sharesAfter = vault.balanceOf(wallet);

        assertEq(checkingAfter, THRESHOLD, "Should have exactly threshold in checking");
        assertGt(sharesAfter, 0, "Should have vault shares");

        uint256 yieldBalance = module.getYieldBalance(wallet, USDC);
        assertApproxEqRel(yieldBalance, checkingBefore - THRESHOLD, 0.01e18);

        console.log("Rebalance results:");
        console.log("  Checking before:", checkingBefore / 1e6, "USDC");
        console.log("  Checking after:", checkingAfter / 1e6, "USDC");
        console.log("  Shares received:", sharesAfter);
        console.log("  Yield balance:", yieldBalance / 1e6, "USDC");
    }

    function test_fork_04_getTotalBalanceAfterRebalance() public onlyFork {
        uint256 totalBefore = module.getTotalBalance(wallet, USDC);

        vm.prank(wallet);
        module.rebalance(USDC);

        uint256 totalAfter = module.getTotalBalance(wallet, USDC);

        assertApproxEqRel(totalAfter, totalBefore, 0.01e18, "Total balance should be preserved");
    }

    // ============ Flush Tests ============

    function test_fork_05_flushToChecking() public onlyFork {
        vm.prank(wallet);
        module.rebalance(USDC);

        uint256 yieldBefore = module.getYieldBalance(wallet, USDC);
        assertGt(yieldBefore, 0, "Should have yield balance");

        vm.prank(wallet);
        module.flushToChecking(USDC);

        uint256 checkingAfter = usdc.balanceOf(wallet);
        uint256 sharesAfter = vault.balanceOf(wallet);

        assertLt(sharesAfter, 1e6, "Should have minimal shares (dust)");
        assertApproxEqRel(checkingAfter, DEPOSIT_AMOUNT * 10, 0.01e18, "Should have all funds back");

        console.log("Flush results:");
        console.log("  Yield before:", yieldBefore / 1e6, "USDC");
        console.log("  Checking after:", checkingAfter / 1e6, "USDC");
        console.log("  Remaining shares:", sharesAfter);
    }

    // ============ Migration Tests ============

    function test_fork_06_migrateToNewVault() public onlyFork {
        vm.prank(wallet);
        module.rebalance(USDC);

        uint256 moonwellSharesBefore = vault.balanceOf(wallet);
        assertGt(moonwellSharesBefore, 0, "Should have Moonwell shares");

        IERC4626 steakhouseVault = IERC4626(VAULT_STEAKHOUSE);
        uint256 steakhouseSharesBefore = steakhouseVault.balanceOf(wallet);
        assertEq(steakhouseSharesBefore, 0, "Should have no Steakhouse shares");

        uint256 totalBefore = module.getTotalBalance(wallet, USDC);

        vm.prank(wallet);
        module.migrateStrategy(USDC, VAULT_STEAKHOUSE);

        assertEq(module.currentVault(wallet, USDC), VAULT_STEAKHOUSE);
        assertTrue(module.allowedVaults(wallet, VAULT_STEAKHOUSE));

        uint256 moonwellSharesAfter = vault.balanceOf(wallet);
        uint256 steakhouseSharesAfter = steakhouseVault.balanceOf(wallet);

        assertLt(moonwellSharesAfter, 1e6, "Moonwell shares should be dust");
        assertGt(steakhouseSharesAfter, 0, "Should have Steakhouse shares");

        uint256 totalAfter = module.getTotalBalance(wallet, USDC);
        assertApproxEqRel(totalAfter, totalBefore, 0.02e18, "Total balance preserved after migration");

        console.log("Migration results:");
        console.log("  Moonwell shares before:", moonwellSharesBefore);
        console.log("  Moonwell shares after:", moonwellSharesAfter);
        console.log("  Steakhouse shares after:", steakhouseSharesAfter);
        console.log("  Total before:", totalBefore / 1e6, "USDC");
        console.log("  Total after:", totalAfter / 1e6, "USDC");
    }

    function test_fork_07_migratePreservesThreshold() public onlyFork {
        vm.prank(wallet);
        module.rebalance(USDC);

        uint256 checkingBefore = usdc.balanceOf(wallet);
        assertEq(checkingBefore, THRESHOLD);

        vm.prank(wallet);
        module.migrateStrategy(USDC, VAULT_STEAKHOUSE);

        uint256 checkingAfter = usdc.balanceOf(wallet);
        assertEq(checkingAfter, THRESHOLD, "Checking balance should remain at threshold");
    }

    // ============ Multiple Vault Tests ============

    function test_fork_08_gauntletVaultWorks() public onlyFork {
        IERC4626 gauntletVault = IERC4626(VAULT_GAUNTLET);

        vm.prank(wallet);
        module.migrateStrategy(USDC, VAULT_GAUNTLET);

        assertEq(module.currentVault(wallet, USDC), VAULT_GAUNTLET);

        uint256 shares = gauntletVault.balanceOf(wallet);
        assertGt(shares, 0, "Should have Gauntlet shares");

        uint256 yieldBalance = module.getYieldBalance(wallet, USDC);
        assertGt(yieldBalance, 0, "Should have yield balance");

        console.log("Gauntlet vault test:");
        console.log("  Shares:", shares);
        console.log("  Yield balance:", yieldBalance / 1e6, "USDC");
    }

    // ============ Edge Cases ============

    function test_fork_09_rebalanceNoOpBelowThreshold() public onlyFork {
        vm.prank(wallet);
        IERC20(USDC).transfer(address(0xdead), DEPOSIT_AMOUNT * 10 - THRESHOLD / 2);

        uint256 checkingBefore = usdc.balanceOf(wallet);
        assertLt(checkingBefore, THRESHOLD);

        vm.prank(wallet);
        module.rebalance(USDC);

        assertEq(usdc.balanceOf(wallet), checkingBefore, "Balance unchanged");
        assertEq(vault.balanceOf(wallet), 0, "No shares minted");
    }

    function test_fork_10_multipleRebalancesIdempotent() public onlyFork {
        vm.prank(wallet);
        module.rebalance(USDC);

        uint256 checkingAfterFirst = usdc.balanceOf(wallet);
        uint256 sharesAfterFirst = vault.balanceOf(wallet);

        vm.prank(wallet);
        module.rebalance(USDC);

        assertEq(usdc.balanceOf(wallet), checkingAfterFirst);
        assertEq(vault.balanceOf(wallet), sharesAfterFirst);
    }

    // ============ Full Flow Test ============

    function test_fork_11_fullLifecycle() public onlyFork {
        console.log("=== Full Lifecycle Test ===");

        uint256 initialBalance = usdc.balanceOf(wallet);
        console.log("1. Initial balance:", initialBalance / 1e6, "USDC");

        vm.prank(wallet);
        module.rebalance(USDC);
        console.log("2. After rebalance:");
        console.log("   Checking:", usdc.balanceOf(wallet) / 1e6, "USDC");
        console.log("   Yield:", module.getYieldBalance(wallet, USDC) / 1e6, "USDC");

        vm.prank(wallet);
        module.migrateStrategy(USDC, VAULT_STEAKHOUSE);
        console.log("3. After migration to Steakhouse:");
        console.log("   Checking:", usdc.balanceOf(wallet) / 1e6, "USDC");
        console.log("   Yield:", module.getYieldBalance(wallet, USDC) / 1e6, "USDC");
        console.log("   Current vault:", module.currentVault(wallet, USDC));

        vm.prank(wallet);
        module.migrateStrategy(USDC, VAULT_GAUNTLET);
        console.log("4. After migration to Gauntlet:");
        console.log("   Checking:", usdc.balanceOf(wallet) / 1e6, "USDC");
        console.log("   Yield:", module.getYieldBalance(wallet, USDC) / 1e6, "USDC");

        vm.prank(wallet);
        module.flushToChecking(USDC);
        uint256 finalBalance = usdc.balanceOf(wallet);
        console.log("5. After flush:");
        console.log("   Final balance:", finalBalance / 1e6, "USDC");

        assertApproxEqRel(finalBalance, initialBalance, 0.02e18, "Should recover most funds");

        console.log("");
        console.log("=== Test Passed ===");
    }
}
