// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IKernel, IKernelFactory, IHook, ValidationId, ValidatorLib, MODULE_TYPE_EXECUTOR} from "./interfaces/IKernel.sol";
import {AutoYieldModule} from "./AutoYieldModule.sol";

/**
 * @title AutopilotFactory
 * @notice Factory for deploying Autopilot wallets via ZeroDev Kernel
 * @dev Deploys Kernel v3 smart accounts with AutoYieldModule pre-installed.
 *
 *      Key features:
 *      - One-click wallet creation
 *      - AutoYieldModule pre-installed as executor
 *      - Global automation key registered for all wallets
 *      - Default adapter and threshold configured
 *
 *      Kernel v3.3 addresses (same on all chains):
 *      - Factory: 0x2577507b78c2008Ff367261CB6285d44ba5eF2E9
 *      - ECDSA Validator: 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57
 */
contract AutopilotFactory {
    // ============ Errors ============
    error ZeroAddress();
    error AccountAlreadyExists();

    // ============ Events ============
    event AccountCreated(address indexed account, address indexed owner, bytes32 salt);
    event DefaultsUpdated(address adapter, uint256 threshold);

    // ============ Constants ============

    /// @notice ERC-7579 module type for executor modules
    uint256 private constant EXECUTOR_MODULE_TYPE = MODULE_TYPE_EXECUTOR;

    /// @notice Default checking threshold (100 USDC with 6 decimals)
    uint256 public constant DEFAULT_THRESHOLD = 100e6;

    // ============ Immutables ============

    /// @notice The ZeroDev Kernel Factory
    IKernelFactory public immutable kernelFactory;

    /// @notice The ECDSA validator for owner signatures
    address public immutable ecdsaValidator;

    /// @notice The AutoYieldModule implementation
    address public immutable autoYieldModule;

    // ============ State ============

    /// @notice Global automation key (backend's session key)
    /// @dev All wallets created by this factory trust this key
    address public automationKey;

    /// @notice Default yield adapter for new wallets
    address public defaultAdapter;

    /// @notice Default checking threshold for new wallets
    uint256 public defaultThreshold;

    /// @notice Mapping of owner to their deployed account
    mapping(address => address) public accountOf;

    /// @notice Factory admin (can update defaults)
    address public admin;

    // ============ Constructor ============

    /**
     * @param _kernelFactory Address of the deployed KernelFactory
     * @param _ecdsaValidator Address of the ECDSA validator module
     * @param _autoYieldModule Address of the AutoYieldModule implementation
     * @param _defaultAdapter Address of the default YieldAdapter
     * @param _automationKey Address of the global automation key
     */
    constructor(
        address _kernelFactory,
        address _ecdsaValidator,
        address _autoYieldModule,
        address _defaultAdapter,
        address _automationKey
    ) {
        if (_kernelFactory == address(0)) revert ZeroAddress();
        if (_ecdsaValidator == address(0)) revert ZeroAddress();
        if (_autoYieldModule == address(0)) revert ZeroAddress();
        if (_defaultAdapter == address(0)) revert ZeroAddress();

        kernelFactory = IKernelFactory(_kernelFactory);
        ecdsaValidator = _ecdsaValidator;
        autoYieldModule = _autoYieldModule;
        defaultAdapter = _defaultAdapter;
        automationKey = _automationKey;
        defaultThreshold = DEFAULT_THRESHOLD;
        admin = msg.sender;
    }

    // ============ External Functions ============

    /**
     * @notice Deploy a new Autopilot wallet for the caller
     * @param salt Salt for CREATE2 deterministic deployment
     * @return account Address of the deployed account
     */
    function createAccount(bytes32 salt) external returns (address account) {
        return createAccountFor(msg.sender, salt);
    }

    /**
     * @notice Deploy a new Autopilot wallet for a specific owner
     * @param owner Owner of the new account (EOA that controls it)
     * @param salt Salt for CREATE2 deterministic deployment
     * @return account Address of the deployed account
     */
    function createAccountFor(address owner, bytes32 salt) public returns (address account) {
        if (owner == address(0)) revert ZeroAddress();
        if (accountOf[owner] != address(0)) revert AccountAlreadyExists();

        // Build the initialization data
        bytes memory initData = _buildInitData(owner);

        // Combine owner into salt for uniqueness
        bytes32 combinedSalt = keccak256(abi.encodePacked(owner, salt));

        // Create the account via Kernel Factory
        account = kernelFactory.createAccount(initData, combinedSalt);

        // Record the account
        accountOf[owner] = account;

        emit AccountCreated(account, owner, salt);
    }

    /**
     * @notice Compute the address of an account before deployment
     * @param owner Owner of the account
     * @param salt Salt for CREATE2
     * @return The predicted account address
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

    // ============ Admin Functions ============

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

    // ============ Internal Functions ============

    /**
     * @notice Build initialization data for Kernel.initialize()
     * @param owner The EOA owner address
     * @return Encoded call to Kernel.initialize
     *
     * @dev The initialization:
     *      1. Sets ECDSA validator as root (owner can sign userOps)
     *      2. Installs AutoYieldModule as executor with:
     *         - Default adapter
     *         - Global automation key
     *         - Default threshold
     */
    function _buildInitData(address owner) internal view returns (bytes memory) {
        // Create ValidationId for ECDSA validator
        ValidationId rootValidator = ValidatorLib.validatorToIdentifier(ecdsaValidator);

        // ECDSA validator expects owner address as init data
        bytes memory validatorData = abi.encodePacked(owner);

        // No hook for root validator
        IHook noHook = IHook(address(0));
        bytes memory hookData = "";

        // Build module init data: (defaultAdapter, automationKey, defaultThreshold)
        bytes memory moduleInitData = abi.encode(
            defaultAdapter,
            automationKey,
            defaultThreshold
        );

        // Build initConfig to install AutoYieldModule
        bytes[] memory initConfig = new bytes[](1);
        initConfig[0] = abi.encodeCall(
            IKernel.installModule,
            (EXECUTOR_MODULE_TYPE, autoYieldModule, moduleInitData)
        );

        // Encode the full initialize call
        return abi.encodeCall(
            IKernel.initialize,
            (rootValidator, noHook, validatorData, hookData, initConfig)
        );
    }
}
