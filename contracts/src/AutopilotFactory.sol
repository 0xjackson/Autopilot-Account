// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IKernel, IKernelFactory, IHook, ValidationId, ValidatorLib, MODULE_TYPE_EXECUTOR, MODULE_TYPE_VALIDATOR} from "./interfaces/IKernel.sol";
import {AutoYieldModule} from "./AutoYieldModule.sol";
import {AutomationValidator} from "./AutomationValidator.sol";

//     ___         __              _ __      __
//    /   | __  __/ /_____  ____  (_) /___  / /_
//   / /| |/ / / / __/ __ \/ __ \/ / / __ \/ __/
//  / ___ / /_/ / /_/ /_/ / /_/ / / / /_/ / /_
// /_/  |_\__,_/\__/\____/ .___/_/_/\____/\__/
//                      /_/
//
// Factory for deploying Autopilot smart wallets via ZeroDev Kernel v3
// https://github.com/autopilot-wallet

/**
 * @title AutopilotFactory
 * @author Autopilot
 * @notice Factory for deploying Autopilot wallets with pre-installed yield automation
 */
contract AutopilotFactory {

    error ZeroAddress();
    error AccountAlreadyExists();

    event AccountCreated(address indexed account, address indexed owner, bytes32 salt);
    event DefaultsUpdated(address adapter, uint256 threshold);

    uint256 private constant EXECUTOR_MODULE_TYPE = MODULE_TYPE_EXECUTOR;
    uint256 private constant VALIDATOR_MODULE_TYPE = MODULE_TYPE_VALIDATOR;

    bytes4 private constant SELECTOR_REBALANCE = 0x21c28191;
    bytes4 private constant SELECTOR_MIGRATE = 0x6cb56d19;
    bytes4 private constant SELECTOR_EXECUTE = 0xe9ae5c53;

    uint256 public constant DEFAULT_THRESHOLD = 100e6;

    IKernelFactory public immutable kernelFactory;
    address public immutable ecdsaValidator;
    address public immutable autoYieldModule;
    address public immutable automationValidator;

    address public automationKey;
    address public defaultAdapter;
    uint256 public defaultThreshold;
    address public admin;

    mapping(address => address) public accountOf;

    /**
     * @notice Deploy the Autopilot factory
     * @param _kernelFactory ZeroDev Kernel factory address
     * @param _ecdsaValidator ECDSA validator module address
     * @param _autoYieldModule AutoYieldModule implementation address
     * @param _automationValidator AutomationValidator implementation address
     * @param _defaultAdapter Default yield adapter address
     * @param _automationKey Global automation key address
     */
    constructor(
        address _kernelFactory,
        address _ecdsaValidator,
        address _autoYieldModule,
        address _automationValidator,
        address _defaultAdapter,
        address _automationKey
    ) {
        if (_kernelFactory == address(0)) revert ZeroAddress();
        if (_ecdsaValidator == address(0)) revert ZeroAddress();
        if (_autoYieldModule == address(0)) revert ZeroAddress();
        if (_automationValidator == address(0)) revert ZeroAddress();
        if (_defaultAdapter == address(0)) revert ZeroAddress();

        kernelFactory = IKernelFactory(_kernelFactory);
        ecdsaValidator = _ecdsaValidator;
        autoYieldModule = _autoYieldModule;
        automationValidator = _automationValidator;
        defaultAdapter = _defaultAdapter;
        automationKey = _automationKey;
        defaultThreshold = DEFAULT_THRESHOLD;
        admin = msg.sender;
    }

    /**
     * @notice Deploy a new Autopilot wallet for the caller
     * @param salt Salt for CREATE2 deterministic deployment
     * @return account Address of the deployed wallet
     */
    function createAccount(bytes32 salt) external returns (address account) {
        return createAccountFor(msg.sender, salt);
    }

    /**
     * @notice Deploy a new Autopilot wallet for a specific owner
     * @param owner Owner of the new wallet
     * @param salt Salt for CREATE2 deterministic deployment
     * @return account Address of the deployed wallet
     */
    function createAccountFor(address owner, bytes32 salt) public returns (address account) {
        if (owner == address(0)) revert ZeroAddress();
        if (accountOf[owner] != address(0)) revert AccountAlreadyExists();

        bytes memory initData = _buildInitData(owner);
        bytes32 combinedSalt = keccak256(abi.encodePacked(owner, salt));

        account = kernelFactory.createAccount(initData, combinedSalt);
        accountOf[owner] = account;

        emit AccountCreated(account, owner, salt);
    }

    /**
     * @notice Compute the address of a wallet before deployment
     * @param owner Owner of the wallet
     * @param salt Salt for CREATE2
     * @return Predicted wallet address
     */
    function getAddress(address owner, bytes32 salt) external view returns (address) {
        bytes memory initData = _buildInitData(owner);
        bytes32 combinedSalt = keccak256(abi.encodePacked(owner, salt));
        return kernelFactory.getAddress(initData, combinedSalt);
    }

    /**
     * @notice Check if an account exists for an owner
     * @param owner Owner to check
     * @return True if account exists
     */
    function hasAccount(address owner) external view returns (bool) {
        return accountOf[owner] != address(0);
    }

    /**
     * @notice Update default adapter for new wallets
     * @param _adapter New default adapter address
     */
    function setDefaultAdapter(address _adapter) external {
        require(msg.sender == admin, "Not admin");
        if (_adapter == address(0)) revert ZeroAddress();
        defaultAdapter = _adapter;
        emit DefaultsUpdated(_adapter, defaultThreshold);
    }

    /**
     * @notice Update default threshold for new wallets
     * @param _threshold New default threshold
     */
    function setDefaultThreshold(uint256 _threshold) external {
        require(msg.sender == admin, "Not admin");
        defaultThreshold = _threshold;
        emit DefaultsUpdated(defaultAdapter, _threshold);
    }

    /**
     * @notice Update the global automation key
     * @param _automationKey New automation key address
     */
    function setAutomationKey(address _automationKey) external {
        require(msg.sender == admin, "Not admin");
        automationKey = _automationKey;
    }

    /**
     * @notice Transfer admin role
     * @param _admin New admin address
     */
    function setAdmin(address _admin) external {
        require(msg.sender == admin, "Not admin");
        if (_admin == address(0)) revert ZeroAddress();
        admin = _admin;
    }

    /**
     * @dev Build initialization data for Kernel.initialize()
     * @param owner The EOA owner address
     * @return Encoded initialization call
     */
    function _buildInitData(address owner) internal view returns (bytes memory) {
        ValidationId rootValidator = ValidatorLib.validatorToIdentifier(ecdsaValidator);
        bytes memory validatorData = abi.encodePacked(owner);
        IHook noHook = IHook(address(0));
        bytes memory hookData = "";

        bytes memory executorOnInstallData = abi.encode(defaultAdapter, automationKey, defaultThreshold);

        bytes memory executorInstallData = abi.encodePacked(
            bytes20(address(0)),
            abi.encode(executorOnInstallData, bytes(""))
        );

        bytes4[] memory allowedSelectors = new bytes4[](2);
        allowedSelectors[0] = SELECTOR_REBALANCE;
        allowedSelectors[1] = SELECTOR_MIGRATE;

        bytes memory validatorOnInstallData = abi.encode(automationKey, autoYieldModule, allowedSelectors);

        bytes memory validatorInstallData = abi.encodePacked(
            bytes20(address(0)),
            abi.encode(validatorOnInstallData, bytes(""), abi.encodePacked(SELECTOR_EXECUTE))
        );

        bytes[] memory initConfig = new bytes[](2);

        initConfig[0] = abi.encodeCall(
            IKernel.installModule,
            (EXECUTOR_MODULE_TYPE, autoYieldModule, executorInstallData)
        );

        initConfig[1] = abi.encodeCall(
            IKernel.installModule,
            (VALIDATOR_MODULE_TYPE, automationValidator, validatorInstallData)
        );

        return abi.encodeCall(
            IKernel.initialize,
            (rootValidator, noHook, validatorData, hookData, initConfig)
        );
    }
}
