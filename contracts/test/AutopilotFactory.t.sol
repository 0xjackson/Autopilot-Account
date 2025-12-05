// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import {AutopilotFactory} from "../src/AutopilotFactory.sol";
import {AutoYieldModule} from "../src/AutoYieldModule.sol";
import {AutomationValidator} from "../src/AutomationValidator.sol";
import {MockERC4626Vault} from "../src/mocks/MockERC4626Vault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IKernel, IKernelFactory, IHook, ValidationId, ExecMode} from "../src/interfaces/IKernel.sol";

/**
 * @title MockKernelFactory
 * @notice Simulates ZeroDev Kernel Factory for testing
 */
contract MockKernelFactory is IKernelFactory {
    mapping(bytes32 => address) public deployedAccounts;
    uint256 public accountNonce;

    function createAccount(bytes calldata data, bytes32 salt) external payable override returns (address account) {
        // Compute deterministic address
        bytes32 hash = keccak256(abi.encodePacked(data, salt, accountNonce++));
        account = address(uint160(uint256(hash)));

        // Deploy mock kernel at this address
        MockKernelForFactory kernel = new MockKernelForFactory();

        // Store the actual deployed address
        deployedAccounts[salt] = address(kernel);

        // Initialize the kernel with the provided data
        // The data is an encoded call to initialize()
        (bool success,) = address(kernel).call(data);
        require(success, "Kernel init failed");

        return address(kernel);
    }

    function getAddress(bytes calldata data, bytes32 salt) external view override returns (address) {
        // For testing, just return a deterministic hash
        return address(uint160(uint256(keccak256(abi.encodePacked(data, salt)))));
    }
}

/**
 * @title MockKernelForFactory
 * @notice Kernel mock that tracks module installations
 */
contract MockKernelForFactory is IKernel {
    address public owner;
    mapping(uint256 => mapping(address => bool)) public installedModules;
    mapping(uint256 => mapping(address => bytes)) public moduleInitData;

    event ModuleInstalled(uint256 indexed moduleTypeId, address indexed module);

    function initialize(
        ValidationId,
        IHook,
        bytes calldata validatorData,
        bytes calldata,
        bytes[] calldata initConfig
    ) external override {
        // Extract owner from validator data (first 20 bytes)
        owner = address(uint160(bytes20(validatorData)));

        // Execute init config calls (install modules)
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
        moduleInitData[moduleTypeId][module] = initData;

        bytes memory dataForOnInstall;

        // Kernel v3 format for both validators and executors:
        // First 20 bytes = hook address
        // Rest = module-specific data
        if (initData.length > 20) {
            if (moduleTypeId == 1) {
                // MODULE_TYPE_VALIDATOR: Format is | hook (20) | abi.encode(validatorData, hookData, selectorData) |
                bytes memory structData = initData[20:];
                (bytes memory validatorData, , ) = abi.decode(structData, (bytes, bytes, bytes));
                dataForOnInstall = validatorData;
            } else if (moduleTypeId == 2) {
                // MODULE_TYPE_EXECUTOR: Format is | hook (20) | abi.encode(executorData, hookData) |
                bytes memory structData = initData[20:];
                (bytes memory executorData, ) = abi.decode(structData, (bytes, bytes));
                dataForOnInstall = executorData;
            } else {
                dataForOnInstall = initData;
            }
        } else {
            dataForOnInstall = initData;
        }

        // Call onInstall on the module
        (bool success,) = module.call(abi.encodeWithSignature("onInstall(bytes)", dataForOnInstall));
        require(success, "Module install failed");

        emit ModuleInstalled(moduleTypeId, module);
    }

    function uninstallModule(uint256, address, bytes calldata) external override {}

    function isModuleInstalled(uint256 moduleTypeId, address module, bytes calldata) external view override returns (bool) {
        return installedModules[moduleTypeId][module];
    }
}

/**
 * @title MockECDSAValidator
 * @notice Mock ECDSA validator for testing
 */
contract MockECDSAValidator {
    mapping(address => address) public owners;

    function onInstall(bytes calldata data) external {
        owners[msg.sender] = address(uint160(bytes20(data)));
    }

    function onUninstall(bytes calldata) external {
        delete owners[msg.sender];
    }

    function isModuleType(uint256 moduleTypeId) external pure returns (bool) {
        return moduleTypeId == 1;
    }
}

/**
 * @title AutopilotFactoryTest
 * @notice Tests for AutopilotFactory including dual module installation
 */
contract AutopilotFactoryTest is Test {
    AutopilotFactory public factory;
    AutoYieldModule public module;
    AutomationValidator public validator;
    MockKernelFactory public kernelFactory;
    MockECDSAValidator public ecdsaValidator;
    MockERC4626Vault public vault;
    MockERC20 public usdc;

    address public owner = address(0x1);
    address public automationKey = address(0x2);

    uint256 constant MODULE_TYPE_VALIDATOR = 1;
    uint256 constant MODULE_TYPE_EXECUTOR = 2;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        vault = new MockERC4626Vault(address(usdc));
        kernelFactory = new MockKernelFactory();
        ecdsaValidator = new MockECDSAValidator();

        module = new AutoYieldModule();
        validator = new AutomationValidator();

        factory = new AutopilotFactory(
            address(kernelFactory),
            address(ecdsaValidator),
            address(module),
            address(validator),
            address(vault),
            automationKey
        );
    }

    function test_factoryDeployment() public view {
        assertEq(address(factory.kernelFactory()), address(kernelFactory));
        assertEq(factory.ecdsaValidator(), address(ecdsaValidator));
        assertEq(factory.autoYieldModule(), address(module));
        assertEq(factory.automationValidator(), address(validator));
        assertEq(factory.defaultVault(), address(vault));
        assertEq(factory.automationKey(), automationKey);
        assertEq(factory.defaultThreshold(), 1e6);
    }

    function test_createAccount() public {
        bytes32 salt = bytes32(uint256(1));

        address account = factory.createAccountFor(owner, salt);

        assertTrue(account != address(0), "Account should be deployed");
        assertEq(factory.accountOf(owner), account, "Account should be recorded");
        assertTrue(factory.hasAccount(owner), "Should have account");
    }

    function test_createAccount_installsBothModules() public {
        bytes32 salt = bytes32(uint256(1));

        address account = factory.createAccountFor(owner, salt);
        MockKernelForFactory kernel = MockKernelForFactory(account);

        // Check executor module is installed
        assertTrue(
            kernel.installedModules(MODULE_TYPE_EXECUTOR, address(module)),
            "AutoYieldModule should be installed"
        );

        // Check validator module is installed
        assertTrue(
            kernel.installedModules(MODULE_TYPE_VALIDATOR, address(validator)),
            "AutomationValidator should be installed"
        );
    }

    function test_createAccount_modulesInitializedCorrectly() public {
        bytes32 salt = bytes32(uint256(1));

        address account = factory.createAccountFor(owner, salt);

        assertTrue(module.isInitialized(account), "Module should be initialized");
        assertEq(module.automationKey(account), automationKey, "Automation key should be set");
        assertEq(module.checkingThreshold(account, address(usdc)), 1e6, "Threshold should be set");

        assertTrue(validator.initialized(account), "Validator should be initialized");
        assertEq(validator.automationKey(account), automationKey, "Validator automation key should be set");

        bytes4 rebalanceSelector = 0x21c28191;
        bytes4 migrateSelector = 0x6cb56d19;
        assertTrue(
            validator.allowedSelectors(account, address(module), rebalanceSelector),
            "Rebalance should be allowed"
        );
        assertTrue(
            validator.allowedSelectors(account, address(module), migrateSelector),
            "Migrate should be allowed"
        );
    }

    function test_createAccount_cannotCreateDuplicate() public {
        bytes32 salt = bytes32(uint256(1));

        factory.createAccountFor(owner, salt);

        vm.expectRevert(AutopilotFactory.AccountAlreadyExists.selector);
        factory.createAccountFor(owner, salt);
    }

    function test_createAccount_differentOwnersGetDifferentAccounts() public {
        address owner2 = address(0x3);
        bytes32 salt = bytes32(uint256(1));

        address account1 = factory.createAccountFor(owner, salt);
        address account2 = factory.createAccountFor(owner2, salt);

        assertTrue(account1 != account2, "Accounts should be different");
    }

    function test_adminFunctions() public {
        address newVault = address(0x999);
        factory.setDefaultVault(newVault);
        assertEq(factory.defaultVault(), newVault);

        factory.setDefaultThreshold(200e6);
        assertEq(factory.defaultThreshold(), 200e6);

        address newKey = address(0x888);
        factory.setAutomationKey(newKey);
        assertEq(factory.automationKey(), newKey);
    }

    function test_adminFunctions_onlyAdmin() public {
        address notAdmin = address(0x999);

        vm.prank(notAdmin);
        vm.expectRevert("Not admin");
        factory.setDefaultVault(address(0x1));

        vm.prank(notAdmin);
        vm.expectRevert("Not admin");
        factory.setDefaultThreshold(200e6);

        vm.prank(notAdmin);
        vm.expectRevert("Not admin");
        factory.setAutomationKey(address(0x1));
    }
}

/**
 * @title FullFlowIntegrationTest
 * @notice End-to-end test simulating the complete automation flow
 */
contract FullFlowIntegrationTest is Test {
    using stdStorage for StdStorage;

    AutopilotFactory public factory;
    AutoYieldModule public module;
    AutomationValidator public validator;
    MockKernelFactory public kernelFactory;
    MockECDSAValidator public ecdsaValidator;
    MockERC4626Vault public vault;
    MockERC20 public usdc;

    uint256 public automationPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address public automationKey;
    address public owner = address(0x1);

    function setUp() public {
        automationKey = vm.addr(automationPrivateKey);

        usdc = new MockERC20("USD Coin", "USDC", 6);
        vault = new MockERC4626Vault(address(usdc));
        kernelFactory = new MockKernelFactory();
        ecdsaValidator = new MockECDSAValidator();

        module = new AutoYieldModule();
        validator = new AutomationValidator();

        factory = new AutopilotFactory(
            address(kernelFactory),
            address(ecdsaValidator),
            address(module),
            address(validator),
            address(vault),
            automationKey
        );
    }

    function test_endToEnd_createWalletAndValidateAutomation() public {
        // 1. Create wallet via factory
        bytes32 salt = bytes32(uint256(1));
        address walletAccount = factory.createAccountFor(owner, salt);

        console.log("=== Wallet Created ===");
        console.log("Wallet Address:", walletAccount);
        console.log("Owner:", owner);
        console.log("Automation Key:", automationKey);

        // 2. Verify modules are installed
        assertTrue(module.isInitialized(walletAccount), "Module should be initialized");
        assertTrue(validator.initialized(walletAccount), "Validator should be initialized");

        // 3. Verify automation key is set correctly in both modules
        assertEq(module.automationKey(walletAccount), automationKey);
        assertEq(validator.automationKey(walletAccount), automationKey);

        // 4. Verify allowed selectors
        bytes4 rebalanceSelector = 0x21c28191;
        assertTrue(validator.allowedSelectors(walletAccount, address(module), rebalanceSelector));

        // 5. Simulate UserOp validation (what would happen in real ERC-4337 flow)
        bytes memory rebalanceCall = abi.encodeWithSelector(rebalanceSelector, address(usdc));
        bytes memory executeCall = abi.encodeWithSelector(
            bytes4(0xb61d27f6), // execute
            address(module),
            uint256(0),
            rebalanceCall
        );

        // Build mock UserOp
        bytes32 userOpHash = keccak256(abi.encodePacked(walletAccount, executeCall, block.timestamp));

        // Sign with automation key
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPrivateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Validate signature through validator
        bytes4 result = validator.isValidSignatureWithSender(walletAccount, userOpHash, signature);
        assertEq(result, bytes4(0x1626ba7e), "Signature should be valid");

        console.log("");
        console.log("=== Automation Validation Passed ===");
        console.log("UserOp hash validated successfully");
        console.log("Automation key can sign valid UserOps for this wallet");
    }
}
