// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import {AutoYieldModule} from "../src/AutoYieldModule.sol";
import {MockERC4626Vault} from "../src/mocks/MockERC4626Vault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IKernel, IHook, ValidationId, ExecMode} from "../src/interfaces/IKernel.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockKernel
 * @notice Simplified mock Kernel for testing AutoYieldModule
 * @dev Executes calls directly without ERC-4337 complexity, supports Kernel v3 format
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
        for (uint256 i = 0; i < initConfig.length; i++) {
            (bool success,) = address(this).call(initConfig[i]);
            require(success, "Init config failed");
        }
    }

    function execute(ExecMode, bytes calldata executionCalldata) external payable override {
        address target = address(bytes20(executionCalldata[:20]));
        uint256 value = uint256(bytes32(executionCalldata[20:52]));
        bytes calldata data = executionCalldata[52:];
        (bool success,) = target.call{value: value}(data);
        require(success, "Execution failed");
    }

    function installModule(uint256 moduleTypeId, address module, bytes calldata initData) external override {
        installedModules[moduleTypeId][module] = true;
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
    MockERC4626Vault public vault;
    MockERC20 public usdc;
    MockKernel public kernel;

    address public owner = address(0x1);
    address public automationKey = address(0x2);
    address public recipient = address(0x3);

    uint256 public constant INITIAL_BALANCE = 1000e6; // 1000 USDC
    uint256 public constant THRESHOLD = 100e6; // 100 USDC

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        vault = new MockERC4626Vault(address(usdc));
        module = new AutoYieldModule();
        kernel = new MockKernel(owner);

        bytes memory initData = abi.encode(address(vault), automationKey, THRESHOLD);
        vm.prank(address(kernel));
        module.onInstall(initData);

        usdc.mint(address(kernel), INITIAL_BALANCE);
    }

    // ============ Initialization Tests ============

    function test_initialization() public view {
        assertTrue(module.isInitialized(address(kernel)));
        assertEq(module.automationKey(address(kernel)), automationKey);
        assertEq(module.checkingThreshold(address(kernel), address(usdc)), THRESHOLD);
        assertEq(module.currentVault(address(kernel), address(usdc)), address(vault));
        assertTrue(module.allowedVaults(address(kernel), address(vault)));
    }

    function test_cannotReinitialize() public {
        bytes memory initData = abi.encode(address(vault), automationKey, THRESHOLD);
        vm.prank(address(kernel));
        vm.expectRevert(AutoYieldModule.AlreadyInitialized.selector);
        module.onInstall(initData);
    }

    // ============ Rebalance Tests ============

    function test_rebalance_depositsExcessToYield() public {
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        uint256 checking = usdc.balanceOf(address(kernel));
        uint256 yield_ = vault.convertToAssets(vault.balanceOf(address(kernel)));

        assertEq(checking, THRESHOLD, "Checking should equal threshold");
        assertEq(yield_, INITIAL_BALANCE - THRESHOLD, "Yield should have excess");
    }

    function test_rebalance_noOpWhenBelowThreshold() public {
        vm.prank(address(kernel));
        usdc.transfer(address(0xdead), 950e6);

        uint256 balanceBefore = usdc.balanceOf(address(kernel));

        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        assertEq(usdc.balanceOf(address(kernel)), balanceBefore);
    }

    function test_rebalance_onlyAuthorizedCanCall() public {
        address unauthorized = address(0x999);

        vm.prank(unauthorized);
        vm.expectRevert(AutoYieldModule.NotInitialized.selector);
        module.rebalance(address(usdc));
    }

    function test_rebalance_automationKeyCanCall() public {
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

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

    function test_setVaultAllowed() public {
        address newVault = address(0x456);

        vm.prank(address(kernel));
        module.setVaultAllowed(newVault, true);

        assertTrue(module.allowedVaults(address(kernel), newVault));
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
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        vm.prank(address(kernel));
        module.flushToChecking(address(usdc));

        assertEq(usdc.balanceOf(address(kernel)), INITIAL_BALANCE);
        assertEq(vault.balanceOf(address(kernel)), 0);
    }

    // ============ Migrate Strategy Tests ============

    function test_migrateStrategy() public {
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        MockERC4626Vault newVault = new MockERC4626Vault(address(usdc));

        vm.prank(address(kernel));
        module.migrateStrategy(address(usdc), address(newVault));

        assertEq(vault.balanceOf(address(kernel)), 0, "Old vault should be empty");
        assertEq(newVault.convertToAssets(newVault.balanceOf(address(kernel))), INITIAL_BALANCE - THRESHOLD, "New vault should have funds");
        assertEq(module.currentVault(address(kernel), address(usdc)), address(newVault));
    }

    function test_migrateStrategy_autoAllowsNewVault() public {
        MockERC4626Vault newVault = new MockERC4626Vault(address(usdc));

        assertFalse(module.allowedVaults(address(kernel), address(newVault)));

        vm.prank(address(kernel));
        module.migrateStrategy(address(usdc), address(newVault));

        assertTrue(module.allowedVaults(address(kernel), address(newVault)));
    }

    // ============ Yield Accrual Tests ============

    function test_yieldAccrual() public {
        vm.prank(address(kernel));
        module.rebalance(address(usdc));

        uint256 yieldBefore = module.getYieldBalance(address(kernel), address(usdc));

        vault.accrueYieldBps(500);

        uint256 yieldAfter = module.getYieldBalance(address(kernel), address(usdc));

        assertGt(yieldAfter, yieldBefore, "Yield should have increased");
        assertApproxEqRel(yieldAfter, yieldBefore * 105 / 100, 0.01e18);
    }
}
