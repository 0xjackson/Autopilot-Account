/**
 * Bundler integration test. Validates each step without submitting.
 * Run: npm run test:bundler [wallet_address]
 */

// Load env vars BEFORE any other imports (rpc.ts reads CDP_BUNDLER_URL at module load)
import { config } from "dotenv";
config({ path: ".env.local" });

import { encodeFunctionData, concat, pad, toHex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS, AUTO_YIELD_MODULE_ABI, KERNEL_EXECUTE_ABI, EXEC_MODE_DEFAULT } from "./constants";
import {
  packUint128,
  getUserOpHash,
  type PackedUserOperation,
} from "./userOp";
import {
  publicClient,
  getNonce,
  getGasPrices,
  getPaymasterStubData,
  isBundlerHealthy,
} from "./rpc";

function log(step: string, status: "ok" | "fail" | "info", msg: string) {
  const icon = status === "ok" ? "✓" : status === "fail" ? "✗" : "→";
  console.log(`${icon} [${step}] ${msg}`);
}

async function runTest(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (error) {
    log(name, "fail", error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function testConfig(): Promise<boolean> {
  return runTest("Config", async () => {
    const privateKey = process.env.AUTOMATION_PRIVATE_KEY;
    if (!privateKey) throw new Error("AUTOMATION_PRIVATE_KEY not set");
    if (!process.env.CDP_BUNDLER_URL) throw new Error("CDP_BUNDLER_URL not set");

    const signer = privateKeyToAccount(privateKey as `0x${string}`);
    log("Config", "ok", `Signer: ${signer.address}`);
  });
}

async function testBundlerHealth(): Promise<boolean> {
  return runTest("Bundler", async () => {
    if (!(await isBundlerHealthy())) {
      throw new Error("Bundler not reachable or doesn't support EntryPoint v0.7");
    }
    log("Bundler", "ok", "CDP bundler healthy");
  });
}

async function testWalletExists(addr: Address): Promise<boolean> {
  return runTest("Wallet", async () => {
    const code = await publicClient.getCode({ address: addr });
    if (!code || code === "0x") throw new Error(`No code at ${addr}`);
    log("Wallet", "ok", `Deployed`);
  });
}

async function testFullFlow(walletAddress: Address) {
  // getNonce returns the full encoded nonce from EntryPoint (includes validator in key)
  const nonce = await getNonce(walletAddress);
  log("Nonce", "ok", `0x${nonce.toString(16)}`);

  const { maxFeePerGas, maxPriorityFeePerGas } = await getGasPrices();
  const gasFees = packUint128(maxPriorityFeePerGas, maxFeePerGas);
  log("Gas", "ok", `maxFee: ${maxFeePerGas}`);

  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "rebalance",
    args: [CONTRACTS.USDC],
  });

  // ERC-7579 execution calldata: abi.encodePacked(target, value, callData)
  const executionCalldata = concat([
    CONTRACTS.MODULE,                    // address (20 bytes)
    pad(toHex(0n), { size: 32 }),        // value (32 bytes)
    moduleCallData,                       // data (variable length)
  ]);

  const callData = encodeFunctionData({
    abi: KERNEL_EXECUTE_ABI,
    functionName: "execute",
    args: [EXEC_MODE_DEFAULT, executionCalldata],
  });
  log("Calldata", "ok", `${callData.length} chars`);

  // Use fixed gas limits (CDP bundler can't estimate with dummy signature)
  const verificationGasLimit = 500000n;
  const callGasLimit = 300000n;
  const preVerificationGas = 100000n;
  const accountGasLimits = packUint128(verificationGasLimit, callGasLimit);
  log("Gas Limits", "ok", `verify: ${verificationGasLimit}, call: ${callGasLimit}`);

  const paymasterAndData = await getPaymasterStubData({
    sender: walletAddress,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  log("Paymaster", "ok", `${paymasterAndData.slice(0, 42)}`);

  const userOp: PackedUserOperation = {
    sender: walletAddress,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits,
    preVerificationGas,
    gasFees,
    paymasterAndData,
    signature: "0x",
  };
  const hash = getUserOpHash(userOp);
  log("Hash", "ok", hash);

  const signer = privateKeyToAccount(process.env.AUTOMATION_PRIVATE_KEY as `0x${string}`);
  const sig = await signer.signMessage({ message: { raw: hash } });
  userOp.signature = sig;
  log("Signature", "ok", `${sig.slice(0, 16)}...`);

  // Note: Not submitting - this test validates the pipeline without sending
  log("Ready", "ok", "UserOp ready to submit (not sending in test mode)");
}

async function main() {
  const walletAddress = process.argv[2] as Address | undefined;

  console.log("\nBundler Test\n");
  console.log(`Module:     ${CONTRACTS.MODULE}`);
  console.log(`Validator:  ${CONTRACTS.VALIDATOR}\n`);

  if (!(await testConfig())) process.exit(1);
  if (!(await testBundlerHealth())) process.exit(1);

  if (!walletAddress) {
    console.log("\nProvide wallet for full test: npm run test:bundler 0xWallet\n");
    process.exit(0);
  }

  if (!(await testWalletExists(walletAddress))) process.exit(1);
  await testFullFlow(walletAddress);

  console.log("\n✓ All tests passed\n");
}

main().catch(console.error);
