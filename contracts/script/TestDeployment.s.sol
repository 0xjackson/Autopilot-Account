// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import {AutoYieldModule} from "../src/AutoYieldModule.sol";
import {MorphoAdapter} from "../src/adapters/MorphoAdapter.sol";
import {AutopilotFactory} from "../src/AutopilotFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TestDeployment
 * @notice Test that deployed contracts work correctly on Base mainnet
 *
 * Usage:
 *   forge script script/TestDeployment.s.sol:TestDeployment --rpc-url https://mainnet.base.org -vvv
 */
contract TestDeployment is Script {
    // Deployed contract addresses
    AutoYieldModule constant MODULE = AutoYieldModule(0xdC5ec0628ff1c0063A2d2B13B3FbBD9431aE4a10);
    MorphoAdapter constant ADAPTER = MorphoAdapter(0x33fD350a1ecE1239B880B3b3f91eb39407A7eDf9);
    AutopilotFactory constant FACTORY = AutopilotFactory(0xa508485E1F6990255B17063C5368BC02eACffa6f);

    // External addresses
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant MORPHO_VAULT = 0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca;

    function run() external view {
        console.log("=== Testing Deployed Contracts ===");
        console.log("");

        // Test 1: Verify AutoYieldModule is deployed
        console.log("1. AutoYieldModule");
        console.log("   Address:", address(MODULE));
        // Check it responds to isModuleType (ERC-7579)
        bool isExecutor = MODULE.isModuleType(2); // MODULE_TYPE_EXECUTOR = 2
        console.log("   isModuleType(EXECUTOR):", isExecutor);
        require(isExecutor, "Module should be executor type");
        console.log("   [PASS]");
        console.log("");

        // Test 2: Verify MorphoAdapter is deployed and configured
        console.log("2. MorphoAdapter");
        console.log("   Address:", address(ADAPTER));
        console.log("   Asset:", ADAPTER.asset());
        console.log("   Vault:", ADAPTER.vault());
        require(ADAPTER.asset() == USDC, "Adapter should use USDC");
        require(ADAPTER.vault() == MORPHO_VAULT, "Adapter should use Morpho vault");
        console.log("   [PASS]");
        console.log("");

        // Test 3: Verify AutopilotFactory is deployed and configured
        console.log("3. AutopilotFactory");
        console.log("   Address:", address(FACTORY));
        console.log("   Kernel Factory:", address(FACTORY.kernelFactory()));
        console.log("   ECDSA Validator:", FACTORY.ecdsaValidator());
        console.log("   AutoYieldModule:", FACTORY.autoYieldModule());
        console.log("   Default Adapter:", FACTORY.defaultAdapter());
        console.log("   Default Threshold:", FACTORY.defaultThreshold());
        console.log("   Automation Key:", FACTORY.automationKey());
        require(FACTORY.autoYieldModule() == address(MODULE), "Factory should use our module");
        require(FACTORY.defaultAdapter() == address(ADAPTER), "Factory should use our adapter");
        console.log("   [PASS]");
        console.log("");

        // Test 4: Predict an account address (doesn't deploy)
        console.log("4. Account Address Prediction");
        address testOwner = 0x380833DAFE52Fdb8fCEdE4486ED676f72D2436D0;
        bytes32 testSalt = bytes32(uint256(1));
        address predicted = FACTORY.getAddress(testOwner, testSalt);
        console.log("   Owner:", testOwner);
        console.log("   Salt:", uint256(testSalt));
        console.log("   Predicted Address:", predicted);
        require(predicted != address(0), "Should predict non-zero address");
        console.log("   [PASS]");
        console.log("");

        // Test 5: Check Morpho vault has liquidity
        console.log("5. Morpho Vault Liquidity");
        uint256 vaultBalance = IERC20(USDC).balanceOf(MORPHO_VAULT);
        console.log("   USDC in Morpho Vault:", vaultBalance / 1e6, "USDC");
        require(vaultBalance > 0, "Vault should have liquidity");
        console.log("   [PASS]");
        console.log("");

        console.log("=== All Tests Passed! ===");
        console.log("");
        console.log("Contracts are correctly deployed and configured.");
        console.log("Ready to create wallets via factory.createAccount(salt)");
    }
}
