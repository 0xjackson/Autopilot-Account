/**
 * High-level UserOp submission functions for automation
 */

import { encodeFunctionData, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CONTRACTS,
  AUTO_YIELD_MODULE_ABI,
  KERNEL_EXECUTE_ABI,
} from "./constants";
import {
  type PackedUserOperation,
  encodeNonceForValidator,
  packUint128,
  getUserOpHash,
} from "./userOp";
import {
  getNonce,
  getGasPrices,
  getPaymasterStubData,
  getPaymasterData,
  estimateUserOperationGas,
  sendUserOperation,
  waitForUserOperationReceipt,
} from "./rpc";

// =============================================================================
// Configuration
// =============================================================================

const AUTOMATION_PRIVATE_KEY = process.env.AUTOMATION_PRIVATE_KEY as Hex | undefined;

function getAutomationSigner() {
  if (!AUTOMATION_PRIVATE_KEY) {
    throw new Error("AUTOMATION_PRIVATE_KEY not configured");
  }
  return privateKeyToAccount(AUTOMATION_PRIVATE_KEY);
}

// =============================================================================
// Core Submit Function
// =============================================================================

/**
 * Build, sign, and submit a UserOp for an automation call
 */
async function submitAutomationUserOp(
  walletAddress: Address,
  moduleCallData: Hex
): Promise<Hex> {
  const signer = getAutomationSigner();
  console.log(`[bundler] Signer: ${signer.address}`);
  console.log(`[bundler] Wallet: ${walletAddress}`);

  // 1. Build Kernel.execute calldata (calls AutoYieldModule)
  const callData = encodeFunctionData({
    abi: KERNEL_EXECUTE_ABI,
    functionName: "execute",
    args: [CONTRACTS.MODULE, 0n, moduleCallData],
  });

  // 2. Get nonce (encoded for AutomationValidator)
  const sequentialNonce = await getNonce(walletAddress);
  const nonce = encodeNonceForValidator(CONTRACTS.VALIDATOR, sequentialNonce);
  console.log(`[bundler] Sequential nonce: ${sequentialNonce}, Encoded: ${nonce}`);

  // 3. Get current gas prices
  const { maxFeePerGas, maxPriorityFeePerGas } = await getGasPrices();
  const gasFees = packUint128(maxPriorityFeePerGas, maxFeePerGas);
  console.log(`[bundler] Gas prices: maxFee=${maxFeePerGas}, priorityFee=${maxPriorityFeePerGas}`);

  // 4. Build stub UserOp for gas estimation
  const stubGasLimits = packUint128(500000n, 500000n);
  const stubUserOp: Partial<PackedUserOperation> = {
    sender: walletAddress,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits: stubGasLimits,
    preVerificationGas: 100000n,
    gasFees,
  };

  // 5. Get paymaster stub data
  const stubPaymasterAndData = await getPaymasterStubData(stubUserOp);

  // 6. Estimate gas with dummy signature
  const dummySignature = ("0x" + "00".repeat(65)) as Hex;
  const gasEstimate = await estimateUserOperationGas({
    ...stubUserOp,
    paymasterAndData: stubPaymasterAndData,
    signature: dummySignature,
  } as PackedUserOperation);
  console.log(`[bundler] Gas estimate:`, gasEstimate);

  // 7. Build UserOp with real gas values
  const accountGasLimits = packUint128(
    BigInt(gasEstimate.verificationGasLimit),
    BigInt(gasEstimate.callGasLimit)
  );
  const preVerificationGas = BigInt(gasEstimate.preVerificationGas);

  // 8. Get final paymaster data
  const paymasterAndData = await getPaymasterData({
    sender: walletAddress,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits,
    preVerificationGas,
    gasFees,
  });

  // 9. Build final UserOp and calculate hash
  const finalUserOp: PackedUserOperation = {
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

  const userOpHash = getUserOpHash(finalUserOp);
  console.log(`[bundler] UserOp hash: ${userOpHash}`);

  // 10. Sign the hash
  const signature = await signer.signMessage({
    message: { raw: userOpHash },
  });
  finalUserOp.signature = signature;
  console.log(`[bundler] Signature: ${signature.slice(0, 20)}...`);

  // 11. Submit to bundler
  console.log(`[bundler] Submitting UserOp...`);
  const submittedHash = await sendUserOperation(finalUserOp);
  console.log(`[bundler] Submitted: ${submittedHash}`);

  // 12. Wait for receipt
  console.log(`[bundler] Waiting for confirmation...`);
  const receipt = await waitForUserOperationReceipt(submittedHash);
  console.log(`[bundler] Confirmed in tx: ${receipt.receipt.transactionHash}`);

  return submittedHash;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Submit a rebalance UserOp
 *
 * Moves excess checking balance into yield. Called when the wallet's
 * checking balance exceeds the threshold after receiving funds.
 */
export async function submitRebalanceUserOp(
  walletAddress: Address,
  tokenAddress: Address = CONTRACTS.USDC
): Promise<Hex> {
  console.log(`[bundler] === REBALANCE ===`);
  console.log(`[bundler] Token: ${tokenAddress}`);

  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "rebalance",
    args: [tokenAddress],
  });

  return submitAutomationUserOp(walletAddress, moduleCallData);
}

/**
 * Submit a migrateStrategy UserOp
 *
 * Moves funds from current vault to a better yielding vault.
 */
export async function submitMigrateStrategyUserOp(
  walletAddress: Address,
  tokenAddress: Address,
  newAdapterAddress: Address
): Promise<Hex> {
  console.log(`[bundler] === MIGRATE STRATEGY ===`);
  console.log(`[bundler] Token: ${tokenAddress}`);
  console.log(`[bundler] New Adapter: ${newAdapterAddress}`);

  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "migrateStrategy",
    args: [tokenAddress, newAdapterAddress],
  });

  return submitAutomationUserOp(walletAddress, moduleCallData);
}

/**
 * Submit a sweepDustAndCompound UserOp
 *
 * Swaps dust tokens to USDC and deposits into yield.
 */
export async function submitSweepDustUserOp(walletAddress: Address): Promise<Hex> {
  console.log(`[bundler] === SWEEP DUST ===`);

  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "sweepDustAndCompound",
    args: [],
  });

  return submitAutomationUserOp(walletAddress, moduleCallData);
}
