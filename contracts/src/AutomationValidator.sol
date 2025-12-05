// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IModule, MODULE_TYPE_VALIDATOR} from "./interfaces/IERC7579Module.sol";
import {PackedUserOperation} from "./interfaces/PackedUserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

//     ___         __              _ __      __
//    /   | __  __/ /_____  ____  (_) /___  / /_
//   / /| |/ / / / __/ __ \/ __ \/ / / __ \/ __/
//  / ___ / /_/ / /_/ /_/ / /_/ / / / /_/ / /_
// /_/  |_\__,_/\__/\____/ .___/_/_/\____/\__/
//                      /_/
//
// ERC-7579 validator module for automation key signatures
// https://github.com/autopilot-wallet

/**
 * @title AutomationValidator
 * @author Autopilot
 * @notice Validates UserOps signed by automation keys for whitelisted operations
 */
contract AutomationValidator is IModule {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    uint256 internal constant SIG_VALIDATION_SUCCESS = 0;
    uint256 internal constant SIG_VALIDATION_FAILED = 1;
    bytes4 internal constant ERC1271_MAGICVALUE = 0x1626ba7e;
    bytes4 internal constant ERC1271_INVALID = 0xffffffff;

    error AlreadyInitialized();
    error NotInitialized();
    error InvalidAutomationKey();
    error SelectorNotAllowed();

    event AutomationKeySet(address indexed account, address indexed automationKey);
    event SelectorAllowed(address indexed account, address indexed target, bytes4 selector, bool allowed);

    mapping(address account => address) public automationKey;
    mapping(address account => bool) public initialized;
    mapping(address account => mapping(address target => mapping(bytes4 selector => bool))) public allowedSelectors;

    /**
     * @notice Called when module is installed on an account
     * @param data Encoded (automationKey, autoYieldModule, allowedSelectors[])
     */
    function onInstall(bytes calldata data) external override {
        address account = msg.sender;
        if (initialized[account]) revert AlreadyInitialized();

        (
            address _automationKey,
            address autoYieldModule,
            bytes4[] memory selectors
        ) = abi.decode(data, (address, address, bytes4[]));

        if (_automationKey == address(0)) revert InvalidAutomationKey();

        automationKey[account] = _automationKey;
        initialized[account] = true;

        for (uint256 i = 0; i < selectors.length; i++) {
            allowedSelectors[account][autoYieldModule][selectors[i]] = true;
            emit SelectorAllowed(account, autoYieldModule, selectors[i], true);
        }

        emit AutomationKeySet(account, _automationKey);
    }

    /**
     * @notice Called when module is uninstalled from an account
     * @param data Unused
     */
    function onUninstall(bytes calldata data) external override {
        address account = msg.sender;
        delete automationKey[account];
        delete initialized[account];
        data;
    }

    /**
     * @notice Check if this module is of a certain type
     * @param moduleTypeId Module type ID to check
     * @return True if this is a validator module
     */
    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_VALIDATOR;
    }

    /**
     * @notice Check if module is initialized for an account
     * @param account Account to check
     * @return True if initialized
     */
    function isInitialized(address account) external view returns (bool) {
        return initialized[account];
    }

    /**
     * @notice Validate a UserOperation signature
     * @param userOp The UserOperation to validate
     * @param userOpHash Hash of the UserOperation
     * @return 0 on success, 1 on failure
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) external view returns (uint256) {
        address account = userOp.sender;

        if (!initialized[account]) {
            return SIG_VALIDATION_FAILED;
        }

        if (!_isAllowedCall(account, userOp.callData)) {
            return SIG_VALIDATION_FAILED;
        }

        address key = automationKey[account];
        if (!_validateSignature(userOpHash, userOp.signature, key)) {
            return SIG_VALIDATION_FAILED;
        }

        return SIG_VALIDATION_SUCCESS;
    }

    /**
     * @notice Validate signature for ERC-1271
     * @param sender The account address
     * @param hash Hash that was signed
     * @param signature The signature
     * @return Magic value if valid, invalid value otherwise
     */
    function isValidSignatureWithSender(
        address sender,
        bytes32 hash,
        bytes calldata signature
    ) external view returns (bytes4) {
        if (!initialized[sender]) {
            return ERC1271_INVALID;
        }

        address key = automationKey[sender];
        if (_validateSignature(hash, signature, key)) {
            return ERC1271_MAGICVALUE;
        }
        return ERC1271_INVALID;
    }

    /**
     * @dev Validate ECDSA signature against expected signer
     */
    function _validateSignature(
        bytes32 hash,
        bytes calldata signature,
        address expectedSigner
    ) internal pure returns (bool) {
        address recovered = hash.recover(signature);
        if (recovered == expectedSigner) {
            return true;
        }

        recovered = hash.toEthSignedMessageHash().recover(signature);
        return recovered == expectedSigner;
    }

    /**
     * @dev Check if the callData targets an allowed function
     * Parses Kernel v3 ERC-7579 execute(bytes32 mode, bytes executionCalldata)
     */
    function _isAllowedCall(
        address account,
        bytes calldata callData
    ) internal view returns (bool) {
        if (callData.length < 156) {
            return false;
        }

        bytes4 executeSelector = bytes4(callData[:4]);

        if (executeSelector != bytes4(0xe9ae5c53)) {
            return false;
        }

        address target = address(bytes20(callData[100:120]));
        bytes4 innerSelector = bytes4(callData[152:156]);

        return allowedSelectors[account][target][innerSelector];
    }
}
