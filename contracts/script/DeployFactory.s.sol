// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import {AutopilotFactory} from "../src/AutopilotFactory.sol";

/**
 * @title DeployFactory
 * @notice Redeploy only the AutopilotFactory with fixed SELECTOR_EXECUTE
 *
 * Usage:
 *   forge script script/DeployFactory.s.sol:DeployFactory \
 *     --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract DeployFactory is Script {
    // Existing deployed contracts (unchanged)
    address constant AUTO_YIELD_MODULE = 0x71b5A4663A49FF02BE672Ea9560256D2268727B7;
    address constant AUTOMATION_VALIDATOR = 0x47A6b2f3bD564F9DeA17AcF8AbE73890c546900b;
    address constant MORPHO_ADAPTER = 0x42EFecD83447e5b90c5F706309FaC8f9615bd68F;

    // ZeroDev infrastructure
    address constant KERNEL_FACTORY = 0x2577507b78c2008Ff367261CB6285d44ba5eF2E9;
    address constant ECDSA_VALIDATOR = 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address automationKey = vm.envOr("AUTOMATION_KEY", address(0xD78F5099987389e33bD6Ec15FF3Ca4dBedD507f3));

        console.log("=== Redeploy AutopilotFactory ===");
        console.log("Fix: SELECTOR_EXECUTE = 0xe9ae5c53 (Kernel v3 ERC-7579)");
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        AutopilotFactory factory = new AutopilotFactory(
            KERNEL_FACTORY,
            ECDSA_VALIDATOR,
            AUTO_YIELD_MODULE,
            AUTOMATION_VALIDATOR,
            MORPHO_ADAPTER,
            automationKey
        );

        vm.stopBroadcast();

        console.log("AutopilotFactory:", address(factory));
        console.log("");
        console.log("Next: Update backend/src/bundler/constants.ts with new factory address");
    }
}
