import { encodeFunctionData, concat, pad, toHex, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CONTRACTS,
  AUTO_YIELD_MODULE_ABI,
  ERC20_ABI,
  KERNEL_EXECUTE_ABI,
  EXEC_MODE_DEFAULT,
  USER_SEND_GAS_LIMITS,
} from "./constants";
import { getUserOpHashV07 } from "./userOp";
import {
  type UserOperationV07,
  getNonce,
  getNonceForEcdsa,
  getGasPrices,
  getPaymasterData,
  sponsorUserOperation,
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

async function submitAutomationUserOp(walletAddress: Address, moduleCallData: Hex): Promise<Hex> {
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

  const initialGas = { call: 500000n, verification: 500000n, preVerification: 100000n };

  const stubUserOp = {
    sender: walletAddress,
    nonce,
    factory: null as Address | null,
    factoryData: null as Hex | null,
    callData,
    callGasLimit: initialGas.call,
    verificationGasLimit: initialGas.verification,
    preVerificationGas: initialGas.preVerification,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymaster: null as Address | null,
    paymasterVerificationGasLimit: null as bigint | null,
    paymasterPostOpGasLimit: null as bigint | null,
    paymasterData: null as Hex | null,
  };

  const stubHash = getUserOpHashV07(stubUserOp);
  const stubSignature = await signer.signMessage({ message: { raw: stubHash } });

  console.log(`[bundler] Requesting sponsorship...`);

  const stubUserOpForSponsorship: UserOperationV07 = {
    sender: walletAddress,
    nonce: toHex(nonce),
    factory: null,
    factoryData: null,
    callData,
    callGasLimit: toHex(initialGas.call),
    verificationGasLimit: toHex(initialGas.verification),
    preVerificationGas: toHex(initialGas.preVerification),
    maxFeePerGas: toHex(maxFeePerGas),
    maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
    paymaster: null,
    paymasterVerificationGasLimit: null,
    paymasterPostOpGasLimit: null,
    paymasterData: null,
    signature: stubSignature,
  };

  const sponsorship = await sponsorUserOperation(stubUserOpForSponsorship);
  console.log(`[bundler] Sponsored by: ${sponsorship.paymaster}`);

  const finalUserOp = {
    sender: walletAddress,
    nonce,
    factory: null as Address | null,
    factoryData: null as Hex | null,
    callData,
    callGasLimit: BigInt(sponsorship.callGasLimit),
    verificationGasLimit: BigInt(sponsorship.verificationGasLimit),
    preVerificationGas: BigInt(sponsorship.preVerificationGas),
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymaster: sponsorship.paymaster,
    paymasterVerificationGasLimit: BigInt(sponsorship.paymasterVerificationGasLimit),
    paymasterPostOpGasLimit: BigInt(sponsorship.paymasterPostOpGasLimit),
    paymasterData: sponsorship.paymasterData,
  };

  const finalHash = getUserOpHashV07(finalUserOp);
  const finalSignature = await signer.signMessage({ message: { raw: finalHash } });

  const userOpToSubmit: UserOperationV07 = {
    sender: walletAddress,
    nonce: toHex(nonce),
    factory: null,
    factoryData: null,
    callData,
    callGasLimit: sponsorship.callGasLimit,
    verificationGasLimit: sponsorship.verificationGasLimit,
    preVerificationGas: sponsorship.preVerificationGas,
    maxFeePerGas: toHex(maxFeePerGas),
    maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
    paymaster: sponsorship.paymaster,
    paymasterVerificationGasLimit: sponsorship.paymasterVerificationGasLimit,
    paymasterPostOpGasLimit: sponsorship.paymasterPostOpGasLimit,
    paymasterData: sponsorship.paymasterData,
    signature: finalSignature,
  };

  console.log(`[bundler] Submitting...`);
  const submittedHash = await sendUserOperation(userOpToSubmit);
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
  newVaultAddress: Address
): Promise<Hex> {
  console.log(`[bundler] Migrate: ${walletAddress} -> ${newVaultAddress}`);
  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "migrateStrategy",
    args: [tokenAddress, newVaultAddress],
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

// Prepare UserOp for user-signed send
export async function prepareUserSendOp(
  walletAddress: Address,
  recipient: Address,
  amount: bigint,
  token: Address = CONTRACTS.USDC
): Promise<{ userOp: UserOperationV07; userOpHash: Hex }> {
  console.log(`[bundler] Prepare send: ${walletAddress} -> ${recipient}, ${amount} of ${token}`);

  // 1. Build ERC20 transfer calldata
  const transferCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [recipient, amount],
  });

  // 2. Build executeWithAutoYield calldata
  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: "executeWithAutoYield",
    args: [token, recipient, amount, transferCalldata],
  });

  // 3. Build Kernel execute calldata
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

  // 4. Get nonce using ECDSA validator (NOT automation validator)
  const nonce = await getNonceForEcdsa(walletAddress);
  const { maxFeePerGas, maxPriorityFeePerGas } = await getGasPrices();

  console.log(`[bundler] Nonce: ${nonce}, Gas prices: ${maxFeePerGas}/${maxPriorityFeePerGas}`);

  // 5. Build unsigned UserOp with hardcoded gas limits
  const unsignedUserOp = {
    sender: walletAddress,
    nonce: toHex(nonce),
    factory: null,
    factoryData: null,
    callData,
    callGasLimit: toHex(USER_SEND_GAS_LIMITS.callGasLimit),
    verificationGasLimit: toHex(USER_SEND_GAS_LIMITS.verificationGasLimit),
    preVerificationGas: toHex(USER_SEND_GAS_LIMITS.preVerificationGas),
    maxFeePerGas: toHex(maxFeePerGas),
    maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
    paymaster: null,
    paymasterVerificationGasLimit: null,
    paymasterPostOpGasLimit: null,
    paymasterData: null,
  };

  // 6. Get paymaster data (no signature required!)
  console.log(`[bundler] Getting paymaster data...`);
  const paymasterResult = await getPaymasterData(unsignedUserOp);
  console.log(`[bundler] Paymaster: ${paymasterResult.paymaster}`);

  // 7. Build final UserOp with paymaster fields
  const userOp: UserOperationV07 = {
    sender: walletAddress,
    nonce: toHex(nonce),
    factory: null,
    factoryData: null,
    callData,
    callGasLimit: toHex(USER_SEND_GAS_LIMITS.callGasLimit),
    verificationGasLimit: toHex(USER_SEND_GAS_LIMITS.verificationGasLimit),
    preVerificationGas: toHex(USER_SEND_GAS_LIMITS.preVerificationGas),
    maxFeePerGas: toHex(maxFeePerGas),
    maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
    paymaster: paymasterResult.paymaster,
    paymasterVerificationGasLimit: toHex(USER_SEND_GAS_LIMITS.paymasterVerificationGasLimit),
    paymasterPostOpGasLimit: toHex(USER_SEND_GAS_LIMITS.paymasterPostOpGasLimit),
    paymasterData: paymasterResult.paymasterData,
    signature: "0x", // Placeholder - user will sign
  };

  // 8. Compute hash for user to sign
  const userOpHash = getUserOpHashV07({
    sender: walletAddress,
    nonce,
    factory: null,
    factoryData: null,
    callData,
    callGasLimit: USER_SEND_GAS_LIMITS.callGasLimit,
    verificationGasLimit: USER_SEND_GAS_LIMITS.verificationGasLimit,
    preVerificationGas: USER_SEND_GAS_LIMITS.preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymaster: paymasterResult.paymaster,
    paymasterVerificationGasLimit: USER_SEND_GAS_LIMITS.paymasterVerificationGasLimit,
    paymasterPostOpGasLimit: USER_SEND_GAS_LIMITS.paymasterPostOpGasLimit,
    paymasterData: paymasterResult.paymasterData,
  });

  console.log(`[bundler] UserOp hash: ${userOpHash}`);

  return { userOp, userOpHash };
}

// Submit a user-signed UserOp
export async function submitSignedUserOp(
  userOp: UserOperationV07
): Promise<{ hash: Hex; txHash: Hex }> {
  console.log(`[bundler] Submitting signed UserOp...`);

  const hash = await sendUserOperation(userOp);
  console.log(`[bundler] Submitted: ${hash}`);

  const receipt = await waitForUserOperationReceipt(hash);
  console.log(`[bundler] Confirmed: ${receipt.receipt.transactionHash}`);

  return { hash, txHash: receipt.receipt.transactionHash };
}
