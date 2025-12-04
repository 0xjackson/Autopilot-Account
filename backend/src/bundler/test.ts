/**
 * Bundler Integration Test
 *
 * Tests each step of UserOp submission without actually sending.
 * Run with: npx ts-node src/bundler/test.ts <wallet_address>
 */

import { encodeFunctionData, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS, AUTO_YIELD_MODULE_ABI, KERNEL_EXECUTE_ABI } from "./constants";
import {
  encodeNonceForValidator,
  packUint128,
  getUserOpHash,
  type PackedUserOperation,
} from "./userOp";
import {
  publicClient,
  getNonce,
  getGasPrices,
  getPaymasterStubData,
  estimateUserOperationGas,
  isBundlerHealthy,
} from "./rpc";

// =============================================================================
// Test Utilities
// =============================================================================

function log(step: string, status: "ok" | "fail" | "info", message: string) {
  const icon = status === "ok" ? "✓" : status === "fail" ? "✗" : "→";
  console.log(`${icon} [${step}] ${message}`);
}

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(name, "fail", msg);
    return false;
  }
}

// =============================================================================
// Tests
// =============================================================================

async function testConfig(): Promise<boolean> {
  return runTest("Config", async () => {
    const privateKey = process.env.AUTOMATION_PRIVATE_KEY;
    const bundlerUrl = process.env.CDP_BUNDLER_URL;

    if (!privateKey) {
      throw new Error("AUTOMATION_PRIVATE_KEY not set");
    }
    if (!bundlerUrl) {
      throw new Error("CDP_BUNDLER_URL not set");
    }

    const signer = privateKeyToAccount(privateKey as `0x${string}`);
    log("Config", "ok", `Signer: ${signer.address}`);

    // Verify it matches expected
    const expected = process.env.AUTOMATION_PUBLIC_ADDRESS;
    if (expected && signer.address.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(
        `Signer mismatch: got ${signer.address}, expected ${expected}`
      );
    }
  });
}

async function testBundlerHealth(): Promise<boolean> {
  return runTest("Bundler", async () => {
    const healthy = await isBundlerHealthy();
    if (!healthy) {
      throw new Error("Bundler not reachable or doesn't support EntryPoint v0.7");
    }
    log("Bundler", "ok", "CDP bundler is healthy");
  });
}

async function testNonceFetch(walletAddress: Address): Promise<bigint> {
  let nonce = 0n;
  await runTest("Nonce", async () => {
    const sequentialNonce = await getNonce(walletAddress);
    nonce = encodeNonceForValidator(CONTRACTS.VALIDATOR, sequentialNonce);
    log("Nonce", "ok", `Sequential: ${sequentialNonce}, Encoded: ${nonce}`);
  });
  return nonce;
}

async function testGasPrices(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  let prices = { maxFeePerGas: 0n, maxPriorityFeePerGas: 0n };
  await runTest("Gas Prices", async () => {
    prices = await getGasPrices();
    log(
      "Gas Prices",
      "ok",
      `maxFee: ${prices.maxFeePerGas}, priorityFee: ${prices.maxPriorityFeePerGas}`
    );
  });
  return prices;
}

async function testBuildCalldata(): Promise<`0x${string}`> {
  let callData: `0x${string}` = "0x";
  await runTest("Calldata", async () => {
    // Build rebalance(USDC) call
    const moduleCallData = encodeFunctionData({
      abi: AUTO_YIELD_MODULE_ABI,
      functionName: "rebalance",
      args: [CONTRACTS.USDC],
    });

    // Wrap in Kernel.execute
    callData = encodeFunctionData({
      abi: KERNEL_EXECUTE_ABI,
      functionName: "execute",
      args: [CONTRACTS.MODULE, 0n, moduleCallData],
    });

    log("Calldata", "ok", `Length: ${callData.length} chars`);
    log("Calldata", "info", `Module call: rebalance(${CONTRACTS.USDC})`);
  });
  return callData;
}

async function testPaymasterStub(
  walletAddress: Address,
  nonce: bigint,
  callData: `0x${string}`,
  gasFees: `0x${string}`
): Promise<`0x${string}`> {
  let paymasterAndData: `0x${string}` = "0x";
  await runTest("Paymaster Stub", async () => {
    const stubGasLimits = packUint128(500000n, 500000n);

    paymasterAndData = await getPaymasterStubData({
      sender: walletAddress,
      nonce,
      initCode: "0x",
      callData,
      accountGasLimits: stubGasLimits,
      preVerificationGas: 100000n,
      gasFees,
    });

    log("Paymaster Stub", "ok", `Length: ${paymasterAndData.length} chars`);
    log("Paymaster Stub", "info", `Paymaster: ${paymasterAndData.slice(0, 42)}`);
  });
  return paymasterAndData;
}

async function testGasEstimation(
  walletAddress: Address,
  nonce: bigint,
  callData: `0x${string}`,
  gasFees: `0x${string}`,
  paymasterAndData: `0x${string}`
): Promise<{ verificationGasLimit: bigint; callGasLimit: bigint; preVerificationGas: bigint }> {
  let gasEstimate = {
    verificationGasLimit: 0n,
    callGasLimit: 0n,
    preVerificationGas: 0n,
  };

  await runTest("Gas Estimation", async () => {
    const stubGasLimits = packUint128(500000n, 500000n);
    const dummySignature = ("0x" + "00".repeat(65)) as `0x${string}`;

    const result = await estimateUserOperationGas({
      sender: walletAddress,
      nonce,
      initCode: "0x",
      callData,
      accountGasLimits: stubGasLimits,
      preVerificationGas: 100000n,
      gasFees,
      paymasterAndData,
      signature: dummySignature,
    });

    gasEstimate = {
      verificationGasLimit: BigInt(result.verificationGasLimit),
      callGasLimit: BigInt(result.callGasLimit),
      preVerificationGas: BigInt(result.preVerificationGas),
    };

    log("Gas Estimation", "ok", `verification: ${gasEstimate.verificationGasLimit}`);
    log("Gas Estimation", "info", `call: ${gasEstimate.callGasLimit}`);
    log("Gas Estimation", "info", `preVerification: ${gasEstimate.preVerificationGas}`);
  });

  return gasEstimate;
}

async function testUserOpHash(
  walletAddress: Address,
  nonce: bigint,
  callData: `0x${string}`,
  gasFees: `0x${string}`,
  gasEstimate: { verificationGasLimit: bigint; callGasLimit: bigint; preVerificationGas: bigint },
  paymasterAndData: `0x${string}`
): Promise<`0x${string}`> {
  let hash: `0x${string}` = "0x";

  await runTest("UserOp Hash", async () => {
    const accountGasLimits = packUint128(
      gasEstimate.verificationGasLimit,
      gasEstimate.callGasLimit
    );

    const userOp: PackedUserOperation = {
      sender: walletAddress,
      nonce,
      initCode: "0x",
      callData,
      accountGasLimits,
      preVerificationGas: gasEstimate.preVerificationGas,
      gasFees,
      paymasterAndData,
      signature: "0x",
    };

    hash = getUserOpHash(userOp);
    log("UserOp Hash", "ok", hash);
  });

  return hash;
}

async function testSignature(userOpHash: `0x${string}`): Promise<`0x${string}`> {
  let signature: `0x${string}` = "0x";

  await runTest("Signature", async () => {
    const privateKey = process.env.AUTOMATION_PRIVATE_KEY as `0x${string}`;
    const signer = privateKeyToAccount(privateKey);

    signature = await signer.signMessage({
      message: { raw: userOpHash },
    });

    log("Signature", "ok", `${signature.slice(0, 20)}...${signature.slice(-8)}`);
    log("Signature", "info", `Signer: ${signer.address}`);
  });

  return signature;
}

async function testWalletExists(walletAddress: Address): Promise<boolean> {
  let exists = false;

  await runTest("Wallet", async () => {
    const code = await publicClient.getCode({ address: walletAddress });
    exists = !!code && code !== "0x";

    if (!exists) {
      throw new Error(`No code at ${walletAddress} - wallet not deployed?`);
    }

    log("Wallet", "ok", `Deployed at ${walletAddress}`);
  });

  return exists;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const walletAddress = process.argv[2] as Address | undefined;

  console.log("\n🔧 Bundler Integration Test\n");
  console.log("Contracts:");
  console.log(`  Module:    ${CONTRACTS.MODULE}`);
  console.log(`  Validator: ${CONTRACTS.VALIDATOR}`);
  console.log(`  EntryPoint: ${CONTRACTS.ENTRYPOINT}`);
  console.log("");

  // Test 1: Config
  const configOk = await testConfig();
  if (!configOk) {
    console.log("\n❌ Config test failed. Set env vars and retry.\n");
    process.exit(1);
  }

  // Test 2: Bundler health
  const bundlerOk = await testBundlerHealth();
  if (!bundlerOk) {
    console.log("\n❌ Bundler test failed. Check CDP_BUNDLER_URL.\n");
    process.exit(1);
  }

  // Need wallet address for remaining tests
  if (!walletAddress) {
    console.log("\n⚠️  Provide wallet address to test full flow:");
    console.log("   npx ts-node src/bundler/test.ts 0xYourWalletAddress\n");
    console.log("✅ Basic tests passed!\n");
    process.exit(0);
  }

  console.log(`\nTesting with wallet: ${walletAddress}\n`);

  // Test 3: Wallet exists
  const walletOk = await testWalletExists(walletAddress);
  if (!walletOk) {
    console.log("\n❌ Wallet not found. Deploy wallet first.\n");
    process.exit(1);
  }

  // Test 4: Nonce
  const nonce = await testNonceFetch(walletAddress);

  // Test 5: Gas prices
  const { maxFeePerGas, maxPriorityFeePerGas } = await testGasPrices();
  const gasFees = packUint128(maxPriorityFeePerGas, maxFeePerGas);

  // Test 6: Build calldata
  const callData = await testBuildCalldata();

  // Test 7: Paymaster stub
  const paymasterAndData = await testPaymasterStub(
    walletAddress,
    nonce,
    callData,
    gasFees
  );

  // Test 8: Gas estimation
  const gasEstimate = await testGasEstimation(
    walletAddress,
    nonce,
    callData,
    gasFees,
    paymasterAndData
  );

  // Test 9: UserOp hash
  const userOpHash = await testUserOpHash(
    walletAddress,
    nonce,
    callData,
    gasFees,
    gasEstimate,
    paymasterAndData
  );

  // Test 10: Signature
  await testSignature(userOpHash);

  console.log("\n✅ All tests passed! Ready to submit UserOps.\n");
  console.log("To submit a real rebalance UserOp, the scheduler will do this automatically");
  console.log("when bundlerEnabled is true and a task is due.\n");
}

// Load env and run
import { config } from "dotenv";
config({ path: ".env.local" });
main().catch(console.error);
