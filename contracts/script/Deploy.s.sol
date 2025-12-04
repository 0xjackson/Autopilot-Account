// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import {AutoYieldModule} from "../src/AutoYieldModule.sol";
import {MorphoAdapter} from "../src/adapters/MorphoAdapter.sol";
import {AutopilotFactory} from "../src/AutopilotFactory.sol";
import {AutomationValidator} from "../src/AutomationValidator.sol";

/**
 * @title Deploy
 * @notice Deployment script for Autopilot contracts on Base mainnet
 *
 * Usage:
 *   forge script script/Deploy.s.sol:Deploy --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY - Private key for deployment
 *   BASESCAN_API_KEY - For contract verification
 */
contract Deploy is Script {
    // ============ Base Mainnet Addresses ============

    /// @notice ZeroDev Kernel Factory (v3.3)
    address constant KERNEL_FACTORY = 0x2577507b78c2008Ff367261CB6285d44ba5eF2E9;

    /// @notice ZeroDev ECDSA Validator
    address constant ECDSA_VALIDATOR = 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57;

    /// @notice Moonwell Flagship USDC MetaMorpho vault (highest TVL, safest)
    address constant MORPHO_VAULT_MOONWELL_USDC = 0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca;

    /// @notice Native USDC on Base
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // ============ Deployment ============

    function run() external {
        // Get deployer private key
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Get automation key (optional - can be set later)
        address automationKey = vm.envOr("AUTOMATION_KEY", deployer);

        console.log("=== Autopilot Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Automation Key:", automationKey);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy AutoYieldModule
        console.log("1. Deploying AutoYieldModule...");
        AutoYieldModule module = new AutoYieldModule();
        console.log("   AutoYieldModule:", address(module));

        // 2. Deploy MorphoAdapter for Moonwell USDC vault
        console.log("2. Deploying MorphoAdapter (Moonwell USDC)...");
        MorphoAdapter adapter = new MorphoAdapter(MORPHO_VAULT_MOONWELL_USDC);
        console.log("   MorphoAdapter:", address(adapter));
        console.log("   -> Vault:", adapter.vault());
        console.log("   -> Asset:", adapter.asset());

        // 3. Deploy AutomationValidator
        console.log("3. Deploying AutomationValidator...");
        AutomationValidator validator = new AutomationValidator();
        console.log("   AutomationValidator:", address(validator));

        // 4. Deploy AutopilotFactory
        console.log("4. Deploying AutopilotFactory...");
        AutopilotFactory factory = new AutopilotFactory(
            KERNEL_FACTORY,
            ECDSA_VALIDATOR,
            address(module),
            address(validator),
            address(adapter),
            automationKey
        );
        console.log("   AutopilotFactory:", address(factory));

        vm.stopBroadcast();

        // Print summary
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("AutoYieldModule:     ", address(module));
        console.log("MorphoAdapter:       ", address(adapter));
        console.log("AutomationValidator: ", address(validator));
        console.log("AutopilotFactory:    ", address(factory));
        console.log("");
        console.log("Morpho Vault:        ", MORPHO_VAULT_MOONWELL_USDC);
        console.log("USDC:                ", USDC);
        console.log("Kernel Factory:      ", KERNEL_FACTORY);
        console.log("ECDSA Validator:     ", ECDSA_VALIDATOR);
        console.log("");
        console.log("Next steps:");
        console.log("1. Verify contracts on Basescan");
        console.log("2. Update backend with contract addresses");
        console.log("3. Test wallet creation via factory");
    }
}
