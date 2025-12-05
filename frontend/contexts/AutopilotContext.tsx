"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { type Address } from "viem";
import { getSavedWallet, clearSavedWallet } from "@/lib/services/wallet";
import { API_URL } from "@/lib/constants";

// =============================================================================
// Types
// =============================================================================

interface AutopilotState {
  // Wallet addresses
  ownerAddress: Address | null;        // The EOA that owns this wallet
  walletAddress: Address | null;       // The smart wallet address

  // Balances (in human-readable format, e.g., "100.50")
  checkingBalance: string | null;      // USDC available for spending
  yieldBalance: string | null;         // USDC in yield strategy
  totalBalance: string | null;         // checking + yield

  // Current strategy info
  currentStrategy: {
    name: string;
    apy: number;        // e.g., 0.065 for 6.5%
    protocol: string;   // "Morpho", "Aave", etc.
  } | null;

  // Loading states
  isLoading: boolean;
  isPolling: boolean;

  // Error state
  error: string | null;
}

interface AutopilotContextValue extends AutopilotState {
  // Actions
  loadWallet: () => void;
  refreshBalances: () => Promise<void>;
  disconnectWallet: () => void;
  setWalletAddress: (address: Address, owner: Address) => void;
}

// =============================================================================
// Context
// =============================================================================

const AutopilotContext = createContext<AutopilotContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface AutopilotProviderProps {
  children: ReactNode;
}

export function AutopilotProvider({ children }: AutopilotProviderProps) {
  const [state, setState] = useState<AutopilotState>({
    ownerAddress: null,
    walletAddress: null,
    checkingBalance: null,
    yieldBalance: null,
    totalBalance: null,
    currentStrategy: null,
    isLoading: true,
    isPolling: false,
    error: null,
  });

  // Load wallet from localStorage on mount
  const loadWallet = useCallback(() => {
    const saved = getSavedWallet();
    if (saved) {
      setState(prev => ({
        ...prev,
        walletAddress: saved.address,
        ownerAddress: saved.owner,
        isLoading: false,
      }));
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Set wallet address (called after creation)
  const setWalletAddress = useCallback((address: Address, owner: Address) => {
    setState(prev => ({
      ...prev,
      walletAddress: address,
      ownerAddress: owner,
    }));
  }, []);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    clearSavedWallet();
    setState({
      ownerAddress: null,
      walletAddress: null,
      checkingBalance: null,
      yieldBalance: null,
      totalBalance: null,
      currentStrategy: null,
      isLoading: false,
      isPolling: false,
      error: null,
    });
  }, []);

  // Refresh balances from chain/backend
  const refreshBalances = useCallback(async () => {
    if (!state.walletAddress) return;

    setState(prev => ({ ...prev, isPolling: true, error: null }));

    try {
      // TODO: Implement real balance fetching
      // For now, use mock data

      // In the real implementation:
      // 1. Read USDC balance from chain: publicClient.readContract(...)
      // 2. Read yield balance from adapter: adapter.totalValue()
      // 3. Fetch current strategy from backend: GET /recommend

      // Mock data for development
      const mockChecking = "150.00";
      const mockYield = "850.00";
      const mockTotal = "1000.00";

      // Fetch current best strategy from backend
      let strategy = null;
      try {
        const response = await fetch(`${API_URL}/recommend?token=USDC&chainId=8453`);
        if (response.ok) {
          const data = await response.json();
          strategy = {
            name: data.strategy?.name || "Morpho USDC",
            apy: data.strategy?.apy || 0.065,
            protocol: data.strategy?.protocolName || "Morpho",
          };
        }
      } catch (e) {
        console.warn("Could not fetch strategy:", e);
        strategy = {
          name: "Morpho USDC Vault",
          apy: 0.065,
          protocol: "Morpho",
        };
      }

      setState(prev => ({
        ...prev,
        checkingBalance: mockChecking,
        yieldBalance: mockYield,
        totalBalance: mockTotal,
        currentStrategy: strategy,
        isPolling: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isPolling: false,
        error: error instanceof Error ? error.message : "Failed to fetch balances",
      }));
    }
  }, [state.walletAddress]);

  // Load wallet on mount
  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const value: AutopilotContextValue = {
    ...state,
    loadWallet,
    refreshBalances,
    disconnectWallet,
    setWalletAddress,
  };

  return (
    <AutopilotContext.Provider value={value}>
      {children}
    </AutopilotContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useAutopilot(): AutopilotContextValue {
  const context = useContext(AutopilotContext);
  if (!context) {
    throw new Error("useAutopilot must be used within an AutopilotProvider");
  }
  return context;
}
