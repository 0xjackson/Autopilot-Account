// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import {AutoYieldModule} from "../src/AutoYieldModule.sol";

/**
 * @title DeployModuleV5
 * @notice Deploy only the fixed AutoYieldModule (v5 - executeFromExecutor fix)
 *
 * The fix: Changed _executeOnKernel to use executeFromExecutor() instead of execute()
 * This allows the module to callback into Kernel without triggering root validator hooks.
 *
 * Usage:
 *   forge script script/DeployModuleV5.s.sol:DeployModuleV5 --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY - Private key for deployment
 *   BASESCAN_API_KEY - For contract verification (optional)
 */
contract DeployModuleV5 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== AutoYieldModule v5 Deployment (executeFromExecutor fix) ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying AutoYieldModule v5...");
        AutoYieldModule module = new AutoYieldModule();
        console.log("AutoYieldModule v5:", address(module));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("NEW MODULE ADDRESS:", address(module));
        console.log("");
        console.log("NEXT STEPS:");
        console.log("1. Update backend/src/bundler/constants.ts MODULE address");
        console.log("2. Existing wallets need to reinstall the module OR");
        console.log("   create new wallets with updated factory");
    }
}
