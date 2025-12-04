"use client";

import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { type Address, keccak256, toBytes } from "viem";
import {
  createSmartWallet,
  getExistingSmartAccount,
  getSmartAccountAddress,
  saveWallet,
} from "@/lib/services/wallet";
import {
  CONTRACTS,
  FACTORY_ABI,
  isFactoryReady,
} from "@/lib/constants";

export type WalletCreationStatus =
  | "idle"
  | "checking"
  | "preparing"
  | "creating"
  | "confirming"
  | "registering"
  | "success"
  | "error";

export interface WalletCreationState {
  status: WalletCreationStatus;
  smartAccountAddress: Address | null;
  transactionHash: string | null;
  error: string | null;
  /** The predicted address (available after 'preparing' step) */
  predictedAddress: Address | null;
}

export interface UseWalletCreationReturn extends WalletCreationState {
  createWallet: () => Promise<void>;
  reset: () => void;
  isConnected: boolean;
  ownerAddress: Address | undefined;
  /** Whether the factory contract is deployed */
  isFactoryDeployed: boolean;
  /** Prepared transaction data for display */
  preparedTx: { predictedAddress: Address } | null;
}

const initialState: WalletCreationState = {
  status: "idle",
  smartAccountAddress: null,
  transactionHash: null,
  error: null,
  predictedAddress: null,
};

/**
 * Generate a deterministic salt from the owner address
 */
function generateSalt(owner: Address): `0x${string}` {
  return keccak256(toBytes(owner));
}

/**
 * Hook for managing smart wallet creation flow
 *
 * Flow:
 * 1. Check if wallet already exists for this owner
 * 2. Call backend session-key endpoint (mock for now)
 * 3. Call createSmartWallet(owner) to prepare transaction
 * 4. Log the txRequest for debugging
 * 5. Submit transaction via writeContract (when factory is deployed)
 * 6. Wait for transaction confirmation
 * 7. Save predictedAddress to localStorage
 * 8. Redirect to dashboard (handled by component)
 */
export function useWalletCreation(): UseWalletCreationReturn {
  const { address: ownerAddress, isConnected } = useAccount();
  const [state, setState] = useState<WalletCreationState>(initialState);

  // Wagmi hooks for contract interaction (prepared but not executed yet)
  const {
    writeContract,
    data: txHash,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  // Wait for transaction receipt
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: confirmError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const reset = useCallback(() => {
    setState(initialState);
    resetWrite();
  }, [resetWrite]);

  const createWallet = useCallback(async () => {
    if (!ownerAddress) {
      setState({
        ...initialState,
        status: "error",
        error: "Wallet not connected. Please connect your wallet first.",
      });
      return;
    }

    try {
      // Step 1: Check if wallet already exists
      setState({
        ...initialState,
        status: "checking",
      });

      const existingAccount = await getExistingSmartAccount(ownerAddress);

      if (existingAccount) {
        console.log("[WalletCreation] Found existing account:", existingAccount);
        setState({
          status: "success",
          smartAccountAddress: existingAccount,
          transactionHash: null,
          error: null,
          predictedAddress: existingAccount,
        });
        return;
      }

      // Step 2: Prepare wallet creation
      setState((prev) => ({
        ...prev,
        status: "preparing",
      }));

      console.log("[WalletCreation] Step 2: Preparing wallet creation");

      // Get the predicted address
      const predictedAddress = await getSmartAccountAddress(ownerAddress);
      console.log("[WalletCreation] Predicted address:", predictedAddress);

      setState((prev) => ({
        ...prev,
        predictedAddress,
      }));

      // Step 3: Check if factory is deployed
      if (isFactoryReady()) {
        setState((prev) => ({
          ...prev,
          status: "creating",
        }));

        console.log("[WalletCreation] Step 3: Submitting transaction to factory");

        const salt = generateSalt(ownerAddress);

        // Submit the actual transaction
        writeContract({
          address: CONTRACTS.FACTORY,
          abi: FACTORY_ABI,
          functionName: "createAccount",
          args: [ownerAddress, salt],
        });

        // The rest of the flow will be handled by the transaction confirmation
      } else {
        // Factory not deployed - use mock mode
        console.log("[WalletCreation] Factory not deployed, using mock mode");

        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Step 4: Register session key with backend (mock)
        setState((prev) => ({
          ...prev,
          status: "registering",
        }));

        // Use the createSmartWallet function which handles mock mode
        const result = await createSmartWallet({ owner: ownerAddress });
        console.log("[WalletCreation] Mock wallet created:", result);

        setState({
          status: "success",
          smartAccountAddress: result.smartAccountAddress,
          transactionHash: result.transactionHash,
          error: null,
          predictedAddress: result.smartAccountAddress,
        });
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create wallet";

      console.error("[WalletCreation] Error:", err);

      setState({
        ...initialState,
        status: "error",
        error: errorMessage,
      });
    }
  }, [ownerAddress, writeContract]);

  // Handle write errors
  if (writeError && state.status === "creating") {
    console.error("[WalletCreation] Write contract error:", writeError);
    setState({
      ...initialState,
      status: "error",
      error: writeError.message,
    });
  }

  // Handle confirmation errors
  if (confirmError && state.status === "confirming") {
    console.error("[WalletCreation] Confirmation error:", confirmError);
    setState({
      ...initialState,
      status: "error",
      error: confirmError.message,
    });
  }

  // Handle transaction confirmation
  if (isConfirmed && txHash && state.predictedAddress && state.status !== "success") {
    console.log("[WalletCreation] Transaction confirmed:", txHash);

    // Save to localStorage
    if (typeof window !== "undefined" && ownerAddress) {
      saveWallet(state.predictedAddress, ownerAddress);
    }

    setState({
      status: "success",
      smartAccountAddress: state.predictedAddress,
      transactionHash: txHash,
      error: null,
      predictedAddress: state.predictedAddress,
    });
  }

  // Update status based on confirming state
  if (isConfirming && txHash && state.status !== "confirming" && state.status !== "success") {
    setState((prev) => ({
      ...prev,
      status: "confirming",
      transactionHash: txHash,
    }));
  }

  return {
    ...state,
    createWallet,
    reset,
    isConnected,
    ownerAddress,
    isFactoryDeployed: isFactoryReady(),
    preparedTx: state.predictedAddress ? { predictedAddress: state.predictedAddress } : null,
  };
}
