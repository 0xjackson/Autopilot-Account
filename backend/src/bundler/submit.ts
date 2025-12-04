import { encodeFunctionData, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS, AUTO_YIELD_MODULE_ABI, KERNEL_EXECUTE_ABI } from "./constants";
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

  const callData = encodeFunctionData({
    abi: KERNEL_EXECUTE_ABI,
    functionName: "execute",
    args: [CONTRACTS.MODULE, 0n, moduleCallData],
  });

  const sequentialNonce = await getNonce(walletAddress);
  const nonce = encodeNonceForValidator(CONTRACTS.VALIDATOR, sequentialNonce);

  const { maxFeePerGas, maxPriorityFeePerGas } = await getGasPrices();
  const gasFees = packUint128(maxPriorityFeePerGas, maxFeePerGas);

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

  const stubPaymasterAndData = await getPaymasterStubData(stubUserOp);

  const dummySignature = ("0x" + "00".repeat(65)) as Hex;
  const gasEstimate = await estimateUserOperationGas({
    ...stubUserOp,
    paymasterAndData: stubPaymasterAndData,
    signature: dummySignature,
  } as PackedUserOperation);

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
    gasFees,
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

  const userOpHash = getUserOpHash(finalUserOp);
  const signature = await signer.signMessage({ message: { raw: userOpHash } });
  finalUserOp.signature = signature;

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
