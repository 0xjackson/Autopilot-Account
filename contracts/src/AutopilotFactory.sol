// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IKernel, IKernelFactory, IHook, ValidationId, ValidatorLib, MODULE_TYPE_EXECUTOR} from "./interfaces/IKernel.sol";

/**
 * @title AutopilotFactory
 * @notice Factory contract for deploying Autopilot wallets via ZeroDev Kernel Factory
 * @dev Uses the deployed Kernel v3 infrastructure on Base to create ERC-4337 + ERC-7579
 *      compliant smart accounts with the AutoYieldModule pre-installed as an executor.
 *
 *      Kernel v3.3 Factory addresses (same on all chains):
 *      - Factory: 0x2577507b78c2008Ff367261CB6285d44ba5eF2E9
 *      - ECDSA Validator: 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57
 */
contract AutopilotFactory {
    // ============ Errors ============
    error AccountAlreadyExists();
    error ZeroAddress();

    // ============ Events ============
    event AccountCreated(address indexed account, address indexed owner, bytes32 salt);

    // ============ Constants ============

    /// @notice ERC-7579 module type for executor modules
    uint256 private constant EXECUTOR_MODULE_TYPE = MODULE_TYPE_EXECUTOR;

    // ============ Immutables ============

    /// @notice The ZeroDev Kernel Factory (deployed on Base)
    IKernelFactory public immutable kernelFactory;

    /// @notice The ECDSA validator for owner signatures
    address public immutable ecdsaValidator;

    /// @notice Address of the AutoYieldModule to install on new accounts
    address public immutable autoYieldModule;

    /// @notice Address of the default YieldAdapter
    address public immutable defaultAdapter;

    // ============ State ============

    /// @notice Mapping of owner to their deployed account
    mapping(address => address) public accountOf;

    // ============ Constructor ============

    /**
     * @notice Initialize the factory
     * @param _kernelFactory Address of the deployed KernelFactory
     * @param _ecdsaValidator Address of the ECDSA validator module
     * @param _autoYieldModule Address of the AutoYieldModule implementation
     * @param _defaultAdapter Address of the default YieldAdapter
     */
    constructor(
        address _kernelFactory,
        address _ecdsaValidator,
        address _autoYieldModule,
        address _defaultAdapter
    ) {
        if (_kernelFactory == address(0)) revert ZeroAddress();
        if (_ecdsaValidator == address(0)) revert ZeroAddress();
        if (_autoYieldModule == address(0)) revert ZeroAddress();
        if (_defaultAdapter == address(0)) revert ZeroAddress();

        kernelFactory = IKernelFactory(_kernelFactory);
        ecdsaValidator = _ecdsaValidator;
        autoYieldModule = _autoYieldModule;
        defaultAdapter = _defaultAdapter;
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
     * @param owner Owner of the new account (EOA that controls it via ECDSA)
     * @param salt Salt for CREATE2 deterministic deployment
     * @return account Address of the deployed account
     */
    function createAccountFor(address owner, bytes32 salt) public returns (address account) {
        if (owner == address(0)) revert ZeroAddress();
        if (accountOf[owner] != address(0)) revert AccountAlreadyExists();

        // Build the initialization data for the Kernel account
        bytes memory initData = _buildInitData(owner);

        // Combine owner into salt for uniqueness per owner
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

    // ============ Internal Functions ============

    /**
     * @notice Build the initialization data for Kernel.initialize()
     * @param owner The EOA owner address for ECDSA validation
     * @return Encoded call to Kernel.initialize with validator + executor module
     *
     * @dev The initialization flow:
     *      1. Set ECDSA validator as root validator (owner can sign userOps)
     *      2. Install AutoYieldModule as executor (handles auto-yield logic)
     *
     *      Kernel.initialize signature:
     *      function initialize(
     *          ValidationId _rootValidator,
     *          IHook hook,
     *          bytes calldata validatorData,
     *          bytes calldata hookData,
     *          bytes[] calldata initConfig
     *      )
     */
    function _buildInitData(address owner) internal view returns (bytes memory) {
        // Create ValidationId for ECDSA validator (0x01 prefix + validator address)
        ValidationId rootValidator = ValidatorLib.validatorToIdentifier(ecdsaValidator);

        // ECDSA validator expects the owner address as initialization data
        bytes memory validatorData = abi.encodePacked(owner);

        // No hook for the root validator
        IHook noHook = IHook(address(0));
        bytes memory hookData = "";

        // Build initConfig to install AutoYieldModule as executor
        // Each entry is an encoded call that will be executed during initialization
        bytes[] memory initConfig = new bytes[](1);
        initConfig[0] = abi.encodeCall(
            IKernel.installModule,
            (EXECUTOR_MODULE_TYPE, autoYieldModule, abi.encode(defaultAdapter))
        );

        // Encode the full initialize call
        return abi.encodeCall(
            IKernel.initialize,
            (rootValidator, noHook, validatorData, hookData, initConfig)
        );
    }
}
