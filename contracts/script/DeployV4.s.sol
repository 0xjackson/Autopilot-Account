// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import {AutoYieldModule} from "../src/AutoYieldModule.sol";
import {AutopilotFactory} from "../src/AutopilotFactory.sol";

/**
 * @title DeployV4
 * @notice Deployment script for v4 upgrade - Direct ERC-4626 vault integration
 *
 * Changes from v3:
 * - AutoYieldModule now interacts directly with ERC-4626 vaults (no adapter layer)
 * - AutopilotFactory uses defaultVault instead of defaultAdapter
 * - Default threshold changed from 100 USDC to 1 USDC
 *
 * Reuses existing AutomationValidator from v3: 0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b
 *
 * Usage:
 *   forge script script/DeployV4.s.sol:DeployV4 --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY - Private key for deployment
 *   BASESCAN_API_KEY - For contract verification
 */
contract DeployV4 is Script {
    address constant KERNEL_FACTORY = 0x2577507b78c2008Ff367261CB6285d44ba5eF2E9;
    address constant ECDSA_VALIDATOR = 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57;
    address constant DEFAULT_VAULT = 0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca;

    // Reuse existing AutomationValidator from v3
    address constant AUTOMATION_VALIDATOR = 0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b;

    // Existing automation key
    address constant AUTOMATION_KEY = 0xD78F5099987389e33bD6Ec15FF3Ca4dBedD507f3;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Autopilot v4 Deployment (Direct ERC-4626) ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        console.log("1. Deploying AutoYieldModule (v4 - direct vault)...");
        AutoYieldModule module = new AutoYieldModule();
        console.log("   AutoYieldModule:", address(module));

        console.log("2. Deploying AutopilotFactory (v4)...");
        AutopilotFactory factory = new AutopilotFactory(
            KERNEL_FACTORY,
            ECDSA_VALIDATOR,
            address(module),
            AUTOMATION_VALIDATOR,
            DEFAULT_VAULT,
            AUTOMATION_KEY
        );
        console.log("   AutopilotFactory:", address(factory));

        vm.stopBroadcast();

        console.log("");
        console.log("=== v4 Deployment Complete ===");
        console.log("");
        console.log("NEW CONTRACTS (v4):");
        console.log("  AutoYieldModule:   ", address(module));
        console.log("  AutopilotFactory:  ", address(factory));
        console.log("");
        console.log("REUSED FROM v3:");
        console.log("  AutomationValidator:", AUTOMATION_VALIDATOR);
        console.log("");
        console.log("CONFIGURATION:");
        console.log("  Default Vault:     ", DEFAULT_VAULT);
        console.log("  Default Threshold:  1 USDC");
        console.log("  Automation Key:    ", AUTOMATION_KEY);
    }
}
