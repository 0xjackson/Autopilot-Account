import { encodeFunctionData, concat, pad, toHex, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS, AUTO_YIELD_MODULE_ABI, KERNEL_EXECUTE_ABI, EXEC_MODE_DEFAULT } from "./constants";
import {
  type PackedUserOperation,
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

const AUTOMATION_PRIVATE_KEY = process.env.AUTOMATION_PRIVATE_KEY as Hex | undefined;

function getAutomationSigner() {
  if (!AUTOMATION_PRIVATE_KEY) {
    throw new Error("AUTOMATION_PRIVATE_KEY not configured");
  }
  return privateKeyToAccount(AUTOMATION_PRIVATE_KEY);
}

async function submitAutomationUserOp(
  walletAddress: Address,
  moduleCallData: Hex
): Promise<Hex> {
  const signer = getAutomationSigner();
  console.log(`[bundler] Signer: ${signer.address}, Wallet: ${walletAddress}`);

  const executionCalldata = concat([
    CONTRACTS.MODULE,
    pad(toHex(0n), { size: 32 }),
    moduleCallData,
  ]);

  const callData = encodeFunctionData({
    abi: KERNEL_EXECUTE_ABI,
    functionName: "execute",
    args: [EXEC_MODE_DEFAULT, executionCalldata],
  });

  const nonce = await getNonce(walletAddress);
  const { maxFeePerGas, maxPriorityFeePerGas } = await getGasPrices();
  const gasFees = packUint128(maxPriorityFeePerGas, maxFeePerGas);

  const stubGasLimits = packUint128(500000n, 500000n);
  const stubPreVerificationGas = 100000n;

  const stubPaymasterAndData = await getPaymasterStubData({
    sender: walletAddress,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits: stubGasLimits,
    preVerificationGas: stubPreVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });

  const stubUserOp: PackedUserOperation = {
    sender: walletAddress,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits: stubGasLimits,
    preVerificationGas: stubPreVerificationGas,
    gasFees,
    paymasterAndData: stubPaymasterAndData,
    signature: "0x",
  };

  const stubHash = getUserOpHash(stubUserOp);
  const stubSignature = await signer.signMessage({ message: { raw: stubHash } });
  stubUserOp.signature = stubSignature;

  const gasEstimate = await estimateUserOperationGas(stubUserOp);

  const accountGasLimits = packUint128(
    BigInt(gasEstimate.verificationGasLimit),
    BigInt(gasEstimate.callGasLimit)
  );
  const preVerificationGas = BigInt(gasEstimate.preVerificationGas);

  const paymasterAndData = await getPaymasterData({
    sender: walletAddress,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });

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

  const finalHash = getUserOpHash(finalUserOp);
  const finalSignature = await signer.signMessage({ message: { raw: finalHash } });
  finalUserOp.signature = finalSignature;

  const submittedHash = await sendUserOperation(finalUserOp);
  console.log(`[bundler] Submitted: ${submittedHash}`);

  const receipt = await waitForUserOperationReceipt(submittedHash);
  console.log(`[bundler] Confirmed: ${receipt.receipt.transactionHash}`);

  return submittedHash;
}

export async function submitRebalanceUserOp(
  walletAddress: Address,
  tokenAddress: Address = CONTRACTS.USDC
): Promise<Hex> {
  console.log(`[bundler] Rebalance: ${walletAddress}`);
  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "rebalance",
    args: [tokenAddress],
  });
  return submitAutomationUserOp(walletAddress, moduleCallData);
}

export async function submitMigrateStrategyUserOp(
  walletAddress: Address,
  tokenAddress: Address,
  newAdapterAddress: Address
): Promise<Hex> {
  console.log(`[bundler] Migrate: ${walletAddress} -> ${newAdapterAddress}`);
  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "migrateStrategy",
    args: [tokenAddress, newAdapterAddress],
  });
  return submitAutomationUserOp(walletAddress, moduleCallData);
}

export async function submitSweepDustUserOp(walletAddress: Address): Promise<Hex> {
  console.log(`[bundler] Sweep: ${walletAddress}`);
  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "sweepDustAndCompound",
    args: [],
  });
  return submitAutomationUserOp(walletAddress, moduleCallData);
}
