"use client";

import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { type Address, type Hex } from "viem";
import {
  createSmartWallet,
  getExistingSmartAccount,
  registerSessionKey,
  type PreparedSmartWalletTx,
} from "@/lib/services/wallet";
import {
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
  /** The prepared transaction data (available after 'preparing' step) */
  preparedTx: PreparedSmartWalletTx | null;
}

export interface UseWalletCreationReturn extends WalletCreationState {
  createWallet: () => Promise<void>;
  reset: () => void;
  isConnected: boolean;
  ownerAddress: Address | undefined;
  /** Whether the factory contract is deployed */
  isFactoryDeployed: boolean;
}

const initialState: WalletCreationState = {
  status: "idle",
  smartAccountAddress: null,
  transactionHash: null,
  error: null,
  preparedTx: null,
};

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
    isPending: isWritePending,
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
          preparedTx: null,
        });
        return;
      }

      // Step 2: Call backend session-key endpoint (mock for now)
      setState((prev) => ({
        ...prev,
        status: "preparing",
      }));

      // This will be replaced with actual backend call
      console.log("[WalletCreation] Step 2: Calling session-key endpoint (mock)");

      // Step 3: Prepare the wallet creation transaction
      const preparedTx = await createSmartWallet(ownerAddress);

      console.log("[WalletCreation] Step 3: Transaction prepared:", {
        predictedAddress: preparedTx.predictedAddress,
        salt: preparedTx.salt,
        isFactoryReady: preparedTx.isFactoryReady,
      });

      // Step 4: Log the txRequest for debugging
      console.log("[WalletCreation] Step 4: Transaction request:", preparedTx.txRequest);

      setState((prev) => ({
        ...prev,
        preparedTx,
      }));

      // Step 5: If factory is deployed, submit the transaction
      if (preparedTx.isFactoryReady && FACTORY_ABI) {
        setState((prev) => ({
          ...prev,
          status: "creating",
        }));

        console.log("[WalletCreation] Step 5: Submitting transaction to factory");

        // Submit the actual transaction
        writeContract({
          address: preparedTx.txRequest.to,
          abi: FACTORY_ABI,
          functionName: "createAccountFor",
          args: [ownerAddress, preparedTx.salt as Hex],
        });

        // The rest of the flow will be handled by the transaction confirmation
        // which triggers the success state via useEffect in the component
      } else {
        // Factory not deployed - simulate success for development
        console.log("[WalletCreation] Factory not deployed, simulating success");

        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Step 6: Register session key with backend (mock)
        setState((prev) => ({
          ...prev,
          status: "registering",
        }));

        await registerSessionKey(preparedTx.predictedAddress, ownerAddress);
        console.log("[WalletCreation] Step 6: Session key registered (mock)");

        // Step 7: Save to localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("autopilotWalletAddress", preparedTx.predictedAddress);
          localStorage.setItem("autopilotWalletOwner", ownerAddress);
        }
        console.log("[WalletCreation] Step 7: Saved to localStorage");

        setState({
          status: "success",
          smartAccountAddress: preparedTx.predictedAddress,
          transactionHash: null, // No real tx in mock mode
          error: null,
          preparedTx,
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
  if (isConfirmed && txHash && state.preparedTx && state.status !== "success") {
    console.log("[WalletCreation] Transaction confirmed:", txHash);

    // Save to localStorage
    if (typeof window !== "undefined" && ownerAddress) {
      localStorage.setItem("autopilotWalletAddress", state.preparedTx.predictedAddress);
      localStorage.setItem("autopilotWalletOwner", ownerAddress);
    }

    setState({
      status: "success",
      smartAccountAddress: state.preparedTx.predictedAddress,
      transactionHash: txHash,
      error: null,
      preparedTx: state.preparedTx,
    });
  }

  // Update status based on write pending state
  if (isWritePending && state.status === "creating") {
    // Status is already "creating", no update needed
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
  };
}
