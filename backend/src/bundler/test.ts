/**
 * Bundler integration test. Validates each step without submitting.
 * Run: npm run test:bundler [wallet_address]
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
  const sequentialNonce = await getNonce(walletAddress);
  const nonce = encodeNonceForValidator(CONTRACTS.VALIDATOR, sequentialNonce);
  log("Nonce", "ok", `${sequentialNonce}`);

  const { maxFeePerGas, maxPriorityFeePerGas } = await getGasPrices();
  const gasFees = packUint128(maxPriorityFeePerGas, maxFeePerGas);
  log("Gas", "ok", `maxFee: ${maxFeePerGas}`);

  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "rebalance",
    args: [CONTRACTS.USDC],
  });
  const callData = encodeFunctionData({
    abi: KERNEL_EXECUTE_ABI,
    functionName: "execute",
    args: [CONTRACTS.MODULE, 0n, moduleCallData],
  });
  log("Calldata", "ok", `${callData.length} chars`);

  const stubGasLimits = packUint128(500000n, 500000n);
  const paymasterAndData = await getPaymasterStubData({
    sender: walletAddress,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits: stubGasLimits,
    preVerificationGas: 100000n,
    gasFees,
  });
  log("Paymaster", "ok", `${paymasterAndData.slice(0, 42)}`);

  const dummySig = ("0x" + "00".repeat(65)) as `0x${string}`;
  const gasEst = await estimateUserOperationGas({
    sender: walletAddress,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits: stubGasLimits,
    preVerificationGas: 100000n,
    gasFees,
    paymasterAndData,
    signature: dummySig,
  });
  log("Gas Est", "ok", `verify: ${gasEst.verificationGasLimit}, call: ${gasEst.callGasLimit}`);

  const accountGasLimits = packUint128(
    BigInt(gasEst.verificationGasLimit),
    BigInt(gasEst.callGasLimit)
  );
  const userOp: PackedUserOperation = {
    sender: walletAddress,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits,
    preVerificationGas: BigInt(gasEst.preVerificationGas),
    gasFees,
    paymasterAndData,
    signature: "0x",
  };
  const hash = getUserOpHash(userOp);
  log("Hash", "ok", hash);

  const signer = privateKeyToAccount(process.env.AUTOMATION_PRIVATE_KEY as `0x${string}`);
  const sig = await signer.signMessage({ message: { raw: hash } });
  log("Signature", "ok", `${sig.slice(0, 16)}...`);
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

import { config } from "dotenv";
config({ path: ".env.local" });
main().catch(console.error);
