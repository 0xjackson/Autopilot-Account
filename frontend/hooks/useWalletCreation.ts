"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { type Address } from "viem";
import {
  createSmartWallet,
  getExistingSmartAccount,
  type CreateWalletResponse,
} from "@/lib/services/wallet";

export type WalletCreationStatus =
  | "idle"
  | "checking"
  | "creating"
  | "success"
  | "error";

export interface WalletCreationState {
  status: WalletCreationStatus;
  smartAccountAddress: Address | null;
  transactionHash: string | null;
  error: string | null;
}

export interface UseWalletCreationReturn extends WalletCreationState {
  createWallet: () => Promise<void>;
  reset: () => void;
  isConnected: boolean;
  ownerAddress: Address | undefined;
}

const initialState: WalletCreationState = {
  status: "idle",
  smartAccountAddress: null,
  transactionHash: null,
  error: null,
};

/**
 * Hook for managing smart wallet creation flow
 *
 * Handles:
 * - Checking if wallet already exists
 * - Creating new smart wallet via factory
 * - Error handling and state management
 */
export function useWalletCreation(): UseWalletCreationReturn {
  const { address: ownerAddress, isConnected } = useAccount();
  const [state, setState] = useState<WalletCreationState>(initialState);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

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
        setState({
          status: "success",
          smartAccountAddress: existingAccount,
          transactionHash: null,
          error: null,
        });
        return;
      }

      // Step 2: Create new wallet
      setState({
        ...initialState,
        status: "creating",
      });

      const result: CreateWalletResponse = await createSmartWallet({
        owner: ownerAddress,
      });

      setState({
        status: "success",
        smartAccountAddress: result.smartAccountAddress,
        transactionHash: result.transactionHash,
        error: null,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create wallet";

      setState({
        ...initialState,
        status: "error",
        error: errorMessage,
      });
    }
  }, [ownerAddress]);

  return {
    ...state,
    createWallet,
    reset,
    isConnected,
    ownerAddress,
  };
}
