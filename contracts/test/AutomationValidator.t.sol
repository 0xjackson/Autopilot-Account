// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import {AutomationValidator} from "../src/AutomationValidator.sol";
import {AutoYieldModule} from "../src/AutoYieldModule.sol";
import {PackedUserOperation} from "../src/interfaces/PackedUserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title AutomationValidatorTest
 * @notice Tests for AutomationValidator - the session key validator for automation
 * @dev Validates:
 *      1. Installation and initialization
 *      2. Signature validation from automation key
 *      3. Selector whitelisting
 *      4. UserOp parsing and validation
 */
contract AutomationValidatorTest is Test {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    AutomationValidator public validator;
    AutoYieldModule public module;

    // Test accounts
    uint256 public automationPrivateKey = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
    address public automationKey;
    address public walletAccount = address(0x1111);
    address public unauthorizedKey = address(0x9999);

    // Selectors
    bytes4 public constant SELECTOR_REBALANCE = 0x21c28191; // rebalance(address)
    bytes4 public constant SELECTOR_MIGRATE = 0x6cb56d19; // migrateStrategy(address,address)
    bytes4 public constant SELECTOR_EXECUTE = 0xe9ae5c53; // execute(bytes32,bytes) - Kernel v3 ERC-7579

    function setUp() public {
        // Derive automation key from private key
        automationKey = vm.addr(automationPrivateKey);

        // Deploy contracts
        validator = new AutomationValidator();
        module = new AutoYieldModule();

        // Build init data for validator
        bytes4[] memory allowedSelectors = new bytes4[](2);
        allowedSelectors[0] = SELECTOR_REBALANCE;
        allowedSelectors[1] = SELECTOR_MIGRATE;

        bytes memory initData = abi.encode(
            automationKey,
            address(module),
            allowedSelectors
        );

        // Install validator on wallet account
        vm.prank(walletAccount);
        validator.onInstall(initData);
    }

    // ============ Installation Tests ============

    function test_initialization() public view {
        assertTrue(validator.initialized(walletAccount));
        assertEq(validator.automationKey(walletAccount), automationKey);
        assertTrue(validator.allowedSelectors(walletAccount, address(module), SELECTOR_REBALANCE));
        assertTrue(validator.allowedSelectors(walletAccount, address(module), SELECTOR_MIGRATE));
    }

    function test_isModuleType() public view {
        assertTrue(validator.isModuleType(1)); // MODULE_TYPE_VALIDATOR
        assertFalse(validator.isModuleType(2)); // MODULE_TYPE_EXECUTOR
    }

    function test_cannotReinitialize() public {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = SELECTOR_REBALANCE;
        bytes memory initData = abi.encode(automationKey, address(module), selectors);

        vm.prank(walletAccount);
        vm.expectRevert(AutomationValidator.AlreadyInitialized.selector);
        validator.onInstall(initData);
    }

    function test_uninstall() public {
        vm.prank(walletAccount);
        validator.onUninstall("");

        assertFalse(validator.initialized(walletAccount));
        assertEq(validator.automationKey(walletAccount), address(0));
    }

    // ============ UserOp Validation Tests ============

    function test_validateUserOp_success() public view {
        // Build a valid UserOp that calls rebalance
        PackedUserOperation memory userOp = _buildRebalanceUserOp(walletAccount);

        // Sign with automation key
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPrivateKey, userOpHash.toEthSignedMessageHash());
        userOp.signature = abi.encodePacked(r, s, v);

        // Validate
        uint256 result = validator.validateUserOp(userOp, userOpHash);
        assertEq(result, 0, "Should return success (0)");
    }

    function test_validateUserOp_wrongSigner() public view {
        // Build a valid UserOp
        PackedUserOperation memory userOp = _buildRebalanceUserOp(walletAccount);

        // Sign with wrong key
        uint256 wrongPrivateKey = 0xdeadbeef;
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPrivateKey, userOpHash.toEthSignedMessageHash());
        userOp.signature = abi.encodePacked(r, s, v);

        // Validate - should fail
        uint256 result = validator.validateUserOp(userOp, userOpHash);
        assertEq(result, 1, "Should return failure (1)");
    }

    function test_validateUserOp_disallowedSelector() public view {
        // Build a UserOp that calls an unauthorized function (e.g., transfer)
        PackedUserOperation memory userOp = _buildUserOpWithSelector(
            walletAccount,
            address(module),
            bytes4(0xa9059cbb) // transfer selector - not allowed
        );

        // Sign with automation key
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPrivateKey, userOpHash.toEthSignedMessageHash());
        userOp.signature = abi.encodePacked(r, s, v);

        // Validate - should fail due to selector not allowed
        uint256 result = validator.validateUserOp(userOp, userOpHash);
        assertEq(result, 1, "Should return failure (1) for disallowed selector");
    }

    function test_validateUserOp_wrongTarget() public {
        // Build a UserOp that targets a different contract
        address wrongTarget = address(0xBAD);

        PackedUserOperation memory userOp = _buildUserOpWithSelector(
            walletAccount,
            wrongTarget,
            SELECTOR_REBALANCE // right selector, wrong target
        );

        // Sign with automation key
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPrivateKey, userOpHash.toEthSignedMessageHash());
        userOp.signature = abi.encodePacked(r, s, v);

        // Validate - should fail due to wrong target
        uint256 result = validator.validateUserOp(userOp, userOpHash);
        assertEq(result, 1, "Should return failure (1) for wrong target");
    }

    function test_validateUserOp_notInitialized() public view {
        address uninitializedAccount = address(0x2222);

        PackedUserOperation memory userOp = _buildRebalanceUserOp(uninitializedAccount);

        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPrivateKey, userOpHash.toEthSignedMessageHash());
        userOp.signature = abi.encodePacked(r, s, v);

        uint256 result = validator.validateUserOp(userOp, userOpHash);
        assertEq(result, 1, "Should return failure (1) for uninitialized account");
    }

    function test_validateUserOp_migrateStrategy() public view {
        // Test with migrateStrategy selector
        PackedUserOperation memory userOp = _buildUserOpWithSelector(
            walletAccount,
            address(module),
            SELECTOR_MIGRATE
        );

        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPrivateKey, userOpHash.toEthSignedMessageHash());
        userOp.signature = abi.encodePacked(r, s, v);

        uint256 result = validator.validateUserOp(userOp, userOpHash);
        assertEq(result, 0, "Should return success (0) for migrateStrategy");
    }

    // ============ ERC-1271 Tests ============

    function test_isValidSignatureWithSender() public view {
        bytes32 hash = keccak256("test message");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPrivateKey, hash.toEthSignedMessageHash());
        bytes memory signature = abi.encodePacked(r, s, v);

        bytes4 result = validator.isValidSignatureWithSender(walletAccount, hash, signature);
        assertEq(result, bytes4(0x1626ba7e), "Should return ERC1271 magic value");
    }

    function test_isValidSignatureWithSender_invalid() public view {
        bytes32 hash = keccak256("test message");
        uint256 wrongKey = 0xdeadbeef;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, hash.toEthSignedMessageHash());
        bytes memory signature = abi.encodePacked(r, s, v);

        bytes4 result = validator.isValidSignatureWithSender(walletAccount, hash, signature);
        assertEq(result, bytes4(0xffffffff), "Should return invalid");
    }

    // ============ Direct Signature Validation ============

    function test_signatureRecovery_direct() public view {
        bytes32 hash = keccak256("test");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPrivateKey, hash);
        bytes memory signature = abi.encodePacked(r, s, v);

        address recovered = hash.recover(signature);
        assertEq(recovered, automationKey, "Direct recovery should match");
    }

    function test_signatureRecovery_ethSigned() public view {
        bytes32 hash = keccak256("test");
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPrivateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        address recovered = ethSignedHash.recover(signature);
        assertEq(recovered, automationKey, "EthSigned recovery should match");
    }

    // ============ Helper Functions ============

    function _buildRebalanceUserOp(address sender) internal view returns (PackedUserOperation memory) {
        return _buildUserOpWithSelector(sender, address(module), SELECTOR_REBALANCE);
    }

    function _buildUserOpWithSelector(
        address sender,
        address target,
        bytes4 innerSelector
    ) internal pure returns (PackedUserOperation memory) {
        // Build inner call data (e.g., rebalance(address token))
        bytes memory innerData = abi.encodeWithSelector(innerSelector, address(0x123));

        // Build ERC-7579 executionCalldata: abi.encodePacked(target, value, innerData)
        bytes memory executionCalldata = abi.encodePacked(
            target,
            uint256(0),
            innerData
        );

        // Build Kernel v3 execute(bytes32 mode, bytes executionCalldata) calldata
        bytes memory executeData = abi.encodeWithSelector(
            SELECTOR_EXECUTE,
            bytes32(0),         // mode (default single call)
            executionCalldata   // packed execution data
        );

        return PackedUserOperation({
            sender: sender,
            nonce: 0,
            initCode: "",
            callData: executeData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: ""
        });
    }
}

/**
 * @title AutomationValidatorIntegrationTest
 * @notice Integration test simulating the full flow
 */
contract AutomationValidatorIntegrationTest is Test {
    using MessageHashUtils for bytes32;

    AutomationValidator public validator;
    AutoYieldModule public module;

    uint256 public automationPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address public automationKey;
    address public owner = address(0x1);

    // Mock wallet that simulates Kernel behavior
    MockWallet public wallet;

    function setUp() public {
        automationKey = vm.addr(automationPrivateKey);

        validator = new AutomationValidator();
        module = new AutoYieldModule();

        // Deploy mock wallet
        wallet = new MockWallet(address(validator), address(module));

        // Initialize validator for the wallet
        bytes4[] memory allowedSelectors = new bytes4[](2);
        allowedSelectors[0] = 0x21c28191; // rebalance
        allowedSelectors[1] = 0x6cb56d19; // migrateStrategy

        bytes memory validatorInitData = abi.encode(
            automationKey,
            address(module),
            allowedSelectors
        );

        vm.prank(address(wallet));
        validator.onInstall(validatorInitData);
    }

    function test_fullFlow_automationCanCallRebalance() public {
        // 1. Build UserOp with ERC-7579 format
        bytes memory rebalanceCall = abi.encodeWithSelector(
            bytes4(0x21c28191), // rebalance(address)
            address(0x123)     // token
        );

        // ERC-7579 executionCalldata: abi.encodePacked(target, value, data)
        bytes memory executionCalldata = abi.encodePacked(
            address(module),
            uint256(0),
            rebalanceCall
        );

        bytes memory executeCall = abi.encodeWithSelector(
            bytes4(0xe9ae5c53), // execute(bytes32,bytes) - Kernel v3
            bytes32(0),
            executionCalldata
        );

        PackedUserOperation memory userOp = PackedUserOperation({
            sender: address(wallet),
            nonce: 0,
            initCode: "",
            callData: executeCall,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: ""
        });

        // 2. Sign UserOp
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            automationPrivateKey,
            userOpHash.toEthSignedMessageHash()
        );
        userOp.signature = abi.encodePacked(r, s, v);

        // 3. Validate - this is what Kernel's validateUserOp would call
        uint256 validationResult = validator.validateUserOp(userOp, userOpHash);

        // 4. Assert success
        assertEq(validationResult, 0, "Validation should succeed");

        console.log("=== Full Flow Test Passed ===");
        console.log("Automation Key:", automationKey);
        console.log("Wallet:", address(wallet));
        console.log("Target:", address(module));
        console.log("Validation Result:", validationResult);
    }

    function test_fullFlow_unauthorizedSelectorFails() public {
        // Try to call setCheckingThreshold (not whitelisted)
        bytes memory unauthorizedCall = abi.encodeWithSelector(
            bytes4(0x12345678), // some unauthorized selector
            address(0x123)
        );

        // ERC-7579 executionCalldata
        bytes memory executionCalldata = abi.encodePacked(
            address(module),
            uint256(0),
            unauthorizedCall
        );

        bytes memory executeCall = abi.encodeWithSelector(
            bytes4(0xe9ae5c53), // execute(bytes32,bytes) - Kernel v3
            bytes32(0),
            executionCalldata
        );

        PackedUserOperation memory userOp = PackedUserOperation({
            sender: address(wallet),
            nonce: 0,
            initCode: "",
            callData: executeCall,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: ""
        });

        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            automationPrivateKey,
            userOpHash.toEthSignedMessageHash()
        );
        userOp.signature = abi.encodePacked(r, s, v);

        uint256 validationResult = validator.validateUserOp(userOp, userOpHash);

        assertEq(validationResult, 1, "Validation should fail for unauthorized selector");
    }
}

/**
 * @title MockWallet
 * @notice Simulates a Kernel wallet for integration testing
 */
contract MockWallet {
    address public validator;
    address public module;

    constructor(address _validator, address _module) {
        validator = _validator;
        module = _module;
    }

    // Simulate Kernel's execute
    function execute(address to, uint256 value, bytes calldata data) external {
        (bool success,) = to.call{value: value}(data);
        require(success, "Execution failed");
    }
}
