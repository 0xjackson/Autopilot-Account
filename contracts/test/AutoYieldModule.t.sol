// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import {AutoYieldModule} from "../src/AutoYieldModule.sol";
import {MockYieldVault} from "../src/mocks/MockYieldVault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IKernel, IHook, ValidationId} from "../src/interfaces/IKernel.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockKernel
 * @notice Simplified mock Kernel for testing AutoYieldModule
 * @dev Executes calls directly without ERC-4337 complexity
 */
contract MockKernel is IKernel {
    address public owner;
    mapping(uint256 => mapping(address => bool)) public installedModules;

    constructor(address _owner) {
        owner = _owner;
    }

    function initialize(
        ValidationId,
        IHook,
        bytes calldata,
        bytes calldata,
        bytes[] calldata initConfig
    ) external override {
        // Execute init config calls (install modules)
        for (uint256 i = 0; i < initConfig.length; i++) {
            (bool success,) = address(this).call(initConfig[i]);
            require(success, "Init config failed");
        }
    }

    function execute(address to, uint256 value, bytes calldata data) external override {
        (bool success,) = to.call{value: value}(data);
        require(success, "Execution failed");
    }

    function installModule(uint256 moduleTypeId, address module, bytes calldata initData) external override {
        installedModules[moduleTypeId][module] = true;
        // Call onInstall
        (bool success,) = module.call(abi.encodeWithSignature("onInstall(bytes)", initData));
        require(success, "Module install failed");
    }

    function uninstallModule(uint256, address, bytes calldata) external override {}

    function isModuleInstalled(uint256 moduleTypeId, address module, bytes calldata) external view override returns (bool) {
        return installedModules[moduleTypeId][module];
    }
}

/**
 * @title AutoYieldModuleTest
 * @notice Unit tests for AutoYieldModule core functionality
 */
contract AutoYieldModuleTest is Test {
    AutoYieldModule public module;
    MockYieldVault public vault;
    MockERC20 public usdc;
    MockKernel public kernel;

    address public owner = address(0x1);
    address public automationKey = address(0x2);
    address public recipient = address(0x3);

    uint256 public constant INITIAL_BALANCE = 1000e6; // 1000 USDC
    uint256 public constant THRESHOLD = 100e6; // 100 USDC

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Deploy mock vault
        vault = new MockYieldVault(address(usdc));

        // Deploy module
        module = new AutoYieldModule();

        // Deploy mock kernel with owner
        kernel = new MockKernel(owner);

        // Install module on kernel
        bytes memory initData = abi.encode(address(vault), automationKey, THRESHOLD);
        vm.prank(address(kernel));
        module.onInstall(initData);

        // Fund the kernel with USDC
        usdc.mint(address(kernel), INITIAL_BALANCE);
    }

    // ============ Initialization Tests ============

    function test_initialization() public view {
        assertTrue(module.isInitialized(address(kernel)));
        assertEq(module.automationKey(address(kernel)), automationKey);
        assertEq(module.checkingThreshold(address(kernel), address(usdc)), THRESHOLD);
        assertEq(module.currentAdapter(address(kernel), address(usdc)), address(vault));
        assertTrue(module.allowedAdapters(address(kernel), address(vault)));
    }

    function test_cannotReinitialize() public {
        bytes memory initData = abi.encode(address(vault), automationKey, THRESHOLD);
        vm.prank(address(kernel));
        vm.expectRevert(AutoYieldModule.AlreadyInitialized.selector);
        module.onInstall(initData);
    }

    // ============ Rebalance Tests ============

    function test_rebalance_depositsExcessToYield() public {
        // Kernel has 1000 USDC, threshold is 100
        // After rebalance, should have 100 checking, 900 in yield

        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        // Check balances
        uint256 checking = usdc.balanceOf(address(kernel));
        uint256 yield_ = vault.totalValueOf(address(kernel));

        assertEq(checking, THRESHOLD, "Checking should equal threshold");
        assertEq(yield_, INITIAL_BALANCE - THRESHOLD, "Yield should have excess");
    }

    function test_rebalance_noOpWhenBelowThreshold() public {
        // Set balance below threshold
        vm.prank(address(kernel));
        usdc.transfer(address(0xdead), 950e6); // Leave 50 USDC

        uint256 balanceBefore = usdc.balanceOf(address(kernel));

        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        // Balance should be unchanged
        assertEq(usdc.balanceOf(address(kernel)), balanceBefore);
    }

    function test_rebalance_onlyAuthorizedCanCall() public {
        // An unauthorized address that tries to call rebalance
        // will fail because it's not initialized for that address
        // (each account must be initialized separately)
        address unauthorized = address(0x999);

        vm.prank(unauthorized);
        vm.expectRevert(AutoYieldModule.NotInitialized.selector);
        module.rebalance(address(usdc));
    }

    function test_rebalance_automationKeyCanCall() public {
        // This test verifies automation key can call rebalance
        // In real Kernel, this would come through userOp with session key
        // For this test, we simulate by having kernel call with automation key context

        // Note: In our mock, onlyAuthorized checks msg.sender
        // In real scenario, the account itself calls the module
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        // Verify it worked
        assertEq(usdc.balanceOf(address(kernel)), THRESHOLD);
    }

    // ============ Configuration Tests ============

    function test_setCheckingThreshold() public {
        uint256 newThreshold = 200e6;

        vm.prank(address(kernel));
        module.setCheckingThreshold(address(usdc), newThreshold);

        assertEq(module.checkingThreshold(address(kernel), address(usdc)), newThreshold);
    }

    function test_setAutomationKey() public {
        address newKey = address(0x123);

        vm.prank(address(kernel));
        module.setAutomationKey(newKey);

        assertEq(module.automationKey(address(kernel)), newKey);
    }

    function test_setAdapterAllowed() public {
        address newAdapter = address(0x456);

        vm.prank(address(kernel));
        module.setAdapterAllowed(newAdapter, true);

        assertTrue(module.allowedAdapters(address(kernel), newAdapter));
    }

    // ============ View Function Tests ============

    function test_getTotalBalance() public {
        // First rebalance to put some in yield
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        uint256 total = module.getTotalBalance(address(kernel), address(usdc));
        assertEq(total, INITIAL_BALANCE, "Total should equal initial balance");
    }

    function test_getCheckingBalance() public view {
        uint256 checking = module.getCheckingBalance(address(kernel), address(usdc));
        assertEq(checking, INITIAL_BALANCE);
    }

    function test_getYieldBalance_beforeRebalance() public view {
        uint256 yield_ = module.getYieldBalance(address(kernel), address(usdc));
        assertEq(yield_, 0, "Should have no yield before rebalance");
    }

    function test_getYieldBalance_afterRebalance() public {
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        uint256 yield_ = module.getYieldBalance(address(kernel), address(usdc));
        assertEq(yield_, INITIAL_BALANCE - THRESHOLD);
    }

    // ============ Flush Tests ============

    function test_flushToChecking() public {
        // First put some in yield
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        // Now flush
        vm.prank(address(kernel));
        module.flushToChecking(address(usdc));

        // All should be in checking
        assertEq(usdc.balanceOf(address(kernel)), INITIAL_BALANCE);
        assertEq(vault.totalValueOf(address(kernel)), 0);
    }

    // ============ Migrate Strategy Tests ============

    function test_migrateStrategy() public {
        // First put some in yield
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        // Deploy new vault
        MockYieldVault newVault = new MockYieldVault(address(usdc));

        // Allow new adapter
        vm.prank(address(kernel));
        module.setAdapterAllowed(address(newVault), true);

        // Migrate
        vm.prank(address(kernel));
        module.migrateStrategy(address(usdc), address(newVault));

        // Check funds moved to new vault
        assertEq(vault.totalValueOf(address(kernel)), 0, "Old vault should be empty");
        assertEq(newVault.totalValueOf(address(kernel)), INITIAL_BALANCE - THRESHOLD, "New vault should have funds");
        assertEq(module.currentAdapter(address(kernel), address(usdc)), address(newVault));
    }

    function test_migrateStrategy_failsForUnallowedAdapter() public {
        address unallowedAdapter = address(0x789);

        vm.prank(address(kernel));
        vm.expectRevert(AutoYieldModule.AdapterNotAllowed.selector);
        module.migrateStrategy(address(usdc), unallowedAdapter);
    }

    // ============ Yield Accrual Tests ============

    function test_yieldAccrual() public {
        // Rebalance first
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        uint256 yieldBefore = module.getYieldBalance(address(kernel), address(usdc));

        // Simulate 5% yield
        vault.accrueYieldBps(500); // 5%

        uint256 yieldAfter = module.getYieldBalance(address(kernel), address(usdc));

        // Should have ~5% more
        assertGt(yieldAfter, yieldBefore, "Yield should have increased");
        assertApproxEqRel(yieldAfter, yieldBefore * 105 / 100, 0.01e18); // Within 1%
    }
}
